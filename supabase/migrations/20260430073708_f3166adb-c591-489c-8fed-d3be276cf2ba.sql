-- Enable pg_trgm for fuzzy fallback
create extension if not exists pg_trgm;

-- Adaptive Planning knowledge base table (FTS-backed, no embeddings)
create table public.adaptive_planning_kb (
  id uuid primary key default gen_random_uuid(),
  source_doc text not null,
  doc_version text,
  section_path text,
  title text,
  content text not null,
  topics text[] not null default '{}',
  content_hash text not null,
  search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(section_path, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'C')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_doc, content_hash)
);

create index adaptive_planning_kb_tsv_idx
  on public.adaptive_planning_kb using gin (search_tsv);
create index adaptive_planning_kb_topics_idx
  on public.adaptive_planning_kb using gin (topics);
create index adaptive_planning_kb_trgm_idx
  on public.adaptive_planning_kb using gin (content gin_trgm_ops);
create index adaptive_planning_kb_source_idx
  on public.adaptive_planning_kb (source_doc);

alter table public.adaptive_planning_kb enable row level security;

create policy "Authenticated read adaptive_planning_kb"
  on public.adaptive_planning_kb for select
  to authenticated using (true);

create policy "Service role write adaptive_planning_kb"
  on public.adaptive_planning_kb for all
  to service_role using (true) with check (true);

-- Trigger to maintain updated_at
create trigger adaptive_planning_kb_set_updated_at
  before update on public.adaptive_planning_kb
  for each row execute function public.update_updated_at_column();

-- Ranked FTS search RPC (websearch_to_tsquery accepts natural language)
create or replace function public.search_adaptive_kb(q text, max_rows int default 30)
returns table (
  id uuid,
  source_doc text,
  section_path text,
  title text,
  content text,
  topics text[],
  rank real
)
language sql
stable
security definer
set search_path = public
as $$
  with parsed as (
    select websearch_to_tsquery('english', coalesce(nullif(trim(q), ''), 'adaptive planning')) as tsq
  )
  select
    k.id, k.source_doc, k.section_path, k.title, k.content, k.topics,
    ts_rank_cd(k.search_tsv, p.tsq) as rank
  from public.adaptive_planning_kb k, parsed p
  where k.search_tsv @@ p.tsq
  order by rank desc
  limit greatest(1, least(coalesce(max_rows, 30), 100));
$$;

revoke all on function public.search_adaptive_kb(text, int) from public;
grant execute on function public.search_adaptive_kb(text, int) to authenticated, service_role;