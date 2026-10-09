// Renderização offline de templates reais. Não substitui testes de interação.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import vm from 'node:vm';
import { openDb } from '../server/db.mjs';
import { seed, demoPassword } from '../server/seed.mjs';
import { createApp } from '../server/app.mjs';

const browser=process.env.CHROME_PATH||[
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium','/usr/bin/google-chrome'
].find(existsSync);
if(!browser)throw new Error('Configure CHROME_PATH com o executável do Chrome/Chromium/Edge.');
const output=resolve('test-results/layout');mkdirSync(output,{recursive:true});
const widths=[360,390,768,1024,1366,1440,1920];
// @charset pertence ao CSS externo; deve ser removido ao embutir em HTML.
const css=readFileSync('public/styles.css','utf8').replace(/^\uFEFF?@charset "UTF-8";\s*/u,'');
const source=readFileSync('public/app.js','utf8').replace('export {};','').replace(/boot\(\);\s*$/u,'');
const db=openDb(':memory:');seed(db);
const server=createApp(db);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
let cookie='';
const context=vm.createContext({
  document:{querySelector:()=>null,querySelectorAll:()=>[]},
  sessionStorage:{getItem:()=>'',setItem(){},removeItem(){}},
  window:{addEventListener(){},matchMedia:()=>({matches:true})},
  location:{hash:''},setTimeout,clearTimeout,URL,
  fetch:(path,options={})=>fetch(base+path,{...options,headers:{...options.headers,Cookie:cookie}})
});
const names=['state','shell','publicHome','aboutPage','authPage','organizerDashboard','projectsPage','projectForm','projectDetail','reviewersPage','assignmentsPage','reviewerDashboard','reviewPage','resultsPage','rubricPage','settingsPage','exportPage','auditPage','empty','confirmAction','operationFlow'];
vm.runInContext(source+'\nglobalThis.ui={'+names.join(',')+'};',context);
const ui=context.ui,pages=[];
async function login(email) {
  const r=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:demoPassword})});
  cookie=r.headers.get('set-cookie').split(';')[0];
  const data=await r.json();ui.state.user=data.user;ui.state.csrf=data.csrf;
  ui.state.event=await(await fetch(base+'/api/event',{headers:{Cookie:cookie}})).json();
  ui.state.events=await(await fetch(base+'/api/events',{headers:{Cookie:cookie}})).json();
  ui.state.publicInfo=await(await fetch(base+'/api/public')).json();
}
async function page(name,path,content) { pages.push({name,html:ui.shell(await content,path)}); }
try {
  await login('organizador@blindpitch.demo');ui.state.user=null;
  await page('landing','/',ui.publicHome());await page('sobre','/about',ui.aboutPage());
  await page('login','/login',ui.authPage(false));await page('cadastro','/register',ui.authPage(true));
  await login('organizador@blindpitch.demo');
  for(const [name,path,render] of [
    ['dashboard','/dashboard',()=>ui.organizerDashboard()],['projetos','/projects',()=>ui.projectsPage()],
    ['participantes','/participants',()=>ui.reviewersPage(true)],['avaliadores','/reviewers',()=>ui.reviewersPage()],
    ['distribuicao','/assignments',()=>ui.assignmentsPage()],['rubrica','/rubric',()=>ui.rubricPage()],
    ['resultados','/results',()=>ui.resultsPage()],['comparacoes','/comparisons',()=>ui.resultsPage(true)],
    ['configuracoes','/settings',()=>ui.settingsPage()],['exportacao','/export',()=>ui.exportPage()],
    ['auditoria','/audit',()=>ui.auditPage()]
  ])await page(name,path,render());
  const submitted=db.prepare("SELECT id FROM projects WHERE status='submitted'").get();
  await page('anonimizacao','/projects/'+submitted.id,ui.projectDetail(submitted.id));
  await login('participante1@blindpitch.demo');
  await page('participante','/dashboard',ui.projectsPage());await page('nova-proposta','/projects/new',ui.projectForm());
  const own=db.prepare('SELECT project_id FROM project_authors WHERE user_id=? LIMIT 1').get(ui.state.user.id);
  await page('detalhes','/projects/'+own.project_id,ui.projectDetail(own.project_id));
  await login('avaliador1@blindpitch.demo');
  await page('avaliador','/dashboard',ui.reviewerDashboard());await page('historico','/history',ui.reviewerDashboard(true));
  const assignment=db.prepare("SELECT id FROM assignments WHERE reviewer_user_id=? AND status='pending'").get(ui.state.user.id);
  await page('avaliacao','/reviews/'+assignment.id,ui.reviewPage(assignment.id));
  await page('vazio','/dashboard',ui.empty('Sua próxima ideia começa aqui.','Crie uma proposta para participar da edição.','<a class="button primary" href="#/projects/new">Criar proposta</a>'));
  // Captura o HTML produzido pelas funções reais de confirmação/operação.
  let dialog;
  context.document.body={append(){}};
  context.document.createElement=()=>dialog={innerHTML:'',className:'',setAttribute(){},addEventListener(){},showModal(){},querySelector:()=>({addEventListener(){},remove(){}})};
  ui.confirmAction('Enviar esta proposta? Após o envio, ela ficará bloqueada para edição.');
  pages.push({name:'confirmacao',html:ui.shell('<dialog class="'+dialog.className+'">'+dialog.innerHTML+'</dialog>','/dashboard')});
  ui.operationFlow('proposal',()=>new Promise(()=>{}));
  pages.push({name:'envio',html:ui.shell('<dialog class="'+dialog.className+'">'+dialog.innerHTML+'</dialog>','/dashboard')});
  // Fixture visual do estado final; a execução assíncrona é testada em experience.test.mjs.
  const code=db.prepare('SELECT anonymous_code FROM projects WHERE anonymous_code IS NOT NULL LIMIT 1').get().anonymous_code;
  const successHtml=dialog.innerHTML.replace('Aguardando confirmação do servidor…','Projeto enviado com sucesso ✓')
    .replace('<p class="operation-code" hidden></p>','<p class="operation-code">'+code+'</p>')
    .replace('class="protected-caption" hidden','class="protected-caption"')
    .replaceAll('<li data-step=','<li class="step-complete" data-step=')
    .replace(/<button[^>]+>.*?<\/button>/su,'<button class="button primary full" type="button">Continuar →</button>');
  pages.push({name:'sucesso',html:ui.shell('<dialog class="'+dialog.className+' operation-success">'+successHtml+'</dialog>','/dashboard')});
} finally {await new Promise(resolve=>server.close(resolve));db.close();}

