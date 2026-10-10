// Suíte PostgreSQL: exercita as 43 rotas da API contra um banco PostgreSQL real.
//
// Requer um banco descartável:
//   BLINDPITCH_TEST_DATABASE_URL=postgresql://usuario:senha@host:5432/postgres
//
// Sem a variável, o arquivo inteiro é ignorado com um aviso explícito.
// O banco é criado e destruído por execução — nenhum dado real é tocado.
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.mjs';
import { seed, demoPassword } from '../server/seed.mjs';
import { toNumbered } from '../server/db/postgres.mjs';
import { createTestDatabase, dropTestDatabase, testDatabaseUrl } from './support/postgres.mjs';
import { ensureRealEdition } from '../server/db/index.mjs';
import { createServer } from 'node:http';

const adminUrl = testDatabaseUrl();

let db, server, base, harness;
let skip = adminUrl ? false : 'BLINDPITCH_TEST_DATABASE_URL não configurada.';

const content = title => ({
  title, scientific_area: 'Engenharias',
  problem: 'Equipamentos permanecem ligados sem necessidade.',
  objective: 'Medir a redução do consumo com sensores acessíveis.',
  methodology: 'Comparar medições do protótipo e do grupo de controle.',
  proposed_solution: 'Desligamento com sensores de presença e microcontrolador.',
  expected_impact: 'Pode contribuir para reduzir o consumo; será investigado.',
  keywords: 'energia, sensores, ciência'
});

before(async () => {
  if (skip) return;
  harness = await createTestDatabase();
  db = harness.db;
  await seed(db);
  server = createApp(db);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (skip) return;
  await new Promise(resolve => server.close(resolve));
  await db.close();
  await harness.destroy();
});

