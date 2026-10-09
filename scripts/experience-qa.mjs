// QA real em Chrome headless, sem dependências. Usa SQLite e perfil temporários.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDb } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { seed } from '../server/seed.mjs';
import { scientificFields, optionalScientificFields } from '../server/validation.mjs';

const executable=process.env.CHROME_PATH||[
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium','/usr/bin/google-chrome'
].find(existsSync);
if(!executable)throw new Error('Configure CHROME_PATH para executar o teste de navegador.');
const temporary=mkdtempSync(join(tmpdir(),'blindpitch-experience-'));
const output=resolve('test-results/experience'+(process.env.QA_BROWSER==='edge'?'-edge':''));mkdirSync(output,{recursive:true});
const db=openDb(join(temporary,'test.sqlite'));seed(db);
const originalCount=db.prepare('SELECT count(*) n FROM projects').get().n;
const server=createApp(db);await new Promise(resolvePromise=>server.listen(0,'127.0.0.1',resolvePromise));
const base='http://127.0.0.1:'+server.address().port;
const chrome=spawn(executable,['--headless','--no-first-run','--no-default-browser-check',
  '--remote-debugging-port=0','--user-data-dir='+temporary,'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket,sequence=0;const pending=new Map(),report=[],browserErrors=[];
const delay=ms=>new Promise(resolvePromise=>setTimeout(resolvePromise,ms));
async function until(check,label) {
  const deadline=Date.now()+12000;
  while(Date.now()<deadline){if(await check())return;await delay(40);}
  throw new Error('Tempo esgotado: '+label);
}
function command(method,params={}) {
  return new Promise((resolvePromise,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},12000);
    pending.set(id,{resolve:value=>{clearTimeout(timer);resolvePromise(value);},reject:error=>{clearTimeout(timer);reject(error);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
  if(result.exceptionDetails)throw new Error(result.exceptionDetails.text+': '+result.exceptionDetails.exception?.description);
  return result.result.value;
}
const visible=selector=>evaluate(`!!document.querySelector(${JSON.stringify(selector)}) && document.querySelector(${JSON.stringify(selector)}).getClientRects().length>0`);
async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);}
async function fill(name,value) {
  await evaluate(`{const control=document.querySelector('[name="${name}"]');control.value=${JSON.stringify(value)};control.dispatchEvent(new Event('input',{bubbles:true}));}`);
}
async function step(index) {
  await until(()=>evaluate(`document.querySelector('#project-form')?.dataset.step==='${index}' && !document.querySelector('[data-wizard-next]').disabled`),'etapa '+index);
  assert.equal(await evaluate(`document.querySelectorAll('.wizard-step:not([hidden])').length`),1);
  assert.equal(await evaluate(`document.querySelector('#wizard-progress').value`),index+1);
}
async function screenshot(name){const result=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});writeFileSync(join(output,name+'.png'),Buffer.from(result.data,'base64'));}
function passed(name){report.push(name);console.log('OK · '+name);}
try {
  let port;
  await until(()=>{
    try{const value=readFileSync(join(temporary,'DevToolsActivePort'),'utf8').split('\n')[0];if(!/^\d+$/u.test(value))return false;port=value;return true;}
    catch{return false;}
  },'inicialização do Chrome');
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolvePromise,reject)=>{socket.addEventListener('open',resolvePromise,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.method==='Runtime.exceptionThrown')browserErrors.push(data.params.exceptionDetails.text);if(data.method==='Runtime.consoleAPICalled'&&data.params.type==='error')browserErrors.push(data.params.args.map(arg=>arg.value||arg.description).join(' '));if(data.method==='Network.responseReceived'&&data.params.response.status>=400&&/\.(?:png|webp|svg|js|css)(?:\?|$)/u.test(data.params.response.url))browserErrors.push(data.params.response.url);const request=pending.get(data.id);if(!request)return;pending.delete(data.id);if(data.error)request.reject(new Error(data.error.message));else request.resolve(data.result);});
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await command('Page.navigate',{url:base});await until(()=>visible('.owl-group'),'página inicial');
  await until(()=>evaluate(`[...document.querySelectorAll('.owl-group img')].every(img=>img.complete&&img.naturalWidth>0)`),'carregamento dos seis WebP');
  assert.equal(await evaluate(`document.querySelectorAll('.owl-group img').length`),6);
  const lossless=await evaluate(`Promise.all([...document.querySelectorAll('.owl-group img')].map(async image=>{const original=new Image();original.src=image.src.replace('.webp','.png');await original.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const encoded=ctx.getImageData(0,0,canvas.width,canvas.height).data;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(original,0,0);const source=ctx.getImageData(0,0,canvas.width,canvas.height).data;let different=0,max=0,alpha=0,visibleMax=0;for(let i=0;i<encoded.length;i++){const diff=Math.abs(encoded[i]-source[i]);if(diff){different++;max=Math.max(max,diff);if(i%4===3)alpha=Math.max(alpha,diff);else visibleMax=Math.max(visibleMax,diff*source[i-i%4+3]/255);}}return {different,max,alpha,visibleMax};}))`);
  // Chrome arredonda a pré-multiplicação RGB de PNG/WebP de forma diferente.
  // Alpha deve ser idêntico; a diferença visível fica limitada a 2/255.
  // A igualdade exata de todos os bytes RGBA é verificada por encode-owls.mjs.
  assert.ok(lossless.every(result=>result.alpha===0&&result.visibleMax<=2));
  assert.equal(await evaluate(`[...document.querySelectorAll('.owl-group img')].every(img=>Math.abs(img.width/img.height-img.naturalWidth/img.naturalHeight)<.02)`),true);
  const labels=()=>evaluate(`[...document.querySelectorAll('.owl-group')].filter(group=>group.getClientRects().length&&Number(getComputedStyle(group).opacity)>.01&&getComputedStyle(group).visibility==='visible').flatMap(group=>[...group.querySelectorAll('img')].map(el=>el.dataset.scientificArea))`);
  assert.deepEqual(await labels(),['Química','Física','Matemática']);await screenshot('landing-desktop-light');
  await delay(5100);assert.deepEqual(await labels(),['Biologia','Astronomia','Tecnologia']);
  assert.equal(await evaluate(`document.querySelectorAll('.science-hero button,.science-hero figcaption,.science-hero .idea-card,.science-hero .owl-caption').length`),0);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.owl-stage')).backgroundColor`),'rgba(0, 0, 0, 0)');
  assert.equal(await evaluate(`[...document.querySelectorAll('.owl-group img')].every(image=>{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0);return context.getImageData(0,0,1,1).data[3]===0&&getComputedStyle(image).mixBlendMode==='normal'&&getComputedStyle(image).maskImage==='none';})`),true);
  // Amostra dois ciclos completos, incluindo cada intervalo dos fades.
  const samples=await evaluate(`(()=>{const groups=[...document.querySelectorAll('.owl-group')];const animations=groups.map(group=>group.getAnimations()[0]);const bad=[];for(let ms=0;ms<=20000;ms+=100){animations.forEach(animation=>{animation.pause();animation.currentTime=ms;});const count=groups.filter(group=>Number(getComputedStyle(group).opacity)>.001&&getComputedStyle(group).visibility==='visible').length;if(count>1)bad.push(ms);}return bad;})()`);
  assert.deepEqual(samples,[]);passed('Seis WebP com alpha real carregados; hero só com corujas, sem fundo/máscara/mesclagem, alternância e máximo de três visíveis.');
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.deepEqual(await labels(),['Química','Física','Matemática']);assert.equal(await visible('.owl-pause'),false);
  passed('Movimento reduzido mantém o primeiro trio estático.');
  for(const theme of ['light','dark'])for(const width of [360,390,768,1024,1440,1920]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:false});
    await evaluate(`document.documentElement.dataset.theme='${theme}'`);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`),true,`landing ${width} ${theme}`);
    if([390,1440].includes(width))await screenshot(`landing-${width}-${theme}`);
  }
  passed('Página inicial sem overflow em seis larguras e nos dois temas.');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
  await evaluate(`location.hash='/login'`);await until(()=>visible('#auth-form'),'login');
  await until(()=>evaluate(`[...document.images].every(image=>image.complete&&image.naturalWidth>0)`),'coruja de login');await screenshot('login-coruja-cientifica');
  await fill('email','participante1@blindpitch.demo');await fill('password','BlindPitch2026!');await click('#auth-form button[type="submit"]');
  await until(()=>visible('a[href="#/projects/new"]'),'dashboard do participante');
  await evaluate(`location.hash='/projects/new'`);await until(()=>visible('#project-form'),'assistente');await step(0);
  await click('[data-wizard-next]');await step(0);
  assert.match(await evaluate(`document.querySelector('.wizard-validation').textContent`),/pelo menos 3/u);
  assert.equal(await evaluate(`document.activeElement.name`),'title');
  await fill('title','   ');await click('[data-wizard-next]');await step(0);
  await fill('title','Projeto de teste do assistente');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await step(1);
  assert.equal(await evaluate(`document.activeElement.getAttribute('data-select-area')`),'Química');
  assert.equal(await evaluate(`document.querySelectorAll('[data-select-area]').length`),11);
  for(const theme of ['light','dark'])for(const width of [360,390,768,1024,1440,1920]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:false});await evaluate(`document.documentElement.dataset.theme='${theme}'`);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`),true,`seletor ${width} ${theme}`);
    if([390,1440].includes(width))await screenshot(`areas-${width}-${theme}`);
  }
  for(const area of ['Química','Física','Matemática','Biologia','Astronomia','Tecnologia','Ciências ambientais']){
    await click(`[data-select-area="${area}"]`);assert.equal(await evaluate(`document.querySelector('[name="scientific_area"]').value`),area);
    assert.equal(await evaluate(`document.querySelectorAll('[data-select-area][aria-pressed="true"]').length`),1);
  }
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('#areas option')].map(option=>option.value)`),['Engenharias','Ciências ambientais','Ciências da saúde','Ciências agrárias','Ciências humanas','Química','Física']);
  await fill('scientific_area','Engenharias');
  assert.equal(await evaluate(`document.querySelector('[data-select-area="Engenharias"]').getAttribute('aria-pressed')`),'true');
  await evaluate(`document.querySelector('[name="scientific_area"]').focus()`);
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await evaluate(`document.activeElement.hasAttribute('data-wizard-back')`),true);
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});await step(0);
  assert.equal(await evaluate(`document.querySelector('[name="title"]').value`),'Projeto de teste do assistente');
  assert.equal(await evaluate(`document.querySelector('[name="scientific_area"]').value`),'Engenharias');
  await fill('title','Projeto revisado no assistente');
  // Também verifica a animação real de avanço/retorno com duração total de 280 ms.
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await click('[data-wizard-next]');await step(1);await click('[data-wizard-back]');await step(0);
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  for(const theme of ['light','dark'])for(const width of [360,390,768,1024,1440,1920]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:false});await evaluate(`document.documentElement.dataset.theme='${theme}'`);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`),true,`campo ${width} ${theme}`);
    if([390,1440].includes(width))await screenshot(`wizard-${width}-${theme}`);
  }
  passed('Seletor com 11 áreas/ícones, seleção única, valores originais, teclado, foco, animações, preservação e campos responsivos.');
  const keys=await evaluate(`[...document.querySelectorAll('#project-form [name]')].map(control=>control.name)`);
  assert.deepEqual([...keys].sort(),[...scientificFields].sort());
  const values={title:'Projeto revisado no assistente',scientific_area:'Engenharias'};
  for(let index=0;index<keys.length;index++){
    await step(index);
    if(index>1){values[keys[index]]=keys[index]==='abstract'?'<img src=x onerror="alert(1)"> Texto científico seguro.':`Conteúdo científico de teste para ${keys[index]}.`;await fill(keys[index],values[keys[index]]);}
    await click('[data-wizard-next]');
  }
  await step(keys.length);assert.equal(await visible('[data-wizard-finish]'),true);assert.equal(await visible('[data-wizard-next]'),false);
  assert.equal(await evaluate(`document.querySelectorAll('.wizard-review dt').length`),18);
  assert.equal(await evaluate(`document.querySelectorAll('.wizard-review img').length`),0);
  for(const value of Object.values(values))assert.ok(await evaluate(`document.querySelector('.wizard-review').textContent.includes(${JSON.stringify(value)})`));
  await click('[data-wizard-edit="0"]');await step(0);await fill('title','Projeto corrigido na revisão');values.title='Projeto corrigido na revisão';
  // Volta por todas as etapas, sem perder respostas.
  for(let index=0;index<keys.length;index++){await step(index);assert.equal(await evaluate(`document.querySelector('[name="${keys[index]}"]').value`),values[keys[index]]);await click('[data-wizard-next]');}
  await step(keys.length);
  for(const theme of ['light','dark'])for(const width of [360,390,768,1024,1440,1920]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:false});await evaluate(`document.documentElement.dataset.theme='${theme}'`);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`),true,`revisão ${width} ${theme}`);
    if([390,1440].includes(width))await screenshot(`review-${width}-${theme}`);
  }
  passed('18 campos e revisão final, correção por campo, preservação integral e revisão responsiva em ambos os temas.');
  // Falha controlada no navegador: não altera a API nem os dados; preserva revisão.
  await evaluate(`window.qaFetch=window.fetch;window.fetch=(url,options)=>String(url).startsWith('/api/projects')&&options?.method==='POST'?Promise.resolve(new Response(JSON.stringify({error:'Falha simulada. Tente novamente.'}),{status:503,headers:{'Content-Type':'application/json'}})):window.qaFetch(url,options);`);
  await click('[data-wizard-finish]');await until(()=>evaluate(`document.querySelector('.form-error')?.textContent.includes('Falha simulada')`),'erro de cadastro');
  assert.equal(db.prepare('SELECT count(*) n FROM projects').get().n,originalCount);assert.equal(await evaluate(`document.querySelector('[name="title"]').value`),values.title);
  await evaluate(`window.fetch=window.qaFetch;window.qaPosts=0;window.fetch=async(url,options)=>{if(String(url).startsWith('/api/projects')&&options?.method==='POST'){window.qaPosts++;await new Promise(resolve=>setTimeout(resolve,250));}return window.qaFetch(url,options);};`);
  await evaluate(`{const form=document.querySelector('#project-form');form.requestSubmit(document.querySelector('[data-wizard-finish]'));form.requestSubmit(document.querySelector('[data-wizard-finish]'));form.requestSubmit(document.querySelector('[data-wizard-finish]'));}`);
  await until(()=>visible('[data-submit-project]'),'projeto cadastrado');
  assert.equal(await evaluate('window.qaPosts'),1);assert.equal(db.prepare('SELECT count(*) n FROM projects').get().n,originalCount+1);
  const saved=db.prepare('SELECT * FROM projects WHERE title=?').get(values.title);assert.ok(saved);assert.equal(saved.status,'draft');
  for(const key of keys)assert.equal(saved[key],values[key],key);
  passed('Falha da API preserva dados; confirmação tripla cria um único rascunho com os 18 campos corretos no SQLite.');
  await click('.project-actions a[href$="/edit"]');await until(()=>visible('#project-form'),'editar rascunho');
  assert.equal(await evaluate(`document.querySelector('[name="title"]').value`),values.title);
  for(const key of optionalScientificFields)await fill(key,'');
  for(let index=0;index<keys.length;index++){await step(index);await click('[data-wizard-next]');}await step(keys.length);
  await click('[data-wizard-finish]');await until(()=>visible('[data-submit-project]'),'rascunho atualizado');
  assert.equal(db.prepare('SELECT count(*) n FROM projects').get().n,originalCount+1);
  for(const key of optionalScientificFields)assert.equal(db.prepare('SELECT * FROM projects WHERE id=?').get(saved.id)[key],'');
  await click('[data-submit-project]');await until(()=>visible('[data-confirm]'),'confirmação de envio');await click('[data-confirm]');
  await until(()=>visible('.operation-success button:not([disabled])'),'confirmação da API');
  const submitted=db.prepare('SELECT * FROM projects WHERE id=?').get(saved.id);assert.equal(submitted.status,'submitted');assert.match(submitted.anonymous_code,/^BP-2026-\d{4}$/u);
  await click('.operation-success button');await until(()=>evaluate(`!document.querySelector('dialog')`),'fechamento do envio');
  await until(()=>visible('.badge.submitted'),'status após envio');
  assert.equal(await visible('.project-actions a[href$="/edit"]'),false);
  passed('Edição do rascunho usa PUT sem duplicar; opcionais vazios aceitos; envio real gera código anônimo e bloqueia edição.');
  // Um rascunho realmente incompleto continua permitido.
  await evaluate(`location.hash='/projects/new'`);await until(()=>visible('#project-form'),'novo rascunho incompleto');
  await fill('title','Rascunho incompleto permitido');await click('[data-wizard-next]');await step(1);await fill('scientific_area','Outra área científica');
  for(let index=1;index<keys.length;index++){await step(index);await click('[data-wizard-next]');}await step(keys.length);
  // O servidor salva, mas a primeira resposta se perde. Repetir não pode duplicar.
  await evaluate(`window.fetch=async(url,options)=>{const response=await window.qaFetch(url,options);if(String(url).startsWith('/api/projects')&&options?.method==='POST'){window.fetch=window.qaFetch;throw new TypeError('Conexão interrompida após salvar');}return response;};`);
  await click('[data-wizard-finish]');await until(()=>evaluate(`document.querySelector('.form-error')?.textContent.includes('Verifique sua conexão')`),'resposta perdida');
  assert.equal(db.prepare('SELECT count(*) n FROM projects').get().n,originalCount+2);
  await click('[data-wizard-finish]');
  await until(()=>visible('[data-submit-project]'),'rascunho incompleto salvo');
  const incomplete=db.prepare('SELECT * FROM projects WHERE title=?').get('Rascunho incompleto permitido');assert.ok(incomplete);assert.equal(incomplete.problem,'');assert.equal(incomplete.status,'draft');
  assert.equal(db.prepare('SELECT count(*) n FROM projects').get().n,originalCount+2);
  passed('Rascunho incompleto permitido; resposta perdida após salvar pode ser repetida sem duplicar o registro.');
  await evaluate(`location.hash='/dashboard'`);await until(()=>visible('.project-card'),'cards do participante');
  assert.equal(await evaluate(`[...document.querySelectorAll('.project-card')].every(card=>card.querySelector('[data-area-symbol]')&&card.querySelector('svg'))`),true);
  assert.equal(await evaluate(`!![...document.querySelectorAll('.project-card')].find(card=>card.textContent.includes('Projeto corrigido na revisão'))?.querySelector('[data-area-symbol="engineering"]')`),true);
  await screenshot('cards-com-icones');
  await until(()=>evaluate(`[...document.images].every(image=>image.complete&&image.naturalWidth>0)`),'imagens internas');
  assert.equal(await evaluate(`document.body.textContent.includes('Íris')||!!document.querySelector('img[src*="/mascot/"]')`),false);
  assert.deepEqual(browserErrors,[]);passed('Cards usam o ícone da área real; nenhuma imagem quebrada, referência ao mascote removido ou erro no console.');
  const originalEvent=db.prepare("SELECT value FROM settings WHERE key='active_event'").get().value;
  async function switchUser(email) {
    if(await visible('#logout')) {await click('#logout');await until(()=>visible('#auth-form'),'logout');}
    await fill('email',email);await fill('password','BlindPitch2026!');await click('#auth-form button[type="submit"]');
    await until(()=>visible('#logout'),'sessão autenticada');
  }
  await switchUser('organizador@blindpitch.demo');
  await evaluate(`location.hash='/projects/${saved.id}'`);await until(()=>visible('#anonymize-form'),'revisão de anonimização');
  await evaluate(`document.querySelector('[name="approved"]').checked=true`);await click('#anonymize-form button');
  await until(()=>visible('.operation-success button:not([disabled])'),'anonimização salva');await click('.operation-success button');
  await until(()=>evaluate(`!document.querySelector('dialog')`),'revisão concluída');
  assert.equal(db.prepare('SELECT anonymization_approved FROM projects WHERE id=?').get(saved.id).anonymization_approved,1);
  await evaluate(`location.hash='/assignments'`);await until(()=>visible('#assignment-form'),'distribuição');
  const reviewerId=db.prepare("SELECT id FROM users WHERE email='avaliador1@blindpitch.demo'").get().id;
  await fill('project_id',saved.id);await fill('reviewer_user_id',reviewerId);await fill('review_mode','anonymous');await click('#assignment-form button');
  await until(()=>!!db.prepare('SELECT id FROM assignments WHERE project_id=? AND reviewer_user_id=?').get(saved.id,reviewerId),'atribuição salva');
  const assigned=db.prepare('SELECT id FROM assignments WHERE project_id=? AND reviewer_user_id=?').get(saved.id,reviewerId);
  await switchUser('avaliador1@blindpitch.demo');await evaluate(`location.hash='/reviews/${assigned.id}'`);await until(()=>visible('#review-form'),'rubrica');
  assert.equal(await visible('.anonymous-banner'),true);
  const response=await evaluate(`fetch('/api/assignments/${assigned.id}').then(response=>response.json())`);
  for(const secret of ['Marina Alves','participante1@blindpitch.demo','Escola fictícia Aurora'])assert.equal(JSON.stringify(response).includes(secret),false);
  assert.equal(response.author,undefined);assert.equal(response.project.id,undefined);
  const criteria=db.prepare('SELECT id FROM rubric_criteria WHERE event_id=? ORDER BY order_index').all(originalEvent);
  for(const criterion of criteria)await fill('score_'+criterion.id,'8');
  await fill('general_comment','Comentário científico fictício da auditoria.');
  await click('#review-form button[value="draft"]');await until(()=>evaluate(`document.querySelector('#review-form')?.dataset.busy===undefined`),'rascunho da avaliação');
  assert.equal(db.prepare('SELECT total_score FROM reviews WHERE assignment_id=?').get(assigned.id).total_score,48);
  await click('#review-form button[value="final"]');await until(()=>visible('[data-confirm]'),'confirmar avaliação');await click('[data-confirm]');
  await until(()=>visible('.operation-success button:not([disabled])'),'avaliação finalizada');await click('.operation-success button');
  await until(()=>visible('#review-form fieldset[disabled]'),'avaliação bloqueada');
  assert.equal(db.prepare('SELECT count(*) n FROM reviews WHERE assignment_id=? AND submitted_at IS NOT NULL').get(assigned.id).n,1);
  await evaluate(`location.hash='/history'`);await until(()=>visible(`a[href="#/reviews/${assigned.id}"]`),'histórico com avaliação');
  passed('Organizador revisa e atribui; avaliador recebe API sem autoria, salva notas, finaliza uma vez e consulta histórico.');
  await switchUser('organizador@blindpitch.demo');await evaluate(`location.hash='/settings'`);await until(()=>visible('#new-event-form'),'configuração');
  await evaluate(`{const form=document.querySelector('#new-event-form');form.elements.name.value='Edição da auditoria';form.elements.year.value='2027';form.requestSubmit();}`);
  await until(()=>visible('[data-event-select]'),'seletor entre edições');
  const newEvent=db.prepare("SELECT id FROM events WHERE name='Edição da auditoria'").get().id;
  for(const email of ['participante1@blindpitch.demo','avaliador1@blindpitch.demo']) {
    await switchUser(email);assert.equal(await evaluate(`document.querySelector('[data-event-select]').value`),newEvent);
    assert.equal(await visible('.demo-note'),false);
    for(const width of [360,390,768,1440]) {
      await command('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:false});
      assert.equal(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth+1`),true,'seletor de edição '+width);
      assert.equal(await visible('[data-event-select]'),true);
    }
    await evaluate(`{const select=document.querySelector('[data-event-select]');select.value=${JSON.stringify(originalEvent)};select.dispatchEvent(new Event('change',{bubbles:true}));}`);
    await until(()=>visible('.demo-note'),'edição anterior');
    if(email.startsWith('participante'))await until(()=>visible(`a[href="#/projects/${saved.id}"]`),'projeto da edição anterior');
    else {await evaluate(`location.hash='/history'`);await until(()=>visible(`a[href="#/reviews/${assigned.id}"]`),'avaliação da edição anterior');}
  }
  passed('Participante e avaliador alternam edições no celular/desktop e recuperam projetos/histórico; rótulo demo acompanha a edição.');
  await click('#logout');await until(()=>visible('#auth-form'),'sair para cadastro');await evaluate(`location.hash='/register'`);await until(()=>visible('[name="name"]'),'cadastro público');
  await fill('name','Pessoa Fictícia da Auditoria');await fill('email','auditoria@example.test');await fill('password','BlindPitch2026!');await click('#auth-form button');
  await until(()=>evaluate(`location.hash==='#/login'`),'conta cadastrada');await until(()=>visible('#auth-form'),'login da conta nova');
  await switchUser('auditoria@example.test');assert.ok(db.prepare("SELECT id FROM users WHERE email='auditoria@example.test' AND role='participant'").get());
  await click('#logout');await until(()=>visible('#auth-form'),'logout final');
  passed('Cadastro de conta fictícia, login e logout executados pela interface.');
  assert.deepEqual(browserErrors,[]);
  const browserVersion=await command('Browser.getVersion');
  writeFileSync(join(output,'report.json'),JSON.stringify({passed:report.length,checks:report,isolated_database:true,browser:browserVersion.product,userAgent:browserVersion.userAgent},null,2));
  console.log(`QA aprovado: ${report.length} verificações. Capturas em ${output}.`);
} catch(error) {
  if(socket?.readyState===WebSocket.OPEN){await screenshot('failure').catch(()=>{});console.error(await evaluate(`({hash:location.hash,active:document.activeElement?.outerHTML,step:document.querySelector('#project-form')?.dataset.step,error:document.querySelector('.form-error')?.textContent})`).catch(()=>null));}
  throw error;
} finally {
  socket?.close();chrome.kill();
  await new Promise(resolvePromise=>{if(chrome.exitCode!==null)return resolvePromise();chrome.once('exit',resolvePromise);});
  await new Promise(resolvePromise=>server.close(resolvePromise));db.close();
  // Somente a pasta absoluta recém-criada por mkdtemp é removida, após fechar Chrome/SQLite.
  assert.ok(resolve(temporary).startsWith(resolve(tmpdir())+join('/')));
  rmSync(temporary,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
