// Captura Directed de telas em larguras específicas, para inspeção visual.
//   node scripts/shots.mjs [larguras] [--pages=/,/login]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDb } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { seed, demoPassword } from '../server/seed.mjs';

const args = process.argv.slice(2);
const widths = (args.find(a => /^\d+(?:,\d+)*$/.test(a)) ?? '320,390').split(',').map(Number);
const pagesArg = (args.find(a => a.startsWith('--pages=')) ?? '').slice(8);
const fullPage = args.includes('--full');

const SHOTS = pagesArg ? pagesArg.split(',') : [
  'publico:/', 'publico:/login', 'publico:/register', 'publico:/gallery', 'publico:/about',
  'participante:/dashboard', 'participante:/projects/new', 'participante:/privacy',
  'avaliador:/dashboard', 'avaliador:/profile',
  'organizador:/dashboard', 'organizador:/assignments', 'organizador:/results', 'organizador:/settings', 'organizador:/audit'
];
const ROLE = { publico: null, participante: 'participante1@blindpitch.demo', avaliador: 'avaliador1@blindpitch.demo', organizador: 'organizador@blindpitch.demo' };

const executable = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find(existsSync);
if (!executable) throw new Error('Configure CHROME_PATH.');

const temporary = mkdtempSync(join(tmpdir(), 'blindpitch-shots-'));
const output = resolve('test-results/shots');
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

let navigation = 0;
try {
  let port;
  await until(() => {
    try {
      const value = readFileSync(join(temporary, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      if (!/^\d+$/u.test(value)) return false; port = value; return true;
    } catch { return false; }
  }, 'chrome');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { socket.addEventListener('open', res, { once: true }); socket.addEventListener('error', rej, { once: true }); });
  socket.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.error) request.reject(new Error(data.error.message)); else request.resolve(data.result);
  });
  await command('Page.enable'); await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', { width: widths[0], height: 800, deviceScaleFactor: 1, mobile: true });
  await command('Page.navigate', { url: `${base}/?_=${++navigation}` });
  await until(() => evaluate(`document.readyState==='complete'`), 'base');

  let currentRole = null;
  for (const entry of SHOTS) {
    const [role, page] = entry.split(':');
    if (role !== currentRole) {
      await evaluate(`(async () => {
        const s = await fetch('/api/session').then(r => r.ok ? r.json() : null).catch(() => null);
        if (s && s.csrf) await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrf }, body: '{}' });
        ${ROLE[role] ? `await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(ROLE[role])}, password: ${JSON.stringify(demoPassword)} }) });` : ''}
      })()`);
      currentRole = role;
      await delay(200);
    }
    for (const width of widths) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 780, deviceScaleFactor: 1, mobile: width < 768 });
      await command('Page.navigate', { url: `${base}/?_=${++navigation}#${page}` });
      await until(() => evaluate(`document.readyState==='complete'`), 'load ' + page);
      await until(() => evaluate(`(() => {
        const m = document.querySelector('#main');
        return m && m.children.length && m.getAttribute('aria-busy') !== 'true' && !document.querySelector('.page-loading');
      })()`), 'render ' + page);
      await delay(500);
      const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage });
      const name = `${role}__${page.replace(/[^a-z0-9]+/gi, '_') || 'home'}__${width}.png`;
      writeFileSync(join(output, name), Buffer.from(shot.data, 'base64'));
      console.log('ok ' + name);
    }
  }
} catch (error) {
  console.error('Falha:', error.message);
  process.exitCode = 1;
} finally {
  try { socket?.close(); } catch { /* ok */ }
  chrome.kill(); db.close();
  await new Promise(r => server.close(r));
  for (let i = 0; i < 10; i++) { try { rmSync(temporary, { recursive: true, force: true, maxRetries: 3 }); break; } catch { await delay(300); } }
}
