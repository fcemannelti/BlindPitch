import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID, webcrypto } from 'node:crypto';
import { openDb, initializeRealDb, passwordMatches } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { seed, demoPassword } from '../server/seed.mjs';

async function fixture(run) {
  const db=openDb(':memory:');await seed(db);const server=createApp(db);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const send=async(path,method='GET',body,headers={})=>{
    const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,data:await response.json(),headers:response.headers};
  };
  const login=async(email,suffix='')=>{
    const response=await send('/login'+suffix,'POST',{email,password:demoPassword});assert.equal(response.status,200);
    const headers={Cookie:response.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':response.data.csrf};
    return (path,method='GET',body,extra={})=>send(path,method,body,{...headers,...extra});
  };
  try{await run({db,base,send,login});}finally{await new Promise(resolve=>server.close(resolve));db.close();}
}

test('login válido não reinicia tentativas maliciosas do mesmo IP',()=>fixture(async({send})=>{
  const wrong=()=>send('/login','POST',{email:'ausente@example.test',password:'senha-incorreta'});
  for(let i=0;i<11;i++)assert.equal((await wrong()).status,401);
  assert.equal((await send('/login','POST',{email:'participante1@blindpitch.demo',password:demoPassword})).status,200);
  assert.equal((await wrong()).status,401);
  assert.equal((await send('/login','POST',{email:'participante1@blindpitch.demo',password:demoPassword})).status,429);
}));

test('cadastro público limita abuso antes de executar hashes de senha',()=>fixture(async({send,db})=>{
  const before=(await db.prepare('SELECT count(*) n FROM users').get()).n;
  for(let i=0;i<20;i++)assert.equal((await send('/register','POST',{})).status,400);
  assert.equal((await send('/register','POST',{})).status,429);
  assert.equal((await db.prepare('SELECT count(*) n FROM users').get()).n,before);
}));

test('login, sessão e logout não dependem de edição salva que deixou de existir',()=>fixture(async({login})=>{
  const suffix='?event_id='+randomUUID(),participant=await login('participante1@blindpitch.demo',suffix);
  assert.equal((await participant('/session'+suffix)).status,200);
  assert.equal((await participant('/events'+suffix)).status,200);
  assert.equal((await participant('/event'+suffix)).status,404);
  assert.equal((await participant('/logout'+suffix,'POST',{})).status,200);
  assert.equal((await participant('/session')).status,401);
}));

test('confirmação repetida de cadastro persiste uma única proposta e isola chave por usuário/edição',()=>fixture(async({login,db})=>{
  const participant=await login('participante1@blindpitch.demo'),other=await login('participante2@blindpitch.demo'),organizer=await login('organizador@blindpitch.demo');
  const content={title:'Teste de conexão interrompida',scientific_area:'Tecnologia'},headers={'Idempotency-Key':randomUUID()};
  const before=(await db.prepare('SELECT count(*) n FROM projects').get()).n;
  const responses=await Promise.all(Array.from({length:3},()=>participant('/projects','POST',content,headers)));
  assert.ok(responses.every(response=>response.status===200));assert.equal(new Set(responses.map(response=>response.data.id)).size,1);
  assert.equal((await db.prepare('SELECT count(*) n FROM projects').get()).n,before+1);
  const projectId=responses[0].data.id;
  assert.equal((await db.prepare("SELECT count(*) n FROM audit_logs WHERE entity_id=? AND action='project.created'").get(projectId)).n,1);
  assert.equal((await participant('/projects','POST',{...content,title:'Outro conteúdo'},headers)).status,409);
  assert.equal((await participant('/projects','POST',content,{'Idempotency-Key':'inválida'})).status,400);
  const second=await other('/projects','POST',content,headers);assert.equal(second.status,200);assert.notEqual(second.data.id,projectId);
  const event=await organizer('/events','POST',{name:'Edição adicional de teste',year:2027});
  const third=await participant('/projects?event_id='+event.data.id,'POST',content,headers);assert.equal(third.status,200);assert.notEqual(third.data.id,projectId);
}));

