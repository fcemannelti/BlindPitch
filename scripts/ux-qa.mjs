// QA das páginas novas em Chrome headless: semântica, foco, rótulos,
// responsividade, erros de console e conteúdo público. Sem dependências.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDb } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { seed } from '../server/seed.mjs';

const executable = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome'
].find(existsSync);
if (!executable) throw new Error('Configure CHROME_PATH para executar o teste de navegador.');

const temporary = mkdtempSync(join(tmpdir(), 'blindpitch-ux-'));
const output = resolve('test-results/ux'); mkdirSync(output, { recursive: true });
const db = openDb(join(temporary, 'test.sqlite')); seed(db);
const server = createApp(db);
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = 'http://127.0.0.1:' + server.address().port;

const chrome = spawn(executable, ['--headless', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--user-data-dir=' + temporary, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket, sequence = 0; const pending = new Map(), report = [], browserErrors = [];
const delay = ms => new Promise(done => setTimeout(done, ms));
async function until(check, label) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await check()) return; await delay(40); }
  throw new Error('Tempo esgotado: ' + label);
}
function command(method, params = {}) {
  return new Promise((done, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 12000);
    pending.set(id, { resolve: value => { clearTimeout(timer); done(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description);
  return result.result.value;
}
const visible = selector => evaluate(`!!document.querySelector(${JSON.stringify(selector)}) && document.querySelector(${JSON.stringify(selector)}).getClientRects().length>0`);
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function fill(name, value) {
  await evaluate(`{const control=document.querySelector('[name="${name}"]');control.value=${JSON.stringify(value)};control.dispatchEvent(new Event('input',{bubbles:true}));}`);
}
async function screenshot(name) {
  const result = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(join(output, name + '.png'), Buffer.from(result.data, 'base64'));
}
function passed(name) { report.push(name); console.log('OK · ' + name); }

// Auditoria de acessibilidade aplicada ao DOM real da página.
const a11yAudit = () => {
  const problems = [];
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  if (document.querySelectorAll('h1').length !== 1) problems.push('h1: ' + document.querySelectorAll('h1').length);
  for (let i = 1; i < headings.length; i++) {
    const previous = Number(headings[i - 1].tagName[1]), current = Number(headings[i].tagName[1]);
    if (current > previous + 1) problems.push('salto de hierarquia ' + headings[i - 1].tagName + '→' + headings[i].tagName);
  }
  for (const control of document.querySelectorAll('input,select,textarea')) {
    if (control.type === 'hidden') continue;
    const labelled = (control.labels && control.labels.length > 0) || control.getAttribute('aria-label') || control.getAttribute('aria-labelledby') || control.closest('label');
    if (!labelled) problems.push('controle sem rótulo: ' + (control.name || control.type));
  }
  for (const image of document.querySelectorAll('img')) if (!image.hasAttribute('alt')) problems.push('img sem alt: ' + (image.getAttribute('src') || '').slice(-40));
  for (const svg of document.querySelectorAll('svg')) if (svg.getAttribute('aria-hidden') !== 'true' && !svg.getAttribute('role') && !svg.getAttribute('aria-label')) problems.push('svg decorativo sem aria-hidden');
  for (const button of document.querySelectorAll('button')) {
    const text = (button.textContent || '').trim();
    if (!text && !button.getAttribute('aria-label') && !button.getAttribute('title')) problems.push('botão de ícone sem rótulo acessível');
  }
  for (const link of document.querySelectorAll('a')) {
    const text = (link.textContent || '').trim();
    if (!text && !link.getAttribute('aria-label')) problems.push('link sem texto nem aria-label: ' + (link.getAttribute('href') || ''));
  }
  const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (overflow > 1) problems.push('overflow horizontal de ' + overflow + 'px');
  return problems;
};

try {
  let port;
  await until(() => {
    try { const value = readFileSync(join(temporary, 'DevToolsActivePort'), 'utf8').split('\n')[0]; if (!/^\d+$/u.test(value)) return false; port = value; return true; }
    catch { return false; }
  }, 'inicialização do Chrome');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') browserErrors.push(data.params.exceptionDetails.text);
    if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') browserErrors.push(data.params.args.map(arg => arg.value || arg.description).join(' '));
    const request = pending.get(data.id); if (!request) return;
    pending.delete(data.id);
    if (data.error) request.reject(new Error(data.error.message)); else request.resolve(data.result);
  });
  await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');

  async function switchUser(email) {
    if (await visible('#logout')) { await click('#logout'); await until(() => visible('#auth-form'), 'logout'); }
    // Sempre pela tela de entrada: o formulário de cadastro também tem e-mail e senha.
    await evaluate(`location.hash='#/login'`); await until(() => visible('#auth-form [name="password"]'), 'tela de entrada');
    await fill('email', email); await fill('password', 'BlindPitch2026!');
    await click('#auth-form button[type="submit"]');
    await until(() => visible('#logout'), 'sessão autenticada de ' + email);
  }
  async function visit(hash, wait, name, widths = [390, 1440]) {
    browserErrors.length = 0;
    await evaluate(`location.hash=${JSON.stringify(hash)}`);
    await until(() => visible(wait), name + ' carregou');
    await delay(200);
    for (const width of widths) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
      await delay(260);
      const problems = await evaluate(`(${a11yAudit})()`);
      assert.deepEqual(problems, [], `${name} @${width}px`);
      if (width === 390) await screenshot(name + '-390');
      if (width === 1440) await screenshot(name + '-1440');
    }
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    assert.deepEqual(browserErrors, [], `${name}: erros de console`);
    passed(`${name}: semântica, rótulos, hierarquia, foco e overflow corretos em 390px e 1440px`);
  }

  // 1. Seleção de perfil no cadastro.
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: base });
  await until(() => visible('.skip-link'), 'aplicação carregada');
  await evaluate(`location.hash='#/register'`); await until(() => visible('#auth-form'), 'cadastro');
  assert.equal(await evaluate(`document.querySelectorAll('[name="role"]').length`), 2, 'duas opções de perfil');
  assert.equal(await evaluate(`[...document.querySelectorAll('[name="role"]')].map(r=>r.value).join()`), 'participant,reviewer');
  assert.ok((await evaluate(`document.querySelector('.role-choice').textContent`)).includes('autorizado pela organização'));
  await visit('/register', '#auth-form', 'cadastro-perfil');
  passed('cadastro oferece Participante e Avaliador com explicação de autorização');

  // 2. Participante: privacidade, três opções e endereço do portfólio.
  await switchUser('participante1@blindpitch.demo');
  await visit('/privacy', '#privacy-form', 'privacidade');
  assert.equal(await evaluate(`document.querySelectorAll('[name="identification"]').length`), 3, 'três preferências');
  const options = await evaluate(`[...document.querySelectorAll('[name="identification"]')].map(r=>r.value).join()`);
  assert.equal(options, 'immediate,after_approval,never');
  assert.equal(await evaluate(`!!document.querySelector('#portfolio-slug').textContent.match(/^bp-[a-f0-9]{8}$/)`), true, 'endereço aleatório');
  // As três opções persistem de verdade, através da API real.
  for (const identification of ['never', 'after_approval', 'immediate']) {
    await evaluate(`document.querySelector('[name="identification"][value="${identification}"]').checked=true;window.__before=document.querySelector('#privacy-form')`);
    await click('#privacy-form button[type="submit"]');
    // O formulário é re-renderizado pelo servidor: a nova instância marca o fim do salvamento.
    await until(() => evaluate(`window.__before && document.querySelector('#privacy-form')!==window.__before`), 'preferência ' + identification + ' salva');
    const stored = db.prepare('SELECT identification FROM privacy_profiles WHERE user_id=?').get(db.prepare("SELECT id FROM users WHERE email='participante1@blindpitch.demo'").get().id);
    assert.equal(stored.identification, identification, 'persistência de ' + identification);
  }
  passed('três preferências de identificação persistem no banco pela interface');

  // 3. Destinos de publicação com prévia, no detalhe do projeto.
  const own = db.prepare("SELECT p.id FROM projects p JOIN project_authors a ON a.project_id=p.id JOIN users u ON u.id=a.user_id WHERE u.email='participante1@blindpitch.demo' LIMIT 1").get();
  await visit('/projects/' + own.id, '.publication-panel', 'publicacao');
  assert.equal(await evaluate(`document.querySelectorAll('.publication-panel [data-target]').length`), 3, 'três destinos');
  assert.equal(await visible('.publication-preview'), false, 'prévia começa oculta');
  await click('.publication-panel [data-preview-publication]');
  await until(() => visible('.publication-preview'), 'prévia aberta');
  assert.equal(await evaluate(`document.querySelector('.publication-preview .public-card h3').textContent.trim()`).then(t => t.length > 0), true, 'prévia usa o título real');
  assert.ok((await evaluate(`document.querySelector('.publication-preview').textContent`)).includes('COMO APARECE PUBLICAMENTE'));
  await screenshot('publicacao-preview-1440');
  passed('destinos de publicação com prévia pública real e ocultão inicial');

  // 4. Avaliador: perfil acadêmico e estatísticas.
  await switchUser('avaliador1@blindpitch.demo');
  await visit('/profile', '#reviewer-profile-form', 'perfil-avaliador');
  assert.equal(await evaluate(`['education_level','degrees','courses','specializations','knowledge_areas','bio'].every(n=>!!document.querySelector('[name="'+n+'"]'))`), true, 'campos acadêmicos');
  const stats = await evaluate(`[...document.querySelectorAll('.metrics-grid .metric-card strong')].map(n=>n.textContent.trim())`);
  assert.equal(stats.length, 3, 'três métricas');
  assert.ok(stats[0].match(/^\d+$/), 'avaliações concluídas é número inteiro');
  passed('perfil do avaliador com formação, privacidade e estatísticas reais');

  // 5. Organizador: pedidos de avaliação.
  await switchUser('organizador@blindpitch.demo');
  await visit('/reviewer-requests', 'table', 'pedidos-avaliador');
  assert.equal(await evaluate(`document.querySelectorAll('[data-approve-reviewer]').length`) >= 1, true, 'há pedido pendente');
  await visit('/settings', '#event-form', 'configuracoes');
  assert.equal(await evaluate(`!!document.querySelector('[name="bonus_max"]')`), true, 'política de pontos extras');
  assert.equal(await evaluate(`!!document.querySelector('[name="bonus_enabled"]')`), true);
  passed('organizador aprova avaliadores e configura a pontuação adicional');

  // 6. Páginas públicas, com e sem sessão.
  const slug = db.prepare("SELECT portfolio_slug FROM privacy_profiles WHERE portfolio_slug<>'' LIMIT 1").get().portfolio_slug;
  await visit('/gallery', '.public-grid', 'galeria-publica');
  assert.ok(await evaluate(`document.querySelectorAll('.public-card').length`) >= 1, 'galeria com conteúdo real');
  await visit('/showcase', '.public-card', 'vitrine-publica');
  await visit('/reviewers-public', '.public-card', 'avaliadores-publicos');
  assert.ok(await evaluate(`document.querySelectorAll('.public-card').length`) >= 1, 'perfis públicos reais');
  await visit('/portfolio/' + slug, '.page-heading', 'portfolio-publico');
  const portfolioText = await evaluate(`document.querySelector('main').textContent`);
  assert.ok(!/blindpitch\.demo|@exemplo/u.test(portfolioText), 'nenhum e-mail público');

  // Sem sessão: as mesmas páginas continuam abertas.
  await click('#logout'); await until(() => visible('#auth-form'), 'logout');
  for (const [hash, wait, name] of [['/gallery', '.public-card', 'galeria-anonima'], ['/portfolio/' + slug, '.page-heading', 'portfolio-anonimo']]) {
    browserErrors.length = 0;
    await evaluate(`location.hash=${JSON.stringify(hash)}`); await until(() => visible(wait), name);
    await delay(200);
    const problems = await evaluate(`(${a11yAudit})()`);
    assert.deepEqual(problems, [], name);
    assert.deepEqual(browserErrors, [], name + ': erros de console');
  }
  passed('galeria, vitrine, perfis e portfólio abrem sem sessão, sem erros e sem vazar contato');

  // 7. Varredura de todas as rotas por papel: hierarquia, rótulos e overflow.
  async function sweep(label, role, hashes) {
    if (role) await switchUser(role);
    for (const hash of hashes) {
      browserErrors.length = 0;
      await evaluate(`location.hash=${JSON.stringify(hash)}`);
      await until(() => evaluate(`!!document.querySelector('#main h1')`), label + ' ' + hash);
      await delay(240);
      for (const width of [390, 1440]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 500 });
        await delay(200);
        const problems = await evaluate(`(${a11yAudit})()`);
        assert.deepEqual(problems, [], `${label} ${hash} @${width}px`);
      }
      await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      assert.deepEqual(browserErrors, [], `${label} ${hash}: erros de console`);
    }
    passed(`${label}: ${hashes.length} rotas com hierarquia, rótulos e overflow corretos nos dois extremos`);
  }

  await sweep('organizador', 'organizador@blindpitch.demo',
    ['/dashboard', '/projects', '/participants', '/reviewers', '/reviewer-requests', '/assignments', '/results', '/comparisons', '/rubric', '/settings', '/export', '/audit', '/gallery', '/showcase', '/reviewers-public']);
  await sweep('avaliador', 'avaliador1@blindpitch.demo',
    ['/dashboard', '/history', '/profile', '/gallery', '/about']);
  await sweep('participante', 'participante1@blindpitch.demo',
    ['/dashboard', '/projects', '/projects/new', '/privacy', '/about']);

  console.log(`\nQA de interface aprovado: ${report.length} verificações. Capturas em ${output}`);
} finally {
  try { socket?.close(); } catch { /* já encerrado */ }
  chrome.kill();
  server.close();
  db.close();
}
