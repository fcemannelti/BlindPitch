// Driver SQLite: mantÃ©m o desenvolvimento local e os backups existentes.
// node:sqlite Ã© sÃ­ncrono; a interface exposta Ã© assÃ­ncrona para que o backend
// use exatamente o mesmo cÃ³digo nos dois motores.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { bind } from './core.mjs';
import { optionalScientificFields, credentials, requireCondition } from '../validation.mjs';
import { id, now, passwordHash, createEvent } from './core.mjs';

function migrate(raw) {
  raw.exec(readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8'));
  const applied = version => !!raw.prepare('SELECT version FROM schema_migrations WHERE version=?').get(version);
  const record = version => raw.prepare('INSERT INTO schema_migrations(version) VALUES(?)').run(version);
  const columnsOf = table => new Set(raw.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name));
  const add = (table, column, definition) => {
    // O nome da coluna precisa de aspas: `references` é palavra reservada do SQL.
    if (!columnsOf(table).has(column)) raw.exec(`ALTER TABLE ${table} ADD COLUMN "${column}" ${definition};`);
  };

  if (!applied(2)) {
    // MigraÃ§Ã£o de consentimentos da primeira versÃ£o local, apenas em ediÃ§Ãµes demo.
    raw.exec(`INSERT OR IGNORE INTO event_consents(user_id,event_id,protocol,consented_at)
      SELECT p.user_id,e.id,e.protocol,CURRENT_TIMESTAMP FROM participant_profiles p CROSS JOIN events e
      WHERE p.consent=1 AND e.demo=1 AND e.identified_enabled=1;
      INSERT INTO schema_migrations(version) VALUES(2);`);
  }
  if (!applied(3)) {
    // MigraÃ§Ã£o aditiva: preserva conteÃºdo, autoria, cÃ³digos e vÃ­nculos de avaliaÃ§Ã£o.
    for (const field of optionalScientificFields) add('projects', field, `TEXT NOT NULL DEFAULT ''`);
    record(3);
  }
  if (!applied(4)) {
    // MigraÃ§Ã£o aditiva de privacidade, publicaÃ§Ã£o, perfis e pontuaÃ§Ã£o adicional.
    // Nenhuma coluna Ã© removida e nenhum registro existente Ã© alterado ou apagado.
    add('events', 'bonus_enabled', 'INTEGER NOT NULL DEFAULT 1');
    add('events', 'bonus_max', 'REAL NOT NULL DEFAULT 2');
    add('reviews', 'bonus_points', 'REAL NOT NULL DEFAULT 0');
    add('reviews', 'bonus_justification', "TEXT NOT NULL DEFAULT ''");
    add('reviews', 'bonus_criterion', "TEXT NOT NULL DEFAULT ''");
    add('reviews', 'bonus_granted_by', 'TEXT');
    add('reviews', 'bonus_granted_at', 'TEXT');
    // Contas anteriores recebem o perfil padrÃ£o sem alterar o papel jÃ¡ armazenado.
    raw.exec(`INSERT OR IGNORE INTO privacy_profiles(user_id,identification,public_name,public_bio)
      SELECT id,'after_approval','','' FROM users WHERE role='participant';`);
    record(4);
  }
  if (!applied(5)) {
    // EndereÃ§o do portfÃ³lio pÃºblico: token aleatÃ³rio, nunca derivado de nome,
    // matrÃ­cula ou e-mail. Impede que a URL revele quem Ã© o autor.
    add('privacy_profiles', 'portfolio_slug', "TEXT NOT NULL DEFAULT ''");
    for (const row of raw.prepare("SELECT user_id FROM privacy_profiles WHERE portfolio_slug=''").all()) {
      raw.prepare('UPDATE privacy_profiles SET portfolio_slug=? WHERE user_id=?').run(`bp-${randomSlug()}`, row.user_id);
    }
    record(5);
  }
  if (!applied(6)) {
    // Limites de tentativas passam a poder ser compartilhados entre instÃ¢ncias.
    raw.exec(`CREATE TABLE IF NOT EXISTS rate_limits (key TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key,at);`);
    record(6);
  }
}

function randomSlug() {
  // SÃ³ para a migraÃ§Ã£o local de slugs jÃ¡ existentes.
  return randomBytes(4).toString('hex');
}

export function openSqlite(path = './data/blindpitch.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const raw = new DatabaseSync(path);
  raw.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  migrate(raw);

  // TransaÃ§Ãµes sÃ£o serializadas: o corpo agora contÃ©m `await`, entÃ£o duas
  // requisiÃ§Ãµes concorrentes poderiam se intercalar dentro do mesmo BEGIN.
  let queue = Promise.resolve();
  let closed = false;

  const db = {
    dialect: 'sqlite',
    raw,
    prepare(sql) {
      const statement = raw.prepare(sql);
      return {
        async get(...params) { return statement.get(...bind(params)) ?? null; },
        async all(...params) { return statement.all(...bind(params)); },
        async run(...params) { return statement.run(...bind(params)); }
      };
    },
    async exec(sql) { return raw.exec(sql); },
    async tx(fn) {
      const task = queue.then(async () => {
        raw.exec('BEGIN IMMEDIATE');
        try { const result = await fn(); raw.exec('COMMIT'); return result; }
        catch (error) { try { raw.exec('ROLLBACK'); } catch { /* jÃ¡ desfeita */ } throw error; }
      });
      queue = task.then(() => {}, () => {});
      return task;
    },
    // Idempotente: fechar duas vezes é inofensivo e não esconde outros erros.
    close() { if (closed) return; closed = true; try { raw.close(); } catch { /* já fechada */ } }
  };
  return db;
}

export async function initializeRealDb(db, email, password) {
  if (await db.prepare('SELECT id FROM events LIMIT 1').get()) return false;
  const account = credentials({ name: 'OrganizaÃ§Ã£o', email, password, school_or_class: '', consent: false }, true);
  requireCondition(account.password.length >= 12, 'Defina ADMIN_PASSWORD com pelo menos 12 caracteres apÃ³s remover espaÃ§os externos.');
  await db.tx(async () => {
    await createEvent(db, 'CearÃ¡ Faz CiÃªncia 2026', 2026);
    await db.prepare("INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,'organizer',?)")
      .run(id(), account.name, account.email, passwordHash(account.password), now());
  });
  return true;
}

