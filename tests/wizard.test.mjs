import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { openDb } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';
import { scientificFields, scientificLimits, optionalScientificFields } from '../server/validation.mjs';
import { pngAlphaStats } from '../scripts/png-alpha.mjs';

function templates() {
  const context=vm.createContext({document:{querySelector:()=>null},sessionStorage:{getItem:()=>''},window:{addEventListener(){}}});
  const source=readFileSync('public/app.js','utf8').replace('export {};','').replace(/boot\(\);\s*$/u,'');
  vm.runInContext(source+'\nglobalThis.ui={projectForm,scienceOwls,areaSymbol,projectCards,publicHome,authPage,empty,welcome};',context);return context.ui;
}

test('assistente mantém o contrato científico: 18 campos, limites, opcionais e área livre; revisão é a última etapa',()=>{
  const ui=templates(),title='Título <img src=x onerror="alert(1)">';
  const html=ui.projectForm({id:'rascunho-existente',title,scientific_area:'Área personalizada',methodology:'Texto já salvo.'});
  const steps=[...html.matchAll(/data-wizard-step="(\d+)"/gu)];assert.equal(steps.length,scientificFields.length+1);
  assert.equal((html.match(/data-wizard-step="\d+" hidden/gu)||[]).length,scientificFields.length);
  assert.ok(html.includes(`max="${steps.length}"`));assert.ok(html.includes('data-id="rascunho-existente"'));assert.ok(html.includes('Revise seu projeto'));assert.ok(html.includes('Salvar alterações'));
  assert.ok(ui.projectForm().includes('Cadastrar projeto'));assert.equal(html.includes('<img src=x'),false);assert.ok(html.includes('&lt;img'));
  for(const key of scientificFields){
    const controls=[...html.matchAll(new RegExp(`<(?:input|textarea) name="${key}"[^>]*>`,'gu'))];assert.equal(controls.length,1,key);
    assert.ok(controls[0][0].includes(`maxlength="${scientificLimits[key]}"`),key);
    assert.equal(controls[0][0].includes('required'),['title','scientific_area'].includes(key),key);
    if(optionalScientificFields.includes(key))assert.equal(controls[0][0].includes('minlength'),false,key);
  }
  assert.equal((html.match(/data-select-area=/gu)||[]).length,11);
  assert.equal((html.match(/<option>/gu)||[]).length,7);assert.ok(html.includes('Texto já salvo.'));
});

test('corujas têm alpha real e são entregues como WebP lossless sob a CSP existente, em dois grupos de três',async()=>{
  const html=templates().scienceOwls(),groups=html.split('<div class="owl-group">').slice(1);assert.equal(groups.length,2);
  assert.deepEqual(groups.map(group=>(group.match(/<img /gu)||[]).length),[3,3]);
  assert.ok(groups[0].includes('coruja-quimica.webp'));assert.ok(groups[0].includes('coruja-fisica.webp'));assert.ok(groups[0].includes('coruja-matematica.webp'));
  assert.ok(groups[1].includes('coruja-biologia.webp'));assert.ok(groups[1].includes('coruja-astronomia.webp'));assert.ok(groups[1].includes('coruja-tecnologia.webp'));
  const db=openDb(':memory:'),server=createApp(db);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    for(const [,path] of html.matchAll(/src="([^"]+\.webp)"/gu)){
      const response=await fetch(`http://127.0.0.1:${server.address().port}${path}`);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');
      assert.ok(response.headers.get('content-security-policy').includes("img-src 'self' data:"));
      const content=Buffer.from(await response.arrayBuffer()),alpha=pngAlphaStats(readFileSync('public'+path.replace('.webp','.png')));
      assert.ok(alpha.corners.every(value=>value<=1),path);assert.ok(alpha.transparent>alpha.total*.15,path);assert.ok(alpha.opaque>alpha.total*.2,path);assert.ok(alpha.partial>0,path);
      assert.deepEqual(content,readFileSync('public'+path));
    }
  }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});

test('ícones correspondem à área cadastrada, preservam valores personalizados e o hero contém somente corujas',()=>{
  const ui=templates();
  const expected={Química:'flask',Física:'atom',Matemática:'geometry',Biologia:'microscope',Astronomia:'planet',Tecnologia:'chip',Engenharias:'engineering','Ciências ambientais':'leaf','Ciências da saúde':'health','Ciências agrárias':'sprout','Ciências humanas':'humanities'};
  for(const [area,symbol] of Object.entries(expected)){
    assert.equal(ui.areaSymbol(area),symbol);const html=ui.projectCards([{id:'p',scientific_area:area,title:'Projeto científico',status:'draft'}]);assert.ok(html.includes(`data-area-symbol="${symbol}"`));assert.ok(html.includes(area));
  }
  assert.equal(ui.areaSymbol('Área interdisciplinar personalizada'),'file');assert.ok(ui.projectForm({scientific_area:'Área interdisciplinar personalizada'}).includes('value="Área interdisciplinar personalizada"'));
  const hero=ui.publicHome().split('<div class="hero-visual science-hero">')[1].split('</section>')[0];
  assert.equal((hero.match(/<img /gu)||[]).length,6);assert.equal(/<button|<figcaption|<p>|<h2|idea-card|owl-caption/u.test(hero),false);
  for(const html of [ui.authPage(false),ui.authPage(true),ui.empty('Vazio'),ui.welcome()]){assert.equal(/Íris|ÍRIS|\/assets\/mascot|\.svg"[^>]*class="mascot/u.test(html),false);assert.ok(html.includes('/assets/science-owls/transparent/'));}
  const css=readFileSync('public/styles.css','utf8');assert.equal(/mix-blend-mode|mask-image/u.test(css),false);
});