// Mede o layout renderizado; não deduz posições apenas a partir de texto CSS.
const measure=String.raw`
window.addEventListener('load',()=>{
document.querySelectorAll('dialog').forEach(dialog=>dialog.showModal());
document.querySelectorAll('.table-scroll').forEach(table=>{table.tabIndex=0;});
const width=window.innerWidth,usableWidth=document.documentElement.clientWidth,problems=[],bounds=e=>e.getBoundingClientRect();
if(!getComputedStyle(document.body).fontFamily.includes('Segoe'))problems.push('estilos de base não aplicados');
if(document.documentElement.scrollWidth>usableWidth+1)problems.push('overflow da página: '+document.documentElement.scrollWidth+' > '+usableWidth);
for(const el of document.querySelectorAll('main,.panel,.metric-card,.auth-card,.table-scroll,form,input,select,textarea,img.scientist-owl')){
  const b=bounds(el);if(!b.width||el.closest('dialog:not([open])'))continue;
  if(b.left< -1||b.right>usableWidth+1)problems.push(el.tagName+'.'+el.className+' fora da viewport');
}
for(const main of document.querySelectorAll('main')){
  const b=bounds(main),parent=bounds(main.parentElement);
  if(Math.abs((b.left+b.right)-(parent.left+parent.right))>2)problems.push('main fora do centro');
}
for(const image of document.querySelectorAll('img.scientist-owl')){
  const b=bounds(image);if(!image.complete||!image.naturalWidth)problems.push('coruja científica não carregou');
  if(Math.abs(b.width/b.height-1)>.01)problems.push('coruja científica distorcida');
}
for(const image of document.querySelectorAll('.owl-group img')){
  if(!image.complete||!image.naturalWidth)problems.push('coruja PNG não carregou');
  const b=bounds(image);if(b.width&&Math.abs(b.width/b.height-image.naturalWidth/image.naturalHeight)>.01)problems.push('coruja PNG distorcida');
}
for(const grid of document.querySelectorAll('.metrics-grid,.project-grid')){
  const row=[...grid.children].filter(el=>Math.abs(bounds(el).top-bounds(grid.firstElementChild).top)<1);
  if(row.length>1&&Math.max(...row.map(el=>bounds(el).height))-Math.min(...row.map(el=>bounds(el).height))>1)problems.push('cards da mesma linha com alturas distintas');
  if(grid.matches('.metrics-grid')&&row.length>1){
    const tops=row.map(el=>bounds(el.querySelector(':scope > strong')).top);
    if(Math.max(...tops)-Math.min(...tops)>1)problems.push('números dos indicadores desalinhados');
  }
}
for(const formPage of document.querySelectorAll('.form-page,.form-page-wide')){
  const b=bounds(formPage),p=bounds(formPage.parentElement);
  if(Math.abs(b.left+b.right-p.left-p.right)>2)problems.push('formulário fora do eixo central');
  if(formPage.matches('.form-page')&&b.width>851)problems.push('formulário excede 850 px');
}
for(const dialog of document.querySelectorAll('dialog[open]')){
  const b=bounds(dialog);if(Math.abs(b.left+b.right-usableWidth)>2)problems.push('diálogo fora do centro horizontal');
  if(Math.abs(b.top+b.bottom-window.innerHeight)>2)problems.push('diálogo fora do centro vertical');
  if(b.height>window.innerHeight-30)problems.push('diálogo ultrapassa altura útil');
}
const metrics=document.querySelector('.metrics-grid'),main=document.querySelector('main');
const overflowElements=problems.length?[...document.querySelectorAll('body *')].filter(el=>bounds(el).right>usableWidth+1&&!el.closest('.table-scroll,.sidebar nav')).slice(0,12).map(el=>({tag:el.tagName,id:el.id,className:String(el.className.baseVal??el.className),left:bounds(el).left,right:bounds(el).right})):[];
const report={width,usableWidth,problems,overflowElements,main:main?Math.round(bounds(main).width):null,metricColumns:metrics?getComputedStyle(metrics).gridTemplateColumns.split(' ').length:0};
window.parent.postMessage(report,'*');
});
`;

