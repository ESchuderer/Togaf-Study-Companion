CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  login TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
CREATE TABLE IF NOT EXISTS runs (
  user_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (user_id, record_id)
);
CREATE TABLE IF NOT EXISTS feedback (
  user_id TEXT NOT NULL,
  record_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (user_id, record_id)
);

CREATE TABLE IF NOT EXISTS dataset_banks (
  user_id TEXT NOT NULL,
  bank_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  PRIMARY KEY(user_id,bank_id)
);
CREATE TABLE IF NOT EXISTS dataset_chunks (
  user_id TEXT NOT NULL,
  bank_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(user_id,bank_id,position)
);

CREATE TRIGGER IF NOT EXISTS dataset_bank_limit BEFORE INSERT ON dataset_banks
WHEN (SELECT COUNT(*) FROM dataset_banks WHERE user_id=NEW.user_id)>=100
BEGIN SELECT RAISE(ABORT,'Dataset count limit'); END;
CREATE TRIGGER IF NOT EXISTS dataset_byte_limit BEFORE INSERT ON dataset_chunks
WHEN (SELECT COALESCE(SUM(length(CAST(payload AS BLOB))),0) FROM dataset_chunks WHERE user_id=NEW.user_id)+length(CAST(NEW.payload AS BLOB))>10485760
BEGIN SELECT RAISE(ABORT,'Dataset storage limit'); END;

CREATE TABLE IF NOT EXISTS dataset_selection (
  user_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  PRIMARY KEY(user_id,dataset_id)
);
