-- ARO: chat history, project memory, and learned skills.
-- Run once against the self-hosted Supabase Postgres instance.

create extension if not exists vector;
create extension if not exists pgcrypto; -- gen_random_uuid()

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null default 'New chat',
  model text not null,
  github_repo jsonb,
  messages jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_idx on conversations (user_id, updated_at desc);

alter table conversations enable row level security;

create table if not exists memory_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  repo text not null,        -- "owner/name"
  path text not null,
  content text not null,
  embedding vector(1024) not null,
  created_at timestamptz not null default now(),
  unique (user_id, repo, path)
);
create index if not exists memory_chunks_ivfflat on memory_chunks
  using ivfflat (embedding vector_cosine_ops);

alter table memory_chunks enable row level security;

create or replace function match_memory_chunks(
  query_embedding vector(1024), match_user text, match_repo text, match_count int
) returns table (path text, content text, similarity float)
language sql stable as $$
  select path, content, 1 - (embedding <=> query_embedding) as similarity
  from memory_chunks
  where user_id = match_user and repo = match_repo
  order by embedding <=> query_embedding
  limit match_count;
$$;

create table if not exists skills (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  description text not null,
  usage_tip text not null,
  keywords text[] not null default '{}',
  status text not null default 'proposed' check (status in ('proposed','approved','rejected')),
  evidence text,
  created_at timestamptz not null default now()
);

alter table skills enable row level security;

create table if not exists skill_signals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

alter table skill_signals enable row level security;
