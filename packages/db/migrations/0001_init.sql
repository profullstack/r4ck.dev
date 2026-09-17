create extension if not exists citext;
create extension if not exists pg_trgm;

-- Accounts: magic link + passkey, no password.
create table if not exists users (
  id           uuid primary key default gen_random_uuid(),
  email        citext not null unique,
  role         text not null default 'user',
  display_name text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists login_tokens (
  token_hash  bytea primary key,
  email       citext not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  consumed_at timestamptz
);
create index if not exists login_tokens_expires_idx on login_tokens (expires_at);

create table if not exists sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text
);
create index if not exists sessions_user_idx on sessions (user_id);

create table if not exists passkeys (
  credential_id text primary key,
  user_id       uuid not null references users(id) on delete cascade,
  public_key    bytea not null,
  counter       bigint not null default 0,
  transports    text[] not null default '{}',
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists passkeys_user_idx on passkeys (user_id);

-- Passkey challenges, short lived, so the web tier needs no Redis.
create table if not exists passkey_challenges (
  id         uuid primary key,
  challenge  text not null,
  expires_at timestamptz not null
);

-- API keys: hash only, shown once, prefix kept for display.
create table if not exists api_keys (
  id           text primary key,
  user_id      uuid not null references users(id) on delete cascade,
  name         text not null default 'default',
  prefix       text not null,
  key_hash     bytea not null unique,
  permissions  jsonb not null default '{"read": true, "write": true}',
  is_active    boolean not null default true,
  expires_at   timestamptz,
  metadata     jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index if not exists api_keys_user_idx on api_keys (user_id);

create table if not exists api_usage (
  bucket text not null,
  hour   timestamptz not null,
  count  int not null default 0,
  primary key (bucket, hour)
);

create table if not exists crawl_sales (
  id          bigserial primary key,
  payer       text,
  ref         text unique,
  days        int not null default 1,
  price_cents int not null,
  total_cents int not null,
  currency    text not null default 'USD',
  user_agent  text,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- The catalogue, mirrored from the NicheDB hosting collection.
create table if not exists providers (
  slug        text primary key,
  nichedb_id  bigint unique,
  name        text not null,
  domain      text,
  url         text,
  summary     text,
  image_url   text,
  country     text,
  regions     text[] not null default '{}',
  categories  text[] not null default '{}',
  features    text[] not null default '{}',
  runtimes    text[] not null default '{}',
  automation  text[] not null default '{}',
  ownership   text,
  price_from  text,
  green       boolean not null default false,
  api_docs    text,
  cli         text,
  status_url  text,
  github      text,
  terraform   text,
  attribution text,
  data        jsonb not null default '{}',
  updated_at  timestamptz,
  synced_at   timestamptz not null default now(),
  search      tsvector generated always as (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(domain, '') || ' ' || coalesce(summary, ''))
  ) stored
);
create index if not exists providers_search_idx on providers using gin (search);
create index if not exists providers_automation_idx on providers using gin (automation);
create index if not exists providers_categories_idx on providers using gin (categories);

create table if not exists servers (
  id             bigserial primary key,
  nichedb_id     bigint not null unique,
  external_id    text not null,
  provider       text not null,
  provider_name  text not null,
  name           text not null,
  url            text,
  kind           text not null default 'vps',
  tenancy        text,
  management     text,
  model          text,
  vcpu           int,
  cores          int,
  ram_mb         int,
  arch           text,
  gpu_model      text,
  gpu_count      int,
  gpu_vram_mb    int,
  disk_gb        numeric,
  disk_type      text,
  bandwidth_mbps int,
  transfer_gb    numeric,
  ipv4           int,
  ipv6           boolean,
  price          numeric,
  currency       text,
  interval       text,
  setup          numeric,
  commitment     text,
  monthly_usd    numeric,
  hourly_usd     numeric,
  regions        text[] not null default '{}',
  countries      text[] not null default '{}',
  stock          text,
  platform       text,
  "group"        text,
  source         text,
  summary        text,
  tags           text[] not null default '{}',
  data           jsonb not null default '{}',
  published_at   timestamptz,
  updated_at     timestamptz,
  first_seen_at  timestamptz,
  synced_at      timestamptz not null default now(),
  search         tsvector generated always as (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(provider_name, '') || ' ' || coalesce(kind, '') || ' ' || coalesce(summary, ''))
  ) stored
);
create index if not exists servers_provider_idx on servers (provider);
create index if not exists servers_kind_idx on servers (kind);
create index if not exists servers_price_idx on servers (monthly_usd);
create index if not exists servers_vcpu_idx on servers (vcpu);
create index if not exists servers_ram_idx on servers (ram_mb);
create index if not exists servers_countries_idx on servers using gin (countries);
create index if not exists servers_tags_idx on servers using gin (tags);
create index if not exists servers_search_idx on servers using gin (search);
create index if not exists servers_name_trgm_idx on servers using gin (name gin_trgm_ops);

create table if not exists price_points (
  server_id   bigint not null references servers(id) on delete cascade,
  seen_at     timestamptz not null default now(),
  price       numeric,
  currency    text,
  monthly_usd numeric,
  primary key (server_id, seen_at)
);

create table if not exists deals (
  nichedb_id   bigint primary key,
  title        text not null,
  url          text,
  summary      text,
  image_url    text,
  source       text,
  published_at timestamptz,
  tags         text[] not null default '{}',
  data         jsonb not null default '{}',
  synced_at    timestamptz not null default now()
);
create index if not exists deals_published_idx on deals (published_at desc);

create table if not exists saved_searches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  name       text not null,
  query      jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists saved_searches_user_idx on saved_searches (user_id);

create table if not exists sync_state (
  key        text primary key,
  value      jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
