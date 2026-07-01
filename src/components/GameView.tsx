'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { startViewing } from '@/lib/game';
import RecordingPhase from './RecordingPhase';
import ViewingPhase from './ViewingPhase';
import VotingPhase from './VotingPhase';
import ScoresPhase from './ScoresPhase';
import FinishedPhase from './FinishedPhase';

type Player = { user_id: string; pseudo: string; score: number };
type Game = {
  id: string;
  total_rounds: number;
  current_round: number;
  phase: string;
  viewing_index: number;
};
type Round = {
  id: string;
  round_number: number;
  video_url: string;
  subtitles_url: string | null;
  video_id: string | null;
  youtube_id: string | null;
};

export default function GameView({
  game,
  players,
  myId,
  isHost,
  roomId,
  onLeave,
}: {
  game: Game;
  players: Player[];
  myId: string | null;
  isHost: boolean;
  roomId: string;
  onLeave: () => void;
}) {
  const [round, setRound] = useState<Round | null>(null);
  // On mémorise À QUELLE manche appartiennent ces validations, pour ne jamais
  // réutiliser celles de la manche précédente.
  const [subData, setSubData] = useState<{ roundId: string; ids: string[] }>({
    roundId: '',
    ids: [],
  });

  const fetchRound = useCallback(async () => {
    const { data } = await supabase
      .from('rounds')
      .select('id, round_number, video_url, subtitles_url, video_id, youtube_id')
      .eq('game_id', game.id)
      .eq('round_number', game.current_round)
      .maybeSingle();
    setRound(data ?? null);
    return data;
  }, [game.id, game.current_round]);

  const fetchSubmissions = useCallback(async (roundId: string) => {
    const { data } = await supabase
      .from('submissions')
      .select('user_id')
      .eq('round_id', roundId);
    setSubData({ roundId, ids: (data ?? []).map((s) => s.user_id) });
  }, []);

  // Validations qui concernent UNIQUEMENT la manche actuellement affichée.
  const submittedIds = round && subData.roundId === round.id ? subData.ids : [];

  // Charge la manche courante + suit les doublages en temps réel.
  // La manche peut être créée juste APRÈS la partie : on réessaie tant qu'elle
  // n'est pas prête (sinon l'écran resterait figé sur « Préparation… »).
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const load = async () => {
      const r = await fetchRound();
      if (cancelled) return;
      if (!r) {
        if (attempts < 15) {
          attempts++;
          timer = setTimeout(load, 500);
        }
        return;
      }
      await fetchSubmissions(r.id);
      if (cancelled) return;
      channel = supabase
        .channel(`round-${r.id}-${Math.random().toString(36).slice(2)}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'submissions', filter: `round_id=eq.${r.id}` },
          () => fetchSubmissions(r.id)
        )
        .subscribe();
    };
    load();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [fetchRound, fetchSubmissions]);

  // Quand tout le monde a validé pendant l'enregistrement, l'hôte passe au visionnage.
  useEffect(() => {
    if (
      game.phase === 'recording' &&
      isHost &&
      round &&
      round.round_number === game.current_round &&
      players.length > 0 &&
      submittedIds.length >= players.length
    ) {
      startViewing(game.id).catch(() => {});
    }
  }, [
    game.phase,
    isHost,
    round,
    players.length,
    submittedIds.length,
    game.id,
    game.current_round,
  ]);

  if (!round) {
    return <p className="text-slate-300 text-center">Préparation de la manche…</p>;
  }

  return (
    <div className="w-full max-w-xl flex flex-col gap-4">
      <div className="text-center text-slate-300 font-semibold">
        Manche {game.current_round} / {game.total_rounds}
      </div>

      {game.phase === 'recording' && (
        <>
          <RecordingPhase
            round={round}
            players={players}
            submittedIds={submittedIds}
            myId={myId}
          />
          {isHost && submittedIds.length < players.length && (
            <button
              onClick={() => startViewing(game.id).catch(() => {})}
              disabled={submittedIds.length === 0}
              className="rounded-lg bg-slate-700 hover:bg-slate-600 py-2 text-sm font-semibold disabled:opacity-40"
            >
              ⏭️ Forcer le passage au visionnage ({submittedIds.length}/{players.length} prêts)
            </button>
          )}
        </>
      )}

      {game.phase === 'viewing' && (
        <ViewingPhase round={round} game={game} isHost={isHost} />
      )}

      {game.phase === 'voting' && (
        <VotingPhase round={round} game={game} players={players} myId={myId} isHost={isHost} />
      )}

      {game.phase === 'scores' && (
        <ScoresPhase game={game} players={players} myId={myId} isHost={isHost} />
      )}

      {game.phase === 'finished' && (
        <FinishedPhase
          game={game}
          players={players}
          roomId={roomId}
          myId={myId}
          isHost={isHost}
          onLeave={onLeave}
        />
      )}
    </div>
  );
}
