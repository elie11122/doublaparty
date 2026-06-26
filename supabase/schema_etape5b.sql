-- ============================================================
--  DoublaParty — Étape 5b (corrige le transfert d'hôte)
--  À coller dans Supabase SQL Editor → Run.
-- ============================================================

-- L'ancienne règle n'avait qu'un USING, appliqué aussi en WITH CHECK par
-- PostgreSQL → impossible de réaffecter host_id à un autre joueur.
-- On autorise l'hôte actuel à modifier la room (y compris transmettre le rôle).
drop policy if exists "rooms_update_host" on public.rooms;
create policy "rooms_update_host" on public.rooms
  for update
  using (auth.uid() = host_id)
  with check (true);
