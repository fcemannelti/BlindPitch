import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { seed, demoPassword } from '../server/seed.mjs';
import { createApp } from '../server/app.mjs';
import { scientificFields } from '../server/validation.mjs';

let db,server,base;
before(async()=>{db=openDb(':memory:');await seed(db);server=createApp(db);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
async function client(email,password=demoPassword) {
  const auth=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  assert.equal(auth.status,200);const {csrf}=await auth.json(),cookie=auth.headers.get('set-cookie').split(';')[0];
  return async(path,method='GET',body,extra={})=>{
    const response=await fetch(base+'/api'+path,{method,headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json',...extra},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const data=await response.json();return {status:response.status,data,headers:response.headers};
  };
}
const content=title=>({title,scientific_area:'Engenharias',problem:'Equipamentos permanecem ligados sem necessidade.',objective:'Medir a redução do consumo com sensores acessíveis.',methodology:'Comparar medições do protótipo e do grupo de controle.',proposed_solution:'Desligamento com sensores de presença e microcontrolador.',expected_impact:'Pode contribuir para reduzir o consumo; será investigado.',keywords:'energia, sensores, ciência'});

test('autenticação, validação, papéis e CSRF são aplicados no servidor',async()=>{
  assert.equal((await fetch(base+'/api/projects')).status,401);
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'naoexiste@example.test',password:'senha-incorreta'})});assert.equal(login.status,401);
  const p=await client('participante1@blindpitch.demo');
  for(const route of ['/metrics','/audit','/users','/export'])assert.equal((await p(route)).status,403,route);
  assert.equal((await p('/projects','POST',content('Teste CSRF'),{'X-CSRF-Token':''})).status,403);
  assert.equal((await p('/projects','POST',content('Origem externa'),{Origin:'https://evil.test'})).status,403);
  assert.equal((await p('/projects','POST',{...content('Escalada de privilégio'),role:'organizer'})).status,400);
  const o=await client('organizador@blindpitch.demo');assert.equal((await o('/projects','POST',content('Papel errado'))).status,403);
});

