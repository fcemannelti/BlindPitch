// Interface nativa sem dependências externas; todos os dados e permissões vêm da API.
export {};
/** @template {Element} [T=HTMLElement] @param {string} selector @param {Document|Element} root @returns {T} */
const $ = (selector, root = document) => /** @type {T} */ (root.querySelector(selector));
const app = $('#app');
function storedEvent(value) {
  try {
    if(value===undefined)return sessionStorage.getItem('bp_event')||'';
    if(value)sessionStorage.setItem('bp_event',value);else sessionStorage.removeItem('bp_event');
  } catch { /* A navegação continua em memória quando o armazenamento é bloqueado. */ }
  return value||'';
}
const state = { user:null, csrf:'', event:null, events:[], eventId:storedEvent(), publicInfo:null };
const statusNames = {draft:'Rascunho',submitted:'Enviado',assigned:'Atribuído',under_review:'Em avaliação',reviewed:'Avaliado',results_available:'Resultado disponível',archived:'Arquivado',pending:'Pendente',in_progress:'Em andamento',completed:'Concluída'};
const roleNames = {participant:'Participante',reviewer:'Avaliador',organizer:'Organizador'};
const fields = {title:'Título',scientific_area:'Área científica',abstract:'Resumo',problem:'Problema',justification:'Justificativa',objective:'Objetivo geral',specific_objectives:'Objetivos específicos',hypothesis:'Hipótese',methodology:'Metodologia detalhada',proposed_solution:'Solução proposta',materials:'Tecnologias e materiais utilizados',expected_impact:'Impacto esperado',social_relevance:'Relevância social',sustainability:'Sustentabilidade',expected_results:'Resultados esperados',obtained_results:'Resultados obtidos',keywords:'Palavras-chave',references:'Referências'};
const coreFields = ['title','scientific_area','problem','objective','methodology','proposed_solution','expected_impact','keywords'];
const fieldLimits = Object.fromEntries(Object.keys(fields).map(key=>[key,key==='methodology'?20000:key==='abstract'?4000:key==='keywords'?600:['title','scientific_area'].includes(key)?300:12000]));
const fieldHelp = {
  problem:'Qual pergunta ou dificuldade será investigada? Delimite o contexto e o que ainda precisa ser compreendido.',
  objective:'Descreva o que a pesquisa pretende investigar ou desenvolver.',
  methodology:'Explique etapas, amostra, variáveis, comparação, instrumentos, análise dos dados, cronograma e limitações.',
  proposed_solution:'Apresente como a solução funciona e como será testada.',
  expected_impact:'Indique possíveis contribuições, sem antecipar conclusões que dependem de testes.',
  keywords:'Separe os termos por vírgulas.',
  abstract:'Sintetize a pergunta, o objetivo, o método e a contribuição prevista.',
  justification:'Explique por que investigar este problema e como ele se relaciona ao contexto escolhido.',
  specific_objectives:'Liste etapas ou metas verificáveis que contribuem para o objetivo geral.',
  hypothesis:'Quando aplicável, formule uma suposição que os dados possam apoiar ou contrariar.',
  materials:'Liste equipamentos, softwares, insumos e recursos necessários.',
  social_relevance:'Quem pode se beneficiar? Descreva acessibilidade e cuidados éticos.',
  sustainability:'Considere água, energia, resíduos, manutenção e descarte.',
  expected_results:'Descreva o que espera observar, sem apresentar previsões como resultados comprovados.',
  obtained_results:'Preencha somente se houver dados coletados. Identifique explicitamente simulações ou dados fictícios.',
  references:'Informe fontes consultadas. Evite assinaturas, links pessoais e referências que revelem a autoria.'
};
const icons = {
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  file:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  people:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 4 5v3"/>',
  check:'<path d="m5 12 4 4L19 6"/><rect x="3" y="3" width="18" height="18" rx="4"/>',
  chart:'<path d="M4 3v18h18M8 17v-5M13 17V7M18 17v-8"/>',
  shield:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6z"/><path d="m8 12 3 3 5-6"/>',
  settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  logout:'<path d="M9 3H4v18h5M9 12h12m-4-4 4 4-4 4"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5l1.5 1.5M5 19l1.5-1.5M17.5 6.5l1.5-1.5"/>',
  moon:'<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
  flask:'<path d="M9 3h6M10 3v7L5 19a1.3 1.3 0 0 0 1.2 2h11.6a1.3 1.3 0 0 0 1.2-2l-5-9V3M8 15h8"/><circle cx="11" cy="17" r=".6"/>',
  atom:'<circle cx="12" cy="12" r="1.5"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>',
  geometry:'<path d="m7 3 5 8H2z"/><rect x="13" y="3" width="8" height="8" rx="1"/><circle cx="7" cy="18" r="4"/><path d="m17 14 5 7H12z"/>',
  microscope:'<path d="m10 3 4 2-4 9-4-2zM11 5l2-4M5 21h15M10 21v-4M5 16h8M15 9a6 6 0 0 1 1 12"/>',
  planet:'<circle cx="12" cy="12" r="7"/><ellipse cx="12" cy="12" rx="12" ry="3" transform="rotate(-30 12 12)"/>',
  chip:'<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  engineering:'<path d="m14 4 3 3-8 8-3-3zM5 13l-3 3 6 6 3-3M16 2l6 6M3 3l18 18"/>',
  leaf:'<path d="M20 3C8 2 2 8 5 15c3 7 15 5 15-12ZM5 21 17 7M10 14v-4M10 14h5"/>',
  health:'<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 7v10M7 12h10"/>',
  sprout:'<path d="M12 21v-9M12 14C5 14 3 10 3 5c6 0 9 3 9 9ZM12 11c0-6 3-8 9-8 0 5-3 8-9 8"/>',
  humanities:'<circle cx="12" cy="6" r="3"/><path d="M7 14a5 5 0 0 1 10 0M3 14l9 4 9-4v6l-9 3-9-3zM12 18v5"/>'
};
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name]||icons.file}</svg>`;
const esc = value => String(value??'').replace(/[&<>"']/gu, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => value===null||value===undefined?'—':Number(value).toLocaleString('pt-BR',{maximumFractionDigits:1});
const date = value => value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
const badge = status => `<span class="badge ${esc(status)}"><span aria-hidden="true">●</span> ${esc(statusNames[status]||status)}</span>`;
const mode = value => value==='anonymous'?'Anônima':'Identificada';
const scientistOwl = (size='small',area='tecnologia') => `<img class="scientist-owl scientist-owl-${size}" src="/assets/science-owls/transparent/coruja-${area}.webp" width="1254" height="1254" alt="" aria-hidden="true" decoding="async">`;
const owlGroups = [
  [['quimica','Química','realizando um experimento'],['fisica','Física','apresentando um modelo atômico'],['matematica','Matemática','demonstrando geometria']],
  [['biologia','Biologia','examinando uma planta'],['astronomia','Astronomia','observando pelo telescópio'],['tecnologia','Tecnologia','interagindo com um robô']]
];
function scienceOwls() {
  return `<div class="science-owls" role="img" aria-label="Corujas cientistas de Química, Física, Matemática, Biologia, Astronomia e Tecnologia"><div class="owl-stage" aria-hidden="true">${owlGroups.map(group=>`<div class="owl-group">${group.map(([file,label,activity])=>`<img src="/assets/science-owls/transparent/coruja-${file}.webp" data-scientific-area="${label}" width="1254" height="1254" alt="Coruja cientista ${activity}" decoding="async">`).join('')}</div>`).join('')}</div></div>`;
}
const scienceAreas = [
  {name:'Química',symbol:'flask'},{name:'Física',symbol:'atom'},{name:'Matemática',symbol:'geometry'},
  {name:'Biologia',symbol:'microscope'},{name:'Astronomia',symbol:'planet'},{name:'Tecnologia',symbol:'chip'},
  {name:'Engenharias',symbol:'engineering'},{name:'Ciências ambientais',symbol:'leaf'},
  {name:'Ciências da saúde',symbol:'health'},{name:'Ciências agrárias',symbol:'sprout'},{name:'Ciências humanas',symbol:'humanities'}
];
const normalizeArea = value => String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/gu,'').trim().toLocaleLowerCase('pt-BR');
const areaSymbol = value => scienceAreas.find(area=>normalizeArea(area.name)===normalizeArea(value))?.symbol||'file';
const scientificAreaIcon = value => `<span class="scientific-area-icon" data-area-symbol="${areaSymbol(value)}">${icon(areaSymbol(value))}</span>`;
function scientificAreaSelector(value='') {
  return `<fieldset class="scientific-area-selector"><legend class="sr-only">Escolha a área científica</legend><p class="wizard-hint">Escolha a área que melhor representa seu projeto.</p><div class="scientific-area-options" role="group" aria-label="Áreas científicas">${scienceAreas.map(area=>`<button class="scientific-area-option" type="button" data-select-area="${area.name}" aria-pressed="${normalizeArea(value)===normalizeArea(area.name)}">${scientificAreaIcon(area.name)}<span>${area.name}</span>${icon('check')}</button>`).join('')}</div><label>Área científica <small class="field-requirement">Obrigatório no rascunho</small><small>Você também pode informar outra área. O nome já cadastrado será preservado.</small><input name="scientific_area" value="${esc(value)}" required minlength="3" maxlength="${fieldLimits.scientific_area}" autocomplete="off"><small class="field-limit">Até 300 caracteres.</small></label></fieldset>`;
}
const empty = (title,text='Os dados aparecerão aqui quando esta etapa começar.',action='') => `<div class="empty">${scientistOwl('empty','astronomia')}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
const welcome = () => `<div class="welcome-note">${scientistOwl()}<div><strong>Bem-vindo ao BlindPitch.</strong><p>Um olhar atento ao potencial de cada proposta científica.</p></div><span class="welcome-symbol">${icon('shield')}</span></div>`;
function themeToggle() {
  const dark=document.documentElement?.dataset?.theme==='dark',label=dark?'Ativar modo claro':'Ativar modo escuro';
  return `<button type="button" class="theme-toggle" data-theme-toggle aria-pressed="${dark}" aria-label="${label}" title="${label}"><span class="theme-sun">${icon('sun')}</span><span class="theme-moon">${icon('moon')}</span><span class="theme-tooltip" aria-hidden="true">${label}</span></button>`;
}
const heading = (eyebrow,title,text,action='') => `<div class="page-heading"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(text)}</p></div>${action}</div>`;
const demoBanner = () => (state.event?.demo??state.publicInfo?.event?.demo)?'<div class="demo-note">'+icon('shield')+'<span><strong>Dados ilustrativos</strong> — resultados reais ainda serão coletados.</span><span class="demo-pill">DEMONSTRAÇÃO</span></div>':'';
/** @param {string} text @param {boolean|'success'|'error'|'warning'|'info'} kind */
function notify(text,kind='success') {
  const type=kind===true?'error':kind===false?'success':kind;
  const box=document.createElement('div');box.className=`toast ${type}`;
  box.setAttribute('role',type==='error'?'alert':'status');
  box.innerHTML=`<span class="toast-icon">${icon(type==='error'?'close':type==='success'?'check':type==='warning'?'shield':'eye')}</span><div><strong>${{success:'Tudo certo',error:'Não foi possível concluir',warning:'Atenção',info:'Informação'}[type]}</strong><p>${esc(text)}</p></div><button type="button" class="toast-close" aria-label="Fechar notificação">${icon('close')}</button>`;
  const host=$('#notifications');if(!host)return;host.append(box);
  while(host.children.length>4)host.firstElementChild.remove();
  let timer,remaining=type==='error'?10000:7000,started=Date.now(),closing=false,paused=false;
  const dismiss=()=>{if(closing)return;closing=true;clearTimeout(timer);box.classList.add('toast-leaving');setTimeout(()=>box.remove(),180);};
  const pause=()=>{if(paused||closing)return;paused=true;clearTimeout(timer);remaining=Math.max(0,remaining-(Date.now()-started));};
  const resume=()=>{if(closing)return;paused=false;clearTimeout(timer);started=Date.now();timer=setTimeout(dismiss,remaining);};
  $('.toast-close',box).addEventListener('click',dismiss);
  box.addEventListener('pointerenter',pause);box.addEventListener('pointerleave',()=>{if(!box.contains(document.activeElement))resume();});
  box.addEventListener('focusin',pause);box.addEventListener('focusout',()=>{if(!box.matches(':hover'))resume();});resume();
}
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionDelay = ms => reducedMotion()?Promise.resolve():new Promise(resolve=>setTimeout(resolve,ms));
function busyButton(button,label='Salvando…') {
  const html=button.innerHTML,disabled=button.disabled;
  button.disabled=true;button.setAttribute('aria-busy','true');button.innerHTML=`<span class="spinner" aria-hidden="true"></span>${esc(label)}`;
  return ()=>{button.disabled=disabled;button.removeAttribute('aria-busy');button.innerHTML=html;};
}
async function buttonAction(button,handler,label='Salvando…') {
  if(button.disabled)return;const restore=busyButton(button,label);
  try{await handler();}catch(error){notify(error.message,'error');}finally{restore();}
}
async function confirmAction(message) {
  const previous=document.activeElement,dialog=document.createElement('dialog');let accepted=false;
  dialog.className='confirm-dialog';dialog.setAttribute('aria-labelledby','confirm-title');dialog.setAttribute('aria-describedby','confirm-message');
  dialog.innerHTML=`<div class="confirm-icon">${icon('shield')}</div><h2 id="confirm-title">Confirme para continuar</h2><p id="confirm-message">${esc(message)}</p><div class="confirm-actions"><button class="button" type="button" data-cancel autofocus>Voltar</button><button class="button primary" type="button" data-confirm>Confirmar ${icon('arrow')}</button></div>`;
  document.body.append(dialog);
  $('[data-cancel]',dialog).addEventListener('click',()=>dialog.close());
  $('[data-confirm]',dialog).addEventListener('click',()=>{accepted=true;dialog.close();});
  const closed=new Promise(resolve=>dialog.addEventListener('close',()=>resolve(accepted),{once:true}));
  dialog.showModal();
  try{return await closed;}finally{dialog.remove();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();}
}
// Nenhuma identidade é consultada: a representação usa somente rótulos genéricos.
async function operationFlow(kind,request,existingCode='') {
  const previous=document.activeElement,dialog=document.createElement('dialog');
  const proposal=kind==='proposal',review=kind==='review';
  const labels=review?['Validando critérios','Registrando avaliação','Avaliação concluída']:['Validando proposta','Protegendo identidade',proposal?'Gerando código anônimo':'Versão científica aprovada'];
  dialog.className='operation-dialog';dialog.setAttribute('aria-labelledby','operation-title');dialog.setAttribute('aria-describedby','operation-detail');
  dialog.innerHTML=`<div class="operation-art">${scientistOwl('flow','quimica')}<span class="guardian-ring"></span><span class="guardian-lock">${icon('shield')}</span></div><span class="eyebrow">${review?'CRITÉRIOS EM PRIMEIRO LUGAR':'PRIMEIRO A IDEIA'}</span><h2 id="operation-title">${review?'Registrando sua avaliação':'Sua ideia em primeiro lugar'}</h2><div class="identity-labels" aria-hidden="true"><span>Nome</span><span>Escola</span><span>Turma</span></div><ol class="operation-steps">${labels.map((label,i)=>`<li data-step="${i}"><span>${i+1}</span>${label}</li>`).join('')}</ol><p id="operation-detail" role="status">Aguardando confirmação do servidor…</p><p class="operation-code" hidden></p><small class="protected-caption" hidden>Identidade do cadastro protegida</small><p class="operation-explanation">${review?'As notas só são confirmadas após o registro no banco.':'A versão científica passa pela revisão do organizador antes da avaliação. Esta animação representa a separação da identidade.'}</p><button class="button primary full" type="button" disabled autofocus><span class="spinner" aria-hidden="true"></span> Aguarde a confirmação</button>`;
  if(review)$('.identity-labels',dialog).remove();
  document.body.append(dialog);dialog.showModal();
  const cancel=event=>event.preventDefault();dialog.addEventListener('cancel',cancel);
  try {
    const result=await request();
    dialog.classList.add('confirmed');
    const status=$('#operation-detail',dialog),button=/** @type {HTMLButtonElement} */($('button',dialog));
    for(let i=0;i<labels.length;i++) {
      if(!dialog.open)break;
      dialog.querySelectorAll('[data-step]').forEach((step,index)=>{step.classList.toggle('step-complete',index<i);step.classList.toggle('step-active',index===i);});
      status.textContent=review?['Critérios validados pelo servidor.','Avaliação registrada no banco.','Avaliação concluída ✓'][i]:['Proposta validada pelo servidor.','Protegendo identidade · separação confirmada.',proposal?'Código anônimo confirmado.':'Revisão de anonimização registrada.'][i];
      await motionDelay(i===1?550:350);
    }
    dialog.querySelectorAll('[data-step]').forEach(step=>{step.classList.remove('step-active');step.classList.add('step-complete');});
    const confirmedCode=result.anonymous_code||existingCode;
    if(confirmedCode){const code=$('.operation-code',dialog);code.textContent=confirmedCode;code.hidden=false;$('.protected-caption',dialog).hidden=false;}
    status.textContent=proposal?'Projeto enviado com sucesso ✓':review?'Avaliação concluída ✓':'Versão científica aprovada ✓';
    dialog.classList.add('operation-success');button.disabled=false;button.innerHTML=`Continuar ${icon('arrow')}`;
    dialog.removeEventListener('cancel',cancel);button.focus();
    await new Promise(resolve=>{button.addEventListener('click',()=>dialog.close(),{once:true});dialog.addEventListener('close',()=>resolve(undefined),{once:true});});
    return result;
  } finally {dialog.remove();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();}
}
let animationFrame=0;
function animatePage() {
  cancelAnimationFrame(animationFrame);
  if(reducedMotion())return;
  const counters=[...document.querySelectorAll('[data-count]')].map(element=>({element,value:Number(element.getAttribute('data-count')),final:element.textContent}));
  if(!counters.length)return;
  const start=performance.now();
  const frame=now=>{
    const progress=Math.min(1,(now-start)/750),ease=1-Math.pow(1-progress,3);
    counters.forEach(({element,value,final})=>{element.textContent=progress===1?final:fmt(Number.isInteger(value)?Math.round(value*ease):Math.round(value*ease*10)/10);});
    if(progress<1)animationFrame=requestAnimationFrame(frame);
  };
  animationFrame=requestAnimationFrame(frame);
}
let navDismissBound=false;
let validationId=0;
function enhancePage() {
  document.querySelectorAll('.table-scroll').forEach(table=>{table.setAttribute('tabindex','0');table.setAttribute('role','region');table.setAttribute('aria-label','Tabela com rolagem horizontal');});
  // No celular a tabela vira lista de cartoes e o cabecalho deixa de ser
  // exibido: cada celula passa a carregar o rotulo da coluna que substitui.
  // Derivar do proprio cabecalho evita duplicar os titulos em cada template.
  document.querySelectorAll('.table-scroll table').forEach(table=>{
    const headers=[...table.querySelectorAll('thead th')].map(head=>head.textContent.trim());
    table.querySelectorAll('tbody tr').forEach(row=>{
      [...row.children].forEach((cell,index)=>{
        if(!(cell instanceof HTMLElement))return;
        const label=headers[index]||'';
        if(label&&!cell.dataset.label)cell.dataset.label=label;
      });
    });
  });
  document.querySelectorAll('form').forEach(form=>{
    form.addEventListener('invalid',event=>{
      const input=event.target;if(!(input instanceof HTMLInputElement||input instanceof HTMLTextAreaElement||input instanceof HTMLSelectElement))return;
      input.setAttribute('aria-invalid','true');
      let message=input.parentElement.querySelector('.field-error');
      if(!message){message=document.createElement('small');message.className='field-error';message.id='validation-'+(++validationId);input.parentElement.append(message);input.setAttribute('aria-describedby',message.id);}
      message.textContent=input.validationMessage;
    },true);
    form.addEventListener('input',event=>{
      const input=event.target;if(!(input instanceof HTMLInputElement||input instanceof HTMLTextAreaElement||input instanceof HTMLSelectElement))return;
      if(input.validity.valid){input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');input.parentElement.querySelector('.field-error')?.remove();input.classList.toggle('field-valid',input.value.trim().length>0);}
    });
  });
  animatePage();
}
function pageLoading() {
  return '<div class="page-loading" role="status"><span class="sr-only">Carregando conteúdo…</span><div class="skeleton skeleton-title"></div><div class="skeleton-grid"><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div></div><div class="skeleton skeleton-panel"></div></div>';
}
async function api(path,method='GET',body,headers={}) {
  const separator=path.includes('?')?'&':'?';
  const scoped=!['/login','/logout','/session','/events'].includes(path);
  let response;
  try {response=await fetch(`/api${path}${scoped&&state.eventId?`${separator}event_id=${encodeURIComponent(state.eventId)}`:''}`,{method,headers:{'Content-Type':'application/json',...(state.csrf?{'X-CSRF-Token':state.csrf}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});}
  catch {throw new Error('Não foi possível conectar. Verifique sua conexão e tente novamente.');}
  if(response.status===404&&method==='GET'&&state.eventId&&['/public','/event'].includes(path)) {state.eventId=storedEvent('');return api(path);}
  let data;try{data=await response.json();}catch{throw new Error('O servidor retornou uma resposta inválida. Tente novamente.');}
  if(!response.ok) { if(response.status===401&&state.user) { state.user=null;state.csrf='';location.hash='/login'; } throw new Error(data.error||'Não foi possível concluir a operação.'); }
  return data;
}
function navigation() {
  if(state.user.role==='organizer') return [['Visão geral','/dashboard','grid'],['Projetos','/projects','file'],['Participantes','/participants','people'],['Avaliadores','/reviewers','check'],['Pedidos','/reviewer-requests','people'],['Distribuição','/assignments','shield'],['Resultados','/results','chart'],['Comparações','/comparisons','chart'],['Rubrica','/rubric','file'],['Edição e evento','/settings','settings'],['Exportação','/export','download'],['Auditoria','/audit','clock']];
  if(state.user.role==='reviewer') return [['Minhas avaliações','/dashboard','grid'],['Histórico','/history','clock'],['Meu perfil','/profile','people']];
  return [['Meus projetos','/dashboard','grid'],['Nova proposta','/projects/new','plus'],['Privacidade','/privacy','shield']];
}
function editionPicker() {
  return state.events.length>1?`<label class="edition-picker"><span class="sr-only">Consultar edição</span><select data-event-select aria-label="Consultar edição">${state.events.map(event=>`<option value="${esc(event.id)}" ${event.id===state.event?.id?'selected':''}>${esc(event.name)} · ${event.year}</option>`).join('')}</select></label>`:`<span class="edition-tag"><i></i> ${esc(state.event?.name||'Edição científica')}</span>`;
}
function shell(content,path) {
  if(!state.user) return `<a class="skip-link" href="#main" data-skip-link>Pular para o conteúdo</a><div class="public-shell"><header class="public-header"><a class="brand" href="#/">${logo()}<span>BlindPitch<span class="brand-dot">.</span></span></a><nav aria-label="Navegação pública"><a href="#/gallery">Galeria</a><a href="#/showcase">Vitrine</a><a href="#/reviewers-public">Avaliadores</a><a href="#/about">Sobre o projeto</a><a href="#/login">Entrar</a></nav><div class="public-header-actions"><a class="button primary small" href="#/register">Criar conta ${icon('arrow')}</a>${themeToggle()}</div></header><main id="main">${content}</main><footer>BlindPitch · Ceará Faz Ciência 2026 <span>Ciência Delas · Primeiro a ideia. Depois, quem a criou.</span></footer></div>`;
  return `<a class="skip-link" href="#main" data-skip-link>Pular para o conteúdo</a><div class="workspace"><aside class="sidebar"><a class="brand" href="#/dashboard">${logo()}<span>BlindPitch<span class="brand-dot">.</span></span></a><button type="button" class="nav-toggle" id="nav-toggle" aria-expanded="false" aria-controls="main-nav"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span class="nav-toggle-text">Menu</span></button><p class="sidebar-caption">ESPAÇO DO ${esc(roleNames[state.user.role].toUpperCase())}</p><nav id="main-nav" class="sidebar-nav" aria-label="Navegação principal">${navigation().map(([name,href,img])=>`<a href="#${href}" class="nav-item ${path===href?'active':''}" ${path===href?'aria-current="page"':''}>${icon(img)}<span>${name}</span></a>`).join('')}</nav><div class="sidebar-bottom"><div class="science-label"><span class="tiny-dot"></span> CIÊNCIA DELAS</div><p>Uma ideia pode vir<br>de qualquer pessoa.</p><a href="#/about">Conheça a pesquisa ${icon('arrow')}</a></div><button class="logout" id="logout">${icon('logout')} Sair da conta</button></aside><div class="main-wrap"><header class="topbar"><span class="breadcrumb">Workspace <span>/</span> <strong>${esc(navigation().find(n=>n[1]===path)?.[0]||'Projeto')}</strong></span><div class="topbar-right">${themeToggle()}${editionPicker()}<div class="avatar">${esc(state.user.name.charAt(0))}</div><div class="account"><strong>${esc(state.user.name)}</strong><small>${esc(roleNames[state.user.role])}</small></div></div></header><main id="main" class="main-content">${content}</main><footer>BlindPitch © 2026 <span>Primeiro a ideia. Depois, quem a criou.</span></footer></div></div>`;
}
const logo = () => '<span class="logo-mark">b<span>p</span></span>';
function publicHome() {
  return `<section class="hero"><div><div class="eyebrow">CEARÁ FAZ CIÊNCIA 2026 · CIÊNCIA DELAS</div><h1>Primeiro a ideia.<br>Depois, <span>quem a criou.</span></h1><p>Um espaço onde propostas científicas ganham voz. Avalie o problema, o método e o potencial de cada ideia com uma primeira etapa anônima.</p><div class="actions"><a class="button primary" href="#/register">Enviar minha ideia ${icon('arrow')}</a><a class="button" href="#/login">Acessar a plataforma</a></div><div class="hero-note">${icon('shield')} Identidade protegida durante a avaliação anônima</div></div><div class="hero-visual science-hero">${scienceOwls()}</div></section><section class="home-steps"><article><span>01</span><h3>Proponha</h3><p>Transforme uma pergunta em um projeto científico.</p></article><article><span>02</span><h3>Avalie</h3><p>Analise o conteúdo com uma rubrica transparente.</p></article><article><span>03</span><h3>Investigue</h3><p>Compare resultados e explore possíveis influências.</p></article></section><section class="public-portals"><a href="#/gallery">${icon('file')}<span><strong>Galeria pública</strong><small>Trabalhos autorizados pelos autores</small></span>${icon('arrow')}</a><a href="#/showcase">${icon('eye')}<span><strong>Vitrine da edição</strong><small>Projetos desta edição autorizados</small></span>${icon('arrow')}</a><a href="#/reviewers-public">${icon('people')}<span><strong>Corpo avaliador</strong><small>Perfis acadêmicos autorizados</small></span>${icon('arrow')}</a></section>${demoBanner()}`;
}
function aboutPage() {
  return `${heading('A PESQUISA','Ciência que abre espaço.','Uma plataforma para investigar como avaliamos ideias.')}<article class="panel prose"><span class="tag">Ceará Faz Ciência 2026 · Ciência Delas</span><h2>A pergunta que nos move</h2><p>A identificação do autor de uma proposta pode influenciar a forma como sua ideia científica é avaliada?</p><h2>Hipótese de trabalho</h2><p>A ocultação temporária de informações pessoais durante a primeira etapa pode reduzir a influência de fatores externos ao conteúdo científico e aumentar o peso dos critérios objetivos.</p><h2>Como funciona</h2><p>Participantes enviam propostas. O organizador revisa o conteúdo para remover identificadores e distribui versões científicas aos avaliadores. Cada avaliação usa uma rubrica, e as notas são armazenadas para análise agregada.</p><h2>Privacidade e participação</h2><p>Coletamos nome e e-mail para acesso; escola/turma é opcional. O consentimento para a condição identificada é opcional. A ausência de consentimento não impede o envio de uma proposta. Avaliações anônimas nunca recebem a identidade do autor, mesmo após o encerramento.</p><h2>Interpretação responsável</h2><p>As comparações são descritivas. Uma diferença entre condições não demonstra, por si só, preconceito ou discriminação. A coleta real deverá seguir o protocolo definido e aprovado pelo orientador, incluindo os cuidados aplicáveis a participantes menores de idade.</p><p>Dados públicos não incluem resultados individuais. Apenas organizadores autenticados acessam análises e relatórios. Solicitações sobre dados e participação devem ser encaminhadas à organização do evento.</p></article>`;
}
function consentDisclosure() {
  const event=state.publicInfo?.event;
  return `<div class="consent-info">O projeto investiga possíveis influências da identificação na avaliação. Seu conteúdo poderá ser avaliado anonimamente.${event?.identified_enabled?`<p><strong>Protocolo da edição</strong><br>${esc(event.protocol)}</p>`:''}</div>${event?.identified_enabled?'<label class="check-label"><input type="checkbox" name="consent"><span>Li o protocolo acima e autorizo minha participação também na condição identificada desta edição. Esta opção é voluntária.</span></label>':'<input type="hidden" name="consent" value="">'}`;
}
async function privacyPage() {
  const data=await api('/privacy');
  const projects=data.projects||[];
  return `${heading('PRIVACIDADE','Quem é você aqui.','Sua preferência governa apenas a exposição pública. A avaliação científica continua anônima em qualquer opção.')}
  ${demoBanner()}
  <div class="info-note">${icon('shield')} Autorizar o nome não autoriza divulgar documentos, contatos ou qualquer outra informação. A organização nunca recebe mais campos públicos do que você autorizar.</div>
  <section class="panel"><div class="panel-heading"><div><span class="eyebrow">SEU ENDEREÇO PÚBLICO</span><h2>Portfólio</h2>
    <p class="muted">Um código aleatório, sem nome nem matrícula. Ele não muda e não revela quem você é: só leva ao que você autorizar publicar.</p></div></div>
    <div class="portfolio-link"><code id="portfolio-slug">${esc(data.portfolio_slug||'')}</code>
      <a class="button" href="#/portfolio/${encodeURIComponent(data.portfolio_slug||'')}" target="_blank" rel="noopener">Abrir portfólio ${icon('arrow')}</a>
      <button class="button" type="button" data-copy-slug>Copiar endereço</button></div></section>
  <section class="panel"><div class="panel-heading"><div><span class="eyebrow">IDENTIFICAÇÃO PÚBLICA</span><h2>Como deseja ser identificado</h2></div></div>
    <form id="privacy-form"><fieldset><legend class="sr-only">Preferência de identificação pública</legend>${identificationChoices(data.identification)}</fieldset>
    <label>Nome público <span class="muted">(opcional)</span><input name="public_name" value="${esc(data.public_name)}" maxlength="100" placeholder="Nome que aparecerá na vitrine pública"><small>Usado apenas em páginas públicas. Não é o mesmo campo do seu acesso à plataforma.</small></label>
    <label>Apresentação acadêmica pública <span class="muted">(opcional)</span><textarea name="public_bio" maxlength="1000" rows="3" placeholder="Breve apresentação sobre a sua área de interesse">${esc(data.public_bio)}</textarea></label>
    <p class="form-error" role="alert"></p><button class="button primary" type="submit">Salvar preferência ${icon('arrow')}</button></form></section>
  <section class="panel"><div class="panel-heading"><div><span class="eyebrow">PORTFÓLIO E PUBLICAÇÃO</span><h2>Onde deseja exibir cada projeto</h2></div></div>
    <p class="muted">Selecionar um destino não publica o projeto: a publicação depende da aprovação da versão científica e da sua preferência de identificação.</p>
    ${projects.length?projects.map(project=>publicationRow(project)).join(''):empty('Nenhum projeto por enquanto.','Crie uma proposta para escolher onde deseja exibi-la.').replace('<div class="empty">','<div class="empty" style="margin-top:24px">')}</section>`;
}
function publicationRow(project) {
  const prefs=project.prefs||{};
  // O servidor é a autoridade: `published` já condensa destino + aprovação + estado.
  const stateLabel=project.published?'Publicado neste destino'
    :project.status==='draft'?'Rascunho — ainda não é público'
    :project.status==='archived'?'Arquivado — não publica'
    :'Aguardando aprovação da versão científica';
  const selected=[prefs.portfolio&&'Meu portfólio público',prefs.gallery&&'Galeria do BlindPitch',prefs.showcase&&'Vitrine da edição'].filter(Boolean);
  return `<article class="publication-row" data-publication="${esc(project.id)}"><div><h3>${esc(project.title)}</h3><p class="muted">${esc(stateLabel)}</p>
    ${selected.length?`<p class="publication-tags">${selected.map(t=>`<span class="badge reviewed">${esc(t)}</span>`).join('')}</p>`:'<p class="muted">Nenhum destino selecionado — o projeto não aparece publicamente.</p>'}</div><fieldset><legend class="sr-only">Destinos de publicação de ${esc(project.title)}</legend>
    <label class="check-label"><input type="checkbox" data-target="portfolio" ${prefs.portfolio?'checked':''}><span><strong>Meu portfólio público</strong><span class="muted">Na sua página pública de trabalhos.</span></span></label>
    <label class="check-label"><input type="checkbox" data-target="gallery" ${prefs.gallery?'checked':''}><span><strong>Galeria do BlindPitch</strong><span class="muted">Na galeria geral de trabalhos científicos.</span></span></label>
    <label class="check-label"><input type="checkbox" data-target="showcase" ${prefs.showcase?'checked':''}><span><strong>Vitrine da edição</strong><span class="muted">Na página pública desta edição.</span></span></label></fieldset>
    <div class="publication-actions"><button class="button" type="button" data-preview-publication aria-expanded="false">Prévia pública</button><button class="button primary" type="button" data-save-publication="${esc(project.id)}">Salvar destinos</button></div>
    <div class="publication-preview" hidden aria-live="polite"><span class="eyebrow">COMO APARECE PUBLICAMENTE</span>
      <p class="muted">A prévia abaixo usa os dados reais deste projeto. Identidade, escola e código anônimo nunca aparecem.</p>
      ${publicCard(project.preview||project)}</div>
    </article>`;
}
// Seção "Onde você deseja exibir este projeto?" — reutilizada na edição e no detalhe.
function publicationSection(p) {
  const pub=p.publication||{},prefs=pub.prefs||{};
  const targets=[['portfolio','Meu portfólio público','Aparece na sua página pública de trabalhos.'],
    ['gallery','Galeria do BlindPitch','Entra na galeria geral de trabalhos científicos.'],
    ['showcase','Vitrine da edição','Exibido na página pública desta edição.']];
  return `<section class="panel publication-panel" data-publication="${esc(p.id)}">
    <div class="panel-heading"><div><span class="eyebrow">ONDE VOCÊ DESEJA EXIBIR ESTE PROJETO?</span><h2>Destinos de publicação</h2>
    <p class="muted">${pub.published?'Publicado em um ou mais destinos.':'Nenhum projeto é publicado automaticamente: é preciso marcar um destino E aprovar a versão científica.'}</p></div>${icon('eye')}</div>
    <fieldset><legend class="sr-only">Destinos de publicação de ${esc(p.title)}</legend>
    ${targets.map(([key,label,help])=>`<label class="check-label"><input type="checkbox" data-target="${key}" ${prefs[key]?'checked':''}><span><strong>${label}</strong><span class="muted">${help}</span></span></label>`).join('')}
    </fieldset>
    <div class="publication-actions"><button class="button" type="button" data-preview-publication aria-expanded="false">Prévia pública</button><button class="button primary" type="button" data-save-publication="${esc(p.id)}">Salvar destinos</button></div>
    <div class="publication-preview" hidden aria-live="polite"><span class="eyebrow">COMO APARECE PUBLICAMENTE</span>
      <p class="muted">Prévia com os dados reais deste projeto, já higienizados pelo servidor. Identidade, escola e código anônimo nunca aparecem.</p>
      ${publicCard(pub.preview||{title:p.title,scientific_area:p.scientific_area,problem:p.problem,keywords:p.keywords,status:p.status})}</div>
  </section>`;
}
async function reviewerRequestsPage() {
  const requests=await api('/reviewer-requests');
  const label={pending:'Pendente',approved:'Aprovado',rejected:'Recusado'};
  return `${heading('PEDIDOS DE AVALIAÇÃO','Quem quer avaliar.','Aprovar um pedido concede o papel de avaliador. Ninguém se torna avaliador apenas escolhendo a opção no cadastro.')}
    <div class="info-note">${icon('shield')} A aprovação encerra as sessões ativas dessa pessoa, para que o novo papel nunca coexista com um acesso antigo.</div>
    <h2 class="sr-only">Pedidos recebidos</h2>
    ${requests.length?`<div class="table-scroll"><table><thead><tr><th scope="col">Pessoa</th><th scope="col">E-mail</th><th scope="col">Situação</th><th scope="col">Ação</th></tr></thead><tbody>${requests.map(row=>`<tr><td>${esc(row.name)}<small class="table-title">${esc(row.school_or_class||'Sem instituição informada')}</small></td><td>${esc(row.email)}</td><td><span class="badge pending">${esc(label[row.status]||row.status)}</span></td><td><div class="request-actions"><button class="button primary" type="button" data-approve-reviewer="${esc(row.user_id)}">Aprovar como avaliador</button><button class="button" type="button" data-reject-reviewer="${esc(row.user_id)}">Recusar</button></div></td></tr>`).join('')}</tbody></table></div>`:empty('Nenhum pedido pendente.','Os pedidos feitos no cadastro aparecem aqui para decisão da organização.')}`;
}
async function reviewerProfilePage() {
  const data=await api('/profile/reviewer'),profile=data.profile||{};
  const stats=data.stats||{};
  return `${heading('MEU PERFIL','Formação e privacidade.','Você avalia com seu nome interno. O que aparece publicamente é uma escolha sua.')}
  <div class="metrics-grid three"><article class="metric-card"><div class="metric-top"><span>Avaliações concluídas</span></div><strong><span class="sr-only">${esc(String(stats.reviews_completed??0))}</span><span aria-hidden="true">${fmt(stats.reviews_completed??0)}</span></strong><small>Apenas avaliações finalizadas</small></article>
  <article class="metric-card"><div class="metric-top"><span>Média das notas</span></div><strong><span class="sr-only">${esc(stats.mean_score===null||stats.mean_score===undefined?'Sem notas':fmt(stats.mean_score))}</span><span aria-hidden="true">${stats.mean_score===null||stats.mean_score===undefined?'—':fmt(stats.mean_score)}</span></strong><small>Escala normalizada · 0 a 100</small></article>
  <article class="metric-card"><div class="metric-top"><span>Visibilidade</span></div><strong><span class="sr-only">${profile.public_identity?'Público':'Privado'}</span><span aria-hidden="true">${profile.public_identity?'Público':'Privado'}</span></strong><small>${profile.public_identity?'Seu perfil acadêmico aparece no site':'Só a organização vê seu perfil'}</small></article></div>
  <section class="panel"><div class="panel-heading"><div><span class="eyebrow">PERFIL ACADÊMICO</span><h2>Formação e áreas</h2></div></div>
    <form id="reviewer-profile-form"><div class="form-grid">
    <label>Nível de escolaridade<input name="education_level" value="${esc(profile.education_level||'')}" maxlength="80" placeholder="Ex.: Ensino Superior completo"></label>
    <label>Graduações<input name="degrees" value="${esc(profile.degrees||'')}" maxlength="400" placeholder="Ex.: Licenciatura em Física"></label>
    <label>Cursos e formações<input name="courses" value="${esc(profile.courses||'')}" maxlength="400"></label>
    <label>Especializações<input name="specializations" value="${esc(profile.specializations||'')}" maxlength="400"></label>
    <label class="span-two">Áreas de conhecimento<input name="knowledge_areas" value="${esc(profile.knowledge_areas||'')}" maxlength="400" placeholder="Ex.: Física, Robótica, Astronomia"></label>
    <label class="span-two">Biografia acadêmica <span class="muted">(opcional)</span><textarea name="bio" maxlength="1000" rows="3">${esc(profile.bio||'')}</textarea></label>
    </div>
    <label class="check-label"><input type="checkbox" name="public_identity" ${profile.public_identity?'checked':''}><span><strong>Exibir minha identidade nominal publicamente</strong><span>Desmarque para mostrar apenas a formação acadêmica que você autorizar. Isso não afeta a identificação interna necessária à segurança.</span></span></label>
    <p class="form-error" role="alert"></p><button class="button primary" type="submit">Salvar perfil ${icon('arrow')}</button></form></section>`;
}
function participantConsent() {
  const event=state.event;
  if(!event.identified_enabled)return '';
  return `<details class="panel"><summary>Participação experimental · ${event.consent?'consentimento registrado':'condição identificada opcional'}</summary><p>${esc(event.protocol)}</p>${event.consent?'<p class="muted">Consentimento registrado para esta edição e esta versão do protocolo.</p>':'<p>A participação na condição identificada é voluntária. Você pode enviar sua proposta e participar da condição anônima sem esta autorização.</p><button class="button" id="consent-button">Li o protocolo e autorizo a condição identificada</button>'}</details>`;
}
// ---------- Superfícies públicas ----------
async function publicGalleryPage(target) {
  const data=await api(`/public/${target}`);
  const projects=data.projects||[];
  const title=target==='gallery'?'Trabalhos científicos publicados.':'Vitrine desta edição.';
  const eyebrow=target==='gallery'?'GALERIA PÚBLICA':'VITRINE DA EDIÇÃO';
  const intro=target==='gallery'
   ?'Trabalhos que os autores autorizaram exibir na galeria geral do BlindPitch.'
    :'Trabalhos autorizados para a vitrine pública desta edição.';
  const body=projects.length
    ? `<div class="public-grid">${projects.map(publicCard).join('')}</div>`
    : empty('Nada publicado ainda.','Nenhum projeto autorizou este destino por enquanto.');
  const section=target==='gallery'?'Trabalhos publicados':'Trabalhos desta edição';
  return `${heading(eyebrow,title,intro)}<h2 class="sr-only">${section}</h2>${data.demo_notice?`<div class="info-note">${icon('chart')} <span>${esc(data.demo_notice)}</span></div>`:''}
    ${body}
    <div class="info-note">${icon('shield')} <span>Publicar um projeto é uma escolha do autor. Identidade, escola e código anônimo não fazem parte destas páginas.</span></div>`;
}
function publicCard(project) {
  return `<article class="public-card"><span class="eyebrow">${esc(project.scientific_area||'Área não informada')}</span>
    <h3>${esc(project.title)}</h3>
    ${project.problem?`<p>${esc(project.problem.slice(0,220))}${project.problem.length>220?'…':''}</p>`:''}
    ${project.keywords?`<p class="public-keywords">${esc(project.keywords)}</p>`:''}
    ${project.portfolio_slug?`<p class="public-card-link"><a href="#/portfolio/${encodeURIComponent(project.portfolio_slug)}">Ver portfólio do autor ${icon('arrow')}</a></p>`:''}
    <p class="muted">${esc(statusNames[project.status]||project.status)}</p></article>`;
}
async function portfolioPage(slug) {
  const data=await api(`/public/portfolio/${encodeURIComponent(slug)}`);
  const projects=data.projects||[];
  const heading_=data.anonymous?'Autoria protegida.':'';
  return `${heading('PORTFÓLIO PÚBLICO',data.name||heading_||'Portfólio científico',
      data.anonymous?'Este autor optou por não se identificar publicamente. O trabalho fala por si.'
        :'Trabalhos publicados por este participante no BlindPitch.')}
    ${data.bio?`<p class="portfolio-bio">${esc(data.bio)}</p>`:''}
    <h2 class="sr-only">Trabalhos neste portfólio</h2>
    ${projects.length?`<div class="public-grid">${projects.map(publicCard).join('')}</div>`
      :empty('Nenhum projeto publicado.','Este autor ainda não autorizou a exibição de trabalhos.')}
    ${data.anonymous?`<div class="info-note">${icon('shield')} <span>Identidade mantida em sigilo a pedido do autor. Não tentamos identificá-lo: a avaliação científica é anônima por desenho.</span></div>`:''}`;
}
async function publicReviewersPage() {
  const data=await api('/public/reviewers');
  const reviewers=data.reviewers||[];
  return `${heading('CORPO AVALIADOR','Quem avalia.','Perfis acadêmicos exibidos apenas quando o avaliador autorizou a identidade nominal.')}
    <h2 class="sr-only">Perfis acadêmicos</h2>
    ${reviewers.length?`<div class="public-grid">${reviewers.map(r=>`<article class="public-card">
      ${r.name?`<span class="eyebrow">${esc(r.name)}</span>`:'<span class="eyebrow">Identidade protegida</span>'}
      <h3>${esc(r.education_level||'Formação não informada')}</h3>
      ${r.degrees?`<p><strong>Graduação:</strong> ${esc(r.degrees)}</p>`:''}
      ${r.specializations?`<p><strong>Especializações:</strong> ${esc(r.specializations)}</p>`:''}
      ${r.knowledge_areas?`<p><strong>Áreas:</strong> ${esc(r.knowledge_areas)}</p>`:''}
      ${r.bio?`<p>${esc(r.bio)}</p>`:''}
      <dl class="public-stats"><div><dt>Avaliações concluídas</dt><dd>${fmt(r.reviews_completed)}</dd></div><div><dt>Média das notas</dt><dd>${r.mean_score===null?'—':fmt(r.mean_score)}</dd></div></dl>
    </article>`).join('')}</div>`
    :empty('Nenhum perfil público.','Nenhum avaliador autorizou a exibição do próprio perfil.')}
    <div class="info-note">${icon('shield')} <span>Estas estatísticas consideram somente avaliações finalizadas. Propostas, comentários e identidades de autores não são exibidos aqui.</span></div>`;
}
// As três opções de identificação pública. Nenhuma afeta a avaliação anônima.
const identificationChoices = selected => [
  ['immediate','Quero ser identificado desde o início','Seus dados de identificação autorizados poderão ser exibidos publicamente junto dos seus projetos, respeitando o estado de cada projeto.'],
  ['after_approval','Quero ser identificado somente após a aprovação','Sua identidade fica oculta publicamente enquanto o projeto aguarda aprovação. Depois da aprovação oficial, os dados autorizados podem ser exibidos.'],
  ['never','Não quero ser identificado publicamente','Sua identidade permanece oculta publicamente, independentemente do resultado do projeto.']
].map(([value,title,description])=>`<label class="choice"><input type="radio" name="identification" value="${value}" ${selected===value?'checked':''} required><span><strong>${esc(title)}</strong><span>${esc(description)}</span></span></label>`).join('');
function profileChoice() {
  return `<fieldset class="role-choice"><legend class="sr-only">Como você quer participar</legend>
    <label class="choice"><input type="radio" name="role" value="participant" checked required><span><strong>Participante</strong><span>Envio projetos científicos e acompanho meus resultados.</span></span></label>
    <label class="choice"><input type="radio" name="role" value="reviewer"><span><strong>Avaliador</strong><span>Avalio os projetos que me forem atribuídos. O acesso como avaliador é autorizado pela organização.</span></span></label>
  </fieldset>`;
}
function authPage(register) {
  return `<section class="auth-layout"><div class="auth-story"><div class="auth-identity">${scientistOwl('auth','biologia')}<div><span class="eyebrow">CIÊNCIA EM PRIMEIRO LUGAR</span><h2>BlindPitch</h2><p>Primeiro a ideia.<br>Depois, quem a criou.</p></div></div><div class="eyebrow">A PRÓXIMA IDEIA PODE SER A SUA</div><h1>Ciência começa com uma <span>boa pergunta.</span></h1><p>Crie, compartilhe e acompanhe sua proposta em um processo de avaliação centrado no conteúdo.</p></div><div class="panel auth-card"><span class="eyebrow">BLINDPITCH</span><h2>${register?'Crie sua conta':'Que bom ter você aqui.'}</h2><p>${register?'Seu primeiro passo para participar da edição.':'Entre para continuar sua jornada científica.'}</p><form id="auth-form">${register?'<label>Nome completo<input name="name" autocomplete="name" required minlength="3" maxlength="100"></label>':''}<label>E-mail<input type="email" name="email" autocomplete="email" required maxlength="200"></label><label>Senha<input type="password" name="password" autocomplete="${register?'new-password':'current-password'}" required minlength="${register?10:1}" maxlength="128"></label>${register?'<small>Use pelo menos 10 caracteres.</small><label>Escola ou turma <span class="muted">(opcional)</span><input name="school_or_class" maxlength="150"></label>'+profileChoice()+consentDisclosure()+'':''}<p class="form-error" role="alert"></p><button class="button primary full" type="submit">${register?'Criar conta':'Entrar na plataforma'} ${icon('arrow')}</button></form><p class="auth-switch">${register?'Já tem uma conta? <a href="#/login">Entrar</a>':'É sua primeira vez? <a href="#/register">Criar conta</a>'}</p>${!register&&state.publicInfo?.event?.demo?`<details class="demo-accounts"><summary>Explorar a demonstração local</summary><p>Contas fictícias · senha: <code>BlindPitch2026!</code></p>${[['organizador','Organizador'],['avaliador1','Avaliador 1'],['avaliador2','Avaliador 2'],['participante1','Participante 1'],['participante2','Participante 2'],['participante3','Participante 3']].map(([email,name])=>`<button type="button" class="demo-account" data-demo="${email}">${name}<span>${email}@blindpitch.demo</span></button>`).join('')}</details>`:''}</div></section>`;
}
const metricCard = (label,value,detail,img,tone='') => `<article class="metric-card"><div class="metric-top"><span>${label}</span><span class="metric-icon ${tone}">${icon(img)}</span></div><strong><span class="sr-only">${esc(value)}</span><span ${Number.isFinite(Number(String(value).replace(/ s$/u,'').replaceAll('.','').replace(',','.')))?`data-count="${Number(String(value).replace(/ s$/u,'').replaceAll('.','').replace(',','.'))}"`: ''} aria-hidden="true">${value}</span></strong><small>${detail}</small></article>`;
function barChart(rows,valueKey='count',suffix='') {
  const max=Math.max(1,...rows.map(r=>Number(r[valueKey]||0)));
  return `<div class="bar-chart">${rows.map(r=>`<div class="bar-row"><div><span>${esc(r.label||r.name)}</span><strong>${fmt(r[valueKey])}${suffix}</strong></div><meter min="0" max="${max}" value="${r[valueKey]??0}" aria-label="${esc(r.label||r.name)}: ${fmt(r[valueKey])}${suffix}">${fmt(r[valueKey])}</meter></div>`).join('')}</div>`;
}
function verticalChart(rows) {
  const max=Math.max(1,...rows.map(r=>r.count));
  return `<div class="vertical-chart">${rows.map(r=>`<div class="column"><span>${r.count}</span><meter min="0" max="${max}" value="${r.count}" aria-label="${esc(r.label)} pontos: ${r.count} avaliações">${r.count}</meter><small>${esc(r.label)}</small></div>`).join('')}</div><p class="chart-caption">Pontuação normalizada (0–100) · avaliações concluídas</p>`;
}
async function organizerDashboard() {
  const m=await api('/metrics');
  return `${heading('PANORAMA DA EDIÇÃO','Cada ideia conta.','Acompanhe as propostas e o avanço da avaliação científica.',`<a class="button primary" href="#/assignments">Distribuir avaliações ${icon('arrow')}</a>`)}${demoBanner()}${welcome()}<div class="edition-overview"><div><span class="tag">EDIÇÃO ${state.event.year}</span><h2>${esc(state.event.name)}</h2><p>Uma nova perspectiva para avaliar o potencial científico.</p></div><div class="edition-status">${icon('shield')}<div><strong>${state.event.reviews_open?'Etapa de avaliação aberta':'Etapa de avaliação encerrada'}</strong><small>Identidade protegida nas avaliações anônimas</small></div></div></div><div class="metrics-grid">${metricCard('Propostas recebidas',m.submitted_projects,`${m.total_projects} propostas no total`,'file')}${metricCard('Avaliações concluídas',m.completed,`${m.pending} avaliações pendentes`,'check','green')}${metricCard('Avaliadores ativos',m.total_reviewers,'Olhares diferentes, critérios comuns','people','purple')}${metricCard('Média geral',fmt(m.mean),'Pontuação normalizada · de 0 a 100','chart','pink')}</div><div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h2>Progresso da avaliação</h2><p>Das atribuições até a conclusão</p></div><span class="tag">${fmt(m.progress)}%</span></div><div class="progress-summary"><strong>${m.completed}<span> / ${m.completed+m.pending}</span></strong><span>avaliações concluídas</span></div><progress value="${m.progress}" max="100" aria-label="Progresso das avaliações">${m.progress}%</progress><div class="progress-legend"><span><i class="dot green"></i> Concluídas <strong>${m.completed}</strong></span><span><i class="dot purple"></i> Pendentes <strong>${m.pending}</strong></span></div><div class="subtle-note">${icon('clock')} Cada avaliação contribui para a análise da edição.</div></section><section class="panel"><div class="panel-heading"><div><h2>Distribuição das notas</h2><p>Como as propostas foram avaliadas</p></div>${icon('chart')}</div>${verticalChart(m.distribution)}</section><section class="panel"><div class="panel-heading"><div><h2>Propostas por área</h2><p>A diversidade das perguntas científicas</p></div><a href="#/projects">Ver projetos ${icon('arrow')}</a></div>${barChart(m.areas)}</section><section class="panel"><div class="panel-heading"><div><h2>Propostas em destaque</h2><p>Maiores médias entre avaliações concluídas</p></div><a href="#/results">Ver resultados ${icon('arrow')}</a></div>${m.ranking.length?m.ranking.slice(0,4).map((p,i)=>`<div class="rank-row"><span class="rank-number">${String(i+1).padStart(2,'0')}</span><div><small>${esc(p.code)}</small><strong>${esc(p.title)}</strong></div><b>${fmt(p.mean)}<small>/100</small></b></div>`).join(''):empty('Ainda não há notas')}</section></div><div class="research-note">${icon('shield')}<div><strong>Uma ferramenta para investigar, com responsabilidade.</strong><p>As diferenças entre condições serão analisadas experimentalmente. Nenhuma diferença isolada comprova preconceito ou discriminação.</p></div><a href="#/comparisons">Explorar comparações ${icon('arrow')}</a></div>`;
}
function projectCards(projects) {
  if(!projects.length)return empty('Sua próxima ideia começa aqui.','Crie uma proposta e salve como rascunho antes de enviar.','<a class="button primary" href="#/projects/new">Criar primeira proposta</a>');
  const targets={portfolio:'Portfólio',gallery:'Galeria',showcase:'Vitrine'};
  return `<div class="project-grid">${projects.map(p=>`<a class="panel project-card" href="#/projects/${p.id}"><div class="card-top"><span class="code">${esc(p.anonymous_code||'RASCUNHO')}</span>${badge(p.status)}</div><div class="project-area">${scientificAreaIcon(p.scientific_area)}<span class="area-label">${esc(p.scientific_area)}</span></div><h2>${esc(p.title)}</h2><p>${esc(p.objective||'Continue escrevendo sua proposta.')}</p>
    <p class="card-publication">${p.published
      ? `<span class="badge reviewed">${icon('eye')} Publicado · ${Object.entries(p.publication_prefs||{}).filter(([,on])=>on).map(([k])=>targets[k]).join(' · ')}</span>`
      : `<span class="badge pending">Não publicado</span>`}</p>
    <div class="card-footer"><span>${p.status==='draft'?'Continuar proposta':'Acompanhar proposta'}</span>${icon('arrow')}</div></a>`).join('')}</div>`;
}
function projectsTable(rows) {
  return rows.length?`<div class="table-scroll"><table><thead><tr><th scope="col">Código / proposta</th><th scope="col">Área científica</th><th scope="col">Status</th><th scope="col">Anonimização</th><th scope="col"><span class="sr-only">Abrir</span></th></tr></thead><tbody>${rows.map(p=>`<tr><td><a href="#/projects/${p.id}"><span class="code">${esc(p.anonymous_code||'Rascunho')}</span><strong class="table-title">${esc(p.title)}</strong></a></td><td>${esc(p.scientific_area)}</td><td>${badge(p.status)}</td><td>${p.anonymization_approved?'Revisada':'Aguardando revisão'}</td><td><a class="icon-link" href="#/projects/${p.id}" aria-label="Abrir ${esc(p.anonymous_code||p.title)}">${icon('arrow')}</a></td></tr>`).join('')}</tbody></table></div>`:empty('Nenhuma proposta encontrada.');
}
let searchableProjects=[];
async function projectsPage() {
  const projects=await api('/projects');
  searchableProjects=projects;
  if(state.user.role==='participant') return `${heading('ESPAÇO DO PARTICIPANTE','Suas ideias, novos caminhos.','Crie uma proposta, acompanhe a avaliação e descubra seu resultado.',`<a class="button primary" href="#/projects/new">${icon('plus')} Nova proposta</a>`)}${demoBanner()}${welcome()}${participantConsent()}
    <nav class="quick-links" aria-label="Atalhos do participante">
      <a href="#/privacy">${icon('shield')}<span><strong>Preferências de identificação</strong><small>Escolha como aparece publicamente</small></span>${icon('arrow')}</a>
      <a href="#/privacy">${icon('eye')}<span><strong>Destinos de publicação</strong><small>Portfólio, galeria e vitrine</small></span>${icon('arrow')}</a>
      <a href="#/gallery">${icon('file')}<span><strong>Galeria pública</strong><small>Confira como os trabalhos são exibidos</small></span>${icon('arrow')}</a>
    </nav>
    <div class="info-note">${icon('shield')} Não inclua nomes, escola, turma, contatos ou assinaturas no conteúdo científico.</div>${projectCards(projects)}`;
  return `${heading('GESTÃO DE PROPOSTAS','Projetos','Revise a anonimização e acompanhe cada etapa do processo.')}<section class="panel"><div class="toolbar"><label class="search-label">Buscar proposta<input id="project-search" type="search" placeholder="Código, título ou área científica"></label><span class="muted">${projects.length} propostas</span></div><div id="project-table">${projectsTable(projects)}</div></section>`;
}
function scientificInput(key,content={},prefix='') {
  return `<label class="${['title','scientific_area'].includes(key)?'':'span-two'}">${fields[key]} <small class="field-requirement">${coreFields.includes(key)?(['title','scientific_area'].includes(key)?'Obrigatório no rascunho':'Obrigatório para envio'):'Opcional'}</small>${fieldHelp[key]?`<small>${fieldHelp[key]}</small>`:''}${['title','scientific_area','keywords'].includes(key)?`<input name="${prefix+key}" value="${esc(content?.[key])}" maxlength="${fieldLimits[key]}" ${['title','scientific_area'].includes(key)?'required minlength="3"':''} ${key==='scientific_area'?'list="areas"':''}>`:`<textarea name="${prefix+key}" rows="${key==='methodology'?10:6}" maxlength="${fieldLimits[key]}">${esc(content?.[key])}</textarea>`}<small class="field-limit">Até ${fieldLimits[key].toLocaleString('pt-BR')} caracteres.</small></label>`;
}
const scientificAreas = () => '<datalist id="areas"><option>Engenharias</option><option>Ciências ambientais</option><option>Ciências da saúde</option><option>Ciências agrárias</option><option>Ciências humanas</option><option>Química</option><option>Física</option></datalist>';
function scientificInputs(content={},prefix='') {
  const input=key=>scientificInput(key,content,prefix);
  const extra=Object.keys(fields).filter(key=>!coreFields.includes(key));
  return `<div class="span-two proposal-form-intro"><h2>Informações principais</h2><p>Para salvar um rascunho, preencha título e área. Para enviar, complete os oito campos principais com pelo menos 3 caracteres. Os campos complementares são opcionais.</p></div>${coreFields.map(input).join('')}<details class="span-two proposal-extras" ${extra.some(key=>content?.[key])?'open':''}><summary>Informações complementares <span class="muted">· 10 campos opcionais</span></summary><p>Acrescente o que fizer sentido para a etapa e o tipo de pesquisa.</p><div class="form-grid">${extra.map(input).join('')}</div></details>${scientificAreas()}`;
}
const projectSteps = [...coreFields,...Object.keys(fields).filter(key=>!coreFields.includes(key))];
function projectForm(project) {
  return `<div class="form-page">${heading('CONTEÚDO CIENTÍFICO',project?'Continue sua proposta.':'Toda ideia começa aqui.','Uma informação por vez. Revise tudo antes de salvar.')}<div class="info-note">${icon('shield')} Escreva apenas sobre a ideia: não inclua seu nome, e-mail, escola, turma ou identificadores.</div><form id="project-form" class="panel project-wizard" data-id="${project?.id||''}" novalidate><div class="wizard-progress"><div><span id="wizard-count" role="status" aria-live="polite">Etapa 1 de ${projectSteps.length+1}</span><span>Seu projeto, passo a passo</span></div><progress id="wizard-progress" value="1" max="${projectSteps.length+1}" aria-labelledby="wizard-count">1 de ${projectSteps.length+1}</progress></div><div class="wizard-stage">${projectSteps.map((key,index)=>`<section class="wizard-step" data-wizard-step="${index}" ${index?'hidden':''} aria-labelledby="wizard-title-${index}"><span class="eyebrow">${coreFields.includes(key)?'A IDEIA CENTRAL':'INFORMAÇÕES COMPLEMENTARES'}</span><h2 id="wizard-title-${index}" tabindex="-1">${fields[key]}</h2>${key==='scientific_area'?scientificAreaSelector(project?.scientific_area):scientificInput(key,project)}${coreFields.includes(key)&&!['title','scientific_area'].includes(key)?'<p class="wizard-hint">Você pode completar este campo depois, no rascunho. Para enviar à avaliação, serão necessários pelo menos 3 caracteres.</p>':!coreFields.includes(key)?'<p class="wizard-hint">Este campo é opcional. Avance sem preencher se não se aplicar à sua pesquisa.</p>':''}<p class="wizard-validation" id="wizard-error-${index}" role="alert"></p></section>`).join('')}<section class="wizard-step" data-wizard-step="${projectSteps.length}" hidden aria-labelledby="wizard-review-title"><span class="eyebrow">QUASE PRONTO</span><h2 id="wizard-review-title" tabindex="-1">Revise seu projeto</h2><p class="wizard-hint">Confira suas respostas. O projeto será salvo como rascunho; o envio para avaliação acontece na próxima tela.</p><dl class="wizard-review"></dl></section></div>${scientificAreas()}<p class="form-error" role="alert"></p><div class="wizard-actions"><button class="button" type="button" data-wizard-back hidden>← Voltar</button><button class="button primary" type="submit" data-wizard-next>Avançar →</button><button class="button primary" type="submit" data-wizard-finish hidden>${project?'Salvar alterações':'Cadastrar projeto'} ${icon('check')}</button></div><p class="wizard-save-note">Suas respostas são mantidas ao avançar e voltar. Elas só serão salvas no banco após a confirmação final.</p></form>${project?.id?publicationSection(project):''}</div>`;
}
function bindProjectWizard() {
  const form=/** @type {HTMLFormElement} */($('#project-form'));if(!form)return;
  const steps=[...form.querySelectorAll('[data-wizard-step]')],last=steps.length-1;
  const values=Object.fromEntries(projectSteps.map(key=>[key,(/** @type {HTMLInputElement|HTMLTextAreaElement} */(form.elements.namedItem(key))).value]));
  const back=/** @type {HTMLButtonElement} */($('[data-wizard-back]',form)),next=$('[data-wizard-next]',form),finish=$('[data-wizard-finish]',form);
  const areaInput=/** @type {HTMLInputElement} */(form.elements.namedItem('scientific_area'));
  const updateAreaSelection=()=>form.querySelectorAll('[data-select-area]').forEach(button=>button.setAttribute('aria-pressed',String(normalizeArea(button.getAttribute('data-select-area'))===normalizeArea(areaInput.value))));
  form.querySelectorAll('[data-select-area]').forEach(button=>button.addEventListener('click',()=>{
    areaInput.value=button.getAttribute('data-select-area');areaInput.dispatchEvent(new Event('input',{bubbles:true}));
  }));
  areaInput.addEventListener('input',updateAreaSelection);
  let current=0,moving=false;
  form.dataset.step='0';
  const validate=index=>{
    const key=projectSteps[index];if(!key)return true;
    const control=/** @type {HTMLInputElement|HTMLTextAreaElement} */(form.elements.namedItem(key));
    const message=control.value.length>fieldLimits[key]?`Use até ${fieldLimits[key]} caracteres.`:['title','scientific_area'].includes(key)&&control.value.trim().length<3?'Preencha este campo com pelo menos 3 caracteres.':'';
    control.setCustomValidity(message);
    const error=$(`#wizard-error-${index}`,form);error.textContent=message;
    if(message){control.setAttribute('aria-invalid','true');control.setAttribute('aria-describedby',error.id);control.focus();return false;}
    control.removeAttribute('aria-invalid');control.removeAttribute('aria-describedby');return true;
  };
  const review=()=>{
    $('.wizard-review',form).innerHTML=projectSteps.map((key,index)=>`<div><dt>${fields[key]}<button class="button small" type="button" data-wizard-edit="${index}" aria-label="Corrigir ${fields[key]}">Corrigir</button></dt><dd>${esc(values[key].trim()||'Não preenchido.')}</dd></div>`).join('');
  };
  const move=async target=>{
    if(moving||form.dataset.busy||target<0||target>last||target===current)return;
    moving=true;const direction=target>current?1:-1;
    back.disabled=true;next.setAttribute('disabled','');finish.setAttribute('disabled','');
    const animate=async(element,enter)=>{
      if(reducedMotion())return;
      await element.animate(enter?[{opacity:0,transform:`translateX(${direction*12}px)`},{opacity:1,transform:'translateX(0)'}]:[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-direction*12}px)`}],{duration:140,easing:'ease-in-out'}).finished;
    };
    try {
      await animate(steps[current],false);if(!form.isConnected)return;
      (/** @type {HTMLElement} */(steps[current])).hidden=true;current=target;form.dataset.step=String(current);
      if(current===last)review();
      (/** @type {HTMLElement} */(steps[current])).hidden=false;
      $('#wizard-count',form).textContent=`Etapa ${current+1} de ${steps.length}`;
      (/** @type {HTMLProgressElement} */($('#wizard-progress',form))).value=current+1;
      back.hidden=current===0;next.hidden=current===last;finish.hidden=current!==last;
      next.textContent=current===last-1?'Revisar projeto →':'Avançar →';
      await animate(steps[current],true);if(!form.isConnected)return;
      const focus=steps[current].querySelector('[data-select-area][aria-pressed="true"]')||steps[current].querySelector('[data-select-area]')||steps[current].querySelector('input,textarea')||steps[current].querySelector('h2');(/** @type {HTMLElement} */(focus)).focus({preventScroll:true});
      if(steps[current].getBoundingClientRect().top<0)steps[current].scrollIntoView({block:'start',behavior:'instant'});
    } finally {moving=false;back.disabled=false;next.removeAttribute('disabled');finish.removeAttribute('disabled');}
  };
  form.addEventListener('input',event=>{
    const control=/** @type {HTMLInputElement|HTMLTextAreaElement} */(event.target);
    if(!projectSteps.includes(control.name))return;values[control.name]=control.value;
    if(control.getAttribute('aria-invalid')==='true')validate(projectSteps.indexOf(control.name));
  });
  back.addEventListener('click',()=>move(current-1));
  $('.wizard-review',form).addEventListener('click',event=>{
    const button=(/** @type {HTMLElement} */(event.target)).closest('[data-wizard-edit]');if(button)move(Number(button.getAttribute('data-wizard-edit')));
  });
  form.addEventListener('submit',event=>{
    if(moving||form.dataset.busy||form.dataset.saved){event.preventDefault();event.stopImmediatePropagation();return;}
    if(current!==last){event.preventDefault();event.stopImmediatePropagation();if(validate(current))move(current+1);return;}
    const invalid=projectSteps.findIndex((_,index)=>!validate(index));
    if(invalid!==-1){event.preventDefault();event.stopImmediatePropagation();move(invalid);}
  },true);
}
async function projectDetail(projectId) {
  const p=await api(`/projects/${projectId}`),organizer=state.user.role==='organizer';
  let results='';
  if(p.status==='results_available'||(organizer&&['reviewed','archived'].includes(p.status))) {
    const r=await api(`/projects/${p.id}/results`);
    results=`<section class="panel result-panel"><span class="eyebrow">RESULTADO DA PROPOSTA</span><h2>Média ${fmt(r.mean)} <span class="muted">/ 100</span></h2>${demoBanner()}${r.bonus_total?`<div class="info-note">${icon('shield')} <span>Pontuação adicional concedida: <strong>${fmt(r.bonus_total)}</strong> ponto${r.bonus_total===1?'':'s'}. A média acima considera apenas a rubrica, para manter a comparação científica possível.</span></div>`:''}${r.reviews.map((review,i)=>`<h3>Avaliação ${i+1} · ${fmt(review.total_score)} pontos ponderados${review.bonus_points?` · nota final ${fmt(review.final_score)}`:''}</h3>${barChart(review.scores.map(s=>({name:s.name,score:s.score})),'score')}${review.bonus_points?`<div class="bonus-result"><strong>Pontuação adicional · ${fmt(review.bonus_points)}</strong>${review.bonus_criterion?`<p class="muted">Critério considerado: ${esc(review.bonus_criterion)}</p>`:''}${review.bonus_justification?`<p>${esc(review.bonus_justification)}</p>`:'<p class="muted">Justificativa não liberada pela organização.</p>'}</div>`:''}<p>${esc(review.general_comment||'Comentários não liberados pela organização.')}</p>`).join('')}</section>`;
  }
  return `${heading(p.anonymous_code||'RASCUNHO',p.title,p.scientific_area,`${badge(p.status)}`)}<div class="project-actions">${!organizer&&p.status==='draft'?`<a class="button" href="#/projects/${p.id}/edit">Editar rascunho</a><button class="button primary" data-submit-project="${p.id}">Enviar proposta ${icon('arrow')}</button>`:''}${organizer&&p.status==='submitted'?`<button class="button" data-reopen="${p.id}">Reabrir para edição</button>`:''}${organizer&&['submitted','reviewed','results_available'].includes(p.status)?`<button class="button" data-archive="${p.id}">Arquivar</button>`:''}</div><div class="detail-layout"><article class="panel proposal-content"><div class="panel-heading"><h2>Proposta científica</h2>${icon('file')}</div>${Object.entries(fields).filter(([key])=>!['title','scientific_area'].includes(key)&&(coreFields.includes(key)||p[key])).map(([key,label])=>`<section><h3>${label}</h3><p>${esc(p[key]||'Ainda não preenchido.')}</p></section>`).join('')}</article><aside><section class="panel"><h2>Acompanhe a proposta</h2><div class="timeline">${[['Rascunho','draft'],['Proposta enviada','submitted'],['Distribuição','assigned'],['Avaliação científica','under_review'],['Avaliação concluída','reviewed'],['Resultado liberado','results_available']].map(([label,s])=>`<div class="timeline-step ${p.status===s?'current':''}"><i></i><span>${label}${p.status===s?' <small>Você está aqui</small>':''}</span></div>`).join('')}</div><p class="muted">${p.progress.completed} de ${p.progress.total} avaliações concluídas</p><p class="muted">Criado em ${date(p.created_at+'Z')}</p></section>${organizer?`<section class="panel"><h2>Autoria</h2>${p.author?`<p><strong>${esc(p.author.name)}</strong></p><p>${esc(p.author.school_or_class)}</p>`:'<p>A autoria desta proposta está protegida. A associação só será disponibilizada após a liberação da edição.</p>'}</section>`:''}</aside></div>${organizer&&p.status==='submitted'?`<section class="panel form-page-wide"><div class="panel-heading"><div><h2>Revisão de anonimização</h2><p>Esta versão será enviada à API do avaliador. Remova nomes, instituições, links e pistas de autoria de todos os campos.</p></div>${badge(p.anonymization_approved?'reviewed':'pending')}</div><form id="anonymize-form" data-id="${p.id}" data-code="${esc(p.anonymous_code)}"><div class="form-grid">${scientificInputs(p.sanitized_content||p)}</div><label class="check-label"><input type="checkbox" name="approved" required><span>Revisei todos os campos e removi informações que possam identificar a autoria, inclusive indiretamente.</span></label><p class="form-error" role="alert"></p><button class="button primary">Aprovar versão científica ${icon('shield')}</button></form></section>`:''}${results}${publicationSection(p)}`;
}
async function reviewersPage(participants=false) {
  const users=(await api('/users')).filter(u=>u.role===(participants?'participant':'reviewer'));
  return `${heading('PESSOAS DA EDIÇÃO',participants?'Participantes':'Avaliadores',participants?'Dados de cadastro com acesso restrito à organização.':'Gerencie quem contribui com a avaliação científica.')}<section class="panel">${users.length?`<div class="table-scroll"><table><thead><tr><th scope="col">Nome</th><th scope="col">E-mail</th><th scope="col">${participants?'Condição identificada':'Situação'}</th><th scope="col">${participants?'Escola / turma':'Ação'}</th></tr></thead><tbody>${users.map(u=>`<tr><td><strong>${esc(u.name)}</strong></td><td>${esc(u.email)}</td><td>${participants?(u.consent?'Consentimento registrado':'Sem consentimento'):(u.active?'Ativo':'Inativo')}</td><td>${participants?esc(u.school_or_class||'Não informada'):`<button class="button small" data-toggle-reviewer="${u.id}" data-active="${!u.active}">${u.active?'Desativar':'Ativar'}</button>`}</td></tr>`).join('')}</tbody></table></div>`:empty('Nenhum cadastro encontrado.')}</section>${!participants?`<section class="panel narrow-panel"><h2>Cadastrar avaliador</h2><form id="reviewer-form"><label>Nome<input name="name" required minlength="3" maxlength="100"></label><label>E-mail<input name="email" type="email" required></label><label>Senha inicial<input name="password" type="password" required minlength="10" maxlength="128" autocomplete="new-password"></label><p class="form-error" role="alert"></p><button class="button primary">Cadastrar avaliador</button></form></section>`:''}`;
}
async function assignmentsPage() {
  const [projects,users,assignments]=await Promise.all([api('/projects'),api('/users'),api('/assignments')]);
  const eligible=projects.filter(p=>p.anonymization_approved&&['submitted','assigned','under_review','reviewed'].includes(p.status));
  return `${heading('DISTRIBUIÇÃO','Conecte ideias a novos olhares.','Cada avaliador recebe apenas a versão científica revisada.')}<div class="info-note">${icon('shield')} Um avaliador só pode receber cada proposta uma vez. Use avaliadores diferentes entre as condições.</div><section class="panel"><h2>Nova atribuição</h2>${eligible.length?`<form id="assignment-form" class="assignment-form"><label>Proposta revisada<select name="project_id" required>${eligible.map(p=>`<option value="${p.id}">${esc(p.anonymous_code)} · ${esc(p.title)}</option>`).join('')}</select></label><label>Avaliador<select name="reviewer_user_id" required>${users.filter(u=>u.role==='reviewer'&&u.active).map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></label><label>Condição<select name="review_mode"><option value="anonymous">Anônima</option>${state.event.identified_enabled?'<option value="identified">Identificada · exige consentimento</option>':''}</select></label><button class="button primary">Atribuir ${icon('arrow')}</button><p class="form-error span-two" role="alert"></p></form>`:empty('Nenhuma proposta pronta para atribuição.','Abra um projeto enviado, revise e aprove sua versão científica.')}<a href="#/projects">Revisar projetos ${icon('arrow')}</a></section><section class="panel"><div class="panel-heading"><h2>Avaliações atribuídas</h2><span class="tag">${assignments.length} atribuições</span></div>${assignments.length?`<div class="table-scroll"><table><thead><tr><th scope="col">Proposta</th><th scope="col">Avaliador</th><th scope="col">Condição</th><th scope="col">Status</th></tr></thead><tbody>${assignments.map(a=>`<tr><td class="code">${esc(a.anonymous_code)}</td><td>${esc(a.reviewer_name)}</td><td>${mode(a.review_mode)}</td><td>${badge(a.status)}</td></tr>`).join('')}</tbody></table></div>`:empty('Nenhuma atribuição criada.')}</section>`;
}
async function reviewerDashboard(history=false) {
  const assignments=await api('/assignments'),rows=assignments.filter(a=>history?a.status==='completed':a.status!=='completed');
  return `${heading('ESPAÇO DO AVALIADOR',history?'Seu histórico de avaliações.':'Um olhar atento faz a diferença.',history?'Consulte as notas das avaliações que você finalizou.':'Explore as propostas e avalie cada ideia pelos critérios científicos.')} ${demoBanner()}${history?'':welcome()}
  <nav class="quick-links" aria-label="Atalhos do avaliador">
    <a href="#/profile">${icon('people')}<span><strong>Perfil acadêmico e privacidade</strong><small>Formação, áreas e identidade pública</small></span>${icon('arrow')}</a>
    <a href="#/reviewers-public">${icon('eye')}<span><strong>Perfis públicos do avaliador</strong><small>Veja o que o público enxerga</small></span>${icon('arrow')}</a>
    <a href="#/history">${icon('clock')}<span><strong>Histórico</strong><small>Suas avaliações concluídas</small></span>${icon('arrow')}</a>
  </nav>
  <div class="metrics-grid three">${metricCard('Atribuídas',assignments.length,'Propostas sob sua avaliação','file')}${metricCard('Em andamento',assignments.filter(a=>a.status==='in_progress').length,'Rascunhos salvos','clock','purple')}${metricCard('Concluídas',assignments.filter(a=>a.status==='completed').length,'Contribuições para a pesquisa','check','green')}</div>${rows.length?`<div class="project-grid">${rows.map(a=>`<a class="panel project-card" href="#/reviews/${a.id}"><div class="card-top"><span class="code">${esc(a.project.anonymous_code)}</span>${badge(a.status)}</div><div class="project-area">${scientificAreaIcon(a.project.scientific_area)}<div class="area-label">${mode(a.review_mode)} · ${esc(a.project.scientific_area)}</div></div><h2>${esc(a.project.title)}</h2><p>${a.review_mode==='anonymous'?'Avaliação anônima ativa':`Condição identificada · ${esc(a.author?.name)}`}</p><div class="card-footer"><span>${history?`Nota: ${fmt(a.review?.total_score)}`:'Abrir proposta'}</span>${icon('arrow')}</div></a>`).join('')}</div>`:empty(history?'Você ainda não concluiu avaliações.':'Tudo em dia por aqui.','As propostas atribuídas aparecerão neste espaço.')}`;
}
async function reviewPage(assignmentId) {
  let a=await api(`/assignments/${assignmentId}`);
  if(!a.review&&state.event.reviews_open) a=await api(`/assignments/${assignmentId}/start`,'POST',{});
  const rubric=await api('/rubric'),done=a.status==='completed',closed=done||!state.event.reviews_open,p=a.project;
  return `${heading(p.anonymous_code,p.title,p.scientific_area,badge(a.status))}${demoBanner()}<div class="${a.review_mode==='anonymous'?'anonymous-banner':'info-note'}">${a.review_mode==='anonymous'?scientistOwl('badge','fisica'):icon('eye')}<div><strong>${a.review_mode==='anonymous'?'Avaliação anônima ativa':'Condição experimental identificada'}</strong><p>${a.review_mode==='anonymous'?'A identidade do autor não é disponibilizada nesta avaliação.':`Autoria autorizada: ${esc(a.author.name)} · ${esc(a.author.school_or_class||'Escola não informada')}`}</p></div></div>${done?'<div class="success-note" role="status">Avaliação finalizada e armazenada. Obrigado por contribuir com a pesquisa.</div>':''}<div class="review-layout"><article class="panel proposal-content"><h2>Leia a proposta</h2>${Object.entries(fields).filter(([key])=>!['title','scientific_area'].includes(key)&&(coreFields.includes(key)||p[key])).map(([key,label])=>`<section><h3>${label}</h3><p>${esc(p[key]||'Ainda não preenchido.')}</p></section>`).join('')}</article><section class="panel rubric-panel"><div class="panel-heading"><div><span class="eyebrow">CRITÉRIOS CIENTÍFICOS</span><h2>Rubrica de avaliação</h2></div>${icon('check')}</div><form id="review-form" data-id="${a.id}"><fieldset ${closed?'disabled':''}><legend class="sr-only">Notas e comentários</legend>${rubric.map(c=>{const score=a.review?.scores.find(s=>s.criterion_id===c.id);return `<div class="criterion"><div><h3>${esc(c.name)}</h3><p>${esc(c.description)}</p></div><label class="score-label">Nota <span>(${c.min_score}–${c.max_score}, peso ${c.weight})</span><input class="score-input" type="number" name="score_${c.id}" min="${c.min_score}" max="${c.max_score}" step="0.1" value="${score?.score??''}" data-weight="${c.weight}" aria-label="Nota de ${esc(c.name)}"></label><label class="criterion-comment">Comentário <span class="muted">(opcional)</span><input name="comment_${c.id}" value="${esc(score?.comment||'')}" maxlength="2000"></label></div>`;}).join('')}<label>Comentário geral<textarea name="general_comment" rows="3" maxlength="4000">${esc(a.review?.general_comment||'')}</textarea></label>
<fieldset class="bonus-section" ${closed?'disabled':''}>
  <legend class="sr-only">Pontuação adicional</legend>
  <div class="panel-heading"><div><span class="eyebrow">PONTUAÇÃO ADICIONAL</span><h2>Mérito fora da rubrica</h2><p>${a.bonus_policy.enabled?`Opcional. Até ${fmt(a.bonus_policy.max)} ponto${a.bonus_policy.max===1?'':'s'}. A nota da rubrica não é alterada.`:'Desativado nesta edição.'}</p></div></div>
  <label class="inline-field">Pontos<input type="number" name="bonus_points" id="bonus-points" min="0" max="${a.bonus_policy.max}" step="0.1" value="${a.review?.bonus_points||''}" ${a.bonus_policy.enabled?'':'disabled'}></label>
  <label>Justificativa <span class="muted">(obrigatória se houver pontos)</span><textarea name="bonus_justification" id="bonus-justification" rows="3" maxlength="2000" placeholder="Fundamente o mérito científico que não cabe nos seis critérios.">${esc(a.review?.bonus_justification||'')}</textarea></label>
  <label>Critério ou mérito considerado <span class="muted">(opcional)</span><input name="bonus_criterion" maxlength="200" value="${esc(a.review?.bonus_criterion||'')}" placeholder="Ex.: replicabilidade do método"></label>
</fieldset>
</fieldset><div class="review-total"><span>Pontuação total ponderada</span><strong id="score-total">${fmt(a.review?.total_score||0)}</strong></div>${a.review?`<small class="muted">Início: ${date(a.review.started_at)}${done?` · Fim: ${date(a.review.submitted_at)}`:''}</small>`:''}<p class="form-error" role="alert"></p>${!closed?'<div class="review-buttons"><button type="submit" class="button" name="action" value="draft">Salvar rascunho</button><button type="submit" class="button primary" name="action" value="final">Revisar e finalizar</button></div>':`<p class="muted">${done?'Esta avaliação não pode ser alterada.':'A etapa de avaliação está fechada.'}</p>`}</form></section></div>`;
}
async function resultsPage(comparisons=false) {
  const m=await api('/metrics');
  return `${heading('ANÁLISE CIENTÍFICA',comparisons?'Diferentes condições. Novas perguntas.':'Resultados da edição.',comparisons?'Compare os dados agregados das avaliações anônimas e identificadas.':'Métricas calculadas a partir das avaliações finalizadas no banco de dados.')} ${demoBanner()}${comparisons?`<div class="info-note">${icon('shield')} Comparações descritivas. Uma diferença isolada não comprova preconceito ou discriminação. Grupos podem ter propostas e avaliadores distintos.</div><div class="metrics-grid three">${metricCard('Média · anônima',fmt(m.anonymous.mean),`${m.anonymous.count} avaliações · escala 0–100`,'shield')}${metricCard('Média · identificada',fmt(m.identified.mean),`${m.identified.count} avaliações · escala 0–100`,'eye','purple')}${metricCard('Diferença média',fmt(m.difference),'Identificada menos anônima · pontos','chart','pink')}</div><section class="panel"><h2>Condições experimentais</h2><div class="table-scroll"><table><thead><tr><th scope="col">Condição</th><th scope="col">Avaliações</th><th scope="col">Avaliadores</th><th scope="col">Média</th><th scope="col">Mediana</th><th scope="col">Tempo médio</th></tr></thead><tbody>${['anonymous','identified'].map(key=>{const s=m[key];return `<tr><td>${mode(key)}</td><td>${s.count}</td><td>${s.reviewers}</td><td>${fmt(s.mean)}</td><td>${fmt(s.median)}</td><td>${fmt(s.average_seconds)} s</td></tr>`;}).join('')}</tbody></table></div></section><div class="dashboard-grid">${['anonymous','identified'].map(key=>`<section class="panel"><h2>Distribuição · ${mode(key).toLowerCase()}</h2>${verticalChart(m[key].distribution)}</section><section class="panel"><h2>Por critério · ${mode(key).toLowerCase()}</h2>${barChart(m[key].criteria,'mean')}</section>`).join('')}</div>`:`<div class="metrics-grid three">${metricCard('Média geral',fmt(m.mean),'Escala normalizada · 0 a 100','chart')}${metricCard('Mediana',fmt(m.median),'Centro da distribuição de notas','chart','purple')}${metricCard('Tempo médio',`${fmt(m.average_seconds)} s`,'Inclui pausas entre início e finalização','clock','green')}</div><div class="dashboard-grid"><section class="panel"><h2>Distribuição das notas</h2>${verticalChart(m.distribution)}</section><section class="panel"><h2>Média por critério</h2>${barChart(m.criteria,'mean')}</section></div><section class="panel"><div class="panel-heading"><h2>Propostas avaliadas</h2><span class="tag">${m.ranking.length} propostas</span></div>${m.ranking.length?`<div class="table-scroll"><table><thead><tr><th scope="col">Código</th><th scope="col">Proposta</th><th scope="col">Média / 100</th></tr></thead><tbody>${m.ranking.map(p=>`<tr><td class="code">${esc(p.code)}</td><td>${esc(p.title)}</td><td><strong>${fmt(p.mean)}</strong></td></tr>`).join('')}</tbody></table></div>`:empty('Nenhuma avaliação finalizada.')}</section>`}`;
}
async function rubricPage() {
  const [criteria,assignments]=await Promise.all([api('/rubric'),api('/assignments')]);
  const locked=assignments.length>0;
  return `<div class="form-page-wide">${heading('CRITÉRIOS DE AVALIAÇÃO','Uma régua comum para todas as ideias.','Configure critérios, intervalos e pesos antes da primeira atribuição.')}<div class="info-note">${icon('shield')} ${locked?'Esta rubrica está bloqueada porque há avaliações atribuídas. Crie outra edição para usar novos critérios.':'Total = soma de nota × peso. A pontuação normalizada usa os limites ponderados de todos os critérios.'}</div><form class="panel" id="rubric-config"><fieldset ${locked?'disabled':''}><legend class="sr-only">Configuração da rubrica</legend><div id="criteria-rows">${criteria.map(c=>criterionConfig(c)).join('')}</div><button class="button" type="button" id="add-criterion">${icon('plus')} Adicionar critério</button></fieldset><p class="form-error" role="alert"></p>${!locked?'<button class="button primary" type="submit">Salvar rubrica</button>':''}</form></div>`;
}
function criterionConfig(c={}) {
  return `<div class="criterion-config"><label>Nome<input name="name" required minlength="2" maxlength="80" value="${esc(c.name)}"></label><label>Descrição<input name="description" maxlength="500" value="${esc(c.description)}"></label><label>Mínimo<input type="number" name="min_score" min="0" max="100" step="0.1" required value="${c.min_score??0}"></label><label>Máximo<input type="number" name="max_score" min="0" max="100" step="0.1" required value="${c.max_score??10}"></label><label>Peso<input type="number" name="weight" min="0.01" max="100" step="0.01" required value="${c.weight??1}"></label><button type="button" class="button remove-criterion" aria-label="Remover critério">Remover</button></div>`;
}
function settingsPage() {
  const e=state.event;
  const check=(name,label,description)=>`<label class="setting-switch"><div><strong>${label}</strong><small>${description}</small></div><input type="checkbox" name="${name}" ${e[name]?'checked':''}></label>`;
  return `<div class="form-page">${heading('ORGANIZAÇÃO','Sua edição, suas etapas.','Controle as submissões, a avaliação e a liberação de resultados.')}<section class="panel"><form id="event-form"><label>Nome da edição<input name="name" value="${esc(e.name)}" required minlength="3" maxlength="150"></label>${check('submissions_open','Submissões abertas','Permite criar, editar rascunhos e enviar propostas.')}${check('reviews_open','Avaliações abertas','Permite iniciar, salvar e finalizar avaliações.')}${check('results_released','Liberar resultados','Exige etapas fechadas e todas as atribuições concluídas.')}${check('comments_released','Liberar comentários aos participantes','Exibe os comentários gerais nas avaliações liberadas.')}${check('reveal_identity','Revelar autoria para a organização','Associa autores às propostas somente no painel do organizador, após o encerramento.')}${check('identified_enabled','Habilitar condição experimental identificada','Exige protocolo registrado e consentimento do participante.')}<label>Protocolo experimental<textarea name="protocol" rows="4" maxlength="4000">${esc(e.protocol)}</textarea></label><p class="muted">Apresente este protocolo aos participantes antes de obter o consentimento. A condição anônima mantém a identidade protegida em todas as etapas.</p>
        <fieldset class="bonus-policy"><legend class="sr-only">Pontuação adicional</legend>
          <div class="panel-heading"><div><span class="eyebrow">PONTUAÇÃO ADICIONAL</span><h2>Política de pontos extras</h2>
          <p class="muted">A rubrica permanece intacta. Os pontos extras são gravados à parte, com justificativa, autor e data — e não entram na média usada nas comparações.</p></div></div>
          ${check('bonus_enabled','Permitir pontuação adicional','O avaliador poderá somar até o limite abaixo, sempre com justificativa obrigatória.')}
          <label>Limite por avaliação (pontos)<input type="number" name="bonus_max" min="0" max="20" step="0.5" value="${Number(e.bonus_max??2)}"><small>Não pode mudar depois que houver avaliações concluídas, para preservar a comparação.</small></label>
        </fieldset><p class="form-error" role="alert"></p><button class="button primary">Salvar configuração</button></form></section><section class="panel"><h2>Consultar outra edição</h2><label>Edição<select id="event-select">${state.events.map(event=>`<option value="${event.id}" ${event.id===e.id?'selected':''}>${esc(event.name)} · ${event.year}</option>`).join('')}</select></label><p class="muted">A consulta preserva os registros anteriores. Novos participantes usam a edição ativa mais recente.</p></section><section class="panel"><h2>Criar nova edição</h2><p>A nova edição se torna ativa e inicia com a rubrica padrão e sem dados demonstrativos.</p><form id="new-event-form" class="inline-form"><label>Nome<input name="name" required minlength="3" maxlength="150"></label><label>Ano<input name="year" type="number" min="2026" max="2100" value="2026" required></label><button class="button primary">Criar edição</button><p class="form-error" role="alert"></p></form></section></div>`;
}
function exportPage() {
  return `<div class="form-page">${heading('DADOS PARA A PESQUISA','Leve os dados. Preserve as pessoas.','Exporte métricas agregadas em CSV para a análise científica.')} ${demoBanner()}<section class="panel export-panel">${icon('download')}<h2>Comparação entre condições</h2><p>Inclui número de avaliações, avaliadores, média, mediana e tempo médio de cada condição. Não inclui nomes, e-mails, escolas, códigos de propostas ou identificadores individuais.</p><p class="muted">O arquivo usa separador ponto e vírgula e UTF-8 para facilitar a abertura em planilhas.</p><button class="button primary" id="export-button">${icon('download')} Baixar CSV anonimizado</button></section></div>`;
}
async function auditPage() {
  const logs=await api('/audit');
  return `${heading('RASTREABILIDADE','Auditoria da plataforma.','Últimas 200 ações registradas, com acesso exclusivo à organização.')}<section class="panel">${logs.length?`<div class="table-scroll"><table><thead><tr><th scope="col">Data</th><th scope="col">Responsável</th><th scope="col">Ação</th><th scope="col">Entidade</th><th scope="col">Identificador</th></tr></thead><tbody>${logs.map(l=>`<tr><td>${date(l.created_at+'Z')}</td><td>${esc(l.actor_name)}</td><td><code>${esc(l.action)}</code></td><td>${esc(l.entity_type)}</td><td><code>${esc(l.entity_id)}</code></td></tr>`).join('')}</tbody></table></div>`:empty('Nenhuma ação registrada ainda.')}</section>`;
}

let renderGeneration=0;
async function render() {
  const generation=++renderGeneration,path=location.hash.slice(1)||'/',parts=path.split('/').filter(Boolean);
  const loadingTimer=setTimeout(()=>{if(generation===renderGeneration){const main=$('#main');if(main){main.setAttribute('aria-busy','true');main.innerHTML=pageLoading();}}},180);
  try {
    let content;
    if(!state.user) {
      // Superfícies públicas: galeria, vitrine, portfólio e perfis de avaliadores.
      const publicPaths=['/','/login','/register','/about','/gallery','/showcase','/reviewers-public'];
      const isPortfolio=parts[0]==='portfolio'&&parts.length===2;
      if(!publicPaths.includes(path)&&!isPortfolio) {location.hash='/login';return;}
      if(path==='/gallery')content=await publicGalleryPage('gallery');
      else if(path==='/showcase')content=await publicGalleryPage('showcase');
      else if(path==='/reviewers-public')content=await publicReviewersPage();
      else if(isPortfolio)content=await portfolioPage(parts[1]);
      else content=path==='/login'?authPage(false):path==='/register'?authPage(true):path==='/about'?aboutPage():publicHome();
    } else {
      const event=await api('/event');if(generation!==renderGeneration)return;state.event=event;
      if(!state.events.length)state.events=await api('/events');
      if(generation!==renderGeneration)return;
      if(path==='/'||path==='/login'||path==='/register') {location.hash='/dashboard';return;}
      if(path==='/about') content=aboutPage();
      else if(state.user.role==='organizer') {
        if(path==='/dashboard') content=await organizerDashboard();
        else if(path==='/projects') content=await projectsPage();
        else if(parts[0]==='projects'&&parts.length===2)content=await projectDetail(parts[1]);
        else if(path==='/participants')content=await reviewersPage(true);
        else if(path==='/reviewers')content=await reviewersPage();
        else if(path==='/reviewer-requests')content=await reviewerRequestsPage();
        else if(path==='/assignments')content=await assignmentsPage();
        else if(path==='/results')content=await resultsPage();
        else if(path==='/comparisons')content=await resultsPage(true);
        else if(path==='/rubric')content=await rubricPage();
        else if(path==='/settings') {state.events=await api('/events');content=settingsPage();}
        else if(path==='/export')content=exportPage();
        else if(path==='/audit')content=await auditPage();
        else if(path==='/gallery')content=await publicGalleryPage('gallery');
        else if(path==='/showcase')content=await publicGalleryPage('showcase');
        else if(path==='/reviewers-public')content=await publicReviewersPage();
        else if(parts[0]==='portfolio'&&parts.length===2)content=await portfolioPage(parts[1]);
      } else if(state.user.role==='reviewer') {
        if(path==='/dashboard'||path==='/history')content=await reviewerDashboard(path==='/history');
        else if(path==='/profile')content=await reviewerProfilePage();
        else if(path==='/gallery')content=await publicGalleryPage('gallery');
        else if(path==='/showcase')content=await publicGalleryPage('showcase');
        else if(path==='/reviewers-public')content=await publicReviewersPage();
        else if(parts[0]==='portfolio'&&parts.length===2)content=await portfolioPage(parts[1]);
        else if(parts[0]==='reviews'&&parts.length===2)content=await reviewPage(parts[1]);
      } else {
        if(path==='/dashboard'||path==='/projects')content=await projectsPage();
        else if(path==='/privacy')content=await privacyPage();
        else if(path==='/gallery')content=await publicGalleryPage('gallery');
        else if(path==='/showcase')content=await publicGalleryPage('showcase');
        else if(path==='/reviewers-public')content=await publicReviewersPage();
        else if(parts[0]==='portfolio'&&parts.length===2)content=await portfolioPage(parts[1]);
        else if(path==='/projects/new')content=projectForm();
        else if(parts[0]==='projects'&&parts[2]==='edit') {const p=await api(`/projects/${parts[1]}`);if(p.status!=='draft')throw new Error('Esta proposta está bloqueada.');content=projectForm(p);}
        else if(parts[0]==='projects'&&parts.length===2)content=await projectDetail(parts[1]);
      }
      content||=heading('PÁGINA NÃO ENCONTRADA','Esta página não existe.','Use o menu para voltar à plataforma ou retome de onde parou.',`<a class="button primary" href="#/dashboard">Ir para o início ${icon('arrow')}</a>`);
    }
    if(generation!==renderGeneration)return;
    app.innerHTML=shell(content,path);bind(path);enhancePage();
    document.title=`BlindPitch · ${$ ('h1')?.textContent||'Primeiro a ideia'}`;
    if(document.activeElement===document.body){const h=$('h1');if(h){h.tabIndex=-1;h.focus({preventScroll:true});}}
  } catch(error) {
    if(generation!==renderGeneration)return;
    app.innerHTML=shell(`<div class="error-panel" role="alert"><h1>Não foi possível abrir esta página.</h1><p>${esc(error.message)}</p><button id="retry" class="button primary">Tentar novamente</button><a href="#/dashboard">Voltar ao início</a></div>`,path);
    $('#retry').onclick=render;$('#logout')?.addEventListener('click',logout);
  } finally {clearTimeout(loadingTimer);}
}
async function logout() {
  const button=$('#logout');
  const leave=async()=>{await api('/logout','POST',{});state.user=null;state.csrf='';state.event=null;state.eventId=storedEvent('');state.events=[];state.publicInfo=await api('/public');location.hash='/login';await render();};
  if(button)await buttonAction(button,leave,'Saindo…');
  else try{await leave();}catch(error){notify(error.message,true);}
}
const formData = form => Object.fromEntries(new FormData(form));
const scientificData = form => {const data=new FormData(form);return Object.fromEntries(Object.keys(fields).map(key=>[key,data.get(key)||'']));};
function creationKey() {
  // getRandomValues também funciona na demonstração acessada por HTTP na rede local.
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function submitHandler(selector,handler) {
  const form=$(selector);if(!form)return;
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(form.dataset.busy)return;
    form.dataset.busy='true';form.setAttribute('aria-busy','true');
    const errorBox=$('.form-error',form);if(errorBox)errorBox.textContent='';
    const buttons=[...form.querySelectorAll('button[type="submit"],button:not([type])')];
    const restores=buttons.map(button=>busyButton(button,selector==='#auth-form'?'Conectando…':selector==='#assignment-form'?'Atribuindo…':'Salvando…'));
    try {await handler(form,event);}catch(error){
      if(errorBox){errorBox.textContent=error.message;errorBox.tabIndex=-1;errorBox.focus();}
      notify(error.message,'error');
    }finally{restores.forEach(restore=>restore());delete form.dataset.busy;form.removeAttribute('aria-busy');}
  });
}
function bind(path) {
  bindProjectWizard();
  $('#logout')?.addEventListener('click',logout);
  // Menu compacto do celular. Com doze itens, a lista rolagem horizontal
  // escondia quase tudo; aqui ela abre inteira, sem tirar nenhum destino.
  const navToggle=$('#nav-toggle'),mainNav=$('#main-nav');
  if(navToggle&&mainNav) {
    const setNavOpen=open=>{navToggle.setAttribute('aria-expanded',String(open));document.body.classList.toggle('nav-open',open);};
    setNavOpen(false);
    navToggle.addEventListener('click',()=>setNavOpen(navToggle.getAttribute('aria-expanded')!=='true'));
    mainNav.addEventListener('click',event=>{
      if(!(event.target instanceof Element))return;
      if(event.target.closest('a'))setNavOpen(false);
    });
    // Escape e o clique fora fecham o menu mesmo com o foco em qualquer lugar.
    // Listener no documento, registrado uma vez: `bind()` roda a cada tela e
    // um listener por renderizacao acumularia execucoes duplicadas.
    if(!navDismissBound){
      navDismissBound=true;
      document.addEventListener('keydown',event=>{
        if(event.key!=='Escape')return;
        const toggle=document.querySelector('#nav-toggle');
        if(!toggle||toggle.getAttribute('aria-expanded')!=='true')return;
        toggle.setAttribute('aria-expanded','false');
        document.body.classList.remove('nav-open');
        if(toggle instanceof HTMLElement)toggle.focus();
      });
      document.addEventListener('click',event=>{
        const toggle=document.querySelector('#nav-toggle');
        if(!toggle||toggle.getAttribute('aria-expanded')!=='true')return;
        if(!(event.target instanceof Element))return;
        if(event.target.closest('#nav-toggle')||event.target.closest('#main-nav')||event.target.closest('.logout'))return;
        toggle.setAttribute('aria-expanded','false');
        document.body.classList.remove('nav-open');
      });
    }
  }
  $('#consent-button')?.addEventListener('click',async()=>{
    if(!await confirmAction('Você leu o protocolo e autoriza a exibição de nome e escola/turma aos avaliadores da condição identificada desta edição?'))return;
    await buttonAction($('#consent-button'),async()=>{const result=await api('/consent','POST',{consent:true});notify(result.message);await render();},'Registrando…');
  });
  submitHandler('#auth-form',async form=>{
    const data=formData(form);
    if(path==='/register') {
      // O papel NUNCA vai no payload: o servidor decide. Só a intenção vai.
      const wantsToReview=/** @type {HTMLInputElement|undefined} */ (form.elements.namedItem('role'))?.value==='reviewer';
      const consentInput=/** @type {HTMLInputElement|undefined} */ (form.elements.namedItem('consent'));
      const payload={name:data.name,email:data.email,password:data.password,school_or_class:data.school_or_class||'',consent:!!consentInput?.checked,wants_to_review:wantsToReview};
      const result=await api('/register','POST',payload);
      notify(result.reviewer_request?'Conta criada. Seu pedido para avaliar foi registrado e será analisado pela organização.':'Conta criada. Entre para continuar.');
      location.hash='/login';
    } else {
      const result=await api('/login','POST',data);state.user=result.user;state.csrf=result.csrf;
      state.eventId=storedEvent('');state.events=[];location.hash='/dashboard';
    }
  });
  document.querySelectorAll('[data-demo]').forEach(element=>{const button=/** @type {HTMLButtonElement} */(element);button.addEventListener('click',()=>{const form=/** @type {HTMLFormElement} */($('#auth-form'));(/** @type {HTMLInputElement} */(form.elements.namedItem('email'))).value=`${button.dataset.demo}@blindpitch.demo`;(/** @type {HTMLInputElement} */(form.elements.namedItem('password'))).value='BlindPitch2026!';form.requestSubmit();});});
  submitHandler('#project-form',async form=>{
    const data=scientificData(form),projectId=form.dataset.id;
    if(!projectId&&!form.dataset.creationKey)form.dataset.creationKey=creationKey();
    const result=await api(projectId?`/projects/${projectId}`:'/projects',projectId?'PUT':'POST',data,projectId?{}:{'Idempotency-Key':form.dataset.creationKey});form.dataset.saved='true';notify(result.message);location.hash=`/projects/${projectId||result.id}`;
  });
  // ---------- Privacidade, publicação e perfil ----------
  submitHandler('#privacy-form',async form=>{
    const chosen=form.elements.identification?.value;
    if(!chosen)throw new Error('Escolha uma das três opções de identificação.');
    const r=await api('/privacy','PUT',{identification:chosen,public_name:form.elements.public_name.value,public_bio:form.elements.public_bio.value});
    notify(r.message);await render();
  });
  document.querySelectorAll('[data-copy-slug]').forEach(element=>{const button=/** @type {HTMLButtonElement} */(element);button.addEventListener('click',async()=>{
    const code=$('#portfolio-slug');if(!code)return;
    try{await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/portfolio/${code.textContent}`);notify('Endereço copiado.');}
    catch{notify('Não foi possível copiar. Selecione o código e copie manualmente.','error');}
  });});
  document.querySelectorAll('[data-save-publication]').forEach(element=>{const button=/** @type {HTMLButtonElement} */(element);button.addEventListener('click',async()=>{await buttonAction(button,async()=>{
    const row=element.closest('[data-publication]');
    const targets={};
    row.querySelectorAll('[data-target]').forEach(input=>{const el=/** @type {HTMLInputElement} */(input);targets[el.dataset.target]=el.checked;});
    const r=await api(`/projects/${button.dataset.savePublication}/publication`,'PUT',{targets});
    notify(r.message);await render();
  });});});
  document.querySelectorAll('[data-preview-publication]').forEach(element=>{const button=/** @type {HTMLButtonElement} */(element);button.addEventListener('click',()=>{
    const panel=button.closest('[data-publication]')?.querySelector('.publication-preview');
    if(!(panel instanceof HTMLElement))return;
    const open=panel.hidden;panel.hidden=!open;button.setAttribute('aria-expanded',String(open));button.textContent=open?'Ocultar prévia':'Prévia pública';
  });});
  submitHandler('#reviewer-profile-form',async form=>{
    const r=await api('/profile/reviewer','PUT',{education_level:form.elements.education_level.value,degrees:form.elements.degrees.value,courses:form.elements.courses.value,specializations:form.elements.specializations.value,knowledge_areas:form.elements.knowledge_areas.value,bio:form.elements.bio.value,public_identity:form.elements.public_identity.checked});
    notify(r.message);await render();
  });
  for(const action of /** @type {Array<{key:string,label:string,approve:boolean}>} */([
    {key:'approveReviewer',label:'Aprovar esta pessoa como avaliador? As sessões ativas dela serão encerradas.',approve:true},
    {key:'rejectReviewer',label:'Recusar este pedido? A pessoa continua como participante e poderá pedir de novo.',approve:false}])){
    const selector=`[data-${action.key.replace(/[A-Z]/gu,c=>'-'+c.toLowerCase())}]`;
    document.querySelectorAll(selector).forEach(element=>{
      const button=/** @type {HTMLButtonElement} */(element);
      button.addEventListener('click',async()=>{
        if(!await confirmAction(action.label))return;
        await buttonAction(button,async()=>{
          const r=await api(`/reviewer-requests/${/** @type {string} */(button.dataset[action.key])}`,'PUT',{approve:action.approve});
          notify(r.message);await render();
        });
      });
    });
  }
  $('[data-submit-project]')?.addEventListener('click',async event=>{
    const button=/** @type {HTMLButtonElement} */(event.currentTarget);
    if(!await confirmAction('Enviar esta proposta? Os oito campos principais precisam estar preenchidos. Os campos complementares são opcionais. Após o envio, a edição ficará bloqueada.'))return;
    await buttonAction(button,async()=>{const r=await operationFlow('proposal',()=>api(`/projects/${button.dataset.submitProject}/submit`,'POST',{}));notify(r.message);await render();},'Enviando…');
  });
  for(const [attribute,action,prompt] of [['reopen','reopen','Reabrir esta proposta para o participante editar?'],['archive','archive','Arquivar esta proposta?']]) {
    $(`[data-${attribute}]`)?.addEventListener('click',async event=>{
      const button=/** @type {HTMLButtonElement} */(event.currentTarget);
      if(!await confirmAction(prompt))return;
      await buttonAction(button,async()=>{const r=await api(`/projects/${button.dataset[attribute]}/${action}`,'POST',{});notify(r.message);await render();});
    });
  }
  submitHandler('#anonymize-form',async form=>{const content=scientificData(form),approved=form.elements.approved.checked;const r=await operationFlow('anonymize',()=>api(`/projects/${form.dataset.id}/anonymize`,'POST',{content,approved}),form.dataset.code);notify(r.message);await render();});
  const search=$('#project-search');
  if(search) {
    let searchGeneration=0;
    search.addEventListener('input',async event=>{
      const generation=++searchGeneration,term=(/** @type {HTMLInputElement} */(event.target)).value.toLocaleLowerCase('pt-BR');
      try {
        const projects=searchableProjects;
        if(generation!==searchGeneration||!search.isConnected)return;
        $('#project-table').innerHTML=projectsTable(projects.filter(p=>`${p.anonymous_code} ${p.title} ${p.scientific_area}`.toLocaleLowerCase('pt-BR').includes(term)));
        document.querySelectorAll('#project-table .table-scroll').forEach(table=>{table.setAttribute('tabindex','0');table.setAttribute('role','region');table.setAttribute('aria-label','Tabela com rolagem horizontal');});
      }catch(error){if(generation===searchGeneration)notify(error.message,true);}
    });
  }
  submitHandler('#reviewer-form',async form=>{const r=await api('/reviewers','POST',{...formData(form),consent:false,school_or_class:''});notify(r.message);await render();});
  document.querySelectorAll('[data-toggle-reviewer]').forEach(element=>{const button=/** @type {HTMLButtonElement} */(element);button.addEventListener('click',async()=>{await buttonAction(button,async()=>{const r=await api(`/reviewers/${button.dataset.toggleReviewer}`,'PUT',{active:button.dataset.active==='true'});notify(r.message);await render();});});});
  submitHandler('#assignment-form',async form=>{const r=await api('/assignments','POST',formData(form));notify(r.message);await render();});
  document.querySelectorAll('.score-input').forEach(input=>input.addEventListener('input',()=>{
    $('#score-total').textContent=fmt([...document.querySelectorAll('.score-input')].reduce((sum,element)=>{const el=/** @type {HTMLInputElement} */(element);return sum+(Number(el.value)||0)*Number(el.dataset.weight);},0));
  }));
  submitHandler('#review-form',async(form,event)=>{
    const finalize=event.submitter?.value==='final';
    const criteria=await api('/rubric');
    const scores=criteria.filter(c=>form.elements[`score_${c.id}`].value!=='').map(c=>({criterion_id:c.id,score:Number(form.elements[`score_${c.id}`].value),comment:form.elements[`comment_${c.id}`].value}));
    if(finalize){if(scores.length!==criteria.length)throw new Error('Preencha todos os critérios antes de finalizar.');if(!await confirmAction(`Finalizar a avaliação com ${$('#score-total').textContent} pontos ponderados? As notas não poderão ser alteradas.`))return;}
    const bonus={points:Number(form.elements.bonus_points?.value||0),justification:form.elements.bonus_justification?.value||'',criterion:form.elements.bonus_criterion?.value||''};
    // O servidor revalida tudo; a interface apenas evita o erro mais óbvio.
    if(finalize&&bonus.points>0&&bonus.justification.trim().length<10)throw new Error('Informe uma justificativa de pelo menos 10 caracteres para os pontos adicionais.');
    const save=()=>api(`/assignments/${form.dataset.id}/review`,'PUT',{scores,general_comment:form.elements.general_comment.value,finalize,bonus});
    const r=finalize?await operationFlow('review',save):await save();notify(r.message);await render();
  });
  $('#add-criterion')?.addEventListener('click',()=>$('#criteria-rows').insertAdjacentHTML('beforeend',criterionConfig()));
  $('#criteria-rows')?.addEventListener('click',event=>{const target=/** @type {HTMLElement} */(event.target);if(target.closest('.remove-criterion'))target.closest('.criterion-config').remove();});
  submitHandler('#rubric-config',async form=>{
    const criteria=[...form.querySelectorAll('.criterion-config')].map(row=>Object.fromEntries([...row.querySelectorAll('input')].map(input=>[input.name,input.type==='number'?Number(input.value):input.value])));
    const r=await api('/rubric','PUT',{criteria});notify(r.message);await render();
  });
  submitHandler('#event-form',async form=>{
    const data=/** @type {Record<string,unknown>} */ (formData(form));
    for(const el of form.querySelectorAll('input[type="checkbox"]'))data[el.name]=el.checked;
    data.bonus_max=Number(data.bonus_max);
    const r=await api('/event','PUT',data);notify(r.message);await render();
  });
  document.querySelectorAll('[data-event-select],#event-select').forEach(select=>select.addEventListener('change',async event=>{
    const control=/** @type {HTMLSelectElement} */(event.target),selected=control.value;
    if($('#project-form')&&!await confirmAction('Trocar de edição? As alterações ainda não salvas neste formulário serão descartadas.')) {control.value=state.event.id;return;}
    state.eventId=storedEvent(selected);state.events=[];
    if(path==='/settings')await render();else {location.hash='/dashboard';await render();}
  }));
  submitHandler('#new-event-form',async form=>{
    const data=formData(form);const r=await api('/events','POST',{name:data.name,year:Number(data.year)});state.eventId=storedEvent(r.id);state.events=[];notify(r.message);await render();
  });
  $('#export-button')?.addEventListener('click',async()=>{
    await buttonAction($('#export-button'),async()=>{const r=await api('/export');const url=URL.createObjectURL(new Blob([r.csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=r.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Exportação agregada gerada.');},'Exportando…');
  });
}
window.addEventListener('hashchange',()=>{window.scrollTo(0,0);render();});
// "Pular para o conteúdo": foca o <main> sem alterar a rota em hash.
document.addEventListener?.('click',event=>{
  const target=event.target;
  const link=target instanceof Element?target.closest('[data-skip-link]'):null;
  if(!link)return;
  const main=document.getElementById('main');
  if(!main)return;
  event.preventDefault();
  main.setAttribute('tabindex','-1');
  main.focus();
});
async function boot() {
  try{state.publicInfo=await api('/public');}catch(error){notify(error.message,true);}
  try{const session=await api('/session');state.user=session.user;state.csrf=session.csrf;}catch{/* Visitantes não possuem sessão. */}
  await render();
}
boot();