function render(file,width,theme,name,worker) {
  const screenshot=['landing','login','cadastro','dashboard','projetos','rubrica','configuracoes','nova-proposta','anonimizacao','avaliacao','vazio','envio','sucesso','confirmacao'].includes(name)&&[390,1440].includes(width);
  return new Promise((resolvePromise,reject)=>{
    const args=['--headless','--no-first-run','--no-default-browser-check','--force-device-scale-factor=1',
      '--user-data-dir='+join(output,'profile-'+worker),'--window-size='+Math.max(540,width+32)+',1120','--virtual-time-budget=1000','--dump-dom'];
    if(screenshot)args.push('--screenshot='+join(output,name+'-'+width+'-'+theme+'.png'));
    args.push(pathToFileURL(file).href);
    const child=spawn(browser,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);
    const timer=setTimeout(()=>{child.kill();reject(new Error('Timeout: '+name));},25000);
    child.on('error',reject);child.on('close',code=>{
      clearTimeout(timer);
      const match=stdout.match(/<pre id="layout-report"[^>]*>(.*?)<\/pre>/su);
      if(code!==0||!match?.[1]?.trim())return reject(new Error('Renderização falhou: '+name+' '+stderr.slice(-400)));
      resolvePromise({name,theme,requestedWidth:width,...JSON.parse(match[1].replaceAll('&gt;','>').replaceAll('&lt;','<').replaceAll('&amp;','&'))});
    });
  });
}
const jobs=[];
for(const page of pages.filter(page=>!process.env.QA_PAGES||process.env.QA_PAGES.split(',').includes(page.name)))for(const theme of ['light','dark']){
  // Reutiliza PNG locais: embutir base64 em cada viewport duplicaria centenas de MB.
  const html=page.html.replace(/\/assets\/science-owls\/transparent\/coruja-[a-z]+\.png/gu,path=>pathToFileURL(resolve('public'+path)).href);
  const fixture='<!doctype html><html lang="pt-BR" data-theme="'+theme+'"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'\n*,*::before,*::after{animation:none!important;transition:none!important}.owl-group:nth-child(2){visibility:hidden!important}</style></head><body>'+html+'<script>'+measure+'</script></body></html>';
  const escaped=fixture.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  // Chrome limita janelas nativas a 500 px. O iframe fornece a viewport CSS
  // exata de 360/390 px sem depender das bordas da janela do sistema operacional.
  for(const width of widths){
    const file=join(output,page.name+'-'+width+'-'+theme+'.html');
    writeFileSync(file,'<!doctype html><meta charset="UTF-8"><style>html,body{margin:0;background:#7e8797;overflow:hidden}iframe{display:block;border:0;width:'+width+'px;height:1000px}</style><pre id="layout-report" hidden></pre><script>window.addEventListener("message",event=>{if(event.source===document.querySelector("iframe").contentWindow)document.querySelector("#layout-report").textContent=JSON.stringify(event.data);});</script><iframe title="Layout de teste" srcdoc="'+escaped+'"></iframe>');
    jobs.push({file,width,theme,name:page.name});
  }
}
const reports=[];let cursor=0;
await Promise.all([0,1,2].map(async worker=>{
  while(cursor<jobs.length){
    const job=jobs[cursor++];const report=await render(job.file,job.width,job.theme,job.name,worker);reports.push(report);
    if(report.width!==job.width)report.problems.push('viewport solicitada não foi respeitada');
    if(report.problems.length)console.log('FALHA',job.name,job.width,job.theme,report.problems,report.overflowElements);
    if(reports.length%28===0)console.log('Layouts renderizados: '+reports.length+'/'+jobs.length);
  }
}));
const failures=reports.filter(r=>r.problems.length);
writeFileSync(join(output,'report.json'),JSON.stringify({pages:new Set(reports.map(r=>r.name)).size,renders:reports.length,widths,failures,reports},null,2));
console.log(`${new Set(reports.map(r=>r.name)).size} telas · ${reports.length} renders · ${failures.length} layouts com falhas. Evidências em test-results/layout.`);
process.exitCode=failures.length?1:0;
