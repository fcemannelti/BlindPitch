// Banco PostgreSQL descartável para a suíte de testes.
//
// Sem BLINDPITCH_TEST_DATABASE_URL a suíte PostgreSQL é ignorada (e diz isso
// claramente). Point para um banco local ou para umbranch de testes do Neon.
// O banco é criado e destruído por execução: nenhum teste toca em dados reais.
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { openPostgres } from '../../server/db/postgres.mjs';

const key = 'BLINDPITCH_TEST_DATABASE_URL';

export function testDatabaseUrl() {
  return process.env[key] || null;
}

export function requiredTestDatabaseUrl() {
  const url = testDatabaseUrl();
  if (!url) throw new Error(`Defina ${key} para executar a suíte PostgreSQL.`);
  return url;
}

export async function createTestDatabase() {
  const url = requiredTestDatabaseUrl();
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  const name = `bp_test_${randomBytes(6).toString('hex')}`;
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const target = new URL(url);
  target.pathname = `/${name}`;
  const db = openPostgres(target.toString(), { max: 5 });
  await db.migrate();
  return { db, name, url: target.toString(), destroy: () => dropTestDatabase(url, name) };
}

export async function dropTestDatabase(adminUrl, name) {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  // Encerrar conexões residuais antes de remover; o servidor ficaria ocupado.
  await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()', [name]);
  await admin.query(`DROP DATABASE IF EXISTS ${name}`);
  await admin.end();
}