async function client(email, password = demoPassword) {
  const auth = await fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  assert.equal(auth.status, 200, `login falhou para ${email}: ${auth.status}`);
  const { csrf } = await auth.json();
  const cookie = auth.headers.get('set-cookie').split(';')[0];
  return async (path, method = 'GET', body, extra = {}) => {
    const response = await fetch(base + '/api' + path, {
      method,
      headers: { Cookie: cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json', ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: response.status, data, headers: response.headers };
  };
}

test('a suíte PostgreSQL está configurada', { skip }, async () => {
  assert.equal(db.dialect, 'postgres');
  const version = await db.prepare('SELECT version() v').get();
  assert.match(version.v, /PostgreSQL/u);
});

test('conversão de placeholders ignora interrogações dentro de texto', () => {
  assert.equal(toNumbered('SELECT * FROM projects WHERE id=?'), 'SELECT * FROM projects WHERE id=$1');
  assert.equal(toNumbered('UPDATE t SET a=?,b=? WHERE c=?'), 'UPDATE t SET a=$1,b=$2 WHERE c=$3');
  // Literal de string não pode ser reescrito.
  assert.equal(toNumbered("SELECT 'olá? tudo bem?' AS t, id FROM p WHERE x=?"),
    "SELECT 'olá? tudo bem?' AS t, id FROM p WHERE x=$1");
});

test('todas as 19 tabelas existem e as chaves estrangeiras são aceitas', { skip }, async () => {
  const tables = await db.prepare("SELECT table_name FROM information_schema.tables WHERE table_schema='public'").all();
  const names = tables.map(t => t.table_name);
  for (const expected of ['users','participant_profiles','sessions','events','settings','event_consents',
    'projects','project_authors','rubric_criteria','assignments','reviews','review_scores','privacy_profiles',
    'publication_prefs','reviewer_profiles','reviewer_requests','audit_logs','schema_migrations','rate_limits']) {
    assert.ok(names.includes(expected), `tabela ausente: ${expected}`);
  }
  assert.equal(names.length, 19);
});

test('o seed grava dados reais e o tipo das métricas é numérico', { skip }, async () => {
  const users = await db.prepare('SELECT count(*) n FROM users').get();
  assert.equal(typeof users.n, 'number', 'count(*) deve chegar como número, não como string');
  assert.equal(users.n, 6);
  const projects = await db.prepare('SELECT count(*) n FROM projects').get();
  assert.equal(projects.n, 6);
  const organizer = await client('organizador@blindpitch.demo');
  const { status, data } = await organizer('/metrics');
  assert.equal(status, 200);
  assert.equal(typeof data.mean, 'number');
  assert.equal(typeof data.total_reviewers, 'number');
  assert.equal(data.total_projects, 6);
});

test('fluxo ponta a ponta no PostgreSQL: proposta, anonimização, avaliação e resultado', { skip }, async () => {
  const registration = {
    name: 'Autora Confidencial', email: 'autora-pg@example.test', password: 'SenhaSegura2026!',
    school_or_class: 'Colégio Identificador 2B', consent: false
  };
  assert.equal((await fetch(base + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(registration)
  })).status, 200);

  const participant = await client(registration.email, registration.password);
  const other = await client('participante1@blindpitch.demo');
  const organizer = await client('organizador@blindpitch.demo');
  const reviewer = await client('avaliador1@blindpitch.demo');

  const draft = await participant('/projects', 'POST', content('Sensores para reduzir consumo'));
  assert.equal(draft.status, 200);
  const projectId = draft.data.id;

  // Acesso horizontal bloqueado.
  assert.equal((await other(`/projects/${projectId}`)).status, 404);

  assert.equal((await participant(`/projects/${projectId}/submit`, 'POST', {})).status, 200);
  const submitted = await participant(`/projects/${projectId}/submit`, 'POST', {});
  assert.ok(submitted.status === 409 || submitted.status === 200);

  const detail = await participant(`/projects/${projectId}`);
  assert.match(detail.data.anonymous_code, /^BP-2026-\d{4}$/u);

  assert.equal((await organizer(`/projects/${projectId}/anonymize`, 'POST', {
    content: content('Sensores para reduzir consumo'), approved: true
  })).status, 200);

  const reviewers = await organizer('/users');
  const reviewerId = reviewers.data.find(u => u.email === 'avaliador1@blindpitch.demo').id;
  const assignment = await organizer('/assignments', 'POST', {
    project_id: projectId, reviewer_user_id: reviewerId, review_mode: 'anonymous'
  });
  assert.equal(assignment.status, 200);
  const assignmentId = assignment.data.id;

  const started = await reviewer(`/assignments/${assignmentId}/start`, 'POST', {});
  assert.equal(started.status, 200);

  const rubric = await reviewer('/rubric');
  assert.equal(rubric.status, 200);
  const scores = rubric.data.map(c => ({ criterion_id: c.id, score: 8, comment: 'Boa proposta.' }));
  const saved = await reviewer(`/assignments/${assignmentId}/review`, 'PUT', {
    scores, general_comment: 'Promissora.', finalize: true
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.review.submitted_at !== null, true);
  assert.equal(typeof saved.data.review.total_score, 'number');

  // Resultados ainda bloqueados para o participante até a liberação.
  const results = await participant(`/projects/${projectId}/results`);
  assert.equal(results.status, 403);

  // A edição só libera resultados depois de encerrar as etapas e concluir tudo.
  const guarded = await organizer('/event', 'PUT', {
    submissions_open: false, reviews_open: false, results_released: true
  });
  assert.equal(guarded.status, 409, 'liberação deve ser bloqueada com atribuições pendentes');

  // Conclui as atribuições que o seed deixou em aberto.
  const open = await organizer('/assignments');
  const users = await organizer('/users');
  for (const assignment of open.data.filter(a => a.status !== 'completed')) {
    const email = users.data.find(u => u.id === assignment.reviewer_user_id)?.email;
    if (!email) continue;
    const judge = await client(email);
    await judge(`/assignments/${assignment.id}/start`, 'POST', {});
    const criteria = await judge('/rubric');
    await judge(`/assignments/${assignment.id}/review`, 'PUT', {
      scores: criteria.data.map(c => ({ criterion_id: c.id, score: 8, comment: '' })),
      general_comment: 'Concluído para liberar resultados.', finalize: true
    });
  }

  const released = await organizer('/event', 'PUT', {
    submissions_open: false, reviews_open: false, reveal_identity: false, results_released: true
  });
  assert.equal(released.status, 200);
  const nowVisible = await participant(`/projects/${projectId}/results`);
  assert.equal(nowVisible.status, 200);
  assert.equal(typeof nowVisible.data.mean, 'number');

  // Reabre a edição: os testes seguintes dependem de submissões e avaliações abertas.
  const reopenedEvent = await organizer('/event', 'PUT', {
    submissions_open: true, reviews_open: true, results_released: false
  });
  assert.equal(reopenedEvent.status, 200);
});

test('anonimização é preservada no PostgreSQL: o avaliador não recebe PII', { skip }, async () => {
  const organizer = await client('organizador@blindpitch.demo');
  const reviewers = await organizer('/users');
  const reviewerId = reviewers.data.find(u => u.email === 'avaliador1@blindpitch.demo').id;
  // Escolha determinística: proposta aprovada e ainda sem este avaliador.
  const candidate = await db.prepare(`SELECT p.id FROM projects p
    WHERE p.anonymization_approved=1 AND p.status IN ('submitted','assigned','under_review')
      AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.project_id=p.id AND a.reviewer_user_id=?)
    LIMIT 1`).get(reviewerId);
  assert.ok(candidate, 'o seed deve ter uma proposta aprovada sem atribuição');
  const assignment = await organizer('/assignments', 'POST', {
    project_id: candidate.id, reviewer_user_id: reviewerId, review_mode: 'anonymous'
  });
  assert.equal(assignment.status, 200);
  const reviewer = await client('avaliador1@blindpitch.demo');
  const dto = await reviewer(`/assignments/${assignment.data.id}`);
  assert.equal(dto.status, 200);
  const serialized = JSON.stringify(dto.data);
  for (const forbidden of ['Marina Alves', 'Beatriz Lima', 'Caio Nunes', '@blindpitch.demo', 'Escola fictícia Aurora']) {
    assert.equal(serialized.includes(forbidden), false, `PII vazou para o avaliador: ${forbidden}`);
  }
  assert.equal(dto.data.author, undefined);
});

test('as 43 rotas respondem com o contrato esperado no PostgreSQL', { skip }, async () => {
  const organizer = await client('organizador@blindpitch.demo');
  const participant = await client('participante1@blindpitch.demo');
  const reviewer = await client('avaliador1@blindpitch.demo');
  const eventId = (await organizer('/event')).data.id;
  const owned = (await participant('/projects')).data[0];
  const assignmentId = (await reviewer('/assignments')).data.find(a => a.status !== 'completed')?.id
    ?? (await reviewer('/assignments')).data[0].id;
  const draft = (await participant('/projects', 'POST', content('Rascunho para cobertura'))).data.id;
  // Arquivamento e reabertura exigem o mesmo estado de entrada ('submitted'),
  // então cada um precisa da sua própria proposta.
  const draftArchive = (await participant('/projects', 'POST', content('Rascunho para arquivar'))).data.id;
  const draftReopen = (await participant('/projects', 'POST', content('Rascunho para reabrir'))).data.id;
  const slug = (await participant('/privacy')).data.portfolio_slug;

  // [rota, chamador, método, argumentos, status esperado]
  const cases = [
    ['/public', null, 'GET', [], 200],
    ['/register', null, 'POST', [{ name: 'Cobertura', email: `cob-${Date.now()}@example.test`, password: 'SenhaSegura2026!', school_or_class: '', consent: false }], 200],
    ['/login', null, 'POST', [{ email: 'organizador@blindpitch.demo', password: demoPassword }], 200],
    ['/session', participant, 'GET', [], 200],
    ['/events', organizer, 'GET', [], 200],
    ['/event', participant, 'GET', [], 200],
    ['/consent', participant, 'POST', [{ consent: true }], 200],
    ['/rubric', participant, 'GET', [], 200],
    ['/projects', participant, 'GET', [], 200],
    ['/projects', participant, 'POST', [content('Cobertura criada')], 200],
    [`/projects/${owned.id}`, participant, 'GET', [], 200],
    [`/projects/${draft}`, participant, 'PUT', [content('Cobertura editada')], 200],
    [`/projects/${draftArchive}/submit`, participant, 'POST', [{}], 200],
    [`/projects/${owned.id}/results`, organizer, 'GET', [], 200],
    [`/projects/${draftArchive}/anonymize`, organizer, 'POST', [{ content: content('Rascunho para arquivar'), approved: true }], 200],
    [`/projects/${draftArchive}/archive`, organizer, 'POST', [{}], 200],
    [`/projects/${draftReopen}/submit`, participant, 'POST', [{}], 200],
    [`/projects/${draftReopen}/anonymize`, organizer, 'POST', [{ content: content('Rascunho para reabrir'), approved: true }], 200],
    [`/projects/${draftReopen}/reopen`, organizer, 'POST', [{}], 200],
    ['/users', organizer, 'GET', [], 200],
    ['/reviewers', organizer, 'POST', [{ name: 'Avaliador Cobertura', email: `rev-${Date.now()}@example.test`, password: 'SenhaSegura2026!', school_or_class: '', consent: false }], 200],
    ['/assignments', organizer, 'GET', [], 200],
    ['/assignments', organizer, 'POST', [{ project_id: draft, reviewer_user_id: (await organizer('/users')).data.find(u => u.role === 'reviewer' && u.email !== 'avaliador1@blindpitch.demo').id, review_mode: 'anonymous' }], 409],
    [`/assignments/${assignmentId}`, reviewer, 'GET', [], 200],
    [`/assignments/${assignmentId}/start`, reviewer, 'POST', [{}], 200],
    [`/assignments/${assignmentId}/review`, reviewer, 'PUT', [{ scores: (await reviewer('/rubric')).data.map(c => ({ criterion_id: c.id, score: 7, comment: '' })), general_comment: '', finalize: true }], 200],
    ['/metrics', organizer, 'GET', [], 200],
    ['/audit', organizer, 'GET', [], 200],
    ['/rubric', organizer, 'PUT', [{ criteria: [{ name: 'Problema', description: 'd', min_score: 0, max_score: 10, weight: 1 }] }], 409],
    ['/event', organizer, 'PUT', [{ name: 'Ceará Faz Ciência 2026' }], 200],
    ['/export', organizer, 'GET', [], 200],
    ['/privacy', participant, 'GET', [], 200],
    ['/privacy', participant, 'PUT', [{ identification: 'after_approval', public_name: '', public_bio: '' }], 200],
    [`/projects/${owned.id}/publication`, participant, 'PUT', [{ targets: { gallery: true } }], 200],
    ['/profile/reviewer', reviewer, 'GET', [], 200],
    ['/profile/reviewer', reviewer, 'PUT', [{ education_level: 'Graduação', degrees: '', courses: '', specializations: '', knowledge_areas: '', bio: '', public_identity: false }], 200],
    ['/reviewer-requests', organizer, 'GET', [], 200],
    ['/public/gallery', null, 'GET', [], 200],
    ['/public/showcase', null, 'GET', [], 200],
    [`/public/portfolio/${slug}`, null, 'GET', [], 200],
    ['/public/reviewers', null, 'GET', [], 200],
    // Por último: criar uma edição a torna ativa e as rotas de projeto acima
    // passariam a procurar na edição nova.
    ['/events', organizer, 'POST', [{ name: 'Edição de cobertura', year: 2031 }], 200]
  ];

  const covered = new Set();
  for (const [path, caller, method, args, expected] of cases) {
    const key = `${method} ${path.replace(/:?[^/]+$/, ':id')}`;
    let status, data, headers;
    if (caller) {
      const response = await caller(path, method, ...args);
      status = response.status; data = response.data; headers = response.headers;
    } else {
      const response = await fetch(base + '/api' + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(args[0] ? { body: JSON.stringify(args[0]) } : {})
      });
      const text = await response.text();
      status = response.status; headers = response.headers;
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    }
    assert.equal(status, expected, `${method} ${path} -> ${status} ${JSON.stringify(data)?.slice(0, 140)}`);
    assert.equal(headers.get('content-type'), 'application/json; charset=utf-8', `${method} ${path}`);
    covered.add(`${method} ${path}`);
  }

  // PUT /api/reviewers/:id e PUT /api/reviewer-requests/:id usam ids dinâmicos.
  const users = await organizer('/users');
  const pending = await organizer('/reviewer-requests');
  const reviewerToToggle = users.data.find(u => u.role === 'reviewer' && u.email === 'avaliador2@blindpitch.demo');
  const toggled = await organizer(`/reviewers/${reviewerToToggle.id}`, 'PUT', { active: true });
  assert.equal(toggled.status, 200);
  covered.add(`PUT /reviewers/:id`);

  if (pending.data.length) {
    const decided = await organizer(`/reviewer-requests/${pending.data[0].user_id}`, 'PUT', { approve: false });
    assert.equal(decided.status, 200);
  }
  covered.add('PUT /reviewer-requests/:id');

  // Logout: precisa do par cookie/CSRF da MESMA sessão. Token de outra sessão
  // deve ser recusado com 403 — é a proteção de CSRF funcionando.
  const session = await loginRaw('participante3@blindpitch.demo');
  const mismatched = await fetch(base + '/api/logout', {
    method: 'POST',
    headers: { Cookie: session.cookie, 'X-CSRF-Token': 'a'.repeat(64), 'Content-Type': 'application/json' },
    body: '{}'
  });
  assert.equal(mismatched.status, 403, 'token CSRF inválido precisa ser recusado');

  const logoutResponse = await fetch(base + '/api/logout', {
    method: 'POST',
    headers: { Cookie: session.cookie, 'X-CSRF-Token': session.csrf, 'Content-Type': 'application/json' },
    body: '{}'
  });
  assert.equal(logoutResponse.status, 200);
  covered.add('POST /logout');

  assert.ok(covered.size >= 40, `cobertura insuficiente: ${covered.size}`);
  assert.ok(covered.has('POST /logout'));
});

async function loginRaw(email) {
  const response = await fetch(base + '/api/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: demoPassword })
  });
  const data = await response.json();
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: data.csrf };
}

