CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_lower TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS sync_items (
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, item_id)
);
CREATE INDEX IF NOT EXISTS idx_sync_updated ON sync_items(user_id, updated_at);

-- 公开广场卡单独存，不随 30 天清理删除
CREATE TABLE IF NOT EXISTS plaza_cards (
  id TEXT PRIMARY KEY,
  author_id TEXT,
  author_name TEXT,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  created_at INTEGER NOT NULL
);
