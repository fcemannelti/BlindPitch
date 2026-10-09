import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { seed, demoPassword } from '../server/seed.mjs';
import { createApp } from '../server/app.mjs';
import { scientificFields } from '../server/validation.mjs';

async function fixture(run) {
  const db=openDb(':memory:');seed(db);const server=createApp(db);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const send=async(path,method='GET',body,headers={})=>{
    const r=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json(),headers:r.headers};
  };
  const login=async(email)=>{
    const r=await send('/login','POST',{email,password:demoPassword});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];
    return {cookie,csrf:r.data.csrf,request:(path,method='GET',body)=>send(path,method,body,{Cookie:cookie,'X-CSRF-Token':r.data.csrf})};
  };
  try{await run({db,send,login,base});}finally{await new Promise(resolve=>server.close(resolve));db.close();}
}
const proposal=title=>Object.fromEntries(scientificFields.map(field=>[field,field==='title'?title:'Conteúdo científico suficiente para investigar o problema.']));

test('anonimização cobre todos os campos e todas as respostas do avaliador, inclusive após revelação',()=>fixture(async({db,login})=>{
  const o=(await login('organizador@blindpitch.demo')).request,r=(await login('avaliador1@blindpitch.demo')).request;
  const p=db.prepare("SELECT id FROM projects WHERE status='submitted'").get();
  const privateContent=Object.fromEntries(scientificFields.map(f=>[f,'Marina Alves MARINA ALVES marina alves participante1@blindpitch.demo Escola fictícia Aurora www.pessoal.test 123.456.789-00. Pesquisa experimental.']));
  assert.equal((await o(`/projects/${p.id}/anonymize`,'POST',{content:privateContent,approved:true})).status,200);
  const reviewer=db.prepare("SELECT id FROM users WHERE email='avaliador1@blindpitch.demo'").get();
  const a=await o('/assignments','POST',{project_id:p.id,reviewer_user_id:reviewer.id,review_mode:'anonymous'});assert.equal(a.status,200);
  for(const response of [await r('/assignments'),await r(`/assignments/${a.data.id}`),await r(`/assignments/${a.data.id}/start`,'POST',{}),await r(`/assignments/${a.data.id}/review`,'PUT',{scores:[],general_comment:'Marina Alves participante1@blindpitch.demo',finalize:false})]) {
    assert.equal(response.status,200);const raw=JSON.stringify(response.data).toLowerCase();
    for(const secret of ['marina alves','participante1@blindpitch.demo','escola fictícia aurora','pessoal.test','123.456.789-00'])assert.equal(raw.includes(secret),false,secret);
  }
}));

test('consentimento é específico da edição e da versão do protocolo',()=>fixture(async({db,login})=>{
  const o=(await login('organizador@blindpitch.demo')).request,p=(await login('participante1@blindpitch.demo')).request;
  const e=await o('/events','POST',{name:'Edição com protocolo próprio',year:2027});const suffix=`?event_id=${e.data.id}`;
  await o('/event'+suffix,'PUT',{identified_enabled:true,protocol:'Protocolo experimental versão um para esta edição.'});
  const created=await p('/projects'+suffix,'POST',proposal('Experimento com consentimento')),pid=created.data.id;
  await p(`/projects/${pid}/submit${suffix}`,'POST',{});await o(`/projects/${pid}/anonymize${suffix}`,'POST',{content:proposal('Experimento com consentimento'),approved:true});
  const rid=db.prepare("SELECT id FROM users WHERE email='avaliador2@blindpitch.demo'").get().id;
  const assign=()=>o('/assignments'+suffix,'POST',{project_id:pid,reviewer_user_id:rid,review_mode:'identified'});
  assert.equal((await assign()).status,409);
  assert.equal((await p('/consent'+suffix,'POST',{consent:true})).status,200);
  assert.equal((await p('/event'+suffix)).data.consent,true);
  assert.equal((await o('/event'+suffix,'PUT',{protocol:'Protocolo experimental versão dois, modificado.'})).status,200);
  assert.equal((await p('/event'+suffix)).data.consent,false);assert.equal((await assign()).status,409);
  await p('/consent'+suffix,'POST',{consent:true});assert.equal((await assign()).status,200);
  assert.equal((await o('/event'+suffix,'PUT',{protocol:'Nova versão que não pode invalidar uma atribuição.'})).status,409);
}));

