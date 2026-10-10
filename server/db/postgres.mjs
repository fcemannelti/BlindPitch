// Driver PostgreSQL para funções serverless.
//
// Decisões de ambiente:
//  - `Pool` com limite baixo e reuso: instâncias da Vercel criam e destruem
//    processos o tempo todo; abrir uma conexão por requisição estoura o plano
//    grátis do Neon. O pool é por instância, nunca por request.
//  - Transações usam uma conexão dedicada do pool via AsyncLocalStorage, de modo
//    que `db.prepare(...)` dentro de `db.tx()` continue enxergando o mesmo
//    cliente sem propagar o objeto manualmente por todas as funções.
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { bind } from './core.mjs';
import { id, now, passwordHash, createEvent } from './core.mjs';
import { credentials, requireCondition } from '../validation.mjs';

const { Pool, types } = pg;

// O PostgreSQL devolve bigint/numeric como string para não perder precisão.
// A API historicamente expõe números (count(*), avg(), notas). Convertemos os
// tipos numéricos para number para manter o contrato JSON idêntico ao SQLite.
types.setTypeParser(types.builtins.INT8, value => (value === null ? null : Number(value)));
types.setTypeParser(types.builtins.NUMERIC, value => (value === null ? null : Number(value)));
types.setTypeParser(types.builtins.FLOAT4, value => (value === null ? null : Number(value)));

// `?` é o placeholder do SQLite; o PostgreSQL usa $1, $2...
// A troca ignora `?` dentro de literais de string e comentários, para não
// corromper textos de conteúdo científico que podem conter interrogações.
export function toNumbered(sql) {
  let out = '', index = 0, position = 0, next = 1;
  while (position < sql.length) {
    const char = sql[position];
    if (char === "'" || char === '"') { // literal
      const quote = char;
      out += char; position++;
      while (position < sql.length) {
        out += sql[position];
        if (sql[position] === quote) {
          if (sql[position + 1] === quote) { out += sql[position + 1]; position += 2; continue; }
          position++; break;
        }
        position++;
      }
      continue;
    }
    if (char === '-' && sql[position + 1] === '-') { // comentário de linha
      while (position < sql.length && sql[position] !== '\n') { out += sql[position]; position++; }
      continue;
    }
    if (char === '?') { out += `$${next++}`; position++; continue; }
    out += char; position++;
  }
  return out;
}

// Converte construções SQLite que não existem no PostgreSQL. Aplicado apenas no
// caminho Postgres para que o SQL continue legível e o SQLite inalterado.
export function toPostgres(sql) {
  let out = toNumbered(sql);
  // INSERT OR IGNORE -> INSERT ... ON CONFLICT DO NOTHING
  out = out.replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/giu, 'INSERT INTO');
  if (/INSERT\s+INTO/iu.test(out) && /\bON\s+CONFLICT\b/iu.test(out) === false && /insert\s+or\s+ignore/iu.test(sql)) {
    out += ' ON CONFLICT DO NOTHING';
  }
  // rowid é específico do SQLite; a ordenação estável usa a chave primária.
  out = out.replace(/\bl\.rowid\b/giu, 'l.id');
  out = out.replace(/\br\.rowid\b/giu, 'r.id');
  return out;
}

const transactionContext = new AsyncLocalStorage();

export function openPostgres(connectionString, { max = 4, schemaPath } = {}) {
  if (!connectionString) throw new Error('DATABASE_URL é obrigatório para usar o PostgreSQL.');
  const pool = new Pool({
    connectionString,
    max,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    // sslmode no próprio host (Neon, Supabase) já é respeitado pelo driver.
    ssl: /sslmode=require|sslmode=verify-ca|sslmode=verify-full/iu.test(connectionString)
      ? { rejectUnauthorized: false }
      : undefined
  });
  // Um erro em conexão ociosa não pode derrubar a função inteira.
  pool.on('error', () => {});

  const run = async (sql, params, client = null) => {
    const executor = client ?? transactionContext.getStore() ?? pool;
    return executor.query(toPostgres(sql), bind(params));
  };

  const db = {
    dialect: 'postgres',
    pool,
    prepare(sql) {
      return {
        async get(...params) { const result = await run(sql, params); return result.rows[0] ?? null; },
        async all(...params) { const result = await run(sql, params); return result.rows; },
        async run(...params) { const result = await run(sql, params); return { changes: result.rowCount }; }
      };
    },
    async exec(sql) { return pool.query(toPostgres(sql)); },
    async tx(fn) {
      // Transações aninhadas participam da transação externa.
      if (transactionContext.getStore()) return fn();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await transactionContext.run(client, () => fn());
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* conexão já perdida */ }
        throw error;
      } finally { client.release(); }
    },
    async migrate() {
      const { readFile } = await import('node:fs/promises');
      const path = schemaPath ?? new URL('../../db/schema.postgres.sql', import.meta.url);
      await pool.query(await readFile(path, 'utf8'));
    },
    // Verifica se o SCHEMA foi aplicado, e nao se ha dados.
    // Um banco recem-migrado esta com as tabelas criadas e vazias: sondar uma
    // linha confunde "ainda vazio" com "sem schema" e derrubaria a API com um
    // 503 mesmo com o banco perfeitamente pronto.
    async schemaReady() {
      const required = ['users', 'events', 'settings', 'rubric_criteria', 'projects', 'assignments', 'reviews'];
      const result = await pool.query(
        'SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema=$1 AND table_name = ANY($2)',
        ['public', required]
      );
      return result.rows[0].n === required.length;
    },
    async close() { await pool.end(); }
  };
  return db;
}

export async function initializeRealDb(db, email, password) {
  if (await db.prepare('SELECT id FROM events LIMIT 1').get()) return false;
  const account = credentials({ name: 'Organização', email, password, school_or_class: '', consent: false }, true);
  requireCondition(account.password.length >= 12, 'Defina ADMIN_PASSWORD com pelo menos 12 caracteres após remover espaços externos.');
  await db.tx(async () => {
    await createEvent(db, 'Ceará Faz Ciência 2026', 2026);
    await db.prepare("INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,'organizer',?)")
      .run(id(), account.name, account.email, passwordHash(account.password), now());
  });
  return true;
}

// Trava de aplicação usada para serializar a inicializacao entre instancias.
const BOOTSTRAP_LOCK = 0x42_1d_9c; // arbitrario e estavel

// Garante que exista uma edicao real, com o setting `active_event` apontando
// para ela. Sem isso, `getEvent()` nao acha edicao nenhuma e a API responde 404
// em quase todas as rotas.
//
// Idempotente e seguro com varias instancias subindo ao mesmo tempo: o
// `pg_advisory_lock` serializa quem inicializa, e a checagem e refeita dentro
// da trava para nao criar duas edicoes. Nunca semeia dados de demonstracao.
export async function ensureRealEdition(db, { email, password } = {}) {
  if (await db.prepare('SELECT id FROM events LIMIT 1').get()) return false;
  if (!email || !password) {
    throw new Error(
      'Banco sem nenhuma edicao cadastrada. Defina ADMIN_EMAIL e ADMIN_PASSWORD '
      + '(12+ caracteres) para a criacao da edicao inicial.'
    );
  }
  const client = await db.pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [BOOTSTRAP_LOCK]);
    try {
      // Outra instancia pode ter inicializado enquanto esperavamos a trava.
      if (await db.prepare('SELECT id FROM events LIMIT 1').get()) return false;
      return await initializeRealDb(db, email, password);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [BOOTSTRAP_LOCK]);
    }
  } finally { client.release(); }
}
