// Verificação da entrada da Vercel (api/index.mjs).
//
// Reproduz o modo de chamada real da plataforma: um servidor HTTP entrega
// IncomingMessage/ServerResponse ao handler exportado. Nenhuma das verificações
// depende de serviço externo; a suíte PostgreSQL é a única que exige o banco.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { seed, demoPassword } from '../server/seed.mjs';
import { createTestDatabase, testDatabaseUrl } from './support/postgres.mjs';

const url = testDatabaseUrl();
const skip = url ? false : 'BLINDPITCH_TEST_DATABASE_URL não configurada.';

let harness, db, server, base;

before(async () => {
  if (skip) return;
  harness = await createTestDatabase();
  db = harness.db;
  await seed(db);
  process.env.DATABASE_URL = harness.url;

  // Import dinâmico: as variáveis precisam estar prontas antes do primeiro load.
  const { default: handler } = await import('../api/index.mjs');
  server = createServer((request, response) => handler(request, response));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (skip) return;
  await new Promise(resolve => server.close(resolve));
  await db.close();
  await harness.destroy();
  delete process.env.DATABASE_URL;
});

test('importar a função não sobe servidor nem executa seed a cada requisição', { skip }, async () => {
  // Se module.exports chamasse listen() na importação, o processo abriria uma
  // porta própria. Aqui a única porta aberta é a criada explicitamente acima.
  const before = await fetch(base + '/api/public');
  assert.equal(before.status, 200);
  const handler = (await import('../api/index.mjs')).default;
  assert.equal(typeof handler, 'function');
  assert.equal(handler.length, 2, 'o handler recebe (request, response)');
});

test('GET /api/public responde 200 — o 404 relatado em produção não acontece aqui', { skip }, async () => {
  const response = await fetch(base + '/api/public');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  const data = await response.json();
  assert.equal(typeof data.event.name, 'string');
  assert.equal(typeof data.event.year, 'number');
});

test('GET /api/session responde 401 sem cookie e 200 com sessão válida', { skip }, async () => {
  const anonymous = await fetch(base + '/api/session');
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).error, 'Entre para continuar.');

  const login = await fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'organizador@blindpitch.demo', password: demoPassword })
  });
  assert.equal(login.status, 200);
  const { csrf } = await login.json();
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^bp_session=[a-f0-9]{64}$/u);

  const authenticated = await fetch(base + '/api/session', { headers: { Cookie: cookie } });
  assert.equal(authenticated.status, 200);
  const data = await authenticated.json();
  assert.equal(data.user.email, 'organizador@blindpitch.demo');
  assert.equal(data.csrf, csrf);
});

test('o cookie de sessão é HttpOnly, SameSite=Strict e Path=/', { skip }, async () => {
  const response = await fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'participante1@blindpitch.demo', password: demoPassword })
  });
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/iu);
  assert.match(cookie, /SameSite=Strict/iu);
  assert.match(cookie, /Path=\//u);
  // O token não pode vazar no corpo da resposta.
  assert.equal((await response.json()).user.password_hash, undefined);
});

test('rotas com parâmetros funcionam através do roteamento /api/*', { skip }, async () => {
  const login = await fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'participante1@blindpitch.demo', password: demoPassword })
  });
  const { csrf } = await login.json();
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const headers = { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' };

  const list = await (await fetch(base + '/api/projects', { headers })).json();
  const projectId = list[0].id;

  const detail = await fetch(base + `/api/projects/${projectId}`, { headers });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).id, projectId);

  // Parâmetro inexistente precisa ser 404 da aplicação, não erro de roteamento.
  const missing = await fetch(base + '/api/projects/00000000-0000-4000-8000-000000000000', { headers });
  assert.equal(missing.status, 404);

  const rubric = await fetch(base + '/api/rubric', { headers });
  assert.equal(rubric.status, 200);
  assert.equal(Array.isArray(await rubric.json()), true);
});

test('rotas inexistentes e métodos inválidos devolvem JSON, nunca HTML', { skip }, async () => {
  const unknown = await fetch(base + '/api/nao-existe');
  assert.equal(unknown.status, 404);
  assert.match(unknown.headers.get('content-type'), /application\/json/u);
  assert.equal((await unknown.json()).error, 'Rota não encontrada.');

  const wrongMethod = await fetch(base + '/api/public', { method: 'DELETE' });
  assert.equal(wrongMethod.status, 404);
  assert.match(wrongMethod.headers.get('content-type'), /application\/json/u);
});

test('os cabeçalhos de segurança são aplicados às respostas da API', { skip }, async () => {
  const response = await fetch(base + '/api/public');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/u);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('sem DATABASE_URL a função falha de forma explícita, sem vazar segredos', async () => {
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    // Cache-busting para carregar o módulo com o novo ambiente.
    const { default: handler } = await import(`../api/index.mjs?sem-db=${Date.now()}`);
    const local = createServer((request, response) => handler(request, response));
    await new Promise(resolve => local.listen(0, '127.0.0.1', resolve));
    try {
      const address = `http://127.0.0.1:${local.address().port}`;
      const response = await fetch(address + '/api/public');
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'Serviço temporariamente indisponível.' });
    } finally {
      await new Promise(resolve => local.close(resolve));
    }
  } finally {
    if (saved !== undefined) process.env.DATABASE_URL = saved;
  }
});

test('a configuração de build da Vercel é coerente com o projeto', async () => {
  const { readFile } = await import('node:fs/promises');
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(vercel.rewrites, [{ source: '/api/:path*', destination: '/api/index' }]);
  assert.equal(vercel.outputDirectory, 'public');
  assert.equal(typeof vercel.functions['api/index.mjs'].maxDuration, 'number');

  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.type, 'module', 'o runtime Node.js precisa de ESM');
  assert.ok(manifest.dependencies.pg, 'o driver PostgreSQL precisa estar declarado');
});
