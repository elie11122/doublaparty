import { supabase } from './supabaseClient';

// Caractères sans ambiguïté (pas de O/0, I/1) pour un code facile à lire/dicter.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

/**
 * S'assure qu'on a une session (connexion anonyme Supabase) puis enregistre
 * le pseudo choisi dans la table profiles. Renvoie l'identifiant utilisateur.
 */
export async function ensureSession(pseudo: string): Promise<string> {
  let {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    session = data.session;
  }

  const userId = session!.user.id;
  const { error: pErr } = await supabase
    .from('profiles')
    .upsert({ id: userId, pseudo });
  if (pErr) throw pErr;

  return userId;
}

/** Inscrit l'utilisateur dans une room déjà existante (via son code). */
async function joinRoomRow(code: string, userId: string, pseudo: string): Promise<string> {
  const { data: room, error } = await supabase
    .from('rooms')
    .select('id')
    .eq('code', code)
    .single();
  if (error || !room) throw new Error("Cette room n'existe pas.");

  const { error: jErr } = await supabase
    .from('room_players')
    .upsert(
      { room_id: room.id, user_id: userId, pseudo },
      { onConflict: 'room_id,user_id' }
    );
  if (jErr) throw jErr;

  return room.id;
}

/** Crée une nouvelle room et y inscrit le créateur (qui devient l'hôte). */
export async function createRoom(pseudo: string): Promise<string> {
  const userId = await ensureSession(pseudo);

  // On tente quelques codes au cas où l'un serait déjà pris.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { error } = await supabase
      .from('rooms')
      .insert({ code, host_id: userId });
    if (!error) {
      await joinRoomRow(code, userId, pseudo);
      return code;
    }
  }
  throw new Error('Impossible de générer un code de room, réessayez.');
}

/** Rejoint une room existante via son code. */
export async function joinRoom(code: string, pseudo: string): Promise<void> {
  const userId = await ensureSession(pseudo);
  await joinRoomRow(code, userId, pseudo);
}

/** Quitte une room (retire sa présence ; transmet le rôle d'hôte si besoin). */
export async function leaveRoom(roomId: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  const uid = session.user.id;

  // Si je suis l'hôte, je transmets le rôle au plus ancien autre joueur.
  const { data: room } = await supabase
    .from('rooms')
    .select('host_id')
    .eq('id', roomId)
    .single();
  if (room?.host_id === uid) {
    const { data: others } = await supabase
      .from('room_players')
      .select('user_id')
      .eq('room_id', roomId)
      .neq('user_id', uid)
      .order('joined_at', { ascending: true })
      .limit(1);
    if (others && others.length > 0) {
      await supabase.from('rooms').update({ host_id: others[0].user_id }).eq('id', roomId);
    }
  }

  await supabase.from('room_players').delete().eq('room_id', roomId).eq('user_id', uid);
}

/** Devient hôte si l'hôte actuel a disparu de la room (sécurisé côté serveur). */
export async function claimHost(roomId: string): Promise<void> {
  const { error } = await supabase.rpc('claim_host', { p_room_id: roomId });
  if (error) throw error;
}

// === Étape 2 : boucle de jeu ===

// Vidéo d'exemple (en dur) pour le MVP, servie depuis public/.
// Sera remplacée par la bibliothèque de vidéos à l'Étape 3.
export const SAMPLE_VIDEO = '/sample.mp4';

type PickedVideo = {
  video_id: string | null;
  video_url: string;
  subtitles_url: string | null;
};

type VideoRow = {
  id: string;
  video_url: string;
  subtitles_url: string | null;
  up_votes: number;
  down_votes: number;
  plays: number;
};

// Borne inférieure de l'intervalle de confiance de Wilson (95 %).
// Donne un "ratio prudent" qui tient compte du nombre de votes.
function wilsonScore(up: number, down: number): number {
  const n = up + down;
  if (n === 0) return 0;
  const z = 1.96;
  const phat = up / n;
  return (
    (phat + (z * z) / (2 * n) - z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * n)) / n)) /
    (1 + (z * z) / n)
  );
}

const EXPLORATION_RATE = 0.2; // 20 % du temps, on met en avant une vidéo peu vue.

/**
 * Choisit une vidéo pour la manche (en évitant les répétitions dans la partie) :
 *  - 20 % du temps : exploration → la vidéo la moins vue (chance aux nouvelles) ;
 *  - 80 % du temps : exploitation → tirage pondéré par le score de Wilson.
 * Repli sur la vidéo de démo si la bibliothèque est vide.
 */
