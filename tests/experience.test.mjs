import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { openDb } from '../server/db.mjs';
import { createApp } from '../server/app.mjs';

const themeSource=readFileSync('public/theme.js','utf8');
function themeFixture({saved=null,dark=false,blocked=false}={}) {
  let stored=saved;
  const events={},systemEvents={},buttonAttributes={},tooltip={textContent:''};
  const root={dataset:{}},meta={content:''};
  class Element {closest(){return button;}}
  const button=new Element();button.setAttribute=(key,value)=>buttonAttributes[key]=value;button.querySelector=()=>tooltip;
  const system={matches:dark,addEventListener:(key,fn)=>systemEvents[key]=fn};
  const context=vm.createContext({Element,
    localStorage:{getItem:()=>{if(blocked)throw new Error('blocked');return stored;},setItem:(key,value)=>{assert.equal(key,'bp_theme');if(blocked)throw new Error('blocked');stored=value;}},
    document:{documentElement:root,querySelector:()=>({setAttribute:(key,value)=>meta[key]=value}),querySelectorAll:()=>[button],addEventListener:(key,fn)=>events[key]=fn},
    window:{matchMedia:()=>system,addEventListener:(key,fn)=>events[key]=fn}
  });
  vm.runInContext(themeSource,context);
  return {root,buttonAttributes,meta,tooltip,click:()=>events.click({target:button}),stored:()=>stored,
    system:dark=>{system.matches=dark;systemEvents.change({matches:dark});},storage:value=>events.storage({key:'bp_theme',newValue:value})};
}

test('tema segue o sistema na primeira visita, persiste escolha manual e atualiza controle acessível',()=>{
  const f=themeFixture({dark:true});assert.equal(f.root.dataset.theme,'dark');assert.equal(f.buttonAttributes['aria-label'],'Ativar modo claro');assert.equal(f.meta.content,'#090f1e');
  f.click();assert.equal(f.root.dataset.theme,'light');assert.equal(f.stored(),'light');assert.equal(f.buttonAttributes['aria-pressed'],'false');assert.equal(f.tooltip.textContent,'Ativar modo escuro');
  f.system(true);assert.equal(f.root.dataset.theme,'light');
  const reloaded=themeFixture({saved:f.stored(),dark:true});assert.equal(reloaded.root.dataset.theme,'light');
  f.storage('dark');assert.equal(f.root.dataset.theme,'dark');f.storage(null);f.system(false);assert.equal(f.root.dataset.theme,'light');
});

test('tema resiste a storage bloqueado e valores inválidos; script carrega antes do CSS e respeita CSP',()=>{
  const blocked=themeFixture({blocked:true,dark:true});blocked.click();assert.equal(blocked.root.dataset.theme,'light');blocked.system(true);assert.equal(blocked.root.dataset.theme,'light');
  const invalid=themeFixture({saved:'unexpected',dark:false});assert.equal(invalid.root.dataset.theme,'light');invalid.system(true);assert.equal(invalid.root.dataset.theme,'dark');
  const html=readFileSync('public/index.html','utf8');assert.ok(html.indexOf('src="/theme.js"')<html.indexOf('href="/styles.css"'));assert.equal(/<script[^>]*>[^<]+<\/script>/u.test(html),false);
});