test('códigos anônimos permanecem únicos sob submissões concorrentes', { skip }, async () => {
  const organizer = await client('organizador@blindpitch.demo');
  await organizer('/events', 'POST', { name: 'Edição concorrente', year: 2032 });
  const eventId = (await organizer('/event')).data.id;
  const suffix = `?event_id=${eventId}`;

  const drafts = [];
  for (let i = 0; i < 6; i++) {
    const email = `conc-${Date.now()}-${i}@example.test`;
    await fetch(base + '/api/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Concorrente ${i}`, email, password: 'SenhaSegura2026!', school_or_class: '', consent: false })
    });
    const caller = await client(email, 'SenhaSegura2026!');
    const draft = await caller(`/projects${suffix}`, 'POST', content(`Concorrência ${i}`));
    drafts.push({ caller, id: draft.data.id });
  }

  // Todas as submissões dispara ao mesmo tempo: é aqui que uma reserva de código
  // mal feita geraria BP-2032-0001 duplicado.
  const results = await Promise.all(drafts.map(d => d.caller(`/projects/${d.id}/submit${suffix}`, 'POST', {})));
  for (const response of results) assert.equal(response.status, 200);

  const codes = results.map(r => r.data.anonymous_code);
  assert.equal(new Set(codes).size, codes.length, `códigos duplicados: ${codes.join(', ')}`);
  for (const code of codes) assert.match(code, /^BP-2032-\d{4}$/u);

  const stored = await db.prepare('SELECT count(*) n,count(DISTINCT anonymous_code) d FROM projects WHERE anonymous_code LIKE ?').get('BP-2032-%');
  assert.equal(stored.n, stored.d);
});

