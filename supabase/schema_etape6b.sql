-- ============================================================
--  DoublaParty — Étape 6b (autoriser la suppression de vidéos)
--  À coller dans Supabase SQL Editor → Run.
-- ============================================================

-- La clé étrangère rounds.video_id -> videos.id bloquait la suppression d'une
-- vidéo déjà utilisée dans une manche. On la passe en ON DELETE SET NULL :
-- supprimer une vidéo détache les manches passées (elles gardent video_url).
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.rounds'::regclass
      and contype = 'f'
      and confrelid = 'public.videos'::regclass
  loop
    execute 'alter table public.rounds drop constraint ' || quote_ident(c);
  end loop;
end $$;

alter table public.rounds
  add constraint rounds_video_id_fkey
  foreign key (video_id) references public.videos(id) on delete set null;
