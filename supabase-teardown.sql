-- FULL RESET: drops all party-game tables (schema + data).
-- Run in Supabase → SQL Editor when you want to reinstall from scratch.
-- After this, run supabase-schema.sql again to recreate tables, RLS, and realtime.

-- FK-safe order: children and join tables first
drop table if exists public.votes cascade;
drop table if exists public.game_state cascade;
drop table if exists public.rounds cascade;
drop table if exists public.players cascade;
drop table if exists public.options cascade;
drop table if exists public.question_bank cascade;
