-- Redeemable credit codes and scarce invites (@profullstack/redeem-credits,
-- @profullstack/affiliates), on r4ck's own Postgres.
--
-- Both packages' postgresStore would create their tables on first use; they are
-- here so the schema arrives the repo's way, in one reviewed migration, and the
-- runtime CREATE ... IF NOT EXISTS is a no-op. The DDL is the packages' own
-- output, unchanged, so a store and this file never disagree about a column.
-- User ids are text there: they hold users.id as a uuid string.
--
-- What a code or an invite GRANTS is not stored in those tables. It is days of
-- the x402 pass, written as a crawl_sales row (the table every sold pass lands
-- in) at $0, owned by the account. See the end of this file.

-- @profullstack/redeem-credits 0.2.0: schemaSql("pg", "credit_")
CREATE TABLE IF NOT EXISTS credit_codes (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  unit TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  recur TEXT,
  months INTEGER,
  max_redemptions INTEGER NOT NULL,
  redemptions INTEGER NOT NULL DEFAULT 0,
  expires_at BIGINT,
  created_at BIGINT NOT NULL,
  revoked_at BIGINT,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS credit_redemptions (
  code_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  at BIGINT NOT NULL,
  PRIMARY KEY (code_id, user_id)
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  unit TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  kind TEXT NOT NULL,
  recur TEXT,
  months INTEGER,
  source TEXT NOT NULL,
  at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS credit_ledger_user_unit ON credit_ledger (user_id, unit, at);

CREATE TABLE IF NOT EXISTS credit_accounts (
  user_id TEXT NOT NULL,
  unit TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, unit)
);


-- @profullstack/affiliates 0.3.0: ddl("aff_", "postgres") + upgradeDdl("aff_", "postgres")
CREATE TABLE IF NOT EXISTS aff_invites (
      id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      inviter_id TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT,
      used_by TEXT,
      used_at BIGINT,
      note TEXT NOT NULL DEFAULT '',
      revoked_at BIGINT,
      legacy_dup INTEGER NOT NULL DEFAULT 0
    );

CREATE INDEX IF NOT EXISTS aff_invites_inviter_idx ON aff_invites (inviter_id);

CREATE INDEX IF NOT EXISTS aff_invites_used_by_idx ON aff_invites (used_by);

CREATE TABLE IF NOT EXISTS aff_quotas (
      user_id TEXT PRIMARY KEY,
      total INTEGER NOT NULL
    );

CREATE TABLE IF NOT EXISTS aff_codes (
      user_id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      created_at BIGINT NOT NULL
    );

CREATE TABLE IF NOT EXISTS aff_attributions (
      user_id TEXT PRIMARY KEY,
      affiliate_id TEXT NOT NULL,
      code TEXT NOT NULL,
      at BIGINT NOT NULL
    );

CREATE INDEX IF NOT EXISTS aff_attributions_affiliate_idx ON aff_attributions (affiliate_id);

CREATE OR REPLACE FUNCTION aff_insert_invite(
            p_id TEXT, p_hash TEXT, p_inviter TEXT, p_created BIGINT, p_expires BIGINT, p_note TEXT, p_limit INTEGER
          ) RETURNS BOOLEAN LANGUAGE plpgsql AS $fn$
          BEGIN
            PERFORM pg_advisory_xact_lock(hashtext('aff_invites'), hashtext(p_inviter));
            IF (SELECT count(*) FROM aff_invites
                WHERE inviter_id = p_inviter AND (revoked_at IS NULL OR used_by IS NOT NULL)) >= p_limit THEN
              RETURN FALSE;
            END IF;
            INSERT INTO aff_invites (id, code_hash, inviter_id, created_at, expires_at, note)
              VALUES (p_id, p_hash, p_inviter, p_created, p_expires, p_note);
            RETURN TRUE;
          END
          $fn$;

ALTER TABLE aff_invites ADD COLUMN IF NOT EXISTS legacy_dup INTEGER NOT NULL DEFAULT 0;

UPDATE aff_invites SET legacy_dup = 1
      WHERE used_by IS NOT NULL AND legacy_dup = 0 AND EXISTS (
        SELECT 1 FROM aff_invites o WHERE o.used_by = aff_invites.used_by
          AND (o.used_at < aff_invites.used_at OR (o.used_at = aff_invites.used_at AND o.id < aff_invites.id)));

CREATE UNIQUE INDEX IF NOT EXISTS aff_invites_one_per_user ON aff_invites (used_by)
      WHERE used_by IS NOT NULL AND legacy_dup = 0;

-- A pass held by an account. A sold pass is a bearer token with no owner; a
-- granted one (a redeemed code, an invite bonus) belongs to the account that
-- earned it, and every request that account makes (session, API key, MCP) is
-- served as a pass while one runs. ref is 'grant:<source>:<user id>', unique
-- already, so a retried grant can never add a second term.
alter table crawl_sales add column if not exists user_id uuid references users (id) on delete cascade;
alter table crawl_sales add column if not exists source text not null default 'sale';
create index if not exists crawl_sales_user_idx on crawl_sales (user_id, expires_at) where user_id is not null;

-- The invite a sign-up came with rides on the emailed link, like the signup
-- profile does (0002): the account only exists once the link is spent, and the
-- link may be opened in a browser that never saw the invite cookie.
alter table login_tokens add column if not exists invite_code text;

-- Where an invite was made from (a salted address hash, never the address), so
-- an inviter cannot pay themselves from the same network.
create table if not exists invite_origins (
  invite_id  text primary key,
  ip_hash    text,
  created_at timestamptz not null default now()
);

-- Every invite bonus decision, paid or withheld, one row per side. The primary
-- key is the once-only rule: a side of an invite is decided exactly once.
create table if not exists invite_bonuses (
  invite_id  text not null,
  side       text not null check (side in ('inviter', 'invitee')),
  user_id    uuid not null references users (id) on delete cascade,
  days       int not null,
  paid       boolean not null,
  reason     text,
  created_at timestamptz not null default now(),
  primary key (invite_id, side)
);
create index if not exists invite_bonuses_user_idx on invite_bonuses (user_id, created_at);
