// Auditoria responsiva real em Chrome headless (CDP, sem dependências).
//
// Para cada papel e cada tela, em cada largura, mede no navegador renderizado:
//   * rolagem horizontal acidental (documento mais largo que a viewport);
//   * elementos que vazam para fora da viewport;
//   * alvos de toque pequenos demais;
//   * texto miúdo.
//
// Alvos dentro de containers com rolagem horizontal intencional (tabelas, menu
// lateral) são ignorados: ali a rolagem é o comportamento projetado.
//
//   node scripts/responsive-qa.mjs
//   node scripts/responsive-qa.mjs --screenshot
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDb } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { seed, demoPassword } from '../server/seed.mjs';

const WIDTHS = [
  { width: 320, height: 720, label: '320 menor celular' },
  { width: 360, height: 780, label: '360 Android comum' },
  { width: 390, height: 844, label: '390 iPhone 12/13/14' },
  { width: 430, height: 932, label: '430 iPhone Pro Max' },
  { width: 768, height: 1024, label: '768 tablet' },
  { width: 1024, height: 800, label: '1024 laptop' },
  { width: 1440, height: 900, label: '1440 desktop' }
];

const ROLES = [
  {
    role: 'participante', email: 'participante1@blindpitch.demo',
    pages: ['/dashboard', '/privacy', '/projects/new', '/gallery', '/showcase', '/reviewers-public', '/about']
  },
  {
    role: 'avaliador', email: 'avaliador1@blindpitch.demo',
    pages: ['/dashboard', '/history', '/profile', '/gallery', '/reviewers-public']
  },
  {
    role: 'organizador', email: 'organizador@blindpitch.demo',
    pages: ['/dashboard', '/projects', '/participants', '/reviewers', '/reviewer-requests',
      '/assignments', '/results', '/comparisons', '/rubric', '/settings', '/export', '/audit', '/gallery']
  }
];

const PUBLIC_PAGES = ['/', '/login', '/register', '/gallery', '/showcase', '/reviewers-public', '/about'];

const executable = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome'
].find(existsSync);
if (!executable) throw new Error('Configure CHROME_PATH para executar a auditoria.');

const screenshots = process.argv.includes('--screenshot');
const temporary = mkdtempSync(join(tmpdir(), 'blindpitch-responsive-'));
const output = resolve('test-results/responsive');
if (screenshots) mkdirSync(output, { recursive: true });

const db = openDb(join(temporary, 'test.sqlite'));
await seed(db);
const server = createApp(db);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

