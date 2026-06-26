-- ============================================================
--  DoublaParty — Étape 2d (scores / fin / rejouer)
--  À coller dans Supabase SQL Editor → Run.
-- ============================================================

-- Remet à zéro les scores de tous les joueurs d'une room (pour une nouvelle partie).
-- security definer : peut modifier le score de tous les joueurs malgré la RLS.
create or replace function public.reset_room_scores(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.room_players set score = 0 where room_id = p_room_id;
end;
$$;

grant execute on function public.reset_room_scores(uuid) to anon, authenticated;
