# DoublaParty — Suivi du projet

Party game en ligne : des amis doublent la même vidéo, puis votent pour le meilleur doublage.

## Stack
- **Next.js 16** (App Router, TypeScript) + **Tailwind v4** — dossier `src/`
- **Supabase** : Postgres + Auth (anonyme) + Storage + Realtime
- Projet local : `C:\Users\52582516\dev\doublaparty` (hors OneDrive)
- Lancer : `npm run dev` → http://localhost:3000
- Projet Supabase ref : `bvpoqetuzffnjutmrdbp`

## Avancement

### ✅ Étape 0 — Faisabilité audio
Page de test (`Documents\CLaude\doublaparty\etape0-audio-test`) : enregistrer la voix sur
vidéo muette + rejouer en synchro. **Validé.**

### ✅ Étape 1 — Fondations
- Connexion par pseudo (Supabase **anonymous sign-in**).
- Créer / rejoindre une room via code à 6 lettres.
- Liste des joueurs **en temps réel** (ajout ET départ en direct).
- Fichiers : `src/lib/supabaseClient.ts`, `src/lib/game.ts`, `src/app/page.tsx`,
  `src/app/room/[code]/page.tsx`, `supabase/schema.sql`.

### 🚧 Étape 2 — Boucle de jeu (MVP jouable) — quasi finie
Sous-étapes :
- [x] **2a** Lancer une partie + machine à états synchronisée + phase enregistrement
      (capture audio + upload Storage `dubs`) + détection « tout le monde a validé ».
- [x] **2b** Phase **visionnage** : doublages un par un (colonne `games.viewing_index`).
- [x] **2c** Phase **vote** (pas pour soi) + points via fonction SQL `tally_round` (idempotente).
- [x] **2d** Phase **scores** + manche suivante (`nextRound`) + écran de fin + Rejouer
      (`reset_room_scores`). **À tester de bout en bout.**

Composants : `GameView` orchestre `RecordingPhase` / `ViewingPhase` / `VotingPhase` /
`ScoresPhase` / `FinishedPhase`. SQL : `schema_etape2.sql` + `_2b` + `_2c` + `_2d`.

### 🚧 Étape 3 — Bibliothèque + upload + sous-titres — À TESTER
- [x] **3a** Table `videos` + sélection auto d'une vidéo par manche (évite les répétitions
      dans une partie) ; compteur `plays` via `increment_video_plays`.
- [x] **3b** Page `/videos` : upload vidéo + sous-titres `.vtt` (bucket Storage `videos`).
- [x] **3c** Affichage des sous-titres (`<track>`) dans les lecteurs.
- SQL : `schema_etape3.sql`. `rounds` gagne `video_id` + `subtitles_url`.

### 🚧 Étape 4 — Votes 👍/👎 + reco — À TESTER
- [x] Table `video_ratings` + fonction `rate_video` (recalcule up/down_votes).
- [x] Widget 👍/👎 dans la phase de vote (`round.video_id`).
- [x] Algo `pickVideoForGame` : 80 % exploitation (tirage pondéré Wilson) /
      20 % exploration (vidéo la moins vue). `wilsonScore()` dans `game.ts`.
- SQL : `schema_etape4.sql`.

### 🚧 Étape 5 — Finitions + mise en ligne — EN COURS
- [x] Robustesse : transmission du rôle d'hôte au départ (`leaveRoom`), bouton
      « Devenir hôte » si l'hôte disparaît (`claim_host`), bouton hôte « forcer le
      visionnage ». SQL : `schema_etape5.sql`.
- [ ] Déploiement sur Vercel (GitHub + Vercel + variables d'env Supabase).
- [ ] (Optionnel) confort : minuteur, animations ; resserrer la RLS.

## Notes techniques importantes (pièges déjà rencontrés)
- **GRANT obligatoires** : après `create table`, donner `grant select,insert,update,delete`
  aux rôles `anon, authenticated`, sinon « permission denied for table ».
- **Realtime DELETE** : il faut `alter table ... replica identity full` pour que les
  événements de suppression contiennent toute la ligne (sinon le filtre par `room_id` rate).
- Clé `anon` publique = normale (sécurité assurée par la RLS).
- Vidéo MVP : URL en dur (échantillon Google). Sous-titres ajoutés à l'Étape 3.
