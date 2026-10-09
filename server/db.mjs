import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { optionalScientificFields, credentials, requireCondition } from './validation.mjs';

export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password, hash) {
  const [salt, key] = hash.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(key, 'hex'));
}
export function openDb(path = './data/blindpitch.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  if(!db.prepare('SELECT version FROM schema_migrations WHERE version=2').get()) transaction(db,()=>{
    // Migração de consentimentos da primeira versão local, apenas em edições demo.
    db.exec(`INSERT OR IGNORE INTO event_consents(user_id,event_id,protocol,consented_at)
      SELECT p.user_id,e.id,e.protocol,CURRENT_TIMESTAMP FROM participant_profiles p CROSS JOIN events e
      WHERE p.consent=1 AND e.demo=1 AND e.identified_enabled=1;
      INSERT INTO schema_migrations(version) VALUES(2);`);
  });
  if(!db.prepare('SELECT version FROM schema_migrations WHERE version=3').get()) transaction(db,()=>{
    // Migração aditiva: preserva conteúdo, autoria, códigos e vínculos de avaliação.
    const columns=new Set(db.prepare('PRAGMA table_info(projects)').all().map(column=>column.name));
    for(const field of optionalScientificFields) if(!columns.has(field)) db.exec(`ALTER TABLE projects ADD COLUMN "${field}" TEXT NOT NULL DEFAULT '';`);
    db.exec('INSERT INTO schema_migrations(version) VALUES(3);');
  });
  if(!db.prepare('SELECT version FROM schema_migrations WHERE version=4').get()) transaction(db,()=>{
    // Migração aditiva de privacidade, publicação, perfis e pontuação adicional.
    // Nenhuma coluna é removida e nenhum registro existente é alterado ou apagado.
    const add=(table,column,definition)=>{ if(!new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name)).has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`); };
    add('events','bonus_enabled','INTEGER NOT NULL DEFAULT 1');
    add('events','bonus_max','REAL NOT NULL DEFAULT 2');
    add('reviews','bonus_points','REAL NOT NULL DEFAULT 0');
    add('reviews','bonus_justification',"TEXT NOT NULL DEFAULT ''");
    add('reviews','bonus_criterion',"TEXT NOT NULL DEFAULT ''");
    add('reviews','bonus_granted_by','TEXT');
    add('reviews','bonus_granted_at','TEXT');
    // Contas anteriores recebem o perfil padrão sem alterar o papel já armazenado.
    db.exec(`INSERT OR IGNORE INTO privacy_profiles(user_id,identification,public_name,public_bio)
      SELECT id,'after_approval','','' FROM users WHERE role='participant';`);
    db.exec('INSERT INTO schema_migrations(version) VALUES(4);');
  });
  if(!db.prepare('SELECT version FROM schema_migrations WHERE version=5').get()) transaction(db,()=>{
    // Endereço do portfólio público: token aleatório, nunca derivado de nome,
    // matrícula ou e-mail. Impede que a URL revele quem é o autor.
    if(!new Set(db.prepare('PRAGMA table_info(privacy_profiles)').all().map(c=>c.name)).has('portfolio_slug'))
      db.exec("ALTER TABLE privacy_profiles ADD COLUMN portfolio_slug TEXT NOT NULL DEFAULT '';");
    db.exec("UPDATE privacy_profiles SET portfolio_slug='bp-'||lower(hex(randomblob(4))) WHERE portfolio_slug='';");
    db.exec('INSERT INTO schema_migrations(version) VALUES(5);');
  });
  return db;
}
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function initializeRealDb(db,email,password) {
  if(db.prepare('SELECT id FROM events LIMIT 1').get())return false;
  const account=credentials({name:'Organização',email,password,school_or_class:'',consent:false},true);
  requireCondition(account.password.length>=12,'Defina ADMIN_PASSWORD com pelo menos 12 caracteres após remover espaços externos.');
  transaction(db,()=>{
    createEvent(db,'Ceará Faz Ciência 2026',2026);
    db.prepare("INSERT INTO users(id,name,email,password_hash,role) VALUES(?,?,?,?,'organizer')").run(id(),account.name,account.email,passwordHash(account.password));
  });
  return true;
}
export function createEvent(db, name, year, demo = false) {
  const eventId = id();
  db.prepare('INSERT INTO events(id,name,year,demo) VALUES(?,?,?,?)').run(eventId, name, year, +demo);
  const descriptions = [
    'O problema é relevante e está bem definido?', 'A proposta apresenta uma abordagem original?',
    'O método permite investigar o objetivo?', 'A execução é possível com os recursos apresentados?',
    'Quais contribuições são esperadas?', 'As ideias estão organizadas e compreensíveis?'
  ];
  ['Problema','Inovação','Metodologia','Viabilidade','Impacto','Clareza'].forEach((name, index) => {
    db.prepare('INSERT INTO rubric_criteria(id,event_id,name,description,order_index) VALUES(?,?,?,?,?)')
      .run(id(), eventId, name, descriptions[index], index);
  });
  db.prepare("INSERT INTO settings(key,value) VALUES('active_event',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(eventId);
  return eventId;
}
