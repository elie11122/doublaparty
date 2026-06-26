-- ============================================================
--  DoublaParty — Étape 2b (visionnage)
--  Ajoute l'index du doublage en cours de visionnage.
--  À coller dans Supabase SQL Editor → Run.
-- ============================================================
alter table public.games
  add column if not exists viewing_index int not null default 0;