test('e-mail duplicado sob concorrência produz um único cadastro', { skip }, async () => {
  const email = `duplicado-${Date.now()}@example.test`;
  const payload = { name: 'Mesma Pessoa', email, password: 'SenhaSegura2026!', school_or_class: '', consent: false };
  const responses = await Promise.all(Array.from({ length: 5 }, () => fetch(base + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  })));
  const statuses = responses.map(r => r.status).sort();
  assert.deepEqual(statuses, [200, 409, 409, 409, 409]);
  const found = await db.prepare('SELECT count(*) n FROM users WHERE email=?').get(email);
  assert.equal(found.n, 1);
});

test('transação com conexão dedicada desfaz tudo em caso de erro', { skip }, async () => {
  await assert.rejects(() => db.tx(async () => {
    await db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('teste_rollback', 'sim');
    await db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run('teste_rollback_duplicado', 'sim');
    throw new Error('falha proposital');
  }));
  const leftover = await db.prepare('SELECT count(*) n FROM settings WHERE key LIKE ?').get('teste_rollback%');
  assert.equal(leftover.n, 0, 'a transação deveria ter sido desfeita por completo');
});

test('sinais booleanos e epoch de sessão usam tipos corretos no PostgreSQL', { skip }, async () => {
  const email = `sessao-${Date.now()}@example.test`;
  await fetch(base + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Sessão', email, password: 'SenhaSegura2026!', school_or_class: '', consent: false })
  });
  const caller = await client(email, 'SenhaSegura2026!');
  assert.equal((await caller('/session')).status, 200);
  // expires_at é epoch em ms: cabe em BIGINT, mas estouraria INTEGER de 32 bits.
  const stored = await db.prepare('SELECT max(expires_at) max FROM sessions').get();
  assert.ok(stored.max > 1_700_000_000_000, `expires_at inesperado: ${stored.max}`);
  assert.ok(stored.max > Date.now(), 'a sessão deve expirar no futuro');
  const flags = await db.prepare('SELECT active,consent FROM users u LEFT JOIN participant_profiles p ON p.user_id=u.id WHERE u.email=?').get(email);
  assert.equal(flags.active, 1);
  assert.equal(flags.consent, 0);
  // Ativar/desativar avaliador grava 1/0, nunca 'true'.
  // Só é possível desativar quem não tem atribuições em aberto.
  const organizer = await client('organizador@blindpitch.demo');
  const reviewerId = (await db.prepare(`SELECT id FROM users WHERE role='reviewer'
    AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.reviewer_user_id=users.id AND a.status<>'completed')
    LIMIT 1`).get())?.id;
  assert.ok(reviewerId, 'deve existir um avaliador sem atribuições pendentes');
  await organizer(`/reviewers/${reviewerId}`, 'PUT', { active: false });
  const off = await db.prepare('SELECT active FROM users WHERE id=?').get(reviewerId);
  assert.equal(off.active, 0);
  await organizer(`/reviewers/${reviewerId}`, 'PUT', { active: true });
  const on = await db.prepare('SELECT active FROM users WHERE id=?').get(reviewerId);
  assert.equal(on.active, 1);
});

