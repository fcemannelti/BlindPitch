import { randomBytes } from 'node:crypto';
import { createEvent, id, now, passwordHash } from './db/index.mjs';
import { scientificContent, scientificFields, optionalScientificFields, redactContent } from './validation.mjs';
import { demoProposals } from './demo-proposals.mjs';
export const demoPassword = 'BlindPitch2026!';
const legacyText={problem:'O uso pouco eficiente dos recursos afeta a comunidade e exige investigação científica.',objective:'Investigar uma alternativa acessível e medir seus efeitos em condições controladas.',methodology:'Construir um protótipo, definir um grupo de comparação e registrar medições durante quatro semanas.',proposed_solution:'Aplicar materiais acessíveis e sensores para acompanhar o processo e orientar decisões.',expected_impact:'Pode contribuir para o uso responsável de recursos. Os efeitos serão analisados experimentalmente.',keywords:'sustentabilidade, sensores, experimentação'};
export async function enrichLegacyDemo(db) {
  let updated=0;
  await db.tx(async()=>{
    const rows=await db.prepare('SELECT p.*,u.name,u.email,pp.school_or_class FROM projects p JOIN events e ON e.id=p.event_id JOIN project_authors a ON a.project_id=p.id JOIN users u ON u.id=a.user_id LEFT JOIN participant_profiles pp ON pp.user_id=u.id WHERE e.demo=1').all();
    for(const row of rows) {
      const index=demoProposals.findIndex(p=>p.title===row.title && p.scientific_area===row.scientific_area);
      if(index<0 || row.email!==`participante${index%3+1}@blindpitch.demo`)continue;
      const legacy={title:row.title,scientific_area:row.scientific_area,...legacyText};
      // Não sobrescrever propostas ou versões anônimas editadas pelo usuário.
      if(!Object.entries(legacy).every(([key,value])=>row[key]===value) || optionalScientificFields.some(key=>row[key]))continue;
      if(row.sanitized_content) {
        let sanitized;try{sanitized=JSON.parse(row.sanitized_content);}catch{continue;}
        if(!Object.entries(legacy).every(([key,value])=>sanitized[key]===value) || Object.keys(sanitized).some(key=>!Object.hasOwn(legacy,key)&&sanitized[key]))continue;
      }
      const content=scientificContent(demoProposals[index],true);
      await db.prepare(`UPDATE projects SET ${scientificFields.map(key=>`"${key}"=?`).join(',')},sanitized_content=? WHERE id=?`).run(...Object.values(content),row.sanitized_content?JSON.stringify(redactContent(content,row)):null,row.id);
      updated++;
    }
  });
  return updated;
}
// Conteúdo demonstrativo das superfícies novas: privacidade, publicação e perfis.
// Idempotente — nunca sobrescreve uma escolha já feita por quem usa a plataforma.
export async function enrichPrivacyDemo(db) {
  const event = await db.prepare('SELECT id FROM events WHERE demo=1 LIMIT 1').get();
  if (!event) return false;
  let created = 0;
  await db.tx(async () => {
    // Um projeto revisado autorizado aos três destinos, para a galeria não ficar vazia.
    const published = await db.prepare(`SELECT p.id FROM projects p
      JOIN project_authors a ON a.project_id=p.id JOIN users u ON u.id=a.user_id
      WHERE p.event_id=? AND u.email='participante2@blindpitch.demo'
        AND p.status='reviewed' AND p.anonymization_approved=1 LIMIT 1`).get(event.id);
    if (published && await db.prepare('SELECT 1 FROM publication_prefs WHERE project_id=?').get(published.id)) {
      // já configurado por quem usa a plataforma
    } else if (published) {
      await db.prepare('INSERT INTO publication_prefs(project_id,portfolio,gallery,showcase) VALUES(?,1,1,1)').run(published.id);
      created++;
    }
    // Perfis acadêmicos: um autorizado publicamente, outro privado.
    const reviewers = await db.prepare("SELECT id,name,email FROM users WHERE role='reviewer' ORDER BY created_at").all();
    for(const [index,reviewer] of reviewers.entries()) {
      if (await db.prepare('SELECT 1 FROM reviewer_profiles WHERE user_id=?').get(reviewer.id)) continue;
      const isPublic = index === 0;
      await db.prepare(`INSERT INTO reviewer_profiles(user_id,education_level,degrees,courses,specializations,knowledge_areas,bio,public_identity)
        VALUES(?,?,?,?,?,?,?,?)`).run(
        reviewer.id,
        isPublic ? 'Especialização' : 'Graduação',
        isPublic ? 'Licenciatura em Ciências' : '',
        isPublic ? 'Metodologia científica aplicada ao ensino' : '',
        '', isPublic ? 'Ciências ambientais, Estatística' : 'Biologia',
        isPublic ? 'Atua com estudantes do ensino médio em projetos de investigação escolar.' : '',
        isPublic ? 1 : 0);
      created++;
    }
    // Um pedido de avaliação pendente, para a tela de decisão existir de fato.
    const requester = await db.prepare("SELECT id FROM users WHERE email='participante3@blindpitch.demo'").get();
    if (requester && !(await db.prepare('SELECT 1 FROM reviewer_requests WHERE user_id=?').get(requester.id))) {
      await db.prepare("INSERT INTO reviewer_requests(user_id,status,created_at) VALUES(?,'pending',?)").run(requester.id,now());
      created++;
    }
  });
  return created;
}
export async function seed(db) {
  if ((await db.prepare('SELECT count(*) n FROM users').get()).n) {await enrichLegacyDemo(db);await enrichPrivacyDemo(db);return false;}
  await db.tx(async () => {
    const eventId = await createEvent(db, 'Ceará Faz Ciência 2026', 2026, true);
    await db.prepare("UPDATE events SET identified_enabled=1,protocol='Protocolo fictício para demonstração. Coleta real exige definição e aprovação pelo orientador.' WHERE id=?").run(eventId);
    const accounts = [['Helena Campos','organizador@blindpitch.demo','organizer'],['Lúcia Duarte','avaliador1@blindpitch.demo','reviewer'],['Rafael Costa','avaliador2@blindpitch.demo','reviewer'],['Marina Alves','participante1@blindpitch.demo','participant'],['Beatriz Lima','participante2@blindpitch.demo','participant'],['Caio Nunes','participante3@blindpitch.demo','participant']];
    const userIds = [];
    for(const [index,account] of accounts.entries()) {
      const [name,email,role]=account;
      const userId=id();
      await db.prepare('INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(userId,name,email,passwordHash(demoPassword),role,now());
      if(role==='participant') {
        await db.prepare('INSERT INTO participant_profiles(user_id,school_or_class,consent) VALUES(?,?,1)').run(userId,'Escola fictícia Aurora');
        await db.prepare('INSERT INTO event_consents(user_id,event_id,protocol,consented_at) SELECT ?,id,protocol,? FROM events WHERE id=?').run(userId,now(),eventId);
        // Uma preferência por participante, cobrindo as três opções disponíveis.
        const identification=['immediate','after_approval','never'][(index-3)%3];
        await db.prepare('INSERT INTO privacy_profiles(user_id,identification,public_name,portfolio_slug) VALUES(?,?,?,?)')
          .run(userId,identification,identification==='never'?'':name,`bp-${randomBytes(4).toString('hex')}`);
      }
      userIds.push(userId);
    }
    for(const [index,proposal] of demoProposals.entries()) {
      const projectId=id(), status=['reviewed','under_review','assigned','submitted','reviewed','draft'][index];
      const content=scientificContent(proposal,true);
      await db.prepare(`INSERT INTO projects(id,event_id,anonymous_code,created_at,${scientificFields.map(key=>`"${key}"`).join(',')},status,submitted_at,sanitized_content,anonymization_approved) VALUES(${Array(scientificFields.length+8).fill('?').join(',')})`).run(projectId,eventId,index===5?null:`BP-2026-${String(index+1).padStart(4,'0')}`,now(),...Object.values(content),status,index===5?null:now(),index===5?null:JSON.stringify(redactContent(content,{})),index===5?0:1);
      await db.prepare('INSERT INTO project_authors(project_id,user_id) VALUES(?,?)').run(projectId,userIds[3+index%3]);
      if([0,1,2,4].includes(index)) {
        const assignmentId=id(), complete=[0,4].includes(index), started=index===1;
        await db.prepare('INSERT INTO assignments(id,project_id,reviewer_user_id,review_mode,status) VALUES(?,?,?,?,?)').run(assignmentId,projectId,userIds[index===4?2:1],index===4?'identified':'anonymous',complete?'completed':started?'in_progress':'pending');
        if(complete||started) {
          const reviewId=id();
          const timestamp=new Date(Date.now()-600000).toISOString();
          const score=index===4?8.5:8;
          await db.prepare('INSERT INTO reviews(id,assignment_id,total_score,normalized_score,general_comment,started_at,submitted_at) VALUES(?,?,?,?,?,?,?)').run(reviewId,assignmentId,complete?score*6:0,complete?score*10:0,complete?'Proposta promissora; detalhar o controle experimental.':'',timestamp,complete?now():null);
          for(const c of await db.prepare('SELECT id FROM rubric_criteria WHERE event_id=?').all(eventId)) await db.prepare('INSERT INTO review_scores(review_id,criterion_id,score) VALUES(?,?,?)').run(reviewId,c.id,score);
        }
      }
    }
    await db.prepare('UPDATE events SET next_code=6 WHERE id=?').run(eventId);
  });
  await enrichPrivacyDemo(db);
  return true;
}
