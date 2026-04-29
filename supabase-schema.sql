-- =============================================================================
-- Party game — database schema (greenfield)
-- =============================================================================
-- Run in Supabase → SQL Editor on an empty public schema for these objects,
-- or after `supabase-teardown.sql` if you are replacing an older install.
--
-- Includes: tables, RLS (open anon policies for party use), realtime publication.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tables (dependency order: question_bank → rounds; options/players → votes;
--         rounds → game_state)
-- -----------------------------------------------------------------------------

create table if not exists public.question_bank (
  id uuid primary key default gen_random_uuid(),
  prompt text not null,
  score_modifier int not null default 1 check (score_modifier in (-1, 1)),
  position int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.options (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  score_modifier int not null default 1 check (score_modifier in (-1, 1)),
  question_bank_id uuid references public.question_bank (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  option_id uuid not null references public.options (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create table if not exists public.game_state (
  id int primary key default 1 check (id = 1),
  phase text not null default 'waiting' check (phase in ('waiting', 'question', 'scoreboard')),
  current_round_id uuid references public.rounds (id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.game_state (id)
values (1)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Row Level Security (anon-friendly policies — tighten for production)
-- -----------------------------------------------------------------------------

alter table public.game_state enable row level security;
alter table public.options enable row level security;
alter table public.players enable row level security;
alter table public.rounds enable row level security;
alter table public.votes enable row level security;
alter table public.question_bank enable row level security;

drop policy if exists "party_game_all_game_state" on public.game_state;
drop policy if exists "party_game_all_options" on public.options;
drop policy if exists "party_game_all_players" on public.players;
drop policy if exists "party_game_all_rounds" on public.rounds;
drop policy if exists "party_game_all_votes" on public.votes;
drop policy if exists "party_game_all_question_bank" on public.question_bank;

-- Legacy policy names (drop if upgrading from older schema)
drop policy if exists "allow full access game_state" on public.game_state;
drop policy if exists "allow full access options" on public.options;
drop policy if exists "allow full access players" on public.players;
drop policy if exists "allow full access rounds" on public.rounds;
drop policy if exists "allow full access votes" on public.votes;
drop policy if exists "allow full access question_bank" on public.question_bank;

create policy "party_game_all_game_state"
  on public.game_state for all using (true) with check (true);

create policy "party_game_all_options"
  on public.options for all using (true) with check (true);

create policy "party_game_all_players"
  on public.players for all using (true) with check (true);

create policy "party_game_all_rounds"
  on public.rounds for all using (true) with check (true);

create policy "party_game_all_votes"
  on public.votes for all using (true) with check (true);

create policy "party_game_all_question_bank"
  on public.question_bank for all using (true) with check (true);

-- -----------------------------------------------------------------------------
-- Realtime (postgres_changes)
-- -----------------------------------------------------------------------------

alter table public.game_state replica identity full;
alter table public.options replica identity full;
alter table public.players replica identity full;
alter table public.rounds replica identity full;
alter table public.votes replica identity full;
alter table public.question_bank replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_state'
  ) then
    alter publication supabase_realtime add table public.game_state;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'options'
  ) then
    alter publication supabase_realtime add table public.options;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rounds'
  ) then
    alter publication supabase_realtime add table public.rounds;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'votes'
  ) then
    alter publication supabase_realtime add table public.votes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'question_bank'
  ) then
    alter publication supabase_realtime add table public.question_bank;
  end if;
end $$;