const chrome = spawn(executable, ['--headless', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--user-data-dir=' + temporary, 'about:blank'],
  { windowsHide: true, stdio: 'ignore' });

let socket, sequence = 0;
const pending = new Map();
const delay = ms => new Promise(r => setTimeout(r, ms));

async function until(check, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await check()) return; await delay(50); }
  throw new Error('Tempo esgotado: ' + label);
}
function command(method, params = {}) {
  return new Promise((resolvePromise, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 20000);
    pending.set(id, {
      resolve: v => { clearTimeout(timer); resolvePromise(v); },
      reject: e => { clearTimeout(timer); reject(e); }
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + (result.exceptionDetails.exception?.description ?? ''));
  return result.result.value;
}

// Medição feita dentro da página renderizada.
const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const describe = el => {
    const parts = [];
    for (let node = el; node && node !== document.body && parts.length < 3; node = node.parentElement) {
      const name = node.tagName.toLowerCase();
      const cls = (node.getAttribute('class') || '').trim().split(/\\s+/).slice(0, 2).join('.');
      parts.push(cls ? name + '.' + cls : name);
    }
    return parts.join(' > ');
  };
  const scrollable = el => {
    // overflow:hidden NAO e container de rolagem: quem esta clipped por ele
    // continua vazando visualmente e precisa ser reportado.
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const ox = getComputedStyle(node).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };
  const leaking = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const rects = el.getClientRects();
    if (!rects.length) continue;
    const rect = rects[0];
    if (rect.width < 1 && rect.height < 1) continue;
    const style = getComputedStyle(el);
    if (style.position === 'fixed' || style.visibility === 'hidden' || style.display === 'none') continue;
    if (rect.right <= vw + 1 && rect.left >= -1) continue;
    if (scrollable(el)) continue;
    const key = describe(el) + Math.round(rect.right);
    if (seen.has(key)) continue;
    seen.add(key);
    leaking.push({ el: describe(el), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) });
  }
  const small = [];
  for (const el of document.querySelectorAll('a[href],button,input,select,textarea,summary,[role="button"]')) {
    // Checkbox e radio nao sao o alvo: o rotulo inteiro e. Medir o input cru
    // acusaria um falso positivo em toda tela com opcao de escolha.
    const target = (el.type === 'checkbox' || el.type === 'radio')
      ? (el.closest('label') || el)
      : el;
    const rect = target.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    if (getComputedStyle(target).visibility === 'hidden') continue;
    if (!target.getClientRects().length) continue;
    // Links dentro de texto corrido nao sao alvos de toque.
    if (target.tagName === 'A' && target.closest('p,li,dd,small,label,td')) continue;
    if (rect.height < 40 || rect.width < 32) {
      small.push({ el: describe(target), w: Math.round(rect.width), h: Math.round(rect.height), text: (target.textContent || '').trim().slice(0, 28) });
    }
  }
  const tiny = [];
  for (const el of document.querySelectorAll('p,li,td,dd,span,label,small,dt')) {
    if (!el.textContent.trim()) continue;
    if (el.children.length) continue;
    // Texto so para leitor de tela nao e lido por ningem olhando a tela.
    if (el.closest('.sr-only')) continue;
    // Elemento nao renderizado nao ocupa espaco na tela do usuario.
    if (!el.getClientRects().length) continue;
    if (getComputedStyle(el).visibility === 'hidden') continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 11) tiny.push({ el: describe(el), size, text: el.textContent.trim().slice(0, 28) });
  }
  return {
    vw,
    docWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    overflow: document.documentElement.scrollWidth > vw + 1,
    leaking: leaking.slice(0, 8),
    small: small.slice(0, 8),
    tiny: [...new Map(tiny.map(t => [t.el + t.size, t])).values()].slice(0, 6)
  };
})()`;

const problems = [];
let checks = 0;

let navigation = 0;
async function visit(hash) {
  // Navegacao completa, nao so troca de hash. Dois motivos:
  //  1. `render()` e assincrono e o conteudo anterior continuaria no DOM;
  //  2. alterar apenas o fragmento NAO recarrega o documento no Chrome, o que
  //     deixaria a medicao apontando para a tela anterior.
  await command('Page.navigate', { url: `${base}/?_=${++navigation}#${hash}` });
  await until(() => evaluate(`document.readyState==='complete'`), 'carga ' + hash);
  await until(() => evaluate(`(() => {
    const main = document.querySelector('#main');
    if (!main || !main.children.length) return false;
    if (main.getAttribute('aria-busy') === 'true') return false;
    return !document.querySelector('.page-loading');
  })()`), 'render ' + hash);
  await delay(220);
}

