-- ============================================================
--  DoublaParty — Étape 5c (corrige « Devenir hôte » après fermeture d'onglet)
--  À coller dans Supabase SQL Editor → Run.
-- ============================================================

-- L'ancienne version ne faisait rien si l'hôte était encore inscrit en base
-- (ce qui est le cas après une fermeture brutale d'onglet). Désormais : un
-- membre de la room peut reprendre la main, ce qui retire l'hôte fantôme et
-- lui transmet le rôle.
create or replace function public.claim_host(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_host uuid;
begin
  -- Le demandeur doit être membre de la room.
  if not exists (
    select 1 from public.room_players
    where room_id = p_room_id and user_id = auth.uid()
  ) then
    return;
  end if;

  select host_id into v_old_host from public.rooms where id = p_room_id;
  if v_old_host = auth.uid() then
    return; -- déjà hôte
  end if;

  -- Retire l'ancien hôte (fantôme) et transmet le rôle au demandeur.
  delete from public.room_players where room_id = p_room_id and user_id = v_old_host;
  update public.rooms set host_id = auth.uid() where id = p_room_id;
end;
$$;
