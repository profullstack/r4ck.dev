-- Customer webhooks (@profullstack/webhooks 0.2.1): endpoints and the durable delivery outbox.
-- The package's own schemaSql('pg'). Owners are users.id as text.
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT '["*"]',
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  failures INTEGER NOT NULL DEFAULT 0,
  disabled_reason TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS webhook_endpoints_owner ON webhook_endpoints(owner);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  endpoint_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_at BIGINT NOT NULL,
  last_status INTEGER,
  last_error TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS webhook_deliveries_due ON webhook_deliveries(status, next_at);

CREATE INDEX IF NOT EXISTS webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id, created_at);