async function auditPages(label, pages, login) {
  // Autentica uma vez por papel; o cookie persiste entre navegações.
  await command('Page.navigate', { url: `${base}/?_=${++navigation}#/login` });
  await until(() => evaluate(`document.readyState==='complete'`), 'base');
  // Encerra qualquer sessao anterior. Com cookie ativo, ate o POST /logout e o
  // POST /login exigem o token CSRF (comportamento correto do backend).
  const cleared = await evaluate(`(async () => {
    const current = await fetch('/api/session').then(r => r.ok ? r.json() : null).catch(() => null);
    if (!current || !current.csrf) return 'sem sessao';
    const response = await fetch('/api/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': current.csrf },
      body: '{}'
    });
    return 'logout ' + response.status;
  })()`);
  if (String(cleared).startsWith('logout 200') === false && cleared !== 'sem sessao') {
    throw new Error('nao foi possivel encerrar a sessao anterior: ' + cleared);
  }
  await delay(150);
  if (login) {
    const result = await evaluate(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:${JSON.stringify(login)},password:${JSON.stringify(demoPassword)}})}).then(async r=>({ok:r.ok,status:r.status,body:(await r.text()).slice(0,160)})).catch(e=>({ok:false,status:0,body:String(e)}))`);
    if (!result.ok) throw new Error(`login falhou para ${label}: HTTP ${result.status} ${result.body}`);
  }
  await delay(250);

  for (const hash of pages) {
    for (const size of WIDTHS) {
      await command('Emulation.setDeviceMetricsOverride', {
        width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.width < 768
      });
      await visit(hash);
      const result = await evaluate(MEASURE);
      checks++;
      const record = { label, hash, ...size, ...result };
      if (result.overflow) {
        problems.push({ ...record, kind: 'rolagem horizontal', detail: `documento ${result.docWidth}px > viewport ${result.vw}px` });
      }
      for (const item of result.leaking) {
        problems.push({ ...record, kind: 'elemento fora da viewport', detail: `${item.el} → ${item.left}..${item.right}px (largura ${item.width})` });
      }
      // Alvo de toque e legibilidade só importam onde há dedo: desktop tem mouse.
      if (size.width <= 768) {
        for (const item of result.small) {
          problems.push({ ...record, kind: 'alvo de toque pequeno', detail: `${item.el} ${item.w}x${item.h} "${item.text}"` });
        }
        for (const item of result.tiny) {
          problems.push({ ...record, kind: 'texto pequeno', detail: `${item.el} ${item.size}px "${item.text}"` });
        }
      }
      if (screenshots && (size.width === 320 || size.width === 390)) {
        const shot = await command('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(output, `${label}-${hash.replace(/[^a-z0-9]+/gi, '_') || 'home'}-${size.width}.png`), Buffer.from(shot.data, 'base64'));
      }
    }
  }
}

try {
  let port;
  await until(() => {
    try {
      const value = readFileSync(join(temporary, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      if (!/^\d+$/u.test(value)) return false; port = value; return true;
    } catch { return false; }
  }, 'inicialização do Chrome');

  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise, reject) => {
    socket.addEventListener('open', resolvePromise, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.error) request.reject(new Error(data.error.message)); else request.resolve(data.result);
  });

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command('Page.navigate', { url: base });
  await until(() => evaluate(`document.readyState==='complete'`), 'carga inicial');

  // Autoteste do próprio instrumento: um detector que nunca acusa nada pode
  // estar quebrado. Injeta um problema conhecido e confirma que ele aparece.
  const selfTest = await evaluate(`(() => {
    const probe = document.createElement('div');
    probe.id = 'auditor-probe';
    probe.style.cssText = 'width:900px;height:10px;position:absolute;top:0;left:0;background:red';
    probe.innerHTML = '<a href="#" style="display:inline-block;width:20px;height:10px">x</a>';
    document.body.append(probe);
    return probe.getBoundingClientRect().right;
  })()`);
  const measured = await evaluate(MEASURE);
  const probeWorks = measured.overflow === true && measured.leaking.length > 0 && measured.small.length > 0;
  await evaluate(`document.getElementById('auditor-probe')?.remove()`);
  console.log(`Autoteste do instrumento: ${probeWorks ? 'OK' : 'FALHOU'} `
    + `(overflow=${measured.overflow}, vazando=${measured.leaking.length}, alvos=${measured.small.length})`);
  if (!probeWorks) {
    console.error('O instrumento nao detecta um problema sintetico conhecido: o relatorio abaixo nao e confiavel.');
    process.exitCode = 3;
  }

  console.log(`\nAuditando ${PUBLIC_PAGES.length} telas públicas + ${ROLES.reduce((n, r) => n + r.pages.length, 0)} telas autenticadas em ${WIDTHS.length} larguras…\n`);
  await auditPages('publico', PUBLIC_PAGES, null);
  for (const role of ROLES) await auditPages(role.role, role.pages, role.email);

  console.log(`\n${checks} medições concluídas.`);

  if (!problems.length) {
    console.log('Nenhum problema responsivo detectado.');
  } else {
    const byKind = {};
    for (const problem of problems) (byKind[problem.kind] ??= []).push(problem);
    console.log(`${problems.length} achados:\n`);
    for (const [kind, list] of Object.entries(byKind)) {
      console.log(`── ${kind}: ${list.length}`);
      const unique = new Map();
      for (const item of list) unique.set(`${item.hash}|${item.detail}`, item);
      for (const item of [...unique.values()].slice(0, 40)) {
        console.log(`   [${item.label}] ${item.hash} @${item.width}px — ${item.detail}`);
      }
      if (unique.size > 40) console.log(`   … e mais ${unique.size - 40}`);
      console.log('');
    }
  }

  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'report.json'), JSON.stringify({ checks, problems }, null, 2));
  console.log(`Relatório completo em ${join('test-results', 'responsive', 'report.json')}`);
  process.exitCode = problems.length ? 1 : 0;
} catch (error) {
  console.error('Falha na auditoria:', error.message);
  process.exitCode = 2;
} finally {
  try { socket?.close(); } catch { /* já fechado */ }
  chrome.kill();
  db.close();
  await new Promise(r => server.close(r));
  // O Chrome solta o perfil de usuário de forma assíncrona: uma tentativa
  // imediata de apagar o diretório falha com EPERM no Windows.
  for (let attempt = 0; attempt < 10; attempt++) {
    try { rmSync(temporary, { recursive: true, force: true, maxRetries: 3 }); break; }
    catch { await delay(300); }
  }
}