test('fluxo completo: cadastro, rascunho, envio, anonimização, notas, resultados e autoria',async()=>{
  const registration={name:'Autora Confidencial',email:'autora-secreta@example.test',password:'SenhaSegura2026!',school_or_class:'Colégio Identificador 2B',consent:true};
  let response=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(registration)});assert.equal(response.status,200);
  response=await fetch(base+'/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...registration,email:'role@example.test',role:'organizer'})});assert.equal(response.status,400);
  const p=await client(registration.email,registration.password),other=await client('participante2@blindpitch.demo'),o=await client('organizador@blindpitch.demo');
  const draft=await p('/projects','POST',content('Sensores para reduzir consumo'));assert.equal(draft.status,200);const projectId=draft.data.id;
  assert.equal((await other(`/projects/${projectId}`)).status,404);
  assert.equal((await other(`/projects/${projectId}`,'PUT',content('Outra pessoa'))).status,404);
  assert.equal((await p(`/projects/${projectId}`,'PUT',{...content('Sensores para reduzir consumo'),problem:''})).status,200);
  assert.equal((await p(`/projects/${projectId}/submit`,'POST',{})).status,400);
  const proposal={...content('Sensores para reduzir consumo'),methodology:'Autora Confidencial, Colégio Identificador 2B, autora-secreta@example.test, https://pessoal.test, (85) 99999-1234. Comparar grupos.'};
  assert.equal((await p(`/projects/${projectId}`,'PUT',proposal)).status,200);
  const submitted=await p(`/projects/${projectId}/submit`,'POST',{});assert.equal(submitted.status,200);assert.match(submitted.data.anonymous_code,/^BP-2026-\d{4}$/u);
  const code=submitted.data.anonymous_code;
  assert.equal((await p(`/projects/${projectId}`,'PUT',content('Bloqueado'))).status,409);
  assert.equal((await p(`/projects/${projectId}/submit`,'POST',{})).status,409);
  assert.equal((await p(`/projects/${projectId}/results`)).status,403);
  const users=(await o('/users')).data,r1id=users.find(u=>u.email==='avaliador1@blindpitch.demo').id,r2id=users.find(u=>u.email==='avaliador2@blindpitch.demo').id;
  assert.equal((await o('/assignments','POST',{project_id:projectId,reviewer_user_id:r1id,review_mode:'anonymous'})).status,409);
  assert.equal((await o(`/projects/${projectId}/anonymize`,'POST',{content:proposal,approved:true})).status,200);
  const assigned=await o('/assignments','POST',{project_id:projectId,reviewer_user_id:r1id,review_mode:'anonymous'});assert.equal(assigned.status,200);const assignmentId=assigned.data.id;
  assert.equal((await o('/assignments','POST',{project_id:projectId,reviewer_user_id:r1id,review_mode:'identified'})).status,409);
  assert.equal((await o('/rubric','PUT',{criteria:[]})).status,409);
  assert.equal((await o('/event','PUT',{reveal_identity:true})).status,409);
  assert.equal((await o(`/projects/${projectId}`)).data.author,undefined);
  const reviewer=await client('avaliador1@blindpitch.demo'),r2=await client('avaliador2@blindpitch.demo');
  assert.equal((await r2(`/assignments/${assignmentId}`)).status,404);
  const detail=await reviewer(`/assignments/${assignmentId}`);assert.equal(detail.status,200);
  assert.deepEqual(Object.keys(detail.data.project).sort(),[...scientificFields,'anonymous_code'].sort());
  const raw=JSON.stringify(detail.data);
  for(const secret of [registration.name,registration.email,registration.school_or_class,'autora-secreta','pessoal.test','99999-1234','participant_user_id','project_authors','school_or_class','password_hash'])assert.equal(raw.includes(secret),false,secret);
  assert.equal(detail.data.project.anonymous_code,code);
  for(const route of ['/projects',`/projects/${projectId}`,`/projects/${projectId}/results`,'/users','/audit','/metrics','/export'])assert.equal((await reviewer(route)).status,403,route);
  assert.equal((await reviewer(`/assignments/${assignmentId}/start`,'POST',{})).status,200);
  const started=(await reviewer(`/assignments/${assignmentId}`)).data.review.started_at;
  await reviewer(`/assignments/${assignmentId}/start`,'POST',{});assert.equal((await reviewer(`/assignments/${assignmentId}`)).data.review.started_at,started);
  const criteria=(await reviewer('/rubric')).data,scores=criteria.map(c=>({criterion_id:c.id,score:8,comment:'Método claro.'}));
  assert.equal((await reviewer(`/assignments/${assignmentId}/review`,'PUT',{scores:[{...scores[0],score:11}],general_comment:'',finalize:false})).status,400);
  assert.equal((await reviewer(`/assignments/${assignmentId}/review`,'PUT',{scores:[scores[0],scores[0]],general_comment:'',finalize:false})).status,400);
  assert.equal((await reviewer(`/assignments/${assignmentId}/review`,'PUT',{scores:scores.slice(0,1),general_comment:'',finalize:true})).status,400);
  const saved=await reviewer(`/assignments/${assignmentId}/review`,'PUT',{scores:scores.slice(0,3),general_comment:'Rascunho',finalize:false});assert.equal(saved.status,200);
  assert.equal((await reviewer(`/assignments/${assignmentId}`)).data.review.scores.length,3);
  const finished=await reviewer(`/assignments/${assignmentId}/review`,'PUT',{scores,general_comment:'Boa proposta.',finalize:true});assert.equal(finished.status,200);assert.equal(finished.data.review.total_score,48);assert.equal(finished.data.review.normalized_score,80);
  assert.equal((await reviewer(`/assignments/${assignmentId}/review`,'PUT',{scores,general_comment:'Duplicado',finalize:true})).status,409);
  assert.equal((await p(`/projects/${projectId}`)).data.status,'reviewed');
  const identified=await o('/assignments','POST',{project_id:projectId,reviewer_user_id:r2id,review_mode:'identified'});assert.equal(identified.status,200);
  const r2detail=(await r2(`/assignments/${identified.data.id}`)).data;assert.equal(r2detail.author.name,registration.name);assert.equal(r2detail.author.email,undefined);
  await r2(`/assignments/${identified.data.id}/start`,'POST',{});
  assert.equal((await r2(`/assignments/${identified.data.id}/review`,'PUT',{scores:criteria.map(c=>({criterion_id:c.id,score:9,comment:''})),general_comment:'Identificada',finalize:true})).status,200);
  const metrics=(await o('/metrics')).data;assert.equal(metrics.completed,4);assert.ok(metrics.mean>0);assert.ok(metrics.anonymous.mean>0);assert.ok(metrics.identified.mean>0);assert.equal(metrics.pending,2);assert.ok(metrics.demo_notice.includes('ilustrativos'));
  // Concluir também as duas atribuições seed pendentes antes da liberação.
  for(const assignment of (await reviewer('/assignments')).data.filter(a=>a.status!=='completed')) {
    await reviewer(`/assignments/${assignment.id}/start`,'POST',{});
    assert.equal((await reviewer(`/assignments/${assignment.id}/review`,'PUT',{scores,general_comment:'Finalizado',finalize:true})).status,200);
  }
  assert.equal((await o('/event','PUT',{submissions_open:false,reviews_open:false,results_released:true,reveal_identity:true,comments_released:true})).status,200);
  const results=await p(`/projects/${projectId}/results`);assert.equal(results.status,200);assert.equal(results.data.mean,85);assert.equal(results.data.reviews.length,2);assert.equal(results.data.reviews[0].general_comment,'Boa proposta.');
  assert.equal((await p(`/projects/${projectId}`)).data.status,'results_available');
  assert.equal((await o(`/projects/${projectId}`)).data.author.name,registration.name);
  const stillAnonymous=(await reviewer(`/assignments/${assignmentId}`)).data;assert.equal(stillAnonymous.author,undefined);assert.equal(JSON.stringify(stillAnonymous).includes(registration.name),false);
  const csv=(await o('/export')).data.csv;assert.ok(csv.includes('anonymous'));assert.ok(csv.includes('ilustrativos'));assert.equal(csv.includes(registration.name),false);assert.equal(csv.includes(code),false);
  assert.ok((await o('/audit')).data.some(l=>l.action==='anonymization.approved'));
  assert.equal((await reviewer('/logout','POST',{})).status,200);assert.equal((await reviewer('/session')).status,401);
});

