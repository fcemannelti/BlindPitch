// Aplicação do schema PostgreSQL.
//
// Ferramenta administrativa: roda uma vez, manualmente, NUNCA a cada requisição.
// Um deploy novo não pode depender de DDL rodando no primeiro request, porque
// isso transformaria toda primeira visita em uma migração.
import { openDatabase } from '../server/db/index.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não configurado. Nada foi alterado.');
  process.exit(1);
}

const db = openDatabase({ url });
if (db.dialect !== 'postgres') {
  console.error('DATABASE_URL definido, mas o driver escolhido não é PostgreSQL.');
  process.exit(1);
}

const before = await db.prepare('SELECT count(*) n FROM information_schema.tables WHERE table_schema=?').get('public');
await db.migrate();
const after = await db.prepare('SELECT count(*) n FROM information_schema.tables WHERE table_schema=?').get('public');
const applied = await db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
console.log(`Tabelas em public: ${before.n} -> ${after.n}`);
console.log(`schema_migrations: ${applied.map(r => r.version).join(', ')}`);
console.log('Schema aplicado. Idempotente: pode ser executado novamente com segurança.');
await db.close();