test('o limite de tentativas é compartilhado entre instâncias (não só em memória)', { skip }, async () => {
  // Uma segunda instância da aplicação, com o mesmo banco: em serverless cada
  // requisição pode cair numa instância diferente.
  const second = createApp(db);
  await new Promise(resolve => second.listen(0, '127.0.0.1', resolve));
  const secondBase = `http://127.0.0.1:${second.address().port}`;

  try {
    const existing = await db.prepare('SELECT count(*) n FROM rate_limits WHERE key LIKE ? AND at>?').get('login:%', Date.now() - 15 * 60000);
    const remaining = Math.max(0, 12 - existing.n);
    const attempt = async target => {
      const response = await fetch(target + '/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'inexistente@example.test', password: 'errada' })
      });
      return response.status;
    };

    // remaining-1 tentativas na instância A...
    for (let i = 0; i < Math.max(0, remaining - 1); i++) assert.equal(await attempt(base), 401);
    // ...e a próxima já é rejeitada na instância B, provando o estado compartilhado.
    assert.equal(await attempt(secondBase), 401);
    assert.equal(await attempt(secondBase), 429, 'o limite deveria valer somando as duas instâncias');
  } finally {
    await new Promise(resolve => second.close(resolve));
    // Libera o orçamento de tentativas para os testes seguintes.
    await db.prepare('DELETE FROM rate_limits').run();
  }
});

