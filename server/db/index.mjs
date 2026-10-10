// Fábrica única de acesso a dados. O backend chama `openDatabase()` e não sabe
// qual motor está ativo; a escolha é feita uma vez, por variável de ambiente.
//
//   DATABASE_URL definido -> PostgreSQL (produção / Vercel)
//   sem DATABASE_URL      -> SQLite local (desenvolvimento e dados existentes)
import { openSqlite, initializeRealDb as initSqlite } from './sqlite.mjs';
import { openPostgres, initializeRealDb as initPostgres, ensureRealEdition } from './postgres.mjs';

export { toPostgres, toNumbered, ensureRealEdition } from './postgres.mjs';
export { createEvent, id, now, passwordHash, passwordMatches, flag, isUniqueViolation } from './core.mjs';

export function openDatabase({ url = process.env.DATABASE_URL, path = process.env.DATABASE_PATH || './data/blindpitch.sqlite', max } = {}) {
  if (url) return openPostgres(url, { max });
  return openSqlite(path);
}

export async function initializeRealDb(db, email, password) {
  return db.dialect === 'postgres' ? initPostgres(db, email, password) : initSqlite(db, email, password);
}
