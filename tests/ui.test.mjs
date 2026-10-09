import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { openDb } from '../server/db.mjs';
import { seed, demoPassword } from '../server/seed.mjs';
import { createApp } from '../server/app.mjs';
import { scientificFields, scientificLimits, optionalScientificFields } from '../server/validation.mjs';

// Verificação dos renderizadores reais contra HTTP/SQLite. Não substitui QA visual em navegador.
test('todas as telas renderizam dados reais por papel e escapam conteúdo HTML',async()=>{
  const db=openDb(':memory:');seed(db);const server=createApp(db);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  let cookie='';
  const context=vm.createContext({
    document:{querySelector:()=>null,querySelectorAll:()=>[]},sessionStorage:{getItem:()=>'',setItem:()=>{},removeItem:()=>{}},
    window:{addEventListener:()=>{}},location:{hash:''},setTimeout,URL,
    fetch:(path,options={})=>fetch(base+path,{...options,headers:{...options.headers,Cookie:cookie}})
  });
  const names=['state','publicHome','authPage','aboutPage','organizerDashboard','projectsPage','projectForm','projectDetail','reviewersPage','assignmentsPage','reviewerDashboard','reviewPage','resultsPage','rubricPage','settingsPage','exportPage','auditPage','esc','scientificInputs','consentDisclosure','shell'];
  const source=readFileSync('public/app.js','utf8').replace('export {};','').replace(/boot\(\);\s*$/u,'');
  vm.runInContext(`(()=>{${source}\nglobalThis.ui={${names.join(',')}};})()`,context);
  const ui=context.ui;
  async function login(email) {
    const response=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:demoPassword})});
    cookie=response.headers.get('set-cookie').split(';')[0];const data=await response.json();ui.state.user=data.user;ui.state.csrf=data.csrf;
    ui.state.event=await(await fetch(base+'/api/event',{headers:{Cookie:cookie}})).json();
    ui.state.events=await(await fetch(base+'/api/events',{headers:{Cookie:cookie}})).json();
    ui.state.publicInfo=await(await fetch(base+'/api/public')).json();
  }
  try {
    await login('organizador@blindpitch.demo');
    for(const html of [ui.publicHome(),ui.authPage(false),ui.authPage(true),ui.aboutPage(),await ui.organizerDashboard(),await ui.projectsPage(),await ui.reviewersPage(),await ui.reviewersPage(true),await ui.assignmentsPage(),await ui.resultsPage(),await ui.resultsPage(true),await ui.rubricPage(),ui.settingsPage(),ui.exportPage(),await ui.auditPage()]) {
      assert.ok(html.length>100);assert.equal(html.includes('undefined'),false);assert.equal(html.includes('[object Object]'),false);
      assert.equal(/Íris|ÍRIS|\/assets\/mascot\//u.test(html),false);
      const page=ui.shell(html,'/dashboard');assert.equal((page.match(/data-theme-toggle/gu)||[]).length,1);assert.ok(page.includes('aria-label="Ativar modo escuro"'));
    }
    const submitted=db.prepare("SELECT id FROM projects WHERE status='submitted'").get();
    const projectHtml=await ui.projectDetail(submitted.id);assert.ok(projectHtml.includes('anonymize-form'));assert.equal(projectHtml.includes('Marina Alves'),false);
    const metricsHtml=await ui.organizerDashboard();assert.ok(metricsHtml.includes('Dados ilustrativos'));assert.ok(metricsHtml.includes('Progresso da avaliação'));
    const dangerous='<img src=x onerror="alert(1)">';const escaped=ui.scientificInputs({title:dangerous});assert.equal(escaped.includes('<img src=x'),false);assert.ok(escaped.includes('&lt;img'));
    const inputs=ui.scientificInputs();
    for(const field of scientificFields) {
      const control=inputs.match(new RegExp(`<(?:input|textarea) name="${field}"[^>]*>`,'u'))?.[0];
      assert.ok(control,field);assert.ok(control.includes(`maxlength="${scientificLimits[field]}"`),field);
      if(optionalScientificFields.includes(field))assert.equal(control.includes('required'),false,field);
    }
    assert.ok(inputs.includes('proposal-extras'));assert.ok(inputs.includes('rows="10"'));
    await login('participante1@blindpitch.demo');assert.ok((await ui.projectsPage()).includes('Nova proposta'));assert.ok(ui.projectForm().includes('project-form'));
    const pid=db.prepare('SELECT project_id FROM project_authors WHERE user_id=? LIMIT 1').get(ui.state.user.id).project_id;
    assert.ok((await ui.projectDetail(pid)).includes('Acompanhe a proposta'));
    await login('avaliador1@blindpitch.demo');
    assert.ok((await ui.reviewerDashboard()).includes('Avaliação anônima ativa'));assert.ok((await ui.reviewerDashboard(true)).includes('Seu histórico'));
    const assignment=db.prepare("SELECT id FROM assignments WHERE reviewer_user_id=? AND status='pending'").get(ui.state.user.id);
    const reviewHtml=await ui.reviewPage(assignment.id);assert.ok(reviewHtml.includes('review-form'));assert.ok(reviewHtml.includes('Avaliação anônima ativa'));assert.equal(reviewHtml.includes('Caio Nunes'),false);
    assert.ok(reviewHtml.includes('Revisar e finalizar'));
  } finally {await new Promise(resolve=>server.close(resolve));db.close();}
});

test('SQLite persiste propostas e avaliações após reabrir a base; seed é idempotente',()=>{
  const dir=mkdtempSync(join(tmpdir(),'blindpitch-test-')),path=join(dir,'app.sqlite');
  try {
    const db=openDb(path);assert.equal(seed(db),true);
    const count=db.prepare('SELECT count(*) n FROM projects').get().n;
    const code=db.prepare('SELECT anonymous_code FROM projects WHERE anonymous_code IS NOT NULL LIMIT 1').get().anonymous_code;
    const reviews=db.prepare('SELECT count(*) n FROM reviews').get().n;db.close();
    const reopened=openDb(path);assert.equal(seed(reopened),false);assert.equal(reopened.prepare('SELECT count(*) n FROM projects').get().n,count);assert.equal(reopened.prepare('SELECT count(*) n FROM reviews').get().n,reviews);assert.ok(reopened.prepare('SELECT id FROM projects WHERE anonymous_code=?').get(code));reopened.close();
  } finally {rmSync(dir,{recursive:true,force:true});}
});
