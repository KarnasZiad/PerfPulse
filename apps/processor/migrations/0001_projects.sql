-- Projects and their read tokens. Public keys are visible in pages; tokens are secrets, stored as
-- HMAC-SHA256 digests only.

create table projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$'),
  name text not null check (length(name) between 1 and 100),
  public_key text not null unique check (public_key ~ '^pk_[A-Za-z0-9]{32}$'),
  -- Exact origins allowed to send measures: scheme, host and port, no path.
  allowed_origins text[] not null default '{}' check (
    array_position(allowed_origins, null) is null
  ),
  created_at timestamptz not null default now()
);

create table api_tokens (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  label text not null check (length(label) between 1 and 100),
  token_hash bytea not null unique check (length(token_hash) = 32),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index api_tokens_project_idx on api_tokens (project_id);
