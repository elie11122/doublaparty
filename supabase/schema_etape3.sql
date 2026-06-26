-- ============================================================
--  DoublaParty — Étape 3 (bibliothèque de vidéos + upload)
--  À coller dans Supabase SQL Editor → Run.
-- ============================================================

-- 1. Bibliothèque de vidéos
create table if not exists public.videos (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  video_url     text not null,
  subtitles_url text,
  uploader_id   uuid references auth.users(id) on delete set null,
  up_votes      int  not null default 0,   -- 👍 (utilisé à l'Étape 4)
  down_votes    int  not null default 0,   -- 👎 (utilisé à l'Étape 4)
  plays         int  not null default 0,   -- nb de fois jouée
  created_at    timestamptz default now()
);

-- 2. La manche référence une vidéo (et garde l'URL des sous-titres pour être autonome)
alter table public.rounds add column if not exists video_id uuid references public.videos(id);
alter table public.rounds add column if not exists subtitles_url text;

-- 3. Droits + RLS
grant select, insert, update, delete on public.videos to anon, authenticated;
alter table public.videos enable row level security;
create policy "videos_select_all"  on public.videos for select using (true);
create policy "videos_insert_auth" on public.videos for insert to authenticated with check (auth.uid() = uploader_id);
create policy "videos_update_own"  on public.videos for update using (auth.uid() = uploader_id);

-- 4. Stockage des vidéos uploadées
insert into storage.buckets (id, name, public)
values ('videos', 'videos', true)
on conflict (id) do nothing;
create policy "videos_read"   on storage.objects for select using (bucket_id = 'videos');
create policy "videos_insert" on storage.objects for insert to authenticated with check (bucket_id = 'videos');

-- 5. Compteur de lectures (incrément atomique)
create or replace function public.increment_video_plays(p_video_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.videos set plays = plays + 1 where id = p_video_id;
$$;
grant execute on function public.increment_video_plays(uuid) to anon, authenticated;

-- 6. Seed : la vidéo de démo déjà présente dans public/ (idempotent)
insert into public.videos (title, video_url)
select 'Vidéo de démo (escalade)', '/sample.mp4'
where not exists (select 1 from public.videos where video_url = '/sample.mp4');
