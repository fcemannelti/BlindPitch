// Núcleo independente de dialeto: hashes, ids, relógio e criação de edição.
// Nenhum SQL específico de SQLite ou PostgreSQL aparece aqui.
import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const id = () => randomUUID();
export const now = () => new Date().toISOString();

// Converte booleanos em 0/1. O schema histórico usa INTEGER para sinalizadores
// (active, consent, reveal_identity...). Manter inteiros preserva a leitura
// `!!row.flag` usada por toda a API e evita divergência entre os dois motores.
export const flag = value => (value ? 1 : 0);

// Violação de unicidade detectada nos dois motores.
// O SQLite serializa as transações (BEGIN IMMEDIATE), então a checagem
// "existe?" antes do INSERT nunca corre. No PostgreSQL, com Read Committed,
// duas requisições simultâneas passam na checagem e uma falha no INSERT
// (SQLSTATE 23505). Sem esta tradução, o usuário veria 500 em vez de 409.
export const isUniqueViolation = error =>
  error?.code === '23505' || /UNIQUE constraint failed|duplicate key value/iu.test(error?.message ?? '');

export function bind(values) {
  return values.map(value => {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
  });
}

export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password, hash) {
  const [salt, key] = hash.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(key, 'hex'));
}

// Descrição padrão da rubrica criada junto com cada edição.
const DEFAULT_CRITERIA = [
  ['Problema', 'O problema é relevante e está bem definido?'],
  ['Inovação', 'A proposta apresenta uma abordagem original?'],
  ['Metodologia', 'O método permite investigar o objetivo?'],
  ['Viabilidade', 'A execução é possível com os recursos apresentados?'],
  ['Impacto', 'Quais contribuições são esperadas?'],
  ['Clareza', 'As ideias estão organizadas e compreensíveis?']
];

// Criação de edição é usada tanto pela instalação real quanto pelo seed de
// demonstração, então precisa funcionar igualmente nos dois motores.
export async function createEvent(db, name, year, demo = false) {
  const eventId = id();
  await db.prepare('INSERT INTO events(id,name,year,demo) VALUES(?,?,?,?)').run(eventId, name, year, flag(demo));
  for (const [index, [criterion, description]] of DEFAULT_CRITERIA.entries()) {
    await db.prepare('INSERT INTO rubric_criteria(id,event_id,name,description,order_index) VALUES(?,?,?,?,?)')
      .run(id(), eventId, criterion, description, index);
  }
  await db.prepare("INSERT INTO settings(key,value) VALUES('active_event',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(eventId);
  return eventId;
}
