-- ============================================================
--  DoublaParty — Schéma de base de données (Étape 1 : fondations)
--  À coller dans Supabase : menu "SQL Editor" → New query → Run.
--  À exécuter UNE SEULE FOIS sur un projet neuf.
-- ============================================================

-- 1. Profils (un par utilisateur, même connecté en anonyme)
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  pseudo     text not null,
  created_at timestamptz default now()
);

-- 2. Rooms (salons)
create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  host_id    uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'lobby',   -- lobby | playing | finished
  created_at timestamptz default now()
);

-- 3. Joueurs présents dans une room
create table if not exists public.room_players (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references public.rooms(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  pseudo     text not null,
  score      int  not null default 0,
  joined_at  timestamptz default now(),
  unique (room_id, user_id)
);

-- ============================================================
--  Autorisations d'accès aux tables (GRANT) pour les joueurs.
--  Nécessaire pour que les rôles anon/authenticated puissent
--  lire/écrire ; le filtrage fin reste assuré par la RLS ci-dessous.
-- ============================================================
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete
  on public.profiles, public.rooms, public.room_players
  to anon, authenticated;

-- ============================================================
--  Sécurité au niveau des lignes (RLS) — niveau MVP.
--  On resserrera ces règles dans une étape ultérieure.
-- ============================================================
alter table public.profiles     enable row level security;
alter table public.rooms        enable row level security;
alter table public.room_players enable row level security;

-- profiles : chacun gère le sien ; lecture ouverte (pour afficher les pseudos)
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- rooms : lecture ouverte (pour retrouver une room via son code),
--         création par soi-même, modification réservée à l'hôte
create policy "rooms_select_all"   on public.rooms for select using (true);
create policy "rooms_insert_own"   on public.rooms for insert with check (auth.uid() = host_id);
create policy "rooms_update_host"  on public.rooms for update using (auth.uid() = host_id);

-- room_players : lecture ouverte ; on ne gère que sa propre présence
create policy "rp_select_all"   on public.room_players for select using (true);
create policy "rp_insert_own"   on public.room_players for insert with check (auth.uid() = user_id);
create policy "rp_update_own"   on public.room_players for update using (auth.uid() = user_id);
create policy "rp_delete_own"   on public.room_players for delete using (auth.uid() = user_id);

-- ============================================================
--  Temps réel : diffuser les changements de ces tables
--  (permet de voir la liste des joueurs se mettre à jour en direct)
-- ============================================================
alter publication supabase_realtime add table public.room_players;
alter publication supabase_realtime add table public.rooms;

-- Inclure TOUTE la ligne dans les événements de suppression (départ d'un joueur),
-- sinon seul l'id est envoyé et le filtre par room_id ne fonctionne pas.
alter table public.room_players replica identity full;
alter table public.rooms        replica identity full;