export async function pickVideoForGame(gameId: string): Promise<PickedVideo> {
  const { data: usedRounds } = await supabase
    .from('rounds')
    .select('video_id')
    .eq('game_id', gameId);
  const usedIds = (usedRounds ?? []).map((r) => r.video_id).filter(Boolean);

  const { data: vids } = await supabase
    .from('videos')
    .select('id, video_url, subtitles_url, up_votes, down_votes, plays');
  const all = (vids ?? []) as VideoRow[];
  if (all.length === 0) {
    return { video_id: null, video_url: SAMPLE_VIDEO, subtitles_url: null };
  }

  const fresh = all.filter((v) => !usedIds.includes(v.id));
  const pool = fresh.length > 0 ? fresh : all;

  let chosen: VideoRow;
  if (Math.random() < EXPLORATION_RATE) {
    // Exploration : parmi les vidéos les moins jouées (indépendant du ratio).
    const minPlays = Math.min(...pool.map((v) => v.plays));
    const leastSeen = pool.filter((v) => v.plays === minPlays);
    chosen = leastSeen[Math.floor(Math.random() * leastSeen.length)];
  } else {
    // Exploitation : tirage aléatoire pondéré par le score de Wilson (+ epsilon).
    const weights = pool.map((v) => wilsonScore(v.up_votes, v.down_votes) + 0.05);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    chosen = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        chosen = pool[i];
        break;
      }
    }
  }

  // Compteur de lectures (best-effort).
  supabase.rpc('increment_video_plays', { p_video_id: chosen.id }).then(undefined, () => {});

  return { video_id: chosen.id, video_url: chosen.video_url, subtitles_url: chosen.subtitles_url };
}

/** Vote 👍 (+1) ou 👎 (-1) sur une vidéo (modifiable). */
export async function rateVideo(videoId: string, value: 1 | -1): Promise<void> {
  const pseudo = localStorage.getItem('pseudo') ?? 'Anonyme';
  await ensureSession(pseudo);
  const { error } = await supabase.rpc('rate_video', { p_video_id: videoId, p_value: value });
  if (error) throw error;
}

// === Gestion admin des vidéos (protégée par mot de passe vérifié côté serveur) ===

/** Vérifie le mot de passe admin. */
export async function adminCheck(secret: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('admin_check', { p_secret: secret });
  if (error) return false;
  return data === true;
}

/** Supprime une vidéo (admin). */
export async function adminDeleteVideo(secret: string, videoId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_video', {
    p_secret: secret,
    p_video_id: videoId,
  });
  if (error) throw error;
}

/** Ajoute / remplace les sous-titres d'une vidéo (admin) : upload .vtt + maj. */
export async function adminSetVideoSubtitles(
  secret: string,
  videoId: string,
  file: File
): Promise<void> {
  const pseudo = localStorage.getItem('pseudo') ?? 'Admin';
  const uid = await ensureSession(pseudo);
  const path = `${uid}/subs-${videoId}-${Date.now()}.vtt`;
  const { error: upErr } = await supabase.storage
    .from('videos')
    .upload(path, file, { contentType: 'text/vtt', upsert: false });
  if (upErr) throw upErr;
  const url = supabase.storage.from('videos').getPublicUrl(path).data.publicUrl;

  const { error } = await supabase.rpc('admin_set_subtitles', {
    p_secret: secret,
    p_video_id: videoId,
    p_subtitles_url: url,
  });
  if (error) throw error;
}

/** L'hôte lance une partie : remet les scores à zéro, crée le jeu et la 1re manche. */
export async function startGame(roomId: string, totalRounds: number): Promise<void> {
  await supabase.rpc('reset_room_scores', { p_room_id: roomId });

  const { data: game, error } = await supabase
    .from('games')
    .insert({ room_id: roomId, total_rounds: totalRounds, current_round: 1, phase: 'recording' })
    .select('id')
    .single();
  if (error || !game) throw error ?? new Error('Création de la partie impossible.');

  const v = await pickVideoForGame(game.id);
  const { error: rErr } = await supabase.from('rounds').insert({
    game_id: game.id,
    round_number: 1,
    video_url: v.video_url,
    video_id: v.video_id,
    subtitles_url: v.subtitles_url,
  });
  if (rErr) throw rErr;
}