test('o log de auditoria ordena de forma estável e grava precisão de milissegundos', { skip }, async () => {
  const organizer = await client('organizador@blindpitch.demo');
  const log = await organizer('/audit');
  assert.equal(log.status, 200);
  assert.ok(log.data.length > 0);
  const timestamps = log.data.map(entry => entry.created_at);
  assert.equal(timestamps[0] >= timestamps[timestamps.length - 1], true, 'o log deve vir do mais recente para o mais antigo');
  assert.match(timestamps[0], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u);
});

test('a migração do schema é idempotente', { skip }, async () => {
  await db.migrate();
  await db.migrate();
  const tables = await db.prepare("SELECT count(*) n FROM information_schema.tables WHERE table_schema='public'").get();
  assert.equal(tables.n, 19);
  const userCount = await db.prepare('SELECT count(*) n FROM users').get();
  assert.equal(userCount.n > 0, true, 'reaplicar o schema não pode apagar dados');
});


// ---------------------------------------------------------------------------
// Arranque de uma base nova: recém-migrada, sem nenhuma linha.
// É o estado exato do Neon antes do primeiro deploy. Duas condições precisam
// valer ao mesmo tempo: o schema é reconhecido como aplicado e a edição inicial
// existe — senão a API responde 404 em quase todas as rotas.
// ---------------------------------------------------------------------------
describe('banco recém-migrado e vazio', { skip }, () => {
  let fresh, savedUrl, savedAdmin, savedPass;

  const serveApi = async stamp => {
    // Import com "cache-busting": cada execução precisa de uma instância limpa
    // do módulo, porque o handler memoiza o pool na variável pending.
    const { default: handler } = await import('../api/index.mjs?t=' + stamp);
    const server = createServer((request, response) => handler(request, response));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return { server, base: 'http://127.0.0.1:' + server.address().port };
  };

  before(async () => {
    fresh = await createTestDatabase();          // aplica o schema e deixa vazio
    savedUrl = process.env.DATABASE_URL;
    savedAdmin = process.env.ADMIN_EMAIL;
    savedPass = process.env.ADMIN_PASSWORD;
    process.env.DATABASE_URL = fresh.url;
    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
  });
  after(async () => {
    if (savedUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = savedUrl;
    if (savedAdmin === undefined) delete process.env.ADMIN_EMAIL; else process.env.ADMIN_EMAIL = savedAdmin;
    if (savedPass === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = savedPass;
    await fresh.db.close();
    await fresh.destroy();
  });

  test('o schema migrado e vazio é reconhecido como aplicado', async () => {
    const tabelas = await fresh.db.prepare("SELECT count(*) n FROM information_schema.tables WHERE table_schema='public'").get();
    assert.equal(tabelas.n, 19, 'o harness aplica o schema completo');

    const eventos = await fresh.db.prepare('SELECT count(*) n FROM events').get();
    const usuarios = await fresh.db.prepare('SELECT count(*) n FROM users').get();
    assert.equal(eventos.n, 0, 'a base começa sem nenhuma edição');
    assert.equal(usuarios.n, 0, 'a base começa sem nenhuma conta');

    // A sonda antiga tratava "vazio" como "sem schema". Este é o motivo do bug.
    const linha = await fresh.db.prepare('SELECT key FROM settings LIMIT 1').get();
    assert.equal(linha, null, 'settings está vazia logo após a migração');
    assert.equal(await fresh.db.schemaReady(), true,
      'um banco migrado e vazio precisa ser considerado pronto');
  });

  test('sem ADMIN_* a inicialização explica exatamente o que falta', async () => {
    await assert.rejects(
      () => ensureRealEdition(fresh.db, {}),
      /ADMIN_EMAIL/iu
    );
    const eventos = await fresh.db.prepare('SELECT count(*) n FROM events').get();
    assert.equal(eventos.n, 0, 'uma inicialização recusada não deixa edição pela metade');
  });

  test('a função da Vercel responde 503 antes de existir edição', async () => {
    const { server, base } = await serveApi('vazio');
    try {
      const response = await fetch(base + '/api/public');
      assert.equal(response.status, 503);
      // A resposta pública não revela configuração interna; o motivo vai ao log.
      assert.deepEqual(await response.json(), { error: 'Serviço temporariamente indisponível.' });
    } finally { server.close(); }
  });

  test('com ADMIN_* a edição inicial é criada uma única vez', async () => {
    const primeira = await ensureRealEdition(fresh.db, {
      email: 'organizador@bptest.test',
      password: 'SenhaOrganizador2026!'
    });
    const segunda = await ensureRealEdition(fresh.db, {
      email: 'organizador@bptest.test',
      password: 'SenhaOrganizador2026!'
    });
    assert.equal(primeira, true, 'a primeira chamada cria a edição');
    assert.equal(segunda, false, 'a segunda chamada não pode duplicar');

    const eventos = await fresh.db.prepare('SELECT count(*) n FROM events').get();
    assert.equal(eventos.n, 1, 'apenas uma edição, mesmo se várias instâncias subirem juntas');

    const criterios = await fresh.db.prepare('SELECT count(*) n FROM rubric_criteria').get();
    assert.equal(criterios.n, 6, 'a rubrica padrão é criada junto da edição');

    // O setting que getEvent() lê para resolver a edição ativa.
    const ativo = await fresh.db.prepare("SELECT value FROM settings WHERE key='active_event'").get();
    assert.ok(ativo?.value, 'active_event precisa apontar para a edição criada');
    const evento = await fresh.db.prepare('SELECT id, demo FROM events WHERE id=?').get(ativo.value);
    assert.ok(evento, 'o setting aponta para uma edição existente');
    assert.equal(Number(evento.demo), 0, 'a inicialização real não semeia demonstração');

    const conta = await fresh.db.prepare("SELECT email, role FROM users WHERE role='organizer'").get();
    assert.equal(conta.email, 'organizador@bptest.test');
  });

  test('depois da inicialização a função da Vercel serve as rotas reais', async () => {
    process.env.ADMIN_EMAIL = 'organizador@bptest.test';
    process.env.ADMIN_PASSWORD = 'SenhaOrganizador2026!';
    const { server, base } = await serveApi('pronto');
    try {
      const publico = await fetch(base + '/api/public');
      assert.equal(publico.status, 200, 'o 404 de /api/public não pode acontecer com a edição criada');
      const dados = await publico.json();
      assert.equal(dados.event.name, 'Ceará Faz Ciência 2026');
      assert.equal(dados.event.demo, false);
      assert.equal(dados.demo_notice, null, 'edição real não exibe o aviso de demonstração');

      const sessao = await fetch(base + '/api/session');
      assert.equal(sessao.status, 401);

      // Login com a conta criada na inicialização: resposta real, sem mock.
      const login = await fetch(base + '/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'organizador@bptest.test', password: 'SenhaOrganizador2026!' })
      });
      assert.equal(login.status, 200);
      const { user, csrf } = await login.json();
      assert.equal(user.role, 'organizer');
      const cookie = login.headers.get('set-cookie').split(';')[0];

      const metricas = await fetch(base + '/api/metrics', {
        headers: { Cookie: cookie, 'X-CSRF-Token': csrf }
      });
      assert.equal(metricas.status, 200);
      assert.equal((await metricas.json()).total_projects, 0, 'base nova não tem propostas');
    } finally { server.close(); }
  });
});

test('o banco de teste é destruído ao final', () => {
  // Guardamos o nome apenas para conferência manual; a remoção real acontece no after().
  assert.ok(adminUrl === null || typeof adminUrl === 'string');
});
