import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { id, now, passwordHash, passwordMatches, createEvent, isUniqueViolation } from './db/index.mjs';
import { HttpError, requireCondition as assert, object, string, number, boolean, credentials, scientificContent, scientificFields, redactContent, redactText, identification, publicationTargets, privacyPreferences, reviewerProfile, bonusPoints } from './validation.mjs';
import { metrics, mean } from './metrics.mjs';
import { createRateLimiter } from './rate-limit.mjs';

const tokenHash = value => createHash('sha256').update(value).digest('hex');
const safeUser = user => ({id:user.id,name:user.name,email:user.email,role:user.role});
const demoNotice = 'Dados ilustrativos — resultados reais ainda serão coletados.';
const routeId = '[a-f0-9-]{36}';
export function createApp(db, options = {}) {
  return createServer(createHandler(db, options));
}

// Handler HTTP compartilhado entre o servidor local e as funções da Vercel.
// Não chama listen() e não depende de socket real, o que permite reutilizá-lo
// como `export default (req,res) => handler(req,res)` sem adapter externo.
export function createHandler(db, { publicDir = resolve('public'), secureCookie = false } = {}) {
  const routes=[], limiter=createRateLimiter(db);
  // `:id` exige UUID; `:slug` aceita identificadores públicos legíveis. Ambos viram grupo.
  const add = (method,path,role,fn) => routes.push({method,pattern:new RegExp(`^${path.replace(/:id/gu,`(${routeId})`).replace(/:slug/gu,'([^/]+)')}$`,'u'),role,fn});
  const getEvent = async request => {
    const eventId = request.url.searchParams.get('event_id') || (await db.prepare("SELECT value FROM settings WHERE key='active_event'").get())?.value;
    const event = await db.prepare('SELECT * FROM events WHERE id=?').get(eventId ?? '');
    assert(event,'Edição não encontrada.',404); return event;
  };
  // `created_at` é gravado com precisão de milissegundos: CURRENT_TIMESTAMP do
  // SQLite tem 1s de precisão e não permite ordenar o log de forma estável.
  const audit = (user,action,type,entity) => db.prepare('INSERT INTO audit_logs(id,actor_user_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?,?)').run(id(),user.id,action,type,entity,now());
  const authorOf = projectId => db.prepare('SELECT u.name,u.email,u.id,p.school_or_class,p.consent FROM project_authors a JOIN users u ON u.id=a.user_id LEFT JOIN participant_profiles p ON p.user_id=u.id WHERE a.project_id=?').get(projectId);
  // Preferência de identificação. O padrão protege: nunca revela sem ação explícita.
  const privacyOf = async userId => (await db.prepare('SELECT identification,public_name,public_bio,portfolio_slug FROM privacy_profiles WHERE user_id=?').get(userId)) || { identification:'after_approval', public_name:'', public_bio:'', portfolio_slug:'' };
  // Endereço público aleatório. Nunca derivado de dados pessoais.
  const slugFor = async userId => {
    const existing=(await privacyOf(userId)).portfolio_slug;
    if(existing) return existing;
    const slug=`bp-${randomBytes(4).toString('hex')}`;
    await db.prepare(`INSERT INTO privacy_profiles(user_id,portfolio_slug,updated_at) VALUES(?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET portfolio_slug=excluded.portfolio_slug,updated_at=excluded.updated_at`)
      .run(userId,slug,now());
    return slug;
  };
  const prefsOf = async projectId => (await db.prepare('SELECT portfolio,gallery,showcase FROM publication_prefs WHERE project_id=?').get(projectId)) || { portfolio:0, gallery:0, showcase:0 };
  // Nome exibível publicamente. 'never' nunca revela; 'immediate' revela desde já.
  const displayName = async (userId, event) => {
    const profile = await privacyOf(userId);
    if (profile.identification === 'never') return null;
    if (profile.identification === 'after_approval' && !event.reveal_identity) return null;
    const name = (profile.public_name||'').trim();
    if (name) return name;
    return profile.identification === 'immediate' ? (await db.prepare('SELECT name FROM users WHERE id=?').get(userId))?.name || null : null;
  };
  // Um projeto só é público quando a versão científica foi aprovada E a etapa de
  // avaliação terminou. Rascunho, submissão e revisão em curso nunca publicam.
  const publishable = async (project, event) => {
    if (!project.anonymization_approved) return false;
    if (!['reviewed','results_available'].includes(project.status)) return false;
    const prefs = await prefsOf(project.id);
    return !!(prefs.portfolio || prefs.gallery || prefs.showcase);
  };
  // Forma pública de um projeto. Nunca inclui código anônimo, id interno nem autoria crua.
  const publicProject = async (project, event) => {
    const author = await authorOf(project.id);
    const content = redactContent(project.sanitized_content ? JSON.parse(project.sanitized_content) : project, author);
    return {
      title: content.title, scientific_area: content.scientific_area, abstract: content.abstract,
      problem: content.problem, objective: content.objective, methodology: content.methodology,
      proposed_solution: content.proposed_solution, expected_impact: content.expected_impact,
      keywords: content.keywords, status: project.status
    };
  };
  const hasConsent = async (userId,event) => !!(await db.prepare('SELECT user_id FROM event_consents WHERE user_id=? AND event_id=? AND protocol=?').get(userId,event.id,event.protocol));
  const projectFor = async (request,projectId) => {
    const project=await db.prepare('SELECT * FROM projects WHERE id=? AND event_id=?').get(projectId,request.event.id);
    assert(project,'Projeto não encontrado.',404);
    if(request.user.role==='participant') assert((await authorOf(projectId))?.id===request.user.id,'Projeto não encontrado.',404);
    return project;
  };
  const rubric = eventId => db.prepare('SELECT * FROM rubric_criteria WHERE event_id=? ORDER BY order_index').all(eventId);
  const reviewFor = async assignmentId => {
    // Nunca retorna bonus_granted_by: o avaliador não é exposto ao autor nem ao público.
    const review=await db.prepare('SELECT id,assignment_id,total_score,normalized_score,general_comment,started_at,submitted_at,bonus_points,bonus_justification,bonus_criterion,bonus_granted_at FROM reviews WHERE assignment_id=?').get(assignmentId);
    return review ? {...review,scores:await db.prepare('SELECT criterion_id,score,comment FROM review_scores WHERE review_id=?').all(review.id)} : null;
  };
  async function assignmentFor(request,assignmentId) {
    const assignment=await db.prepare('SELECT a.* FROM assignments a JOIN projects p ON p.id=a.project_id WHERE a.id=? AND p.event_id=?').get(assignmentId,request.event.id);
    assert(assignment && assignment.reviewer_user_id===request.user.id,'Avaliação não encontrada.',404);
    return assignment;
  }
  async function reviewerDTO(assignment) {
    const project=await db.prepare('SELECT * FROM projects WHERE id=?').get(assignment.project_id);
    const author=await authorOf(project.id);
    assert(project.anonymization_approved && project.sanitized_content,'A proposta aguarda revisão de anonimização.',409);
    const content=redactContent(JSON.parse(project.sanitized_content),author);
    const event=await db.prepare('SELECT * FROM events WHERE id=?').get(project.event_id);
    const review=await reviewFor(assignment.id);
    const dto={id:assignment.id,review_mode:assignment.review_mode,status:assignment.status,project:{...content,anonymous_code:project.anonymous_code},review,bonus_policy:{enabled:!!event.bonus_enabled,max:Number(event.bonus_max??2)}};
    // A opção geral de revelação nunca altera o contrato de uma avaliação anônima.
    if(assignment.review_mode==='identified') {
      assert(event.identified_enabled && await hasConsent(author.id,event),'Condição identificada indisponível.',409);
      dto.author={name:author.name,school_or_class:author.school_or_class};
    }
    if(dto.review && assignment.review_mode==='anonymous') {
      // Em avaliação anônima, nem a justificativa dos pontos extras pode citar o autor.
      const clean=text=>redactContent({title:text},author).title;
      dto.review.general_comment=clean(dto.review.general_comment);
      dto.review.bonus_justification=clean(dto.review.bonus_justification);
      dto.review.scores=dto.review.scores.map(s=>({...s,comment:clean(s.comment)}));
    }
    return dto;
  }
  async function syncProject(projectId) {
    const rows=await db.prepare('SELECT status FROM assignments WHERE project_id=?').all(projectId);
    const status=rows.length===0?'submitted':rows.every(a=>a.status==='completed')?'reviewed':rows.some(a=>a.status!=='pending')?'under_review':'assigned';
    await db.prepare('UPDATE projects SET status=? WHERE id=?').run(status,projectId);
  }

  add('GET','/api/public',null,request=>({event:{name:request.event.name,year:request.event.year,submissions_open:!!request.event.submissions_open,demo:!!request.event.demo,identified_enabled:!!request.event.identified_enabled,protocol:request.event.protocol},demo_notice:request.event.demo?demoNotice:null}));
  add('POST','/api/register',null,async request=>{
    const key='register:'+(request.raw.socket?.remoteAddress??'unknown');
    const recent=await limiter.recent(key,3600000);
    assert(recent.count<20,'Muitos cadastros. Tente novamente em uma hora.',429);
    await limiter.hit(key);
    const data=credentials(request.body,true);
    assert(!(await db.prepare('SELECT id FROM users WHERE email=?').get(data.email)),'Não foi possível criar a conta com esse e-mail.',409);
    const userId=id();
    try {
      await db.tx(async()=>{
        // A conta nasce sempre como participante. Escolher "avaliador" registra um pedido
        // que só o organizador pode aprovar; não existe auto-elevação de privilégio.
        await db.prepare("INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,'participant',?)").run(userId,data.name,data.email,passwordHash(data.password),now());
        await db.prepare('INSERT INTO participant_profiles(user_id,school_or_class,consent) VALUES(?,?,?)').run(userId,data.school_or_class,data.consent);
        await db.prepare("INSERT INTO privacy_profiles(user_id,identification) VALUES(?,'after_approval')").run(userId);
        if(data.wants_to_review) await db.prepare("INSERT INTO reviewer_requests(user_id,status,created_at) VALUES(?,'pending',?)").run(userId,now());
        if(data.consent) {
          assert(request.event.identified_enabled && request.event.protocol.trim(),'A condição identificada não está disponível.');
          await db.prepare('INSERT INTO event_consents(user_id,event_id,protocol,consented_at) VALUES(?,?,?,?)').run(userId,request.event.id,request.event.protocol,now());
        }
      });
    } catch (error) {
      // Outro cadastro com o mesmo e-mail chegou primeiro: é conflito, não falha.
      if (isUniqueViolation(error)) throw new HttpError(409,'Não foi possível criar a conta com esse e-mail.');
      throw error;
    }
    return {message:'Conta criada. Entre para cadastrar sua proposta.',reviewer_request:!!data.wants_to_review};
  });
  const dummyHash=passwordHash('not-a-valid-user-password');
  add('POST','/api/login',null,async request=>{
    const data=credentials(request.body);
    const key='login:'+(request.raw.socket?.remoteAddress??'unknown');
    const recent=await limiter.recent(key);
    assert(recent.count<12,'Muitas tentativas. Tente novamente em 15 minutos.',429);
    const user=await db.prepare('SELECT * FROM users WHERE email=?').get(data.email);
    const valid=passwordMatches(data.password,user?.password_hash??dummyHash);
    if(!valid || !user?.active) {await limiter.hit(key);throw new HttpError(401,'E-mail ou senha incorretos.');}
    const token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
    await db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
    await db.prepare('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)').run(tokenHash(token),user.id,csrf,Date.now()+8*3600000);
    request.response.setHeader('Set-Cookie',`bp_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secureCookie?'; Secure':''}`);
    return {user:safeUser(user),csrf};
  });
  add('GET','/api/session','authenticated',request=>({user:safeUser(request.user),csrf:request.session.csrf}));
  add('POST','/api/logout','authenticated',async request=>{
    await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(request.session.token_hash);
    request.response.setHeader('Set-Cookie',`bp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie?'; Secure':''}`);
    return {message:'Sessão encerrada.'};
  });
  add('GET','/api/events','authenticated',()=>db.prepare('SELECT id,name,year,demo FROM events ORDER BY year DESC,name').all());
  add('GET','/api/event','authenticated',async request=>{
    const e=request.event;
    return request.user.role==='organizer'?e:{id:e.id,name:e.name,year:e.year,demo:e.demo,submissions_open:e.submissions_open,reviews_open:e.reviews_open,results_released:e.results_released,identified_enabled:e.identified_enabled,protocol:e.protocol,consent:await hasConsent(request.user.id,e),bonus_enabled:!!e.bonus_enabled,bonus_max:Number(e.bonus_max??2)};
  });
  add('POST','/api/consent','participant',async request=>{
    object(request.body,['consent']);assert(request.body.consent===true,'Confirme o consentimento para esta edição.');
    assert(request.event.identified_enabled&&request.event.protocol.trim(),'A condição identificada não está disponível.',409);
    await db.prepare('INSERT INTO event_consents(user_id,event_id,protocol,consented_at) VALUES(?,?,?,?) ON CONFLICT(user_id,event_id) DO UPDATE SET protocol=excluded.protocol,consented_at=excluded.consented_at').run(request.user.id,request.event.id,request.event.protocol,now());
    audit(request.user,'consent.recorded','event',request.event.id);return {message:'Consentimento registrado para esta edição e protocolo.'};
  });
  add('GET','/api/rubric','authenticated',request=>rubric(request.event.id));
  add('GET','/api/projects','participant|organizer',async request=>{
    const rows=request.user.role==='organizer'
      ?await db.prepare('SELECT * FROM projects WHERE event_id=? ORDER BY created_at DESC').all(request.event.id)
      :await db.prepare('SELECT p.* FROM projects p JOIN project_authors a ON a.project_id=p.id WHERE p.event_id=? AND a.user_id=? ORDER BY p.created_at DESC').all(request.event.id,request.user.id);
    // Uma única consulta de destinos: evita N+1 ao montar o dashboard.
    const prefs=new Map((await db.prepare('SELECT pp.project_id,pp.portfolio,pp.gallery,pp.showcase FROM publication_prefs pp JOIN projects p ON p.id=pp.project_id WHERE p.event_id=?').all(request.event.id)).map(r=>[r.project_id,r]));
    return Promise.all(rows.map(async p=>{ const {sanitized_content,...rest}=p;
      const target=prefs.get(p.id)||{portfolio:0,gallery:0,showcase:0};
      return {...rest,...(request.user.role==='organizer'?{sanitized_content:sanitized_content?JSON.parse(sanitized_content):null}: {}),
        publication_prefs:{portfolio:!!target.portfolio,gallery:!!target.gallery,showcase:!!target.showcase},
        published:await publishable(p,request.event)}; }));
  });
  add('POST','/api/projects','participant',async request=>{
    assert(request.event.submissions_open,'As submissões estão encerradas.',409);
    const content=scientificContent(request.body),key=request.raw.headers['idempotency-key'];
    if(key!==undefined) assert(typeof key==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu.test(key),'Chave de cadastro inválida.');
    // A mesma confirmação pode ser repetida após perda de conexão, sem novo registro.
    // A chave é isolada por participante e edição; não deriva o código anônimo.
    const digest=key?tokenHash(`${request.user.id}:${request.event.id}:${key.toLowerCase()}`).slice(0,32):null;
    const projectId=digest?`${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20)}`:id();
    await db.tx(async()=>{
      const existing=await db.prepare('SELECT * FROM projects WHERE id=?').get(projectId);
      if(existing) {
        assert(existing.event_id===request.event.id&&(await authorOf(projectId))?.id===request.user.id&&scientificFields.every(field=>existing[field]===content[field]),'Esta confirmação já foi utilizada com outros dados. Abra o projeto salvo para editá-lo.',409);
        return;
      }
      await db.prepare(`INSERT INTO projects(id,event_id,created_at,${scientificFields.map(f=>`"${f}"`).join(',')}) VALUES(?,?,?${',?'.repeat(scientificFields.length)})`).run(projectId,request.event.id,now(),...Object.values(content));
      await db.prepare('INSERT INTO project_authors(project_id,user_id) VALUES(?,?)').run(projectId,request.user.id);
      audit(request.user,'project.created','project',projectId);
    });
    return {id:projectId,message:'Rascunho salvo.'};
  });
  add('GET','/api/projects/:id','participant|organizer',async(request,projectId)=>{
    const p=await projectFor(request,projectId);
    const result={...p}; delete result.sanitized_content;
    // Destinos de publicação e situação: necessários à prévia e ao acompanhamento.
    result.publication={prefs:await prefsOf(p.id),published:await publishable(p,request.event),preview:await publicProject(p,request.event)};
    if(request.user.role==='organizer') {
      const author=await authorOf(p.id);
      result.sanitized_content=p.sanitized_content?JSON.parse(p.sanitized_content):redactContent(p,author);
      if(request.event.reveal_identity) result.author={name:author.name,school_or_class:author.school_or_class};
    }
    const completed=Number((await db.prepare("SELECT count(*) n FROM assignments WHERE project_id=? AND status='completed'").get(projectId)).n);
    const total=Number((await db.prepare('SELECT count(*) n FROM assignments WHERE project_id=?').get(projectId)).n);
    result.progress={completed,total};
    return result;
  });
  add('PUT','/api/projects/:id','participant',async(request,projectId)=>{
    const p=await projectFor(request,projectId);
    assert(p.status==='draft' && request.event.submissions_open,'A proposta está bloqueada para edição.',409);
    const content=scientificContent(request.body);
    await db.prepare(`UPDATE projects SET ${scientificFields.map(f=>`"${f}"=?`).join(',')},anonymization_approved=0,sanitized_content=NULL WHERE id=?`).run(...Object.values(content),projectId);
    return {message:'Rascunho atualizado.'};
  });
  add('POST','/api/projects/:id/submit','participant',async(request,projectId)=>{
    object(request.body,[]);
    const p=await projectFor(request,projectId);
    assert(p.status==='draft' && request.event.submissions_open,'Não é possível enviar esta proposta.',409);
    const content=scientificContent(Object.fromEntries(scientificFields.map(f=>[f,p[f]])),true);
    let code;
    await db.tx(async()=>{
      const event=await db.prepare('SELECT * FROM events WHERE id=?').get(request.event.id);
      // Reserva atômica do próximo código. O UPDATE trava a linha da edição até
      // o fim da transação, então duas instâncias serverless concorrentes nunca
      // leem o mesmo next_code. `RETURNING` existe em SQLite 3.35+ e PostgreSQL.
      const reserved=await db.prepare('UPDATE events SET next_code=next_code+1 WHERE id=? RETURNING next_code').get(event.id);
      const globalNext=Number((await db.prepare('SELECT max(CAST(substr(anonymous_code,9) AS INTEGER)) n FROM projects WHERE anonymous_code LIKE ?').get(`BP-${event.year}-%`)).n||0)+1;
      const next=Math.max(Number(reserved.next_code)-1,globalNext);
      // another event may already own a higher number for the same year
      if(Number(reserved.next_code)<=next) await db.prepare('UPDATE events SET next_code=? WHERE id=?').run(next+1,event.id);
      code=p.anonymous_code||`BP-${event.year}-${String(next).padStart(4,'0')}`;
      await db.prepare("UPDATE projects SET anonymous_code=?,status='submitted',submitted_at=?,sanitized_content=?,anonymization_approved=0 WHERE id=?").run(code,now(),JSON.stringify(redactContent(content,await authorOf(p.id))),projectId);
      audit(request.user,'project.submitted','project',projectId);
    });
    return {anonymous_code:code,message:`Proposta enviada: ${code}.`};
  });
  add('GET','/api/projects/:id/results','participant|organizer',async(request,projectId)=>{
    const p=await projectFor(request,projectId);
    assert(request.user.role==='organizer'||(request.event.results_released && p.status==='results_available'),'Os resultados ainda não foram liberados.',403);
    // `rowid` é específico do SQLite; a chave primária mantém a ordenação estável.
    const rows=await db.prepare('SELECT r.id,r.total_score,r.normalized_score,r.general_comment,r.bonus_points,r.bonus_justification,r.bonus_criterion FROM reviews r JOIN assignments a ON a.id=r.assignment_id WHERE a.project_id=? AND r.submitted_at IS NOT NULL ORDER BY r.submitted_at,r.id').all(projectId);
    // A nota final soma os pontos extras; a nota da rubrica permanece intacta e auditável.
    return {code:p.anonymous_code,mean:mean(rows.map(r=>r.normalized_score)),demo_notice:request.event.demo?demoNotice:null,bonus_total:rows.reduce((sum,r)=>sum+Number(r.bonus_points),0),reviews:await Promise.all(rows.map(async r=>({total_score:r.total_score,normalized_score:r.normalized_score,bonus_points:r.bonus_points,...(request.user.role==='organizer'||request.event.comments_released?{general_comment:r.general_comment}:{}),...(request.user.role==='organizer'||request.event.comments_released?{bonus_justification:r.bonus_justification,bonus_criterion:r.bonus_criterion}:{}),final_score:Math.round((Number(r.total_score)+Number(r.bonus_points))*100)/100,scores:await db.prepare('SELECT c.name,s.score,c.max_score,c.weight FROM review_scores s JOIN rubric_criteria c ON c.id=s.criterion_id WHERE s.review_id=? ORDER BY c.order_index').all(r.id)})))};
  });
  add('POST','/api/projects/:id/anonymize','organizer',async(request,projectId)=>{
    const p=await projectFor(request,projectId);
    assert(p.status==='submitted','A anonimização deve ser revisada antes da atribuição.',409);
    object(request.body,['content','approved']);
    assert(request.body.approved===true,'Confirme a revisão manual de informações identificáveis.');
    const content=redactContent(scientificContent(request.body.content,true),await authorOf(p.id));
    await db.prepare('UPDATE projects SET sanitized_content=?,anonymization_approved=1 WHERE id=?').run(JSON.stringify(content),projectId);
    audit(request.user,'anonymization.approved','project',projectId);
    return {message:'Versão científica revisada e aprovada.'};
  });
  add('POST','/api/projects/:id/reopen','organizer',async(request,projectId)=>{
    object(request.body,[]); const p=await projectFor(request,projectId);
    assert(p.status==='submitted' && !(await db.prepare('SELECT id FROM assignments WHERE project_id=?').get(projectId)),'Só é possível reabrir propostas sem avaliações atribuídas.',409);
    await db.prepare("UPDATE projects SET status='draft',anonymization_approved=0,sanitized_content=NULL WHERE id=?").run(projectId);
    audit(request.user,'project.reopened','project',projectId); return {message:'Proposta reaberta. O código será preservado.'};
  });
  add('POST','/api/projects/:id/archive','organizer',async(request,projectId)=>{
    object(request.body,[]); const p=await projectFor(request,projectId);
    assert(['reviewed','results_available','submitted'].includes(p.status),'Estado incompatível com arquivamento.',409);
    await db.prepare("UPDATE projects SET status='archived' WHERE id=?").run(projectId);
    audit(request.user,'project.archived','project',projectId); return {message:'Projeto arquivado.'};
  });
  add('GET','/api/users','organizer',async request=>{
    const rows=await db.prepare('SELECT u.id,u.name,u.email,u.role,u.active,p.school_or_class FROM users u LEFT JOIN participant_profiles p ON p.user_id=u.id ORDER BY u.name').all();
    return Promise.all(rows.map(async u=>({...u,consent:await hasConsent(u.id,request.event)})));
  });
  add('POST','/api/reviewers','organizer',async request=>{
    const data=credentials(request.body,true),userId=id();
    assert(!(await db.prepare('SELECT id FROM users WHERE email=?').get(data.email)),'E-mail já cadastrado.',409);
    try {
      await db.prepare("INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,'reviewer',?)").run(userId,data.name,data.email,passwordHash(data.password),now());
    } catch (error) {
      if (isUniqueViolation(error)) throw new HttpError(409,'E-mail já cadastrado.');
      throw error;
    }
    audit(request.user,'reviewer.created','user',userId); return {message:'Avaliador cadastrado.',id:userId};
  });
  add('PUT','/api/reviewers/:id','organizer',async(request,userId)=>{
    object(request.body,['active']); const active=boolean(request.body.active,'Ativo');
    assert(await db.prepare("SELECT id FROM users WHERE id=? AND role='reviewer'").get(userId),'Avaliador não encontrado.',404);
    assert(active||!(await db.prepare("SELECT id FROM assignments WHERE reviewer_user_id=? AND status!='completed'").get(userId)),'Conclua as atribuições pendentes antes de desativar.',409);
    await db.prepare('UPDATE users SET active=? WHERE id=?').run(active,userId);
    await db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
    audit(request.user,active?'reviewer.activated':'reviewer.deactivated','user',userId); return {message:'Avaliador atualizado.'};
  });
  add('GET','/api/assignments','reviewer|organizer',async request=>{
    if(request.user.role==='reviewer') {
      const rows=await db.prepare('SELECT a.* FROM assignments a JOIN projects p ON p.id=a.project_id WHERE a.reviewer_user_id=? AND p.event_id=? ORDER BY p.anonymous_code').all(request.user.id,request.event.id);
      return Promise.all(rows.map(reviewerDTO));
    }
    return db.prepare('SELECT a.*,p.anonymous_code,u.name reviewer_name FROM assignments a JOIN projects p ON p.id=a.project_id JOIN users u ON u.id=a.reviewer_user_id WHERE p.event_id=? ORDER BY p.anonymous_code').all(request.event.id);
  });
  add('POST','/api/assignments','organizer',async request=>{
    object(request.body,['project_id','reviewer_user_id','review_mode']);
    const project=await projectFor(request,string(request.body.project_id,'Projeto',36,36));
    const reviewerId=string(request.body.reviewer_user_id,'Avaliador',36,36),mode=request.body.review_mode;
    assert(['anonymous','identified'].includes(mode),'Modo inválido.');
    assert(request.event.reviews_open&&!request.event.results_released,'A etapa de avaliação está encerrada.',409);
    assert(['submitted','assigned','under_review','reviewed'].includes(project.status)&&project.anonymization_approved,'Revise a anonimização da proposta antes de atribuí-la.',409);
    assert(await db.prepare("SELECT id FROM users WHERE id=? AND role='reviewer' AND active=1").get(reviewerId),'Avaliador indisponível.');
    assert(!(await db.prepare('SELECT id FROM assignments WHERE project_id=? AND reviewer_user_id=?').get(project.id,reviewerId)),'Este avaliador já recebeu esta proposta. Use outro avaliador para evitar efeito de memória.',409);
    if(mode==='identified') {
      const author=await authorOf(project.id);
      assert(request.event.identified_enabled&&request.event.protocol.trim()&&await hasConsent(author.id,request.event),'Modo identificado exige protocolo habilitado e consentimento do participante para esta edição.',409);
    }
    const assignmentId=id();
    await db.tx(async()=>{
      await db.prepare('INSERT INTO assignments(id,project_id,reviewer_user_id,review_mode) VALUES(?,?,?,?)').run(assignmentId,project.id,reviewerId,mode);
      await syncProject(project.id); audit(request.user,`assignment.${mode}`,'assignment',assignmentId);
    });
    return {id:assignmentId,message:'Avaliação atribuída.'};
  });
  add('GET','/api/assignments/:id','reviewer',async(request,assignmentId)=>reviewerDTO(await assignmentFor(request,assignmentId)));
  add('POST','/api/assignments/:id/start','reviewer',async(request,assignmentId)=>{
    object(request.body,[]); const a=await assignmentFor(request,assignmentId);
    assert(request.event.reviews_open&&a.status!=='completed','Avaliação encerrada.',409);
    if(!(await reviewFor(a.id))) await db.tx(async()=>{
      await db.prepare('INSERT INTO reviews(id,assignment_id,started_at) VALUES(?,?,?)').run(id(),a.id,now());
      await db.prepare("UPDATE assignments SET status='in_progress' WHERE id=?").run(a.id); await syncProject(a.project_id);
    });
    return reviewerDTO(await db.prepare('SELECT * FROM assignments WHERE id=?').get(a.id));
  });
  add('PUT','/api/assignments/:id/review','reviewer',async(request,assignmentId)=>{
    object(request.body,['scores','general_comment','finalize','bonus']);
    const a=await assignmentFor(request,assignmentId),review=await reviewFor(a.id);
    assert(request.event.reviews_open&&a.status!=='completed'&&review&&!review.submitted_at,'Inicie uma avaliação disponível antes de salvar.',409);
    assert(typeof request.body.finalize==='boolean','Informe se a avaliação será finalizada.');
    const criteria=await rubric(request.event.id),scores=request.body.scores;
    assert(Array.isArray(scores)&&scores.length<=criteria.length,'Notas inválidas.');
    assert(new Set(scores.map(s=>s?.criterion_id)).size===scores.length,'Critério duplicado.');
    let total=0,weightedMax=0,weightedMin=0;
    const validated=scores.map(s=>{
      object(s,['criterion_id','score','comment']); const c=criteria.find(c=>c.id===s.criterion_id);
      assert(c,'Critério inválido.'); const score=number(s.score,c.name,c.min_score,c.max_score);
      total+=score*c.weight; weightedMax+=c.max_score*c.weight; weightedMin+=c.min_score*c.weight;
      return {criterion_id:c.id,score,comment:string(s.comment??'','Comentário',0,2000)};
    });
    if(request.body.finalize) assert(validated.length===criteria.length,'Preencha todos os critérios antes de finalizar.');
    const comment=string(request.body.general_comment??'','Comentário geral',0,4000);
    // Pontos adicionais: gravados à parte da nota da rubrica, com justificativa e autor.
    // A escala original nunca muda, e normalized_score continua sendo só da rubrica.
    // Em avaliação anônima a justificativa é higienizada ANTES de gravar: o banco não
// deve conservar um identificador que a resposta pública jamais poderá devolver.
    const author=await authorOf(a.project_id);
    const rawBonus=bonusPoints(request.body.bonus??{},request.event);
    const bonus=a.review_mode==='anonymous'
      ? {...rawBonus,justification:redactText(rawBonus.justification,author)}
      : rawBonus;
    await db.tx(async()=>{
      await db.prepare('DELETE FROM review_scores WHERE review_id=?').run(review.id);
      for(const s of validated) await db.prepare('INSERT INTO review_scores(review_id,criterion_id,score,comment) VALUES(?,?,?,?)').run(review.id,s.criterion_id,s.score,s.comment);
      const normalized=weightedMax>weightedMin?(total-weightedMin)/(weightedMax-weightedMin)*100:0;
      await db.prepare('UPDATE reviews SET total_score=?,normalized_score=?,general_comment=?,submitted_at=?,bonus_points=?,bonus_justification=?,bonus_criterion=?,bonus_granted_by=?,bonus_granted_at=? WHERE id=?').run(Math.round(total*100)/100,Math.round(normalized*100)/100,comment,request.body.finalize?now():null,bonus.points,bonus.justification,bonus.criterion,request.user.id,bonus.points>0?now():null,review.id);
      if(request.body.finalize) { await db.prepare("UPDATE assignments SET status='completed' WHERE id=?").run(a.id); await syncProject(a.project_id); }
      if(bonus.points>0) audit(request.user,`review.bonus.${bonus.points}`,'review',review.id);
      audit(request.user,request.body.finalize?'review.submitted':'review.draft_saved','assignment',a.id);
    });
    return {message:request.body.finalize?'Avaliação finalizada com sucesso.':'Rascunho da avaliação salvo.',review:(await reviewerDTO(await db.prepare('SELECT * FROM assignments WHERE id=?').get(a.id))).review};
  });
  add('GET','/api/metrics','organizer',async request=>({...await metrics(db,request.event.id),demo_notice:request.event.demo?demoNotice:null}));
  add('GET','/api/audit','organizer',()=>db.prepare('SELECT l.*,u.name actor_name FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_user_id ORDER BY l.created_at DESC,l.id DESC LIMIT 200').all());
  add('PUT','/api/rubric','organizer',async request=>{
    object(request.body,['criteria']);
    assert(!(await db.prepare('SELECT a.id FROM assignments a JOIN projects p ON p.id=a.project_id WHERE p.event_id=?').get(request.event.id)),'A rubrica está bloqueada após a primeira atribuição. Crie outra edição para alterar os critérios.',409);
    assert(Array.isArray(request.body.criteria)&&request.body.criteria.length>0&&request.body.criteria.length<=20,'Use entre 1 e 20 critérios.');
    const rows=request.body.criteria.map((c,index)=>{
      object(c,['name','description','min_score','max_score','weight']);
      const name=string(c.name,'Nome',2,80),description=string(c.description,'Descrição',0,500),min=number(c.min_score,'Mínimo',0,100),max=number(c.max_score,'Máximo',0,100),weight=number(c.weight,'Peso',0.01,100);
      assert(max>min,'O máximo deve superar o mínimo.'); return [id(),request.event.id,name,description,min,max,weight,index];
    });
    await db.tx(async()=>{
      await db.prepare('DELETE FROM rubric_criteria WHERE event_id=?').run(request.event.id);
      for(const row of rows) await db.prepare('INSERT INTO rubric_criteria(id,event_id,name,description,min_score,max_score,weight,order_index) VALUES(?,?,?,?,?,?,?,?)').run(...row);
      audit(request.user,'rubric.updated','event',request.event.id);
    }); return {message:'Rubrica atualizada.'};
  });
  add('PUT','/api/event','organizer',async request=>{
    const keys=['name','submissions_open','reviews_open','reveal_identity','results_released','comments_released','identified_enabled','protocol','bonus_enabled','bonus_max'];
    object(request.body,keys);
    const e={...request.event};
    for(const key of Object.keys(request.body)) e[key]=['name','protocol'].includes(key)?string(request.body[key],key,key==='name'?3:0,key==='name'?150:4000):boolean(request.body[key],key);
    if('bonus_max' in request.body) e.bonus_max=number(request.body.bonus_max,'Limite de pontos adicionais',0,20);
    const pending=Number((await db.prepare("SELECT count(*) n FROM assignments a JOIN projects p ON p.id=a.project_id WHERE p.event_id=? AND a.status!='completed'").get(e.id)).n);
    if(e.results_released||e.reveal_identity) assert(!e.reviews_open&&!e.submissions_open&&pending===0,'Encerre submissões e avaliações e conclua todas as atribuições antes de liberar resultados ou autoria.',409);
    if(e.identified_enabled) assert(e.protocol.trim().length>=10,'Descreva o protocolo experimental.');
    // Alterar o teto depois de avaliações concluídas invalidaria a comparação já registrada.
    if(e.bonus_max!==Number(request.event.bonus_max)) assert(!(await db.prepare("SELECT r.id FROM reviews r JOIN assignments a ON a.id=r.assignment_id JOIN projects p ON p.id=a.project_id WHERE p.event_id=? AND r.submitted_at IS NOT NULL").get(e.id)),'O limite de pontos adicionais não pode mudar depois que houver avaliações concluídas.',409);
    if(!e.identified_enabled) assert(!(await db.prepare("SELECT a.id FROM assignments a JOIN projects p ON p.id=a.project_id WHERE p.event_id=? AND a.review_mode='identified'").get(e.id)),'Há avaliações identificadas nesta edição. Preserve o protocolo.',409);
    if(e.protocol!==request.event.protocol) assert(!(await db.prepare("SELECT a.id FROM assignments a JOIN projects p ON p.id=a.project_id WHERE p.event_id=? AND a.review_mode='identified'").get(e.id)),'O protocolo está bloqueado após atribuições identificadas.',409);
    await db.tx(async()=>{
      await db.prepare(`UPDATE events SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=?`).run(...keys.map(k=>e[k]),e.id);
      if(e.results_released) await db.prepare("UPDATE projects SET status='results_available' WHERE event_id=? AND status='reviewed'").run(e.id);
      else await db.prepare("UPDATE projects SET status='reviewed' WHERE event_id=? AND status='results_available'").run(e.id);
      audit(request.user,'event.updated','event',e.id);
    }); return {message:'Configuração da edição salva.'};
  });
  add('POST','/api/events','organizer',async request=>{
    object(request.body,['name','year']); const name=string(request.body.name,'Nome',3,150),year=number(request.body.year,'Ano',2026,2100);
    assert(Number.isInteger(year),'Ano inválido.');
    const eventId=await db.tx(async()=>{
      const eventId=await createEvent(db,name,year,false);
      // Códigos precisam ser únicos mesmo quando duas edições compartilham o ano.
      const largest=Number((await db.prepare('SELECT max(CAST(substr(anonymous_code,9) AS INTEGER)) n FROM projects WHERE anonymous_code LIKE ?').get(`BP-${year}-%`)).n||0);
      await db.prepare('UPDATE events SET next_code=? WHERE id=?').run(largest+1,eventId);
      audit(request.user,'event.created','event',eventId); return eventId;
    }); return {id:eventId,message:'Nova edição criada e definida como edição ativa.'};
  });
  add('GET','/api/export','organizer',async request=>{
    const m=await metrics(db,request.event.id);
    // Exportação agregada por condição, sem nomes, códigos ou chaves de indivíduos.
    const rows=[['condicao','avaliacoes','avaliadores','media_0_100','mediana_0_100','tempo_medio_segundos','dados'],...['anonymous','identified'].map(mode=>{const v=m[mode];return [mode,v.count,v.reviewers,v.mean??'',v.median??'',v.average_seconds??'',request.event.demo?demoNotice:'Dados coletados'];})];
    const csv='\uFEFF'+rows.map(row=>row.map(value=>`"${String(value).replace(/"/gu,'""')}"`).join(';')).join('\r\n');
    return {csv,filename:`blindpitch-${request.event.year}-agregado.csv`};
  });

  // ---------- Privacidade, publicação, perfis e pontuação adicional ----------
  add('GET','/api/privacy','participant',async request=>{
    const profile=await privacyOf(request.user.id);
    const projects=await db.prepare('SELECT p.* FROM projects p JOIN project_authors a ON a.project_id=p.id WHERE a.user_id=? AND p.event_id=?').all(request.user.id,request.event.id);
    const requested=await db.prepare('SELECT status FROM reviewer_requests WHERE user_id=?').get(request.user.id);
    return {...profile,portfolio_slug:profile.portfolio_slug||await slugFor(request.user.id),
      reviewer_request:requested?.status||null,
      // Prévia usa a MESMA forma pública da galeria, já higienizada pelo servidor.
      projects:await Promise.all(projects.map(async p=>({id:p.id,status:p.status,title:p.title,scientific_area:p.scientific_area,problem:p.problem,keywords:p.keywords,prefs:await prefsOf(p.id),published:await publishable(p,request.event),preview:await publicProject(p,request.event)})))};
  });
  add('PUT','/api/privacy','participant',async request=>{
    const data=privacyPreferences(request.body);
    await db.prepare(`INSERT INTO privacy_profiles(user_id,identification,public_name,public_bio,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET identification=excluded.identification,public_name=excluded.public_name,public_bio=excluded.public_bio,updated_at=excluded.updated_at`)
      .run(request.user.id,data.identification,data.public_name,data.public_bio,now());
    await slugFor(request.user.id);
    audit(request.user,'privacy.updated','user',request.user.id);
    return {message:'Preferência de identificação salva. A avaliação científica continua anônima.',portfolio_slug:(await privacyOf(request.user.id)).portfolio_slug};
  });
  add('PUT','/api/projects/:id/publication','participant',async(request,projectId)=>{
    const p=await projectFor(request,projectId);
    assert(p.status!=='archived','Este projeto está arquivado.','Removed');
    const targets=publicationTargets(request.body.targets??{});
    await db.prepare(`INSERT INTO publication_prefs(project_id,portfolio,gallery,showcase,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(project_id) DO UPDATE SET portfolio=excluded.portfolio,gallery=excluded.gallery,showcase=excluded.showcase,updated_at=excluded.updated_at`)
      .run(projectId,targets.portfolio,targets.gallery,targets.showcase,now());
    audit(request.user,'publication.updated','project',projectId);
    return {message:'Destinos de publicação salvos.',targets,targets_note:'A publicação depende da aprovação da versão científica e da sua preferência de identificação.'};
  });
  add('GET','/api/profile/reviewer','reviewer',async request=>{
    const profile=await db.prepare('SELECT * FROM reviewer_profiles WHERE user_id=?').get(request.user.id);
    const stats=await db.prepare("SELECT count(*) reviews,avg(r.normalized_score) mean FROM assignments a JOIN reviews r ON r.assignment_id=a.id WHERE a.reviewer_user_id=? AND r.submitted_at IS NOT NULL").get(request.user.id);
    const completed=Number(stats.reviews);
    return {profile:profile?{education_level:profile.education_level,degrees:profile.degrees,courses:profile.courses,specializations:profile.specializations,knowledge_areas:profile.knowledge_areas,bio:profile.bio,public_identity:!!profile.public_identity}:null,
      stats:{reviews_completed:completed,mean_score:completed&&stats.mean!==null?Math.round(stats.mean*10)/10:null}};
  });
  add('PUT','/api/profile/reviewer','reviewer',async request=>{
    const data=reviewerProfile(request.body);
    await db.prepare(`INSERT INTO reviewer_profiles(user_id,education_level,degrees,courses,specializations,knowledge_areas,bio,public_identity,updated_at) VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET education_level=excluded.education_level,degrees=excluded.degrees,courses=excluded.courses,specializations=excluded.specializations,knowledge_areas=excluded.knowledge_areas,bio=excluded.bio,public_identity=excluded.public_identity,updated_at=excluded.updated_at`)
      .run(request.user.id,data.education_level,data.degrees,data.courses,data.specializations,data.knowledge_areas,data.bio,data.public_identity,now());
    audit(request.user,'reviewer.profile.updated','user',request.user.id);
    return {message:'Perfil acadêmico salvo.'};
  });
  // Promoção a avaliador: exclusiva do organizador, auditada e restrita a quem pediu.
  add('PUT','/api/reviewer-requests/:id','organizer',async(request,userId)=>{
    object(request.body,['approve']);
    assert(typeof request.body.approve==='boolean','Informe "approve" verdadeiro ou falso.');
    const target=await db.prepare('SELECT * FROM reviewer_requests WHERE user_id=?').get(userId);
    assert(target,'Pedido não encontrado.',404);
    const user=await db.prepare('SELECT * FROM users WHERE id=?').get(userId);
    assert(user,'Usuário não encontrado.',404);
    assert(user.role!=='organizer','Não é possível alterar o papel de um organizador.');
    if(!request.body.approve){
      assert(target.status==='pending','Este pedido já foi decidido.');
      await db.prepare("UPDATE reviewer_requests SET status='rejected',decided_at=?,decided_by=? WHERE user_id=?").run(now(),request.user.id,userId);
      audit(request.user,'reviewer.request.rejected','user',userId);
      return {message:'Pedido recusado. O participante continua como participante e pode pedir novamente.'};
    }
    assert(target.status!=='approved','Este pedido já foi aprovado.');
    await db.tx(async()=>{
      await db.prepare("UPDATE users SET role='reviewer' WHERE id=?").run(userId);
      await db.prepare("UPDATE reviewer_requests SET status='approved',decided_at=?,decided_by=? WHERE user_id=?").run(now(),request.user.id,userId);
      // ON CONFLICT é aceito tanto pelo SQLite quanto pelo PostgreSQL.
      await db.prepare('INSERT INTO reviewer_profiles(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING').run(userId);
      await db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
      audit(request.user,'reviewer.request.approved','user',userId);
    });
    return {message:'Avaliador aprovado. A sessão anterior foi encerrada por segurança.'};
  });
  add('GET','/api/reviewer-requests','organizer',()=>db.prepare(`SELECT r.user_id,r.status,r.created_at,u.name,u.email,p.school_or_class
    FROM reviewer_requests r JOIN users u ON u.id=r.user_id
    LEFT JOIN participant_profiles p ON p.user_id=u.id
    WHERE r.status='pending' ORDER BY r.created_at`).all());

  // ---------- Superfícies públicas: apenas o que o autor autorizou ----------
  // Link de portfólio ligado ao projeto, quando o autor autorizou esse destino.
  const withPortfolio = async (project,request) => {
    const prefs=await prefsOf(project.id);
    const author=await authorOf(project.id);
    const slug=prefs.portfolio&&author?(await db.prepare('SELECT portfolio_slug FROM privacy_profiles WHERE user_id=?').get(author.id))?.portfolio_slug:'';
    return {...await publicProject(project,request.event),...(slug?{portfolio_slug:slug}:{})};
  };
  add('GET','/api/public/gallery',null,async request=>{
    const rows=await db.prepare('SELECT p.* FROM projects p WHERE p.event_id=?').all(request.event.id);
    const visible=[];
    for(const p of rows) if(await publishable(p,request.event)&&(await prefsOf(p.id)).gallery) visible.push(p);
    return {projects:(await Promise.all(visible.map(p=>withPortfolio(p,request)))).slice(0,60),demo_notice:request.event.demo?demoNotice:null};
  });
  add('GET','/api/public/showcase',null,async request=>{
    const rows=await db.prepare('SELECT p.* FROM projects p WHERE p.event_id=?').all(request.event.id);
    const visible=[];
    for(const p of rows) if(await publishable(p,request.event)&&(await prefsOf(p.id)).showcase) visible.push(p);
    return {event:{name:request.event.name,year:request.event.year},projects:(await Promise.all(visible.map(p=>withPortfolio(p,request)))).slice(0,60)};
  });
  add('GET','/api/public/portfolio/:slug',null,async(request,slug)=>{
    // O endereço é um token aleatório — nunca nome, e-mail, id ou matrícula.
    const normalized=decodeURIComponent(slug).trim().toLowerCase();
    assert(/^bp-[a-f0-9]{8}$/u.test(normalized),'Endereço inválido.',404);
    const row=await db.prepare('SELECT user_id,public_name,public_bio FROM privacy_profiles WHERE portfolio_slug=?').get(normalized);
    assert(row,'Portfólio não encontrado.',404);
    const candidates=await db.prepare('SELECT p.* FROM projects p JOIN project_authors a ON a.project_id=p.id WHERE a.user_id=? AND p.event_id=?').all(row.user_id,request.event.id);
    const projects=[];
    for(const p of candidates) if(await publishable(p,request.event)&&(await prefsOf(p.id)).portfolio) projects.push(p);
    const displayed=await displayName(row.user_id,request.event);
    const firstAuthor=projects[0]?await authorOf(projects[0].id):{name:displayed};
    return {slug:normalized,name:displayed,anonymous:!displayed,bio:displayed?redactText(row.public_bio,firstAuthor):'',projects:await Promise.all(projects.map(p=>publicProject(p,request.event)))};
  });

  // ---------- Perfil público do avaliador: apenas campos autorizados ----------
  add('GET','/api/public/reviewers',null,async()=>{
    const rows=await db.prepare('SELECT r.*,u.name FROM reviewer_profiles r JOIN users u ON u.id=r.user_id WHERE r.public_identity=1').all();
    return {reviewers:await Promise.all(rows.map(async r=>{
      const stats=await db.prepare("SELECT count(*) n,avg(x.normalized_score) mean FROM assignments a JOIN reviews x ON x.assignment_id=a.id WHERE a.reviewer_user_id=? AND x.submitted_at IS NOT NULL").get(r.user_id);
      const reviews=Number(stats.n);
      const mean=stats.mean===null||stats.mean===undefined?null:Math.round(stats.mean*10)/10;
      return {name:r.name,education_level:r.education_level,degrees:r.degrees,courses:r.courses,specializations:r.specializations,knowledge_areas:r.knowledge_areas,bio:redactText(r.bio,{name:r.name}),
        reviews_completed:reviews,mean_score:reviews?mean:null};}))};
  });

  async function handler(raw,response) {
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('X-Frame-Options','DENY');
    response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const url=new URL(raw.url,'http://localhost');
      if(!url.pathname.startsWith('/api/')) {
        assert(['GET','HEAD'].includes(raw.method),'Método não permitido.',405);
        let relative;try{relative=decodeURIComponent(url.pathname);}catch{throw new HttpError(400,'Endereço inválido.');}
        assert(!relative.split('/').some(segment=>segment.startsWith('.')),'Recurso não encontrado.',404);
        const path=resolve(publicDir,`.${relative}`);
        assert(path.startsWith(resolve(publicDir)+sep)||path===resolve(publicDir),'Recurso não encontrado.',404);
        let file=path;
        try { const s=await stat(file); if(!s.isFile()) file=resolve(publicDir,'index.html'); }
        catch { if(extname(path)) throw new HttpError(404,'Recurso não encontrado.'); file=resolve(publicDir,'index.html'); }
        const info=await stat(file),etag=`W/"${info.size.toString(16)}-${info.mtimeMs.toString(16)}"`;
        response.setHeader('ETag',etag);
        response.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');
        response.setHeader('Cache-Control','no-cache');
        if(raw.headers['if-none-match']?.split(',').map(value=>value.trim()).some(value=>value===etag||value==='*')) {response.statusCode=304;response.end();return;}
        response.setHeader('Content-Length',info.size);
        response.end(raw.method==='HEAD'?undefined:await readFile(file)); return;
      }
      response.setHeader('Content-Type','application/json; charset=utf-8');
      response.setHeader('Cache-Control','no-store');
      const match=routes.map(route=>({route,match:url.pathname.match(route.pattern)})).find(item=>item.match&&item.route.method===raw.method);
      assert(match,'Rota não encontrada.',404);
      const request={raw,response,url,user:null,session:null,body:{}};
      const cookie=raw.headers.cookie?.match(/(?:^|;\s*)bp_session=([a-f0-9]{64})(?:;|$)/u)?.[1];
      if(cookie) {
        const session=await db.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').get(tokenHash(cookie),Date.now());
        if(session) {
          const user=await db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(session.user_id);
          if(user) { request.user=user; request.session=session; }
        }
      }
      const {route}=match;
      if(route.role) {
        assert(request.user,'Entre para continuar.',401);
        assert(route.role==='authenticated'||route.role.split('|').includes(request.user.role),'Acesso não permitido.',403);
      }
      if(!['GET','HEAD'].includes(raw.method)) {
        // SameSite não substitui verificação explícita de origem/CSRF.
        if(raw.headers.origin) {
          let origin;try{origin=new URL(raw.headers.origin);}catch{throw new HttpError(403,'Origem não permitida.');}
          assert(['http:','https:'].includes(origin.protocol)&&origin.host===raw.headers.host,'Origem não permitida.',403);
        }
        if(request.session) assert(raw.headers['x-csrf-token']===request.session.csrf,'Sessão inválida. Atualize a página.',403);
        assert(raw.headers['content-type']?.split(';')[0]==='application/json','Envie JSON.',415);
        let size=0; const chunks=[];
        const bodyLimit=/^\/api\/projects(?:\/|$)/u.test(url.pathname)?1024*1024:128*1024;
        for await(const chunk of raw) { size+=chunk.length; assert(size<=bodyLimit,'Dados excedem o limite permitido.',413); chunks.push(chunk); }
        try { request.body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'); }
        catch { throw new HttpError(400,'JSON inválido.'); }
        assert(request.body&&typeof request.body==='object'&&!Array.isArray(request.body),'Dados inválidos.');
      }
      if(!['/api/login','/api/logout','/api/session','/api/events'].includes(url.pathname)) request.event=await getEvent(request);
      const result=await route.fn(request,...match.match.slice(1));
      response.end(JSON.stringify(result));
    } catch(error) {
      const status=error instanceof HttpError?error.status:500;
      response.statusCode=status;
      response.removeHeader('Content-Length');response.removeHeader('ETag');
      response.setHeader('Cache-Control','no-store');
      response.setHeader('Content-Type','application/json; charset=utf-8');
      if(status===500) console.error('Falha interna:',error.code||error.name,error.message);
      response.end(JSON.stringify({error:status===500?'Não foi possível concluir a operação.':error.message}));
    }
  }
  return handler;
}
