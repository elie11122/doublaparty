'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { setViewingIndex, setGamePhase } from '@/lib/game';
import ClipPlayer, { ClipPlayerHandle } from './ClipPlayer';

type Submission = { id: string; user_id: string; pseudo: string; audio_url: string };
type Round = {
  id: string;
  video_url: string;
  subtitles_url: string | null;
  youtube_id: string | null;
};
type Game = { id: string; viewing_index: number };

export default function ViewingPhase({
  round,
  game,
  isHost,
}: {
  round: Round;
  game: Game;
  isHost: boolean;
}) {
  const [subs, setSubs] = useState<Submission[]>([]);
  const clipRef = useRef<ClipPlayerHandle>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [needGesture, setNeedGesture] = useState(false);

  // Récupère les doublages de la manche, dans un ordre identique pour tous.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('submissions')
        .select('id, user_id, pseudo, audio_url')
        .eq('round_id', round.id)
        .order('created_at', { ascending: true });
      setSubs(data ?? []);
    })();
  }, [round.id]);

  const index = game.viewing_index;
  const current = subs[index];

  // Joue le doublage courant (vidéo muette + voix par-dessus) à chaque changement d'index.
  useEffect(() => {
    if (!current) return;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const audio = new Audio(current.audio_url);
    audioRef.current = audio;

    clipRef.current?.playMuted();

    const goNext = () => {
      clipRef.current?.pause();
      if (!isHost) return;
      if (index < subs.length - 1) setViewingIndex(game.id, index + 1).catch(() => {});
      else setGamePhase(game.id, 'voting').catch(() => {});
    };
    audio.addEventListener('ended', goNext);

    // L'audio peut être bloqué si le navigateur exige un geste utilisateur.
    audio.play().then(
      () => setNeedGesture(false),
      () => setNeedGesture(true)
    );

    return () => {
      audio.removeEventListener('ended', goNext);
      audio.pause();
    };
  }, [current?.id, index, subs.length, isHost, game.id]);

  function manualPlay() {
    audioRef.current?.play().then(() => setNeedGesture(false), () => {});
    clipRef.current?.playMuted();
  }

  if (subs.length === 0) {
    return <p className="text-slate-300 text-center">Chargement des doublages…</p>;
  }

  return (
    <div className="bg-slate-800/60 rounded-2xl p-5 flex flex-col gap-4">
      <div className="text-center">
        <p className="text-slate-400 text-sm">
          Doublage {index + 1} / {subs.length}
        </p>
        <p className="text-2xl font-bold text-indigo-300">🎤 {current?.pseudo}</p>
      </div>

      <ClipPlayer
        key={round.id}
        ref={clipRef}
        videoUrl={round.video_url}
        youtubeId={round.youtube_id}
        subtitlesUrl={round.subtitles_url}
        className="w-full rounded-lg bg-black aspect-video overflow-hidden"
      />

      {needGesture && (
        <button
          onClick={manualPlay}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2.5 font-semibold"
        >
          ▶ Lancer la lecture
        </button>
      )}

      {isHost ? (
        <button
          onClick={() => {
            if (index < subs.length - 1) setViewingIndex(game.id, index + 1).catch(() => {});
            else setGamePhase(game.id, 'voting').catch(() => {});
          }}
          className="rounded-lg bg-slate-700 hover:bg-slate-600 py-2 text-sm font-semibold"
        >
          {index < subs.length - 1 ? 'Passer au suivant ▶' : 'Terminer le visionnage → vote'}
        </button>
      ) : (
        <p className="text-center text-slate-400 text-sm">
          L’hôte fait défiler les doublages…
        </p>
      )}
    </div>
  );
}
