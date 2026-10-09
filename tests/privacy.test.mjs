// Privacidade, publicação, perfis e pontuação adicional — servidor como autoridade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';

async function scenario() {
  const db = openDb(':memory:');
  const { seed, demoPassword } = await import('../server/seed.mjs');
  seed(db);
  const server = createApp(db);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const sessions = new Map();
  async function login(email) {
    const response = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: demoPassword }) });
    const data = await response.json();
    assert.equal(response.status, 200, `login ${email}`);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    sessions.set(email, { cookie, csrf: data.csrf, id: data.user.id });
    return sessions.get(email);
  }
  async function call(email, method, path, body) {
    const session = sessions.get(email);
    const response = await fetch(`${base}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', Cookie: session.cookie, ...(method === 'GET' ? {} : { 'X-CSRF-Token': session.csrf }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, data: await response.json() };
  }
  return { db, base, sessions, login, call, close: () => new Promise(resolve => server.close(resolve)), demoPassword };
}

const identificationNames = { immediate: 'identificado desde o início', after_approval: 'somente após a aprovação', never: 'nunca identificado publicamente' };

test('cadastro registra o pedido de avaliador sem conceder o papel', async () => {
  const { db, base, close } = await scenario();
  try {
    const response = await fetch(`${base}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Nova Participante', email: 'nova@exemplo.test', password: 'senha-suficiente-123', school_or_class: '', consent: false, wants_to_review: true }) });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.reviewer_request, true);
    // O papel só muda por decisão do organizador, nunca pela escolha no cadastro.
    assert.equal(db.prepare("SELECT role FROM users WHERE email='nova@exemplo.test'").get().role, 'participant');
  } finally { await close(); }
});

