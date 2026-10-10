import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.mjs';
import { seed, demoPassword, enrichLegacyDemo } from '../server/seed.mjs';
import { createApp } from '../server/app.mjs';
import { demoProposals } from '../server/demo-proposals.mjs';
import { scientificContent, scientificFields, requiredScientificFields, optionalScientificFields, scientificLimits } from '../server/validation.mjs';

test('campos complementares são opcionais e limites científicos aceitam textos extensos',()=>{
  const core=Object.fromEntries(requiredScientificFields.map(key=>[key,demoProposals[0][key]]));
  const minimal=scientificContent(core,true);
  for(const key of optionalScientificFields)assert.equal(minimal[key],'');
  for(const key of scientificFields) {
    assert.equal(scientificContent({...core,[key]:'á'.repeat(scientificLimits[key])},true)[key].length,scientificLimits[key]);
    assert.throws(()=>scientificContent({...core,[key]:'á'.repeat(scientificLimits[key]+1)},true),/caracteres/u);
  }
  assert.throws(()=>scientificContent({...core,methodology:''},true),/caracteres/u);
  assert.equal(scientificContent({title:'Rascunho',scientific_area:'Engenharias'}).methodology,'');
});

test('seis propostas têm planos próprios, campos completos e resultados explicitamente fictícios',async()=>{
  const db=openDb(':memory:');
  try {
    await seed(db);const rows=await db.prepare('SELECT * FROM projects').all();assert.equal(rows.length,6);
    assert.equal(new Set(rows.map(p=>p.methodology)).size,6);
    for(const p of rows) {
      assert.ok(p.methodology.length>1400,p.title);
      assert.ok(scientificFields.reduce((sum,key)=>sum+p[key].length,0)>4000,p.title);
      for(const key of scientificFields)assert.ok(p[key].trim().length>0,`${p.title}: ${key}`);
      assert.match(p.obtained_results,/fictício/u);assert.match(p.obtained_results,/Não foram realizados/u);
      if(p.sanitized_content){const clean=JSON.parse(p.sanitized_content);assert.equal(clean.methodology,p.methodology);assert.equal(clean.references.includes('https://'),false);}
    }
  } finally {db.close();}
});

test('migração aditiva e enriquecimento preservam edições, códigos, autoria e avaliações',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'blindpitch-migration-')),path=join(dir,'legacy.sqlite');
  const legacy={problem:'O uso pouco eficiente dos recursos afeta a comunidade e exige investigação científica.',objective:'Investigar uma alternativa acessível e medir seus efeitos em condições controladas.',methodology:'Construir um protótipo, definir um grupo de comparação e registrar medições durante quatro semanas.',proposed_solution:'Aplicar materiais acessíveis e sensores para acompanhar o processo e orientar decisões.',expected_impact:'Pode contribuir para o uso responsável de recursos. Os efeitos serão analisados experimentalmente.',keywords:'sustentabilidade, sensores, experimentação'};
  let db;
  try {
    db=openDb(path);await seed(db);
    const rows=await db.prepare('SELECT * FROM projects ORDER BY title').all();
    for(const row of rows) {
      const content={title:row.title,scientific_area:row.scientific_area,...legacy};
      await db.prepare(`UPDATE projects SET ${Object.keys(legacy).map(key=>`${key}=?`).join(',')},sanitized_content=? WHERE id=?`).run(...Object.values(legacy),row.sanitized_content?JSON.stringify(content):null,row.id);
    }
    // Simula uma base anterior aos campos complementares.
    for(const key of optionalScientificFields)db.exec(`ALTER TABLE projects DROP COLUMN "${key}";`);
    db.exec('DELETE FROM schema_migrations WHERE version=3;');
    await db.prepare('UPDATE projects SET objective=? WHERE id=?').run('Texto revisado pelo participante: preservar.',rows[0].id);
    const revised={title:rows[1].title,scientific_area:rows[1].scientific_area,...legacy,problem:'Versão anônima revisada pelo organizador.'};
    await db.prepare('UPDATE projects SET sanitized_content=? WHERE id=?').run(JSON.stringify(revised),rows[1].id);
    const snapshot=async()=>JSON.stringify({projects:await db.prepare('SELECT id,event_id,anonymous_code,status,anonymization_approved FROM projects ORDER BY id').all(),authors:await db.prepare('SELECT * FROM project_authors ORDER BY project_id').all(),reviews:await db.prepare('SELECT * FROM reviews ORDER BY id').all(),scores:await db.prepare('SELECT * FROM review_scores ORDER BY review_id,criterion_id').all(),assignments:await db.prepare('SELECT * FROM assignments ORDER BY id').all()});
    const before=await snapshot();db.close();db=openDb(path);
    for(const key of optionalScientificFields)assert.equal((await db.prepare(`SELECT "${key}" value FROM projects LIMIT 1`).get()).value,'');
    assert.equal(await enrichLegacyDemo(db),4);assert.equal(await snapshot(),before);
    assert.equal((await db.prepare('SELECT objective FROM projects WHERE id=?').get(rows[0].id)).objective,'Texto revisado pelo participante: preservar.');
    assert.equal(JSON.parse((await db.prepare('SELECT sanitized_content FROM projects WHERE id=?').get(rows[1].id)).sanitized_content).problem,revised.problem);
    assert.equal(await enrichLegacyDemo(db),0);assert.equal(await seed(db),false);
    // Mesmo texto legado em edição real nunca é enriquecido.
    await db.prepare('UPDATE events SET demo=0').run();
    await db.prepare('UPDATE projects SET objective=? WHERE id=?').run(legacy.objective,rows[0].id);
    assert.equal(await enrichLegacyDemo(db),0);
  } finally {db?.close();rmSync(dir,{recursive:true,force:true});}
});

test('API persiste todos os campos longos e mantém compatibilidade com propostas de oito campos',async()=>{
  const db=openDb(':memory:');await seed(db);const server=createApp(db);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}/api`;
  try {
    const login=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'participante1@blindpitch.demo',password:demoPassword})});
    const session=await login.json(),headers={'Content-Type':'application/json',Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrf};
    const send=async(path,method,body)=>{const response=await fetch(base+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.ok(response.ok,JSON.stringify(data));return data;};
    const extended=Object.fromEntries(scientificFields.map(key=>[key,'á'.repeat(scientificLimits[key])]));
    assert.ok(Buffer.byteLength(JSON.stringify(extended))>128*1024);
    const created=await send('/projects','POST',extended);
    const stored=await send(`/projects/${created.id}`,'GET');
    for(const key of scientificFields)assert.equal(stored[key],extended[key]);
    const core=Object.fromEntries(requiredScientificFields.map(key=>[key,demoProposals[0][key]]));
    await send(`/projects/${created.id}`,'PUT',core);
    const updated=await send(`/projects/${created.id}`,'GET');
    for(const key of optionalScientificFields)assert.equal(updated[key],'');
    await send(`/projects/${created.id}/submit`,'POST',{});
  } finally {await new Promise(resolve=>server.close(resolve));db.close();}
});