test('requisições malformadas retornam 4xx e cache condicional evita reenviar imagens',()=>fixture(async({base,send})=>{
  assert.equal((await fetch(base+'/%ZZ.js')).status,400);
  for(const origin of ['null','not a URL','ftp://'+new URL(base).host])assert.equal((await send('/login','POST',{},{Origin:origin})).status,403);
  const path=base+'/assets/science-owls/transparent/coruja-fisica.png';
  const first=await fetch(path);assert.equal(first.status,200);const bytes=await first.arrayBuffer(),etag=first.headers.get('etag');assert.ok(etag);
  assert.equal(Number(first.headers.get('content-length')),bytes.byteLength);
  const cached=await fetch(path,{headers:{'If-None-Match':etag}});assert.equal(cached.status,304);assert.equal((await cached.arrayBuffer()).byteLength,0);
  const head=await fetch(path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(Number(head.headers.get('content-length')),bytes.byteLength);assert.equal((await head.arrayBuffer()).byteLength,0);
}));

test('isolamento por usuário, papel e edição também protege URLs e mutações diretas',()=>fixture(async({db,login})=>{
  const participant=await login('participante1@blindpitch.demo'),other=await login('participante2@blindpitch.demo'),reviewer=await login('avaliador1@blindpitch.demo'),organizer=await login('organizador@blindpitch.demo');
  const original=(await participant('/event')).data.id;
  const project=(await participant('/projects','POST',{title:'Projeto reservado',scientific_area:'Física'})).data.id;
  for(const [method,suffix,body] of [['GET','',undefined],['PUT','',{title:'Alterado',scientific_area:'Física'}],['POST','/submit',{}],['GET','/results',undefined]])assert.equal((await other('/projects/'+project+suffix,method,body)).status,404);
  for(const path of ['/projects','/projects/'+project,'/users','/metrics','/audit','/export'])assert.equal((await reviewer(path)).status,403);
  const foreign=(await db.prepare("SELECT a.id FROM assignments a JOIN users u ON u.id=a.reviewer_user_id WHERE u.email='avaliador2@blindpitch.demo'").get()).id;
  assert.equal((await reviewer('/assignments/'+foreign)).status,404);
  assert.equal((await reviewer('/assignments/'+foreign+'/start','POST',{})).status,404);
  assert.equal((await reviewer('/assignments/'+foreign+'/review','PUT',{})).status,404);
  const next=(await organizer('/events','POST',{name:'Teste de isolamento por edição',year:2027})).data.id;
  assert.equal((await participant('/projects/'+project+'?event_id='+next)).status,404);
  assert.equal((await organizer('/projects/'+project+'/archive?event_id='+next,'POST',{})).status,404);
  assert.equal((await participant('/projects/'+project+'?event_id='+original)).status,200);
  assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).length,0);
  assert.equal((await db.prepare('PRAGMA integrity_check').get()).integrity_check,'ok');
}));

test('inicialização real valida credenciais e desfaz toda a edição quando a conta falha',async()=>{
  const db=openDb(':memory:');
  try {
    for(const [email,password] of [['inválido','SenhaInicialLonga2026'],['admin@example.test','            ']]) {
      await assert.rejects(()=>initializeRealDb(db,email,password));assert.equal((await db.prepare('SELECT count(*) n FROM events').get()).n,0);
    }
    await db.exec("CREATE TRIGGER fail_admin BEFORE INSERT ON users BEGIN SELECT RAISE(ABORT,'Falha simulada'); END;");
    await assert.rejects(()=>initializeRealDb(db,'admin@example.test','SenhaInicialLonga2026'));
    for(const table of ['events','rubric_criteria','settings','users'])assert.equal((await db.prepare(`SELECT count(*) n FROM ${table}`).get()).n,0);
    await db.exec('DROP TRIGGER fail_admin');
    assert.equal(await initializeRealDb(db,' ADMIN@example.test ','  SenhaInicialLonga2026  '),true);
    const account=await db.prepare('SELECT * FROM users').get();assert.equal(account.email,'admin@example.test');assert.equal(passwordMatches('SenhaInicialLonga2026',account.password_hash),true);
    assert.equal(await initializeRealDb(db,'ignored','ignored'),false);
  } finally {db.close();}
});

