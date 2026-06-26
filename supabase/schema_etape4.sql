-- ============================================================
--  DoublaParty — Étape 4 (votes 👍/👎 sur les vidéos)
--  À coller dans Supabase SQL Editor → Run.
-- ============================================================

-- Un vote par utilisateur et par vidéo (+1 = 👍, -1 = 👎).
create table if not exists public.video_ratings (
  video_id   uuid not null references public.videos(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  value      int  not null check (value in (1, -1)),
  created_at timestamptz default now(),
  primary key (video_id, user_id)
);

grant select on public.video_ratings to anon, authenticated;
alter table public.video_ratings enable row level security;
create policy "vr_select_all" on public.video_ratings for select using (true);

-- Enregistre/modifie un vote puis recalcule les compteurs de la vidéo.
-- security definer : recalcule de façon fiable malgré la RLS.
create or replace function public.rate_video(p_video_id uuid, p_value int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.video_ratings (video_id, user_id, value)
  values (p_video_id, auth.uid(), p_value)
  on conflict (video_id, user_id) do update set value = excluded.value;

  update public.videos v set
    up_votes   = (select count(*) from public.video_ratings r where r.video_id = v.id and r.value = 1),
    down_votes = (select count(*) from public.video_ratings r where r.video_id = v.id and r.value = -1)
  where v.id = p_video_id;
end;
$$;

grant execute on function public.rate_video(uuid, int) to anon, authenticated;
