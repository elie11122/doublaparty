-- ============================================================
--  DoublaParty — Étape 5 (robustesse multijoueur)
--  À coller dans Supabase SQL Editor → Run.
-- ============================================================

-- Permet à un joueur de devenir hôte UNIQUEMENT si l'hôte actuel
-- n'est plus présent dans la room (sinon ne fait rien).
create or replace function public.claim_host(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.rooms r
    join public.room_players rp on rp.room_id = r.id and rp.user_id = r.host_id
    where r.id = p_room_id
  ) then
    return; -- l'hôte est toujours là, on ne change rien
  end if;

  update public.rooms set host_id = auth.uid() where id = p_room_id;
end;
$$;

grant execute on function public.claim_host(uuid) to anon, authenticated;
