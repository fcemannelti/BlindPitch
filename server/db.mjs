// Compatibilidade: os módulos que já importavam `./db.mjs` continuam válidos.
// Toda a implementação passou para `server/db/`.
export { openSqlite as openDb, initializeRealDb } from './db/sqlite.mjs';
export { id, now, passwordHash, passwordMatches, createEvent, flag } from './db/core.mjs';
export { openDatabase } from './db/index.mjs';
