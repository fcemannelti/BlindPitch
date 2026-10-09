export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function requireCondition(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}
export function object(value, keys) {
  requireCondition(value && typeof value === 'object' && !Array.isArray(value), 'Dados inválidos.');
  requireCondition(Object.keys(value).every(key => keys.includes(key)), 'Campo não permitido.');
  return value;
}
export function string(value, label, min = 0, max = 6000) {
  requireCondition(typeof value === 'string', `${label}: texto obrigatório.`);
  const text = value.trim().normalize('NFC');
  requireCondition(text.length >= min && text.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text), `${label}: use entre ${min} e ${max} caracteres.`);
  return text;
}
export function number(value, label, min, max) {
  requireCondition(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, `${label}: valor entre ${min} e ${max}.`);
  return value;
}
export function boolean(value, label) {
  requireCondition(typeof value === 'boolean', `${label}: valor inválido.`); return +value;
}
export const requiredScientificFields = ['title','scientific_area','problem','objective','methodology','proposed_solution','expected_impact','keywords'];
export const optionalScientificFields = ['abstract','justification','specific_objectives','hypothesis','materials','social_relevance','sustainability','expected_results','obtained_results','references'];
export const scientificFields = ['title','scientific_area','abstract','problem','justification','objective','specific_objectives','hypothesis','methodology','proposed_solution','materials','expected_impact','social_relevance','sustainability','expected_results','obtained_results','keywords','references'];
export const scientificLimits = Object.fromEntries(scientificFields.map(key=>[key, key==='methodology'?20000:key==='abstract'?4000:key==='keywords'?600:['title','scientific_area'].includes(key)?300:12000]));
export function scientificContent(data, complete = false) {
  object(data, scientificFields);
  return Object.fromEntries(scientificFields.map(key => [key, string(data[key] ?? '', key, (complete && requiredScientificFields.includes(key)) || ['title','scientific_area'].includes(key) ? 3 : 0, scientificLimits[key])]));
}
export function credentials(data, registration = false) {
  object(data, registration ? ['name','email','password','school_or_class','consent','wants_to_review'] : ['email','password']);
  const email = string(data.email, 'E-mail', 5, 200).toLowerCase();
  requireCondition(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email), 'E-mail inválido.');
  const result = { email, password: string(data.password, 'Senha', registration ? 10 : 1, 128) };
  if (registration) {
    result.name = string(data.name, 'Nome', 3, 100);
    result.school_or_class = string(data.school_or_class ?? '', 'Escola/turma', 0, 150);
    result.consent = boolean(data.consent, 'Ciência da pesquisa');
    // A opção declara intenção apenas. O papel de avaliador continua concedido pelo
    // organizador em /api/reviewers; nunca por auto-cadastro.
    result.wants_to_review = boolean(data.wants_to_review ?? false, 'Quero avaliar');
  }
  return result;
}
export const identificationOptions = ['immediate','after_approval','never'];
export function identification(value) {
  requireCondition(typeof value === 'string' && identificationOptions.includes(value), 'Escolha uma das opções de identificação.');
  return value;
}
export function publicationTargets(value) {
  requireCondition(value === null || (value && typeof value === 'object' && !Array.isArray(value)), 'Destinos inválidos.');
  const allowed = ['portfolio','gallery','showcase'];
  requireCondition(Object.keys(value).every(key => allowed.includes(key)), 'Destino não permitido.');
  return Object.fromEntries(allowed.map(key => [key, boolean(value[key] ?? false, 'Destino')]));
}
export function privacyPreferences(data) {
  object(data, ['identification','public_name','public_bio']);
  return {
    identification: identification(data.identification),
    public_name: string(data.public_name ?? '', 'Nome público', 0, 100),
    public_bio: string(data.public_bio ?? '', 'Apresentação', 0, 1000)
  };
}
export function reviewerProfile(data) {
  object(data, ['education_level','degrees','courses','specializations','knowledge_areas','bio','public_identity']);
  return {
    education_level: string(data.education_level ?? '', 'Nível de escolaridade', 0, 80),
    degrees: string(data.degrees ?? '', 'Graduações', 0, 400),
    courses: string(data.courses ?? '', 'Cursos', 0, 400),
    specializations: string(data.specializations ?? '', 'Especializações', 0, 400),
    knowledge_areas: string(data.knowledge_areas ?? '', 'Áreas de conhecimento', 0, 400),
    bio: string(data.bio ?? '', 'Biografia', 0, 1000),
    public_identity: boolean(data.public_identity ?? false, 'Identidade pública')
  };
}
export function bonusPoints(data, policy) {
  object(data, ['points','justification','criterion']);
  const max = Number(policy.bonus_max ?? 2);
  const points = number(data.points ?? 0, 'Pontos adicionais', 0, 100);
  const justification = string(data.justification ?? '', 'Justificativa', 0, 2000);
  const criterion = string(data.criterion ?? '', 'Critério', 0, 200);
  requireCondition(points <= max, `Os pontos adicionais não podem ultrapassar ${max}.`);
  // Pontos sem justificativa verificável são rejeitados no servidor, não só na interface.
  requireCondition(points === 0 || justification.length >= 10, 'Informe uma justificativa de pelo menos 10 caracteres para os pontos adicionais.');
  requireCondition(points === 0 || Number(policy.bonus_enabled) === 1, 'Pontos adicionais não estão habilitados nesta edição.');
  return { points: points > 0 ? points : 0, justification: points > 0 ? justification : '', criterion: points > 0 ? criterion : '' };
}
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
// Campos deriveis do nome que podem denunciar autoria em texto livre.
export function nameHints(author) {
  if (!author?.name) return [];
  return author.name.split(/\s+/u).filter(part => part.length >= 4);
}
export function redactContent(content, author) {
  const privateValues = [author?.name, author?.email, author?.school_or_class].filter(value => value && value.length >= 3);
  // Nomes completos e componentes relevantes, além dos dados identificadores conhecidos.
  if (author?.name) privateValues.push(...nameHints(author));
  return Object.fromEntries(scientificFields.map(key => {
    let text = content[key] ?? '';
    for (const value of privateValues) text = text.replace(new RegExp(escapeRegex(value), 'giu'), '[informação removida]');
    text = text.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/giu, '[e-mail removido]')
      .replace(/(?:https?:\/\/|www\.)[^\s]+/giu, '[link removido]')
      .replace(/(?:\+?\d[\d ().-]{7,}\d)/gu, '[identificador removido]');
    return [key, text];
  }));
}
// Texto livre de perfil e justificativa: mesma política de remoção de identificadores.
export function redactText(text, author) {
  const privateValues = [author?.name, author?.email, author?.school_or_class].filter(value => value && value.length >= 3);
  if (author?.name) privateValues.push(...nameHints(author));
  let clean = String(text ?? '');
  for (const value of privateValues) clean = clean.replace(new RegExp(escapeRegex(value), 'giu'), '[informação removida]');
  return clean.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/giu, '[e-mail removido]')
    .replace(/(?:https?:\/\/|www\.)[^\s]+/giu, '[link removido]')
    .replace(/(?:\+?\d[\d ().-]{7,}\d)/gu, '[identificador removido]');
}