function classes(){const values=new Set();return {add:(...names)=>names.forEach(n=>values.add(n)),remove:(...names)=>names.forEach(n=>values.delete(n)),toggle:(n,on)=>on?values.add(n):values.delete(n),contains:n=>values.has(n)};}
function experienceFixture() {
  const nodes={},steps=Array.from({length:3},()=>({classList:classes()}));
  const listeners={},buttonListeners={};let dialog;
  const button={disabled:true,innerHTML:'',focus(){this.focused=true;},addEventListener:(key,fn)=>buttonListeners[key]=fn};
  class HTMLElement {}
  const document={activeElement:null,querySelector:()=>null,querySelectorAll:()=>[],body:{append:()=>{}},createElement:()=>{
    dialog={innerHTML:'',classList:classes(),open:false,removed:false,setAttribute(){},showModal(){this.open=true;},remove(){this.removed=true;},
      close(){this.open=false;listeners.close?.();},addEventListener:(key,fn)=>listeners[key]=fn,removeEventListener:key=>delete listeners[key],
      querySelector:selector=>selector==='button'?button:(nodes[selector]||=(selector==='.identity-labels'?{remove(){}}:{textContent:'',hidden:true})),querySelectorAll:()=>steps};return dialog;
  }};
  const context=vm.createContext({document,HTMLElement,window:{matchMedia:()=>({matches:true}),addEventListener(){}},sessionStorage:{getItem:()=>''},location:{hash:''},setTimeout,clearTimeout,cancelAnimationFrame(){},requestAnimationFrame(){throw new Error('Movimento reduzido não deve animar contadores.');}});
  const source=readFileSync('public/app.js','utf8').replace('export {};','').replace(/boot\(\);\s*$/u,'');
  vm.runInContext(source+'\nglobalThis.experience={operationFlow,animatePage};',context);
  return {ui:context.experience,nodes,steps,dialog:()=>dialog,button,continue:()=>buttonListeners.click()};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('envio só confirma sucesso e revela o código real após resposta da API; foco e fechamento funcionam',async()=>{
  const f=experienceFixture();let confirm;
  const pending=new Promise(resolve=>confirm=resolve);
  const flow=f.ui.operationFlow('proposal',()=>pending);
  assert.equal(f.dialog().open,true);assert.equal(f.button.disabled,true);assert.equal(f.dialog().classList.contains('operation-success'),false);assert.equal(f.nodes['.operation-code'],undefined);
  assert.ok(f.dialog().innerHTML.includes('Aguardando confirmação do servidor'));
  assert.equal(f.dialog().innerHTML.includes('school_or_class'),false);assert.equal(f.dialog().innerHTML.includes('participant_user_id'),false);
  confirm({anonymous_code:'BP-2026-0427',message:'Enviado'});await tick();
  assert.equal(f.nodes['.operation-code'].textContent,'BP-2026-0427');assert.equal(f.nodes['.operation-code'].hidden,false);
  assert.equal(f.dialog().classList.contains('operation-success'),true);assert.equal(f.button.disabled,false);assert.equal(f.button.focused,true);
  f.continue();assert.equal((await flow).anonymous_code,'BP-2026-0427');assert.equal(f.dialog().removed,true);
});

test('erro da API não anuncia sucesso nem cria código; diálogo é removido sem alterar dados',async()=>{
  const f=experienceFixture();await assert.rejects(f.ui.operationFlow('proposal',async()=>{throw new Error('Submissões encerradas');}),/Submissões encerradas/u);
  assert.equal(f.dialog().classList.contains('operation-success'),false);assert.equal(f.dialog().removed,true);assert.equal(f.nodes['.operation-code'],undefined);
});

test('anonimização e avaliação concluída usam retorno real; movimento reduzido não dispara contadores',async()=>{
  for(const kind of ['anonymize','review']) {
    const f=experienceFixture();const flow=f.ui.operationFlow(kind,async()=>({message:'Registrado'}));await tick();
    assert.equal(f.dialog().classList.contains('operation-success'),true);assert.ok(f.nodes['#operation-detail'].textContent.includes(kind==='review'?'Avaliação concluída':'Versão científica aprovada'));
    assert.equal(f.nodes['.operation-code'],undefined);f.continue();await flow;f.ui.animatePage();
  }
});


test('ações preservam o botão original após confirmação assíncrona e bloqueiam envios duplicados',async()=>{
  for(const attribute of ['submit-project','reopen','archive']) {
    let click;const requests=[],errors=[];
    const button={dataset:{submitProject:'proposta-1',reopen:'proposta-1',archive:'proposta-1'},disabled:false,innerHTML:'Ação',setAttribute(){},removeAttribute(){},addEventListener:(key,fn)=>{if(key==='click')click=fn;}};
    const selector='[data-'+attribute+']';
    const context=vm.createContext({document:{querySelector:s=>s===selector?button:null,querySelectorAll:()=>[]},sessionStorage:{getItem:()=>''},window:{addEventListener(){}},location:{hash:''},setTimeout,
      fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({message:'Registrado'})};}});
    const source=readFileSync('public/app.js','utf8').replace('export {};','').replace(/boot\(\);\s*$/u,'');
    vm.runInContext(source+'\nconfirmAction=async()=>true;operationFlow=async(kind,request)=>request();render=async()=>{};notify=(text,error)=>{if(error)globalThis.errors.push(text);};bind("/projects/proposta-1");',Object.assign(context,{errors}));
    const event={currentTarget:button};const action=click(event);event.currentTarget=null;await action;
    assert.equal(errors.length,0);assert.equal(requests.length,1);assert.ok(requests[0].url.includes('/projects/proposta-1/'+(attribute==='submit-project'?'submit':attribute)));
    assert.equal(requests[0].options.method,'POST');assert.equal(button.disabled,false);assert.equal(button.innerHTML,'Ação');
    button.disabled=true;await click({currentTarget:button});assert.equal(requests.length,1);
  }
});


test('paletas mantêm contraste AA nos textos, botões e feedbacks principais',()=>{
  const css=readFileSync('public/styles.css','utf8');
  const sections=[css.match(/:root\s*\{([^}]+)\}/u)[1],css.match(/\[data-theme="dark"\]\s*\{([^}]+)\}/u)[1]];
  const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
  for(const section of sections) {
    const colors=Object.fromEntries([...section.matchAll(/(--[\w-]+):\s*(#[a-f0-9]{6})\b/gu)].map(m=>[m[1],m[2]]));
    for(const [foreground,background] of [['text','surface'],['text-secondary','surface-alt'],['text-muted','surface-alt'],['primary','surface'],['secondary','secondary-soft'],['on-primary','primary'],['success','success-soft'],['warning','warning-soft'],['danger','danger-soft']]) {
      const a=luminance(colors['--'+foreground]),b=luminance(colors['--'+background]);
      assert.ok((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)>=4.5,foreground+' sobre '+background);
    }
  }
});

test('servidor entrega tema e coruja científica transparentes com os tipos corretos e CSP restrita',async()=>{
  const db=openDb(':memory:'),server=createApp(db);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try {
    assert.equal((await fetch(base+'/assets/mascot/blindpitch-owl.svg')).status,404);
    for(const [file,type] of [['/theme.js','text/javascript'],['/assets/science-owls/transparent/coruja-quimica.png','image/png'],['/styles.css','text/css']]) {
      const response=await fetch(base+file);assert.equal(response.status,200);assert.ok(response.headers.get('content-type').startsWith(type));assert.ok(response.headers.get('content-security-policy').includes("script-src 'self'"));
      const body=Buffer.from(await response.arrayBuffer());assert.ok(body.length>100);
      if(file.endsWith('.png'))assert.equal(body.subarray(1,4).toString(),'PNG');
    }
  }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
