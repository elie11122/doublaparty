-- ============================================================
--  DoublaParty — Étape 6 (gestion admin des vidéos)
--  À coller dans Supabase SQL Editor → Run.
-- ============================================================

-- 1. Mot de passe admin (une seule ligne). RLS sans aucune policy
--    => personne ne peut le lire ni l'écrire via l'API : seules les
--    fonctions security definer ci-dessous y accèdent.
create table if not exists public.admin_settings (
  id     int primary key default 1,
  secret text not null,
  constraint single_row check (id = 1)
);
alter table public.admin_settings enable row level security;

-- 2. Vérifie le mot de passe admin.
create or replace function public.admin_check(p_secret text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from admin_settings where id = 1 and secret = p_secret);
$$;

-- 3. Supprime une vidéo (admin uniquement).
create or replace function public.admin_delete_video(p_secret text, p_video_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_check(p_secret) then
    raise exception 'Accès refusé';
  end if;
  delete from public.videos where id = p_video_id;
end;
$$;

-- 4. Ajoute / remplace les sous-titres d'une vidéo (admin uniquement).
create or replace function public.admin_set_subtitles(p_secret text, p_video_id uuid, p_subtitles_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.admin_check(p_secret) then
    raise exception 'Accès refusé';
  end if;
  update public.videos set subtitles_url = p_subtitles_url where id = p_video_id;
end;
$$;

grant execute on function public.admin_check(text) to anon, authenticated;
grant execute on function public.admin_delete_video(text, uuid) to anon, authenticated;
grant execute on function public.admin_set_subtitles(text, uuid, text) to anon, authenticated;

-- ============================================================
--  5. DÉFINIS TON MOT DE PASSE ADMIN ICI (remplace la valeur)
--     Choisis une phrase longue et difficile à deviner.
-- ============================================================
insert into public.admin_settings (id, secret)
values (1, '#Conduent09081973')
on conflict (id) do update set secret = excluded.secret;
