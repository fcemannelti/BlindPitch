// Importação do SQLite local para o PostgreSQL.
//
// Postura deliberadamente conservadora:
//  * NADA é apagado e nada é sobrescrito. A importação só INSERE linhas cujo
//    identificador ainda não existe no destino.
//  * Por padrão roda em SIMULAÇÃO (dry-run): mostra o que faria e sai.
//  * Só grava com `--apply`.
//  * Ao final imprime uma comparação contável entre origem e destino.
//
// O SQLite local NÃO é automaticamente considerado a fonte oficial dos dados
// publicados. Confira a origem antes de usar isto em produção.
//
//   npm run db:import -- --from ./data/blindpitch.sqlite            (simula)
//   npm run db:import -- --from ./data/blindpitch.sqlite --apply    (grava)
import { openSqlite } from '../server/db/sqlite.mjs';
import { openDatabase } from '../server/db/index.mjs';

// Ordem de inserção: respeita as chaves estrangeiras.
const TABLES = [
  'users', 'participant_profiles', 'privacy_profiles', 'reviewer_profiles', 'reviewer_requests',
  'events', 'settings', 'rubric_criteria', 'event_consents',
  'projects', 'project_authors',
  'assignments', 'reviews', 'review_scores',
  'publication_prefs', 'sessions', 'audit_logs'
];
const PRIMARY_KEY = {
  users: ['id'], participant_profiles: ['user_id'], privacy_profiles: ['user_id'],
  reviewer_profiles: ['user_id'], reviewer_requests: ['user_id'], events: ['id'], settings: ['key'],
  rubric_criteria: ['id'], event_consents: ['user_id', 'event_id'], projects: ['id'],
  project_authors: ['project_id'], assignments: ['id'], reviews: ['id'],
  review_scores: ['review_id', 'criterion_id'], publication_prefs: ['project_id'],
  sessions: ['token_hash'], audit_logs: ['id']
};

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const fromIndex = args.indexOf('--from');
const source = fromIndex >= 0 ? args[fromIndex + 1] : process.env.DATABASE_PATH || './data/blindpitch.sqlite';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não configurado. Nada foi lido nem escrito.');
  process.exit(1);
}

const sqlite = openSqlite(source);
const target = openDatabase({ url: process.env.DATABASE_URL });
if (target.dialect !== 'postgres') {
  console.error('O destino precisa ser PostgreSQL (defina DATABASE_URL).');
  process.exit(1);
}

const report = [];
const totals = { inserted: 0, conflicts: 0, skipped: 0 };

for (const table of TABLES) {
  const keys = PRIMARY_KEY[table];
  const rows = await sqlite.prepare(`SELECT * FROM ${table}`).all();

  // Só colunas que existem nos dois lados: evita quebrar em bancos antigos.
  const targetColumns = new Set(
    (await target.prepare("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=?").all(table))
      .map(c => c.column_name)
  );
  const columns = Object.keys(rows[0] ?? {}).filter(c => targetColumns.has(c));
  const dropped = Object.keys(rows[0] ?? {}).filter(c => !targetColumns.has(c));

  let inserted = 0, conflicts = 0;
  for (const row of rows) {
    const where = keys.map(k => `${k}=?`).join(' AND ');
    const existing = await target.prepare(`SELECT 1 FROM ${table} WHERE ${where}`).get(...keys.map(k => row[k]));
    if (existing) { conflicts++; continue; }
    if (apply) {
      const placeholders = columns.map(() => '?').join(',');
      await target.prepare(`INSERT INTO ${table}(${columns.map(c => `"${c}"`).join(',')}) VALUES(${placeholders})`)
        .run(...columns.map(c => row[c]));
    }
    inserted++;
  }
  totals.inserted += inserted; totals.conflicts += conflicts;
  report.push({ table, origem: rows.length, destino: await count(target, table), a_inserir: inserted, ja_existentes: conflicts, colunas_ignoradas: dropped.join(',') || '—' });
}

console.log(apply ? 'MODO APLICAÇÃO — linhas novas foram inseridas.' : 'SIMULAÇÃO — nenhuma escrita realizada. Use --apply para gravar.');
console.table(report);
console.log(`Origem: ${source}`);
console.log(`Total a inserir: ${totals.inserted} | Já existentes no destino: ${totals.conflicts}`);

if (apply) {
  console.log('\nVerificação após a importação (origem -> destino):');
  let divergencias = 0;
  for (const table of TABLES) {
    const origem = await count(sqlite, table);
    const destino = await count(target, table);
    const ok = destino >= origem;
    if (!ok) divergencias++;
    console.log(`  ${ok ? 'ok ' : '!! '} ${table.padEnd(22)} ${origem} -> ${destino}`);
  }
  console.log(divergencias === 0
    ? 'Nenhuma tabela ficou com menos linhas do que a origem.'
    : `${divergencias} tabela(s) com menos linhas: investigue antes de publicar.`);
}

sqlite.close();
await target.close();

async function count(db, table) {
  return Number((await db.prepare(`SELECT count(*) n FROM ${table}`).get()).n);
}