test('códigos únicos sob submissões concorrentes e entre edições do mesmo ano',()=>fixture(async({login})=>{
  const o=(await login('organizador@blindpitch.demo')).request,p=(await login('participante1@blindpitch.demo')).request;
  const first=(await p('/event')).data.id;
  const newer=(await o('/events','POST',{name:'Outra edição no mesmo ano',year:2026})).data.id;
  const codes=[];
  for(const eventId of [first,newer,first]) {
    const suffix=`?event_id=${eventId}`,draft=await p('/projects'+suffix,'POST',proposal('Código científico único'));
    const submissions=await Promise.all([p(`/projects/${draft.data.id}/submit${suffix}`,'POST',{}),p(`/projects/${draft.data.id}/submit${suffix}`,'POST',{})]);
    assert.deepEqual(submissions.map(r=>r.status).sort(),[200,409]);codes.push(submissions.find(r=>r.status===200).data.anonymous_code);
  }
  assert.equal(new Set(codes).size,3);
}));

test('sessões expiram, tokens não são armazenados em claro e cookies são HttpOnly',()=>fixture(async({db,send,login})=>{
  const account=await login('participante1@blindpitch.demo'),rawToken=account.cookie.split('=')[1];
  assert.equal(db.prepare('SELECT token_hash FROM sessions WHERE token_hash=?').get(rawToken),undefined);
  assert.equal((await account.request('/session')).status,200);
  db.prepare('UPDATE sessions SET expires_at=0').run();assert.equal((await account.request('/session')).status,401);
  const r=await send('/login','POST',{email:'participante1@blindpitch.demo',password:demoPassword});
  assert.match(r.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/u);
}));

test('notas inválidas, estados bloqueados, limites de payload e base de dados protegida',()=>fixture(async({db,login,base})=>{
  const r=(await login('avaliador1@blindpitch.demo')).request,o=(await login('organizador@blindpitch.demo')).request;
  const a=db.prepare("SELECT id,project_id FROM assignments WHERE status='pending'").get();
  assert.equal((await o(`/projects/${a.project_id}/archive`,'POST',{})).status,409);
  await r(`/assignments/${a.id}/start`,'POST',{});const c=(await r('/rubric')).data[0];
  for(const score of [-1,11,null,'8'])assert.equal((await r(`/assignments/${a.id}/review`,'PUT',{scores:[{criterion_id:c.id,score}],general_comment:'',finalize:false})).status,400);
  assert.equal((await o('/event','PUT',{reviews_open:false})).status,200);
  assert.equal((await r(`/assignments/${a.id}/review`,'PUT',{scores:[],general_comment:'',finalize:false})).status,409);
  for(const path of ['/data/blindpitch.sqlite','/.env','/tools/typescript/lib/typescript.js'])assert.equal((await fetch(base+path)).status,404);
  const loginR=await login('participante1@blindpitch.demo');
  const oversized=await fetch(base+'/api/projects',{method:'POST',headers:{Cookie:loginR.cookie,'X-CSRF-Token':loginR.csrf,'Content-Type':'application/json'},body:JSON.stringify({title:'x'.repeat(1024*1024+1)})});assert.equal(oversized.status,413);
}));

test('limitação de tentativas de login retorna erro genérico e bloqueia excesso',()=>fixture(async({send})=>{
  for(let i=0;i<12;i++)assert.equal((await send('/login','POST',{email:'ausente@example.test',password:'senhaerrada'})).status,401);
  assert.equal((await send('/login','POST',{email:'organizador@blindpitch.demo',password:demoPassword})).status,429);
}));