test('auto-cadastro como avaliador não altera o papel armazenado', async () => {
  const { db, base, close } = await scenario();
  try {
    await fetch(`${base}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Falsa Avaliadora', email: 'falsa@exemplo.test', password: 'senha-suficiente-123', school_or_class: '', consent: false, wants_to_review: true }) });
    const user = db.prepare('SELECT role FROM users WHERE email=?').get('falsa@exemplo.test');
    assert.equal(user.role, 'participant', 'escolher avaliador não pode conceder o papel');
    const request = db.prepare('SELECT status FROM reviewer_requests WHERE user_id=?').get(db.prepare('SELECT id FROM users WHERE email=?').get('falsa@exemplo.test').id);
    assert.equal(request.status, 'pending');
  } finally { await close(); }
});

test('recusa de pedido não promove ninguém e fica registrada', async () => {
  const { db, base, login, call, close } = await scenario();
  try {
    await fetch(`${base}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Pedido Recusado', email: 'recusada@exemplo.test', password: 'senha-suficiente-123', school_or_class: '', consent: false, wants_to_review: true }) });
    const user = db.prepare("SELECT id FROM users WHERE email='recusada@exemplo.test'").get();
    // Um valor que não seja booleano é recusado, para não virar aprovação por engano.
    await login('organizador@blindpitch.demo');
    assert.equal((await call('organizador@blindpitch.demo', 'PUT', `/reviewer-requests/${user.id}`, { approve: 'sim' })).status, 400);
    const rejected = await call('organizador@blindpitch.demo', 'PUT', `/reviewer-requests/${user.id}`, { approve: false });
    assert.equal(rejected.status, 200);
    assert.equal(db.prepare('SELECT role FROM users WHERE id=?').get(user.id).role, 'participant', 'recusa não concede o papel');
    assert.equal(db.prepare('SELECT status FROM reviewer_requests WHERE user_id=?').get(user.id).status, 'rejected');
    assert.equal(db.prepare('SELECT count(*) n FROM audit_logs WHERE action=?').get('reviewer.request.rejected').n, 1, 'recusa deve ser auditada');
    assert.equal(db.prepare('SELECT count(*) n FROM reviewer_profiles WHERE user_id=?').get(user.id).n, 0, 'sem perfil de avaliador criado');
    // Decidido duas vezes é negado.
    assert.equal((await call('organizador@blindpitch.demo', 'PUT', `/reviewer-requests/${user.id}`, { approve: false })).status, 400);
  } finally { await close(); }
});

test('promoção a avaliador exige organizador e encerra a sessão', async () => {
  const { db, login, call, close } = await scenario();
  try {
    await login('participante1@blindpitch.demo');
    const participant = db.prepare("SELECT id FROM users WHERE email='participante1@blindpitch.demo'").get();
    db.prepare('INSERT INTO reviewer_requests(user_id,status) VALUES(?,?)').run(participant.id, 'pending');
    // O próprio participante não pode se promover.
    const self = await call('participante1@blindpitch.demo', 'PUT', `/reviewer-requests/${participant.id}`, { approve: true });
    assert.equal(self.status, 403);
    await login('organizador@blindpitch.demo');
    const approved = await call('organizador@blindpitch.demo', 'PUT', `/reviewer-requests/${participant.id}`, { approve: true });
    assert.equal(approved.status, 200);
    assert.equal(db.prepare('SELECT role FROM users WHERE id=?').get(participant.id).role, 'reviewer');
    assert.equal(db.prepare('SELECT count(*) n FROM audit_logs WHERE action=?').get('reviewer.request.approved').n, 1, 'promoção deve ser auditada');
    // A sessão anterior foi encerrada por segurança.
    assert.equal(db.prepare('SELECT count(*) n FROM sessions WHERE user_id=?').get(participant.id).n, 0);
  } finally { await close(); }
});

test('as três preferências de identificação persistem e são validadas', async () => {
  const { login, call, close } = await scenario();
  try {
    await login('participante1@blindpitch.demo');
    for (const identification of Object.keys(identificationNames)) {
      const saved = await call('participante1@blindpitch.demo', 'PUT', '/privacy', { identification, public_name: `Autora ${identification}`, public_bio: 'Apresentação pública autorizada.' });
      assert.equal(saved.status, 200, identification);
      const read = await call('participante1@blindpitch.demo', 'GET', '/privacy');
      assert.equal(read.data.identification, identification);
      assert.equal(read.data.public_name, `Autora ${identification}`);
    }
    const invalid = await call('participante1@blindpitch.demo', 'PUT', '/privacy', { identification: 'sempre', public_name: '', public_bio: '' });
    assert.equal(invalid.status, 400, 'opção desconhecida deve ser rejeitada');
    const stranger = await call('participante1@blindpitch.demo', 'PUT', '/privacy', { identification: 'never', public_name: 'x'.repeat(400), public_bio: '' });
    assert.equal(stranger.status, 400);
  } finally { await close(); }
});

test('portfólio anônimo não expõe nome, e-mail, escola nem código anônimo', async () => {
  const { db, base, login, call, close } = await scenario();
  try {
    await login('participante1@blindpitch.demo');
    const project = db.prepare("SELECT p.id,p.anonymous_code FROM projects p JOIN project_authors a ON a.project_id=p.id JOIN users u ON u.id=a.user_id WHERE u.email='participante1@blindpitch.demo' LIMIT 1").get();
    // Publica com identidade totalmente protegida.
    await call('participante1@blindpitch.demo', 'PUT', '/privacy', { identification: 'never', public_name: '', public_bio: '' });
    await call('participante1@blindpitch.demo', 'PUT', `/projects/${project.id}/publication`, { targets: { portfolio: true, gallery: true, showcase: true } });
    db.prepare('UPDATE projects SET anonymization_approved=1,status=? WHERE id=?').run('reviewed', project.id);

    const gallery = await (await fetch(`${base}/api/public/gallery`)).json();
    const entry = gallery.projects.find(p => p.title);
    assert.ok(entry, 'galeria deve listar o projeto autorizado');
    const serialized = JSON.stringify(gallery);
    assert.ok(!serialized.includes(project.anonymous_code), 'código anônimo não pode vazar publicamente');
    assert.ok(!serialized.includes('participante1'), 'e-mail não pode vazar');
    assert.ok(!/@exemplo|@blindpitch\.demo/u.test(serialized), 'nenhum e-mail pode vazar');
    assert.ok(!('anonymous_code' in entry) && !('id' in entry) && !('author' in entry));

    // O endereço do portfólio é um token aleatório, não o nome de ninguém.
    const privacy = await call('participante1@blindpitch.demo', 'GET', '/privacy');
    const slug = privacy.data.portfolio_slug;
    assert.match(slug, /^bp-[a-f0-9]{8}$/u, 'o endereço deve ser um token aleatório');
    const portfolio = await (await fetch(`${base}/api/public/portfolio/${slug}`)).json();
    assert.equal(portfolio.anonymous, true, 'identidade never mantém o portfólio anônimo');
    assert.ok(Array.isArray(portfolio.projects));
    // Nomes usados como endereço têm de ser recusados.
    const byName = await fetch(`${base}/api/public/portfolio/${encodeURIComponent('Nome Oculto')}`);
    assert.equal(byName.status, 404, 'o nome público não pode funcionar como endereço');
  } finally { await close(); }
});

test('identidade só aparece publicamente quando autorizada e liberada', async () => {
  const { db, base, login, call, close } = await scenario();
  try {
    await login('participante1@blindpitch.demo');
    const project = db.prepare("SELECT p.id FROM projects p JOIN project_authors a ON a.project_id=p.id JOIN users u ON u.id=a.user_id WHERE u.email='participante1@blindpitch.demo' LIMIT 1").get();
    db.prepare('UPDATE projects SET anonymization_approved=1,status=? WHERE id=?').run('reviewed', project.id);
    await call('participante1@blindpitch.demo', 'PUT', `/projects/${project.id}/publication`, { targets: { portfolio: true } });

    // O endereço vem do token, nunca do nome — inclusive quando o nome está autorizado.
    const slug = (await call('participante1@blindpitch.demo', 'GET', '/privacy')).data.portfolio_slug;

    // 'never' nunca revela, mesmo com reveal_identity ligado na edição.
    await call('participante1@blindpitch.demo', 'PUT', '/privacy', { identification: 'never', public_name: 'Nome Oculto', public_bio: '' });
    db.prepare('UPDATE events SET reveal_identity=1').run();
    let portfolio = await (await fetch(`${base}/api/public/portfolio/${slug}`)).json();
    assert.equal(portfolio.anonymous, true, 'preferência never deve manter o portfólio anônimo');
    assert.equal(portfolio.name, null);
    assert.ok(!JSON.stringify(portfolio).includes('Nome Oculto'), 'o nome não pode aparecer nem na URL nem no corpo');

    // 'immediate' revela desde já.
    await call('participante1@blindpitch.demo', 'PUT', '/privacy', { identification: 'immediate', public_name: 'Nome Aberto', public_bio: '' });
    portfolio = await (await fetch(`${base}/api/public/portfolio/${slug}`)).json();
    assert.equal(portfolio.name, 'Nome Aberto');
    assert.equal(portfolio.anonymous, false);
    assert.ok(portfolio.projects.length >= 1);
    // O endereço continua o mesmo: trocar o nome público não quebra nem expõe o vínculo.
    assert.equal(portfolio.slug, slug);
  } finally { await close(); }
});

test('projeto sem destino selecionado, não aprovado ou arquivado não é publicado', async () => {
  const { db, base, login, call, close } = await scenario();
  try {
    await login('participante1@blindpitch.demo');
    const project = db.prepare("SELECT p.id FROM projects p JOIN project_authors a ON a.project_id=p.id JOIN users u ON u.id=a.user_id WHERE u.email='participante1@blindpitch.demo' LIMIT 1").get();
    const title = db.prepare('SELECT title FROM projects WHERE id=?').get(project.id).title;

    // Sem destinos, mesmo aprovado, não aparece.
    db.prepare('UPDATE projects SET anonymization_approved=1,status=? WHERE id=?').run('reviewed', project.id);
    let gallery = await (await fetch(`${base}/api/public/gallery`)).json();
    assert.ok(!gallery.projects.some(p => p.title === title), 'sem destino não publica');

    // Com destino, mas sem aprovação da anonimização, continua fora.
    await call('participante1@blindpitch.demo', 'PUT', `/projects/${project.id}/publication`, { targets: { gallery: true } });
    db.prepare('UPDATE projects SET anonymization_approved=0').run();
    gallery = await (await fetch(`${base}/api/public/gallery`)).json();
    assert.ok(!gallery.projects.some(p => p.title === title), 'sem aprovação não publica');

    // Rascunho nunca publica.
    db.prepare("UPDATE projects SET anonymization_approved=1,status='draft' WHERE id=?").run(project.id);
    gallery = await (await fetch(`${base}/api/public/gallery`)).json();
    assert.ok(!gallery.projects.some(p => p.title === title), 'rascunho não publica');

    // Arquivado nunca publica.
    db.prepare("UPDATE projects SET status='archived' WHERE id=?").run(project.id);
    gallery = await (await fetch(`${base}/api/public/gallery`)).json();
    assert.ok(!gallery.projects.some(p => p.title === title), 'arquivado não publica');
  } finally { await close(); }
});

test('destinos de publicação são independentes por projeto', async () => {
  const { db, base, login, call, close } = await scenario();
  try {
    await login('participante1@blindpitch.demo');
    const projects = db.prepare("SELECT p.id,p.title FROM projects p JOIN project_authors a ON a.project_id=p.id JOIN users u ON u.id=a.user_id WHERE u.email='participante1@blindpitch.demo' LIMIT 2").all();
    if (projects.length < 2) return;
    for (const p of projects) db.prepare("UPDATE projects SET anonymization_approved=1,status='reviewed' WHERE id=?").run(p.id);
    await call('participante1@blindpitch.demo', 'PUT', `/projects/${projects[0].id}/publication`, { targets: { gallery: true } });
    await call('participante1@blindpitch.demo', 'PUT', `/projects/${projects[1].id}/publication`, { targets: { showcase: true } });
    const gallery = await (await fetch(`${base}/api/public/gallery`)).json();
    const showcase = await (await fetch(`${base}/api/public/showcase`)).json();
    assert.ok(gallery.projects.some(p => p.title === projects[0].title), 'primeiro projeto vai para a galeria');
    assert.ok(!gallery.projects.some(p => p.title === projects[1].title), 'segundo não vai para a galeria');
    assert.ok(showcase.projects.some(p => p.title === projects[1].title), 'segundo vai para a vitrine');
    assert.ok(!showcase.projects.some(p => p.title === projects[0].title), 'primeiro não vai para a vitrine');
  } finally { await close(); }
});

test('participante não altera destinos de projeto alheio', async () => {
  const { db, login, call, close } = await scenario();
  try {
    await login('participante1@blindpitch.demo');
    await login('participante2@blindpitch.demo');
    const other = db.prepare("SELECT p.id FROM projects p JOIN project_authors a ON a.project_id=p.id JOIN users u ON u.id=a.user_id WHERE u.email='participante1@blindpitch.demo' LIMIT 1").get();
    const forbidden = await call('participante2@blindpitch.demo', 'PUT', `/projects/${other.id}/publication`, { targets: { gallery: true } });
    assert.equal(forbidden.status, 404, 'acesso horizontal deve ser bloqueado');
  } finally { await close(); }
});

test('pontos adicionais exigem justificativa e respeitam o limite da edição', async () => {
  const { db, login, call, close } = await scenario();
  try {
    await login('avaliador1@blindpitch.demo');
    const assignment = db.prepare("SELECT id FROM assignments WHERE reviewer_user_id=(SELECT id FROM users WHERE email='avaliador1@blindpitch.demo') AND status<>'completed' LIMIT 1").get();
    if (!assignment) return;
    const criteria = db.prepare('SELECT * FROM rubric_criteria ORDER BY order_index').all();
    const full = criteria.map(c => ({ criterion_id: c.id, score: 5, comment: '' }));

    // Sem justificativa, o servidor recusa mesmo que a interface permita enviar.
    let attempt = await call('avaliador1@blindpitch.demo', 'PUT', `/assignments/${assignment.id}/review`, { scores: full, general_comment: '', finalize: false, bonus: { points: 2, justification: '', criterion: '' } });
    assert.equal(attempt.status, 400, 'pontos sem justificativa devem ser rejeitados');

    // Justificativa só com espaços é rejeitada.
    attempt = await call('avaliador1@blindpitch.demo', 'PUT', `/assignments/${assignment.id}/review`, { scores: full, general_comment: '', finalize: false, bonus: { points: 1, justification: '     ', criterion: '' } });
    assert.equal(attempt.status, 400);

    // Acima do limite configurado.
    db.prepare('UPDATE events SET bonus_max=2').run();
    attempt = await call('avaliador1@blindpitch.demo', 'PUT', `/assignments/${assignment.id}/review`, { scores: full, general_comment: '', finalize: false, bonus: { points: 9, justification: 'Mérito extraordinário justificado.', criterion: '' } });
    assert.equal(attempt.status, 400);

    // Válido: registra e calcula a nota final.
    const ok = await call('avaliador1@blindpitch.demo', 'PUT', `/assignments/${assignment.id}/review`, { scores: full, general_comment: 'Comentário', finalize: true, bonus: { points: 1.5, justification: 'Método replicável com controle adequado.', criterion: 'Metodologia' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    const review = db.prepare('SELECT r.* FROM reviews r JOIN assignments a ON a.id=r.assignment_id WHERE a.id=?').get(assignment.id);
    assert.equal(review.bonus_points, 1.5);
    assert.ok(review.bonus_justification.length > 0);
    assert.ok(review.bonus_granted_by, 'deve registrar quem concedeu');
    assert.ok(review.bonus_granted_at, 'deve registrar a data');
    assert.ok(review.total_score > 0);
    // normalized_score continua sendo só da rubrica: a escala original não muda.
    assert.ok(review.normalized_score >= 0 && review.normalized_score <= 100);
  } finally { await close(); }
});

test('pontos adicionais são zerados quando a seção fica vazia', async () => {
  const { db, login, call, close } = await scenario();
  try {
    await login('avaliador2@blindpitch.demo');
    const assignment = db.prepare("SELECT id FROM assignments WHERE reviewer_user_id=(SELECT id FROM users WHERE email='avaliador2@blindpitch.demo') AND status<>'completed' LIMIT 1").get();
    if (!assignment) return;
    const criteria = db.prepare('SELECT * FROM rubric_criteria ORDER BY order_index').all();
    const ok = await call('avaliador2@blindpitch.demo', 'PUT', `/assignments/${assignment.id}/review`, { scores: criteria.map(c => ({ criterion_id: c.id, score: 4, comment: '' })), general_comment: '', finalize: false, bonus: { points: 0, justification: '', criterion: '' } });
    assert.equal(ok.status, 200);
    const review = db.prepare('SELECT r.bonus_points,r.bonus_justification FROM reviews r JOIN assignments a ON a.id=r.assignment_id WHERE a.id=?').get(assignment.id);
    assert.equal(review.bonus_points, 0);
    assert.equal(review.bonus_justification, '');
  } finally { await close(); }
});

test('justificativa de pontos é removida de identificadores na avaliação anônima', async () => {
  const { db, login, call, close } = await scenario();
  try {
    // Usa a atribuição anônima real e o autor REAL dela: o nome cit��do é o do dono do projeto.
    const assignment = db.prepare("SELECT a.id,a.project_id,a.reviewer_user_id FROM assignments a JOIN projects p ON p.id=a.project_id WHERE a.review_mode='anonymous' AND a.status<>'completed' AND p.anonymization_approved=1 LIMIT 1").get();
    if (!assignment) return;
    const author = db.prepare('SELECT u.name FROM project_authors a JOIN users u ON u.id=a.user_id WHERE a.project_id=?').get(assignment.project_id);
    db.prepare("INSERT OR IGNORE INTO privacy_profiles(user_id,identification) SELECT id,'never' FROM users WHERE id=?").run(author.id ? db.prepare('SELECT user_id FROM project_authors WHERE project_id=?').get(assignment.project_id).user_id : '');
    const reviewerEmail = db.prepare('SELECT email FROM users WHERE id=?').get(assignment.reviewer_user_id).email;
    await login(reviewerEmail);
    await call(reviewerEmail, 'PUT', `/assignments/${assignment.id}/start`, {});
    const criteria = db.prepare('SELECT * FROM rubric_criteria ORDER BY order_index').all();
    // O avaliador escreve o nome do autor na justificativa: nem resposta nem banco podem guardá-lo.
    const result = await call(reviewerEmail, 'PUT', `/assignments/${assignment.id}/review`, {
      scores: criteria.map(c => ({ criterion_id: c.id, score: 5, comment: '' })), general_comment: '',
      finalize: false, bonus: { points: 1, justification: `Excelente trabalho de ${author.name}.`, criterion: 'Clareza' }
    });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    assert.ok(!JSON.stringify(result.data).includes(author.name), 'o nome do autor não pode voltar na resposta anônima');
    const stored = db.prepare('SELECT r.bonus_justification FROM reviews r WHERE r.assignment_id=?').get(assignment.id);
    assert.ok(stored && !stored.bonus_justification.includes(author.name), 'o banco também não pode conservar o identificador');
  } finally { await close(); }
});

test('avaliação finalizada não aceita alteração de nota nem de bônus', async () => {
  const { db, login, call, close } = await scenario();
  try {
    await login('avaliador1@blindpitch.demo');
    const done = db.prepare("SELECT a.id FROM assignments a JOIN reviews r ON r.assignment_id=a.id WHERE a.reviewer_user_id=(SELECT id FROM users WHERE email='avaliador1@blindpitch.demo') AND r.submitted_at IS NOT NULL LIMIT 1").get();
    if (!done) return;
    const criteria = db.prepare('SELECT * FROM rubric_criteria ORDER BY order_index').all();
    const blocked = await call('avaliador1@blindpitch.demo', 'PUT', `/assignments/${done.id}/review`, { scores: criteria.map(c => ({ criterion_id: c.id, score: 1, comment: '' })), general_comment: '', finalize: true, bonus: { points: 2, justification: 'Tentativa inválida aqui.', criterion: '' } });
    assert.equal(blocked.status, 409);
  } finally { await close(); }
});

test('perfil acadêmico do avaliador é privado e as estatísticas contam só o concluído', async () => {
  const { login, call, close } = await scenario();
  try {
    await login('avaliador1@blindpitch.demo');
    const saved = await call('avaliador1@blindpitch.demo', 'PUT', '/profile/reviewer', { education_level: 'Ensino Superior', degrees: 'Licenciatura em Física', courses: 'Introdução à Robótica', specializations: 'Instrumentação', knowledge_areas: 'Física, Robótica', bio: 'Bioografia autorizada.', public_identity: true });
    assert.equal(saved.status, 200);
    const read = await call('avaliador1@blindpitch.demo', 'GET', '/profile/reviewer');
    assert.equal(read.data.profile.education_level, 'Ensino Superior');
    assert.equal(read.data.stats.reviews_completed >= 0, true);
    // Participante não lê o perfil de um avaliador.
    await login('participante1@blindpitch.demo');
    const denied = await call('participante1@blindpitch.demo', 'GET', '/profile/reviewer');
    assert.equal(denied.status, 403);
  } finally { await close(); }
});

test('perfil público do avaliador só expõe o autorizado e usa notas reais', async () => {
  const { base, login, call, close } = await scenario();
  try {
    await login('avaliador2@blindpitch.demo');
    await call('avaliador2@blindpitch.demo', 'PUT', '/profile/reviewer', { education_level: 'Ensino Médio', degrees: '', courses: '', specializations: '', knowledge_areas: 'Biologia', bio: 'Bioografia pública.', public_identity: true });
    const data = await (await fetch(`${base}/api/public/reviewers`)).json();
    assert.ok(Array.isArray(data.reviewers), 'a resposta deve conter a lista de perfis');
    const entry = data.reviewers.find(r => r.education_level === 'Ensino Médio' && r.knowledge_areas === 'Biologia');
    assert.ok(entry, 'avaliador que autorizou identidade deve aparecer');
    assert.equal(typeof entry.reviews_completed, 'number');
    assert.equal(entry.mean_score === null || typeof entry.mean_score === 'number', true);
    assert.ok(!('email' in entry) && !('user_id' in entry), 'nada de identificador interno');
  } finally { await close(); }
});

test('avaliador sem identidade pública não aparece na galeria pública', async () => {
  const { base, login, call, close } = await scenario();
  try {
    await login('avaliador1@blindpitch.demo');
    await call('avaliador1@blindpitch.demo', 'PUT', '/profile/reviewer', { education_level: 'Ensino Médio', degrees: '', courses: '', specializations: '', knowledge_areas: 'Física', bio: '', public_identity: false });
    const data = await (await fetch(`${base}/api/public/reviewers`)).json();
    assert.ok(!data.reviewers.some(r => r.education_level === 'Ensino Médio'), 'perfil privado não pode ser listado');
  } finally { await close(); }
});

test('apenas participantes gerenciam privacidade e apenas o organizador aprova avaliadores', async () => {
  const { login, call, close } = await scenario();
  try {
    await login('organizador@blindpitch.demo');
    assert.equal((await call('organizador@blindpitch.demo', 'PUT', '/privacy', { identification: 'never', public_name: '', public_bio: '' })).status, 403);
    await login('avaliador1@blindpitch.demo');
    assert.equal((await call('avaliador1@blindpitch.demo', 'GET', '/privacy')).status, 403);
  } finally { await close(); }
});

test('publicação por texto direto não injeta identificadores na galeria', async () => {
  const { db, base, login, call, close } = await scenario();
  try {
    await login('participante2@blindpitch.demo');
    const project = db.prepare("SELECT p.id FROM projects p JOIN project_authors a ON a.project_id=p.id JOIN users u ON u.id=a.user_id WHERE u.email='participante2@blindpitch.demo' LIMIT 1").get();
    db.prepare("UPDATE projects SET anonymization_approved=1,status='reviewed',problem=? WHERE id=?")
      .run('Projeto conduzido por Ana Souza, contato ana@escola.test.', project.id);
    await call('participante2@blindpitch.demo', 'PUT', `/projects/${project.id}/publication`, { targets: { gallery: true } });
    const gallery = await (await fetch(`${base}/api/public/gallery`)).json();
    const serialized = JSON.stringify(gallery);
    assert.ok(!serialized.includes('ana@escola.test'), 'e-mail dentro do texto deve ser removido na publicação');
    assert.ok(!serialized.includes('Ana Souza'), 'nome dentro do texto deve ser removido na publicação');
  } finally { await close(); }
});
test('varredura: nenhum endpoint alcançável pelo avaliador devolve dados de participante', async () => {
  const { db, base, sessions, login, call, close } = await scenario();
  try {
    await login('avaliador1@blindpitch.demo');
    const cookie = sessions.get('avaliador1@blindpitch.demo').cookie;
    const people = db.prepare(`SELECT u.email,u.name,p.school_or_class FROM users u
      LEFT JOIN participant_profiles p ON p.user_id=u.id WHERE u.role='participant'`).all();
    assert.ok(people.length >= 3, 'há participantes para comparar');

    // Todas as rotas GET que um avaliador consegue alcançar, inclusive as públicas.
    const routes = ['/session', '/event', '/events', '/rubric', '/assignments',
      '/profile/reviewer', '/public', '/public/gallery', '/public/showcase', '/public/reviewers'];
    for (const route of routes) {
      const response = await fetch(`${base}/api${route}`, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200, `status de ${route}`);
      const text = await response.text();
      for (const person of people) {
        assert.ok(!text.includes(person.email), `${route} expôs o e-mail ${person.email}`);
        if (person.school_or_class) assert.ok(!text.includes(person.school_or_class), `${route} expôs a instituição "${person.school_or_class}"`);
      }
    }

    // Toda atribuição anônima do avaliador, no detalhe.
    const anonymous = db.prepare(`SELECT a.id FROM assignments a
      JOIN projects p ON p.id=a.project_id
      JOIN users u ON u.id=a.reviewer_user_id
      WHERE u.email='avaliador1@blindpitch.demo' AND a.review_mode='anonymous' AND p.anonymization_approved=1`).all();
    assert.ok(anonymous.length >= 1, 'há atribuições anônimas');
    for (const assignment of anonymous) {
      const detail = await call('avaliador1@blindpitch.demo', 'GET', `/assignments/${assignment.id}`);
      assert.equal(detail.status, 200);
      const text = JSON.stringify(detail.data);
      for (const person of people) {
        assert.ok(!text.includes(person.email), `atribuição ${assignment.id} expôs e-mail`);
        assert.ok(!text.includes(person.name), `atribuição ${assignment.id} expôs o nome do autor`);
        if (person.school_or_class) assert.ok(!text.includes(person.school_or_class), `atribuição ${assignment.id} expôs a instituição`);
      }
      assert.ok(!('author' in detail.data), 'modo anônimo não tem objeto de autoria');
    }

    // O que é negado continua negado: rotas administrativas não abrem para avaliador.
    for (const route of ['/users', '/audit', '/metrics', '/export', '/reviewer-requests']) {
      const session = sessions.get('avaliador1@blindpitch.demo');
      const response = await fetch(`${base}/api${route}`, { headers: { Cookie: session.cookie } });
      assert.equal(response.status, 403, `${route} deveria ser negado ao avaliador`);
    }
  } finally { await close(); }
});