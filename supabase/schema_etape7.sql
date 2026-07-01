-- ============================================================
--  DoublaParty — Étape 7 (vidéos YouTube)
--  À coller dans Supabase SQL Editor → Run.
-- ============================================================

-- Identifiant YouTube (ex. "dQw4w9WgXcQ"). Si présent, la vidéo est jouée
-- depuis YouTube (lecteur intégré) au lieu d'un fichier hébergé.
alter table public.videos add column if not exists youtube_id text;
alter table public.rounds add column if not exists youtube_id text;
