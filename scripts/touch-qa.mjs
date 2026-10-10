// Verificacao de interacao no celular: abre o menu, navega, checa foco e Escape.
//   node scripts/touch-qa.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDb } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { seed, demoPassword } from '../server/seed.mjs';

const WIDTH = Number(process.env.QA_WIDTH || 360);
const executable = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find(existsSync);
if (!executable) throw new Error('Configure CHROME_PATH.');

const temporary = mkdtempSync(join(tmpdir(), 'blindpitch-touch-'));
const output = resolve('test-results/touch');
mkdirSync(output, { recursive: true });
const db = openDb(join(temporary, 'test.sqlite'));
await seed(db);
const server = createApp(db);
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const chrome = spawn(executable, ['--headless', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--user-data-dir=' + temporary, 'about:blank'], { windowsHide: true, stdio: 'ignore' });

let socket, sequence = 0;
const pending = new Map();
const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(check, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { if (await check()) return; await delay(50); }
  throw new Error('Tempo esgotado: ' + label);
}
function command(method, params = {}) {
  return new Promise((res, rej) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); rej(new Error('CDP timeout ' + method)); }, 20000);
    pending.set(id, { resolve: v => { clearTimeout(timer); res(v); }, reject: e => { clearTimeout(timer); rej(e); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ': ' + (r.exceptionDetails.exception?.description ?? ''));
  return r.result.value;
}

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'OK  ' : 'FALHA'} ${name}${detail ? ' — ' + detail : ''}`);
};

let navigation = 0;
async function load(hash) {
  await command('Page.navigate', { url: `${base}/?_=${++navigation}#${hash}` });
  await until(() => evaluate(`document.readyState==='complete'`), 'load');
  await until(() => evaluate(`(() => { const m=document.querySelector('#main'); return m && m.children.length && m.getAttribute('aria-busy')!=='true' && !document.querySelector('.page-loading'); })()`), 'render');
  await delay(300);
}
async function shot(name) {
  const s = await command('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(output, name + '.png'), Buffer.from(s.data, 'base64'));
}

try {
  let port;
  await until(() => {
    try {
      const v = readFileSync(join(temporary, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      if (!/^\d+$/u.test(v)) return false; port = v; return true;
    } catch { return false; }
  }, 'chrome');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { socket.addEventListener('open', res, { once: true }); socket.addEventListener('error', rej, { once: true }); });
  socket.addEventListener('message', e => {
    const d = JSON.parse(e.data);
    const p = pending.get(d.id); if (!p) return; pending.delete(d.id);
    if (d.error) p.reject(new Error(d.error.message)); else p.resolve(d.result);
  });
  await command('Page.enable'); await command('Runtime.enable'); await command('Input.enable').catch(() => {});
  await command('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 740, deviceScaleFactor: 1, mobile: true });

  await load('/');
  await evaluate(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'organizador@blindpitch.demo',password:${JSON.stringify(demoPassword)}})})`);
  await load('/dashboard');

  // --- Menu recolhivel --------------------------------------------------
  check('menu recolhido por padrao', await evaluate(`getComputedStyle(document.querySelector('#main-nav')).display==='none'`));
  check('botao de menu visivel', await evaluate(`!!document.querySelector('#nav-toggle') && getComputedStyle(document.querySelector('#nav-toggle')).display!=='none'`));

  await evaluate(`document.querySelector('#nav-toggle').click()`);
  await delay(280);
  check('menu abre ao tocar', await evaluate(`getComputedStyle(document.querySelector('#main-nav')).display!=='none'`));
  check('aria-expanded=true', await evaluate(`document.querySelector('#nav-toggle').getAttribute('aria-expanded')==='true'`));

  const total = await evaluate(`document.querySelectorAll('#main-nav .nav-item').length`);
  check('todos os destinos presentes', total === 12, total + ' itens (organizador tem 12)');

  // Nenhum item pode ficar fora da tela.
  const clipped = await evaluate(`[...document.querySelectorAll('#main-nav .nav-item')].filter(el=>{const r=el.getBoundingClientRect();return r.right>document.documentElement.clientWidth+1||r.left<-1||r.width<40||r.height<44;}).map(el=>el.textContent.trim())`);
  check('itens do menu cabem e sao tocáveis', clipped.length === 0, clipped.join(', ') || 'todos ok');

  // O item ativo precisa continuar visível e marcado.
  check('item ativo destacado', await evaluate(`!!document.querySelector('#main-nav .nav-item.active[aria-current="page"]')`));
  await shot('menu-aberto');

  // --- Escape fecha e devolve o foco --------------------------------------
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await delay(280);
  check('Escape fecha o menu', await evaluate(`getComputedStyle(document.querySelector('#main-nav')).display==='none'`));
  check('foco volta ao botao', await evaluate(`document.activeElement && document.activeElement.id==='nav-toggle'`), await evaluate(`document.activeElement?.className||'nenhum'`));

  // --- Navegar fecha o menu ----------------------------------------------
  await evaluate(`document.querySelector('#nav-toggle').click()`);
  await delay(250);
  await evaluate(`document.querySelector('#main-nav .nav-item[href="#/rubric"]').click()`);
  await delay(500);
  check('navegar pelo menu funciona', (await evaluate(`location.hash`)) === '#/rubric', await evaluate(`location.hash`));
  check('menu fecha apos navegar', await evaluate(`getComputedStyle(document.querySelector('#main-nav')).display==='none'`));

  // --- Navegacao por teclado ----------------------------------------------
  await load('/dashboard');
  await evaluate(`document.body.focus();document.querySelector('#nav-toggle').focus()`);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await delay(280);
  check('Enter abre o menu pelo teclado', await evaluate(`document.querySelector('#nav-toggle').getAttribute('aria-expanded')==='true'`));

  // --- Formulario: fonte 16px evita zoom no iOS ----------------------------
  // O formulario de proposta pertence ao participante.
  await evaluate(`(async()=>{const s=await fetch('/api/session').then(r=>r.ok?r.json():null);if(s&&s.csrf)await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},body:'{}'});await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'participante1@blindpitch.demo',password:${JSON.stringify(demoPassword)}})})})()`);
  await load('/projects/new');
  const fieldSizes = await evaluate(`[...document.querySelectorAll('input,textarea,select')].filter(el=>el.type!=='checkbox'&&el.type!=='hidden').map(el=>parseFloat(getComputedStyle(el).fontSize))`);
  check('campos com 16px (sem zoom no iOS)', fieldSizes.length > 0 && fieldSizes.every(size => size >= 16), 'minimo ' + (fieldSizes.length ? Math.min(...fieldSizes) : '?') + 'px em ' + fieldSizes.length + ' campos');

  // --- Tabelas viram cartoes (perfil organizador) ---------------------------
  await evaluate(`(async()=>{const s=await fetch('/api/session').then(r=>r.ok?r.json():null);if(s&&s.csrf)await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},body:'{}'});await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'organizador@blindpitch.demo',password:${JSON.stringify(demoPassword)}})})})()`);
  await load('/participants');
  const cardMode = await evaluate(`(() => {
    const cell=document.querySelector('.table-scroll tbody td');
    if(!cell)return {ok:false,why:'sem celulas'};
    const label=cell.dataset.label||'';
    return {ok:getComputedStyle(cell).display==='flex'&&label.length>0, label, display:getComputedStyle(cell).display};
  })()`);
  check('tabela vira cartao com rotulo', cardMode.ok, 'rotulo "' + cardMode.label + '", display ' + cardMode.display);
  const noPageOverflow = await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`);
  check('sem rolagem horizontal na pagina', noPageOverflow);
  await shot('tabela-cartoes');

  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} verificacoes de interacao ok`);
  process.exitCode = failed.length ? 1 : 0;
} catch (error) {
  console.error('Falha:', error.message);
  process.exitCode = 2;
} finally {
  try { socket?.close(); } catch { /* ok */ }
  chrome.kill(); db.close();
  await new Promise(r => server.close(r));
  for (let i = 0; i < 10; i++) { try { rmSync(temporary, { recursive: true, force: true, maxRetries: 3 }); break; } catch { await delay(300); } }
}
