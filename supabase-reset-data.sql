-- Wipe all party-game data and return to a clean slate.
-- Run in Supabase → SQL Editor (safe to re-run).
-- Does NOT drop tables, policies, or realtime — only deletes rows.

-- Detach current round so FKs allow cleanup
update public.game_state
set
  current_round_id = null,
  phase = 'waiting',
  updated_at = now()
where id = 1;

-- Order matters: children first
delete from public.votes;
delete from public.rounds;
delete from public.players;
delete from public.options;
delete from public.question_bank;

-- Ensure singleton game_state row exists and is idle
insert into public.game_state (id, phase, current_round_id, updated_at)
values (1, 'waiting', null, now())
on conflict (id) do update
set
  current_round_id = excluded.current_round_id,
  phase = excluded.phase,
  updated_at = excluded.updated_at;