function frontend(overrides={}) {
  const context=vm.createContext({document:{querySelector:()=>null},window:{addEventListener(){}},location:{hash:''},sessionStorage:{getItem(){throw new Error('Storage bloqueado');},setItem(){throw new Error('Storage bloqueado');},removeItem(){throw new Error('Storage bloqueado');}},...overrides});
  const source=readFileSync('public/app.js','utf8').replace('export {};','').replace(/boot\(\);\s*$/u,'');
  vm.runInContext(source+'\nglobalThis.ui={state,storedEvent,api,demoBanner,editionPicker,creationKey};',context);return context.ui;
}
test('interface inicia sem storage e rotula demonstração conforme a edição consultada',()=>{
  const ui=frontend();assert.equal(ui.state.eventId,'');assert.equal(ui.storedEvent('edição'),'edição');assert.equal(ui.storedEvent(''),'');
  ui.state.publicInfo={event:{demo:1}};assert.match(ui.demoBanner(),/Dados ilustrativos/u);
  ui.state.event={id:'real',demo:0};assert.equal(ui.demoBanner(),'');
  ui.state.events=[{id:'demo',name:'Demonstração',year:2026},{id:'real',name:'Nova edição',year:2027}];
  assert.match(ui.editionPicker(),/data-event-select/u);assert.match(ui.editionPicker(),/value="real" selected/u);
});
test('chave de confirmação funciona sem randomUUID em HTTP da rede local',()=>{
  const ui=frontend({crypto:{getRandomValues:array=>webcrypto.getRandomValues(array)}});
  const keys=Array.from({length:100},()=>ui.creationKey());assert.equal(new Set(keys).size,100);
  assert.ok(keys.every(key=>/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(key)));
});
test('interface recupera edição inválida e distingue falha de conexão de resposta inválida',async()=>{
  const paths=[];
  const ui=frontend({fetch:async path=>{paths.push(path);return path.includes('event_id=')?{status:404,ok:false,json:async()=>({error:'Edição não encontrada.'})}:{status:200,ok:true,json:async()=>({id:'ativa'})};}});
  ui.state.eventId='removida';assert.equal((await ui.api('/event')).id,'ativa');assert.equal(ui.state.eventId,'');assert.deepEqual(paths,['/api/event?event_id=removida','/api/event']);
  const offline=frontend({fetch:async()=>{throw new Error('network');}});await assert.rejects(offline.api('/projects'),/Verifique sua conexão/u);
  const invalid=frontend({fetch:async()=>({json:async()=>{throw new Error('HTML');}})});await assert.rejects(invalid.api('/projects'),/resposta inválida/u);
});

test('build remove assets obsoletos sem alterar os arquivos de origem',()=>{
  const directory=mkdtempSync(join(tmpdir(),'blindpitch-build-audit-'));
  try {
    mkdirSync(join(directory,'public'));mkdirSync(join(directory,'dist'));
    writeFileSync(join(directory,'public','index.html'),'<main>Teste de build</main>');
    writeFileSync(join(directory,'dist','obsolete.svg'),'asset removido');
    const result=spawnSync(process.execPath,[resolve('scripts/build.mjs')],{cwd:directory,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);
    assert.equal(existsSync(join(directory,'dist','obsolete.svg')),false);
    assert.equal(readFileSync(join(directory,'dist','index.html'),'utf8'),readFileSync(join(directory,'public','index.html'),'utf8'));
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(join(directory,'dist','build-manifest.json'),'utf8')).files),['index.html']);
  } finally {
    assert.ok(resolve(directory).startsWith(resolve(tmpdir())));rmSync(directory,{recursive:true,force:true});
  }
});
