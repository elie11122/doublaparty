-- ============================================================
--  DoublaParty — Étape 2c (vote + points)
--  À coller dans Supabase SQL Editor → Run.
-- ============================================================

-- Marqueur « manche déjà comptée » (évite de distribuer les points 2 fois).
alter table public.rounds
  add column if not exists scored boolean not null default false;

-- Fonction de dépouillement : +1 point par vote reçu, pour chaque doubleur.
-- security definer = s'exécute avec les droits du propriétaire (peut donc
-- mettre à jour le score de TOUS les joueurs, malgré la RLS).
create or replace function public.tally_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room uuid;
begin
  -- Déjà compté ? on ne fait rien.
  if (select scored from public.rounds where id = p_round_id) then
    return;
  end if;

  select g.room_id into v_room
  from public.rounds r
  join public.games g on g.id = r.game_id
  where r.id = p_round_id;

  update public.room_players rp
  set score = rp.score + v.cnt
  from (
    select s.user_id, count(vt.id) as cnt
    from public.submissions s
    left join public.votes vt on vt.submission_id = s.id
    where s.round_id = p_round_id
    group by s.user_id
  ) v
  where rp.user_id = v.user_id
    and rp.room_id = v_room;

  update public.rounds set scored = true where id = p_round_id;
end;
$$;

grant execute on function public.tally_round(uuid) to anon, authenticated;
