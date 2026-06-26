-- ============================================================
--  DoublaParty — Schéma Étape 2 (boucle de jeu)
--  À coller dans Supabase SQL Editor → Run. (Une seule fois.)
-- ============================================================

-- 1. Une partie en cours dans une room
create table if not exists public.games (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  total_rounds  int  not null default 3,
  current_round int  not null default 1,
  phase         text not null default 'recording', -- recording|viewing|voting|scores|finished
  created_at    timestamptz default now()
);

-- 2. Une manche (avec la vidéo à doubler)
create table if not exists public.rounds (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.games(id) on delete cascade,
  round_number int  not null,
  video_url    text not null,
  unique (game_id, round_number)
);

-- 3. Un doublage validé par un joueur
create table if not exists public.submissions (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references public.rounds(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  pseudo     text not null,
  audio_url  text not null,
  created_at timestamptz default now(),
  unique (round_id, user_id)
);

-- 4. Un vote pour un doublage
create table if not exists public.votes (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.rounds(id) on delete cascade,
  voter_id      uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  unique (round_id, voter_id)
);

-- === Autorisations (GRANT) ===
grant select, insert, update, delete
  on public.games, public.rounds, public.submissions, public.votes
  to anon, authenticated;

-- === RLS (niveau MVP) ===
alter table public.games       enable row level security;
alter table public.rounds      enable row level security;
alter table public.submissions enable row level security;
alter table public.votes       enable row level security;

create policy "games_all"   on public.games       for all using (true) with check (true);
create policy "rounds_all"  on public.rounds      for all using (true) with check (true);
create policy "subs_select" on public.submissions for select using (true);
create policy "subs_write_own" on public.submissions for insert with check (auth.uid() = user_id);
create policy "subs_update_own" on public.submissions for update using (auth.uid() = user_id);
create policy "votes_select" on public.votes       for select using (true);
create policy "votes_write_own" on public.votes     for insert with check (auth.uid() = voter_id);

-- === Temps réel ===
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.submissions;
alter publication supabase_realtime add table public.votes;
alter table public.games       replica identity full;
alter table public.submissions replica identity full;
alter table public.votes       replica identity full;

-- ============================================================
--  Stockage des fichiers audio (doublages)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('dubs', 'dubs', true)
on conflict (id) do nothing;

-- Lecture publique du bucket + écriture par les utilisateurs connectés
create policy "dubs_read"   on storage.objects for select using (bucket_id = 'dubs');
create policy "dubs_insert" on storage.objects for insert to authenticated with check (bucket_id = 'dubs');
create policy "dubs_update" on storage.objects for update to authenticated using (bucket_id = 'dubs');
