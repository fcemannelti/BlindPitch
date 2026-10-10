-- Schema PostgreSQL do BlindPitch.
-- Espelha db/schema.sql (SQLite) mantendo as mesmas 18 tabelas e as mesmas
-- chaves, para que a importação preserve IDs e relacionamentos.
--
-- Diferenças intencionais em relação ao SQLite:
--  * REAL            -> DOUBLE PRECISION
--  * expires_at      -> BIGINT (epoch em ms excede INTEGER de 32 bits)
--  * COLLATE NOCASE  -> removido; toda entrada de e-mail é normalizada em
--    minúsculas por server/validation.mjs antes de chegar ao banco
--  * created_at      -> texto ISO escrito pela aplicação. O SQLite usava
--    CURRENT_TIMESTAMP (precisão de 1s), que não é ordenável de forma estável.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('participant','reviewer','organizer')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS participant_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  school_or_class TEXT NOT NULL DEFAULT '',
  consent INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  submissions_open INTEGER NOT NULL DEFAULT 1,
  reviews_open INTEGER NOT NULL DEFAULT 1,
  reveal_identity INTEGER NOT NULL DEFAULT 0,
  results_released INTEGER NOT NULL DEFAULT 0,
  comments_released INTEGER NOT NULL DEFAULT 0,
  identified_enabled INTEGER NOT NULL DEFAULT 0,
  protocol TEXT NOT NULL DEFAULT '',
  demo INTEGER NOT NULL DEFAULT 0,
  next_code INTEGER NOT NULL DEFAULT 1,
  bonus_enabled INTEGER NOT NULL DEFAULT 1,
  bonus_max DOUBLE PRECISION NOT NULL DEFAULT 2
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_consents (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  protocol TEXT NOT NULL,
  consented_at TEXT NOT NULL,
  PRIMARY KEY (user_id, event_id)
);

-- Projetos científicos não contêm chaves nem dados pessoais do participante.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  anonymous_code TEXT UNIQUE,
  title TEXT NOT NULL,
  scientific_area TEXT NOT NULL,
  problem TEXT NOT NULL DEFAULT '',
  objective TEXT NOT NULL DEFAULT '',
  methodology TEXT NOT NULL DEFAULT '',
  proposed_solution TEXT NOT NULL DEFAULT '',
  expected_impact TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '',
  abstract TEXT NOT NULL DEFAULT '',
  justification TEXT NOT NULL DEFAULT '',
  specific_objectives TEXT NOT NULL DEFAULT '',
  hypothesis TEXT NOT NULL DEFAULT '',
  materials TEXT NOT NULL DEFAULT '',
  social_relevance TEXT NOT NULL DEFAULT '',
  sustainability TEXT NOT NULL DEFAULT '',
  expected_results TEXT NOT NULL DEFAULT '',
  obtained_results TEXT NOT NULL DEFAULT '',
  "references" TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','assigned','under_review','reviewed','results_available','archived')),
  created_at TEXT NOT NULL DEFAULT '',
  submitted_at TEXT,
  sanitized_content TEXT,
  anonymization_approved INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS project_authors (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rubric_criteria (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  min_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  max_score DOUBLE PRECISION NOT NULL DEFAULT 10,
  weight DOUBLE PRECISION NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL,
  CHECK (max_score > min_score AND weight > 0)
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reviewer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_mode TEXT NOT NULL CHECK (review_mode IN ('anonymous','identified')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed')),
  UNIQUE (project_id, reviewer_user_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL UNIQUE REFERENCES assignments(id) ON DELETE CASCADE,
  total_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  normalized_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  general_comment TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  bonus_points DOUBLE PRECISION NOT NULL DEFAULT 0,
  bonus_justification TEXT NOT NULL DEFAULT '',
  bonus_criterion TEXT NOT NULL DEFAULT '',
  bonus_granted_by TEXT REFERENCES users(id),
  bonus_granted_at TEXT
);

CREATE TABLE IF NOT EXISTS review_scores (
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  criterion_id TEXT NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
  score DOUBLE PRECISION NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (review_id, criterion_id)
);

-- Preferência de identificação pública do participante. Independentemente dela, a
-- avaliação científica continua anônima: a preferência só governa a exposição pública.
CREATE TABLE IF NOT EXISTS privacy_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  identification TEXT NOT NULL DEFAULT 'after_approval'
    CHECK (identification IN ('immediate','after_approval','never')),
  public_name TEXT NOT NULL DEFAULT '',
  public_bio TEXT NOT NULL DEFAULT '',
  portfolio_slug TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);

-- Autorização de publicação por projeto, independente do consentimento de identidade.
CREATE TABLE IF NOT EXISTS publication_prefs (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  portfolio INTEGER NOT NULL DEFAULT 0,
  gallery INTEGER NOT NULL DEFAULT 0,
  showcase INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ''
);

-- Perfil acadêmico do avaliador: dados internos nunca lidos por outro avaliador.
CREATE TABLE IF NOT EXISTS reviewer_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  education_level TEXT NOT NULL DEFAULT '',
  degrees TEXT NOT NULL DEFAULT '',
  courses TEXT NOT NULL DEFAULT '',
  specializations TEXT NOT NULL DEFAULT '',
  knowledge_areas TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  public_identity INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ''
);

-- Pedido de avaliação feito no cadastro. Não concede o papel: apenas o organizador decide.
CREATE TABLE IF NOT EXISTS reviewer_requests (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_at TEXT,
  decided_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT ''
);

-- Tentativas de acesso. Em PostgreSQL o limite é gravado no banco para valer
-- também entre instâncias serverless, que não compartilham memória.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT NOT NULL,
  at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_event ON projects(event_id);
CREATE INDEX IF NOT EXISTS idx_projects_code ON projects(anonymous_code);
CREATE INDEX IF NOT EXISTS idx_projects_author ON project_authors(user_id);
CREATE INDEX IF NOT EXISTS idx_privacy_identification ON privacy_profiles(identification);
CREATE INDEX IF NOT EXISTS idx_privacy_slug ON privacy_profiles(portfolio_slug);
CREATE INDEX IF NOT EXISTS idx_reviewer_requests_status ON reviewer_requests(status);
CREATE INDEX IF NOT EXISTS idx_assignments_reviewer ON assignments(reviewer_user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_project ON assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_reviews_assignment ON reviews(assignment_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key, at);

INSERT INTO schema_migrations(version, applied_at)
SELECT 6, '' WHERE NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = 6);
