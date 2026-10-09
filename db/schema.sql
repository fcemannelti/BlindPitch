PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('participant','reviewer','organizer')),
 active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS participant_profiles (
 user_id TEXT PRIMARY KEY REFERENCES users(id), school_or_class TEXT NOT NULL DEFAULT '', consent INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, year INTEGER NOT NULL,
 submissions_open INTEGER NOT NULL DEFAULT 1, reviews_open INTEGER NOT NULL DEFAULT 1,
 reveal_identity INTEGER NOT NULL DEFAULT 0, results_released INTEGER NOT NULL DEFAULT 0,
 comments_released INTEGER NOT NULL DEFAULT 0, identified_enabled INTEGER NOT NULL DEFAULT 0,
 protocol TEXT NOT NULL DEFAULT '', demo INTEGER NOT NULL DEFAULT 0, next_code INTEGER NOT NULL DEFAULT 1,
 bonus_enabled INTEGER NOT NULL DEFAULT 1, bonus_max REAL NOT NULL DEFAULT 2
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS event_consents (
 user_id TEXT NOT NULL REFERENCES users(id), event_id TEXT NOT NULL REFERENCES events(id),
 protocol TEXT NOT NULL, consented_at TEXT NOT NULL, PRIMARY KEY(user_id,event_id)
);
-- Projetos científicos não contêm chaves nem dados pessoais do participante.
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), anonymous_code TEXT UNIQUE,
 title TEXT NOT NULL, scientific_area TEXT NOT NULL, problem TEXT NOT NULL DEFAULT '', objective TEXT NOT NULL DEFAULT '',
 methodology TEXT NOT NULL DEFAULT '', proposed_solution TEXT NOT NULL DEFAULT '', expected_impact TEXT NOT NULL DEFAULT '',
 keywords TEXT NOT NULL DEFAULT '',
 abstract TEXT NOT NULL DEFAULT '', justification TEXT NOT NULL DEFAULT '', specific_objectives TEXT NOT NULL DEFAULT '',
 hypothesis TEXT NOT NULL DEFAULT '', materials TEXT NOT NULL DEFAULT '', social_relevance TEXT NOT NULL DEFAULT '',
 sustainability TEXT NOT NULL DEFAULT '', expected_results TEXT NOT NULL DEFAULT '', obtained_results TEXT NOT NULL DEFAULT '',
 "references" TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft'
 CHECK(status IN ('draft','submitted','assigned','under_review','reviewed','results_available','archived')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, submitted_at TEXT,
 sanitized_content TEXT, anonymization_approved INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS project_authors (
 project_id TEXT PRIMARY KEY REFERENCES projects(id), user_id TEXT NOT NULL REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS rubric_criteria (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id), name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 min_score REAL NOT NULL DEFAULT 0, max_score REAL NOT NULL DEFAULT 10, weight REAL NOT NULL DEFAULT 1,
 order_index INTEGER NOT NULL, CHECK(max_score > min_score AND weight > 0)
);
CREATE TABLE IF NOT EXISTS assignments (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), reviewer_user_id TEXT NOT NULL REFERENCES users(id),
 review_mode TEXT NOT NULL CHECK(review_mode IN ('anonymous','identified')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed')),
 UNIQUE(project_id,reviewer_user_id)
);
CREATE TABLE IF NOT EXISTS reviews (
 id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL UNIQUE REFERENCES assignments(id),
 total_score REAL NOT NULL DEFAULT 0, normalized_score REAL NOT NULL DEFAULT 0,
 general_comment TEXT NOT NULL DEFAULT '', started_at TEXT NOT NULL, submitted_at TEXT,
 bonus_points REAL NOT NULL DEFAULT 0, bonus_justification TEXT NOT NULL DEFAULT '',
 bonus_criterion TEXT NOT NULL DEFAULT '', bonus_granted_by TEXT REFERENCES users(id), bonus_granted_at TEXT
);
CREATE TABLE IF NOT EXISTS review_scores (
 review_id TEXT NOT NULL REFERENCES reviews(id), criterion_id TEXT NOT NULL REFERENCES rubric_criteria(id),
 score REAL NOT NULL, comment TEXT NOT NULL DEFAULT '', PRIMARY KEY(review_id,criterion_id)
);
-- Preferência de identificação pública do participante. Independentemente dela, a
-- avaliação científica continua anônima: a preferência só governa a exposição pública.
CREATE TABLE IF NOT EXISTS privacy_profiles (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 identification TEXT NOT NULL DEFAULT 'after_approval'
   CHECK(identification IN ('immediate','after_approval','never')),
 public_name TEXT NOT NULL DEFAULT '', public_bio TEXT NOT NULL DEFAULT '',
 portfolio_slug TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Autorização de publicação por projeto, independente do consentimento de identidade.
CREATE TABLE IF NOT EXISTS publication_prefs (
 project_id TEXT PRIMARY KEY REFERENCES projects(id),
 portfolio INTEGER NOT NULL DEFAULT 0, gallery INTEGER NOT NULL DEFAULT 0, showcase INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Perfil acadêmico do avaliador: dados internos nunca lidos por outro avaliador.
CREATE TABLE IF NOT EXISTS reviewer_profiles (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 education_level TEXT NOT NULL DEFAULT '', degrees TEXT NOT NULL DEFAULT '',
 courses TEXT NOT NULL DEFAULT '', specializations TEXT NOT NULL DEFAULT '',
 knowledge_areas TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '',
 public_identity INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Pedido de avaliação feito no cadastro. Não concede o papel: apenas o organizador decide.
CREATE TABLE IF NOT EXISTS reviewer_requests (
 user_id TEXT PRIMARY KEY REFERENCES users(id), status TEXT NOT NULL DEFAULT 'pending'
   CHECK(status IN ('pending','approved','rejected')),
 decided_at TEXT, decided_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_logs ( id TEXT PRIMARY KEY, actor_user_id TEXT REFERENCES users(id), action TEXT NOT NULL,
 entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_projects_event ON projects(event_id);
CREATE INDEX IF NOT EXISTS idx_privacy_identification ON privacy_profiles(identification);
CREATE INDEX IF NOT EXISTS idx_reviewer_requests_status ON reviewer_requests(status);
CREATE INDEX IF NOT EXISTS idx_assignments_reviewer ON assignments(reviewer_user_id);
INSERT OR IGNORE INTO schema_migrations(version) VALUES(1);