/** Passe à la manche suivante : choisit une vidéo, crée la manche, repasse en enregistrement. */
export async function nextRound(gameId: string, nextNumber: number): Promise<void> {
  const v = await pickVideoForGame(gameId);
  const { error: rErr } = await supabase.from('rounds').upsert(
    {
      game_id: gameId,
      round_number: nextNumber,
      video_url: v.video_url,
      video_id: v.video_id,
      subtitles_url: v.subtitles_url,
    },
    { onConflict: 'game_id,round_number' }
  );
  if (rErr) throw rErr;

  const { error } = await supabase
    .from('games')
    .update({ current_round: nextNumber, phase: 'recording', viewing_index: 0 })
    .eq('id', gameId);
  if (error) throw error;
}

/** Upload d'une vidéo (+ sous-titres .vtt optionnels) dans la bibliothèque. */
export async function uploadVideo(
  file: File,
  title: string,
  subtitleFile: File | null
): Promise<void> {
  const pseudo = localStorage.getItem('pseudo') ?? 'Anonyme';
  const uid = await ensureSession(pseudo);

  const id = crypto.randomUUID();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
  const path = `${uid}/${id}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from('videos')
    .upload(path, file, { contentType: file.type || 'video/mp4', upsert: false });
  if (upErr) throw upErr;
  const videoUrl = supabase.storage.from('videos').getPublicUrl(path).data.publicUrl;

  let subtitlesUrl: string | null = null;
  if (subtitleFile) {
    const spath = `${uid}/${id}.vtt`;
    const { error: sErr } = await supabase.storage
      .from('videos')
      .upload(spath, subtitleFile, { contentType: 'text/vtt', upsert: false });
    if (sErr) throw sErr;
    subtitlesUrl = supabase.storage.from('videos').getPublicUrl(spath).data.publicUrl;
  }

  const { error } = await supabase.from('videos').insert({
    id,
    title,
    video_url: videoUrl,
    subtitles_url: subtitlesUrl,
    uploader_id: uid,
  });
  if (error) throw error;
}

/** Envoie le doublage validé : upload de l'audio dans Storage + enregistrement en base. */
export async function submitDub(roundId: string, blob: Blob): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Session manquante.');
  const userId = session.user.id;
  const pseudo = localStorage.getItem('pseudo') ?? 'Joueur';

  const path = `${roundId}/${userId}.webm`;
  const { error: upErr } = await supabase.storage
    .from('dubs')
    .upload(path, blob, { upsert: true, contentType: 'audio/webm' });
  if (upErr) throw upErr;

  const { data: pub } = supabase.storage.from('dubs').getPublicUrl(path);
  const { error: sErr } = await supabase
    .from('submissions')
    .upsert(
      { round_id: roundId, user_id: userId, pseudo, audio_url: pub.publicUrl },
      { onConflict: 'round_id,user_id' }
    );
  if (sErr) throw sErr;
}

/** Change la phase de la partie (utilisé par l'hôte pour faire avancer le jeu). */
export async function setGamePhase(gameId: string, phase: string): Promise<void> {
  const { error } = await supabase.from('games').update({ phase }).eq('id', gameId);
  if (error) throw error;
}

/** Démarre la phase de visionnage (remet l'index à 0). */
export async function startViewing(gameId: string): Promise<void> {
  const { error } = await supabase
    .from('games')
    .update({ phase: 'viewing', viewing_index: 0 })
    .eq('id', gameId);
  if (error) throw error;
}

/** Change le doublage en cours de visionnage (synchronisé pour tous). */
export async function setViewingIndex(gameId: string, index: number): Promise<void> {
  const { error } = await supabase.from('games').update({ viewing_index: index }).eq('id', gameId);
  if (error) throw error;
}

/** Vote pour un doublage (un seul vote par manche, pas pour soi-même côté UI). */
export async function castVote(roundId: string, submissionId: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Session manquante.');
  const { error } = await supabase
    .from('votes')
    .insert({ round_id: roundId, voter_id: session.user.id, submission_id: submissionId });
  if (error) throw error;
}

/** Dépouille la manche (distribue les points) puis passe à la phase scores. */
export async function tallyAndScore(roundId: string, gameId: string): Promise<void> {
  const { error } = await supabase.rpc('tally_round', { p_round_id: roundId });
  if (error) throw error;
  await setGamePhase(gameId, 'scores');
}