test('nova edição, pesos, códigos persistentes, consentimento e limites de estados',async()=>{
  const o=await client('organizador@blindpitch.demo'),p=await client('participante3@blindpitch.demo');
  const users=(await o('/users')).data,rid=users.find(u=>u.role==='reviewer').id;
  const newEvent=await o('/events','POST',{name:'Edição de teste sem demonstração',year:2026});assert.equal(newEvent.status,200);
  const eventId=newEvent.data.id;const at=(path)=>`${path}?event_id=${eventId}`;
  assert.equal((await o(at('/rubric'),'PUT',{criteria:[{name:'Método',description:'Verificar metodologia',min_score:2,max_score:10,weight:2},{name:'Impacto',description:'Contribuição esperada',min_score:0,max_score:5,weight:1}]})).status,200);
  let created=await p(at('/projects'),'POST',content('Projeto com pesos'));const pid=created.data.id;
  const submitted=await p(at(`/projects/${pid}/submit`),'POST',{});assert.equal(submitted.status,200);
  const originalCode=submitted.data.anonymous_code;
  assert.equal((await o(at(`/projects/${pid}/reopen`),'POST',{})).status,200);
  assert.equal((await p(at(`/projects/${pid}/submit`),'POST',{})).data.anonymous_code,originalCode);
  assert.equal((await o(at(`/projects/${pid}/anonymize`),'POST',{content:content('Projeto com pesos'),approved:true})).status,200);
  assert.equal((await o(at('/assignments'),'POST',{project_id:pid,reviewer_user_id:rid,review_mode:'identified'})).status,409);
  const a=await o(at('/assignments'),'POST',{project_id:pid,reviewer_user_id:rid,review_mode:'anonymous'});assert.equal(a.status,200);
  assert.equal((await o(at(`/projects/${pid}/reopen`),'POST',{})).status,409);
  const r=await client(users.find(u=>u.id===rid).email);const rubric=(await r(at('/rubric'))).data;
  await r(at(`/assignments/${a.data.id}/start`),'POST',{});
  const scores=rubric.map((c,index)=>({criterion_id:c.id,score:index===0?6:2.5,comment:''}));
  const final=await r(at(`/assignments/${a.data.id}/review`),'PUT',{scores,general_comment:'',finalize:true});assert.equal(final.status,200);assert.equal(final.data.review.total_score,14.5);assert.equal(final.data.review.normalized_score,50);
  assert.equal((await o(at('/metrics'))).data.demo_notice,null);
  const reviewerAdded=await o('/reviewers','POST',{name:'Nova Avaliadora',email:'nova@example.test',password:'SenhaLonga2026!',consent:false,school_or_class:''});assert.equal(reviewerAdded.status,200);
  assert.equal((await o(`/reviewers/${reviewerAdded.data.id}`,'PUT',{active:false})).status,200);
  assert.equal((await db.prepare('SELECT COUNT(*) n,COUNT(DISTINCT anonymous_code) distinct_n FROM projects WHERE anonymous_code IS NOT NULL').get()).n,(await db.prepare('SELECT COUNT(DISTINCT anonymous_code) n FROM projects WHERE anonymous_code IS NOT NULL').get()).n);
});

test('recursos públicos, cabeçalhos e proteção de arquivos',async()=>{
  const response=await fetch(base+'/');assert.equal(response.status,200);assert.ok(response.headers.get('content-security-policy').includes("script-src 'self'"));assert.ok((await response.text()).includes('pt-BR'));
  assert.equal((await fetch(base+'/server/app.mjs')).status,404);
  assert.equal((await fetch(base+'/db/schema.sql')).status,404);
  const publicData=await (await fetch(base+'/api/public')).json();assert.equal(JSON.stringify(publicData).includes('email'),false);
});
