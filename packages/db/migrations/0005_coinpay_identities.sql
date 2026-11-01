create table if not exists coinpay_identities (
  user_id uuid primary key references users(id) on delete cascade,
  sub text not null unique,
  email text,
  name text,
  openprofile_url text,
  linked_at timestamptz not null default now()
);
create table if not exists coinpay_identities (
  user_id uuid primary key references users(id) on delete cascade,
  sub text not null unique,
  email text,
  name text,
  openprofile_url text,
  linked_at timestamptz not null default now()
);
