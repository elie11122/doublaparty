'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { castVote, tallyAndScore, rateVideo } from '@/lib/game';

type Submission = { id: string; user_id: string; pseudo: string; audio_url: string };
type Player = { user_id: string; pseudo: string };
type Round = {
  id: string;
  video_url: string;
  subtitles_url: string | null;
  video_id: string | null;
};
type Game = { id: string };

export default function VotingPhase({
  round,
  game,
  players,
  myId,
  isHost,
}: {
  round: Round;
  game: Game;
  players: Player[];
  myId: string | null;
  isHost: boolean;
}) {
  const [subs, setSubs] = useState<Submission[]>([]);
  const [votes, setVotes] = useState<{ voter_id: string; submission_id: string }[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [myRating, setMyRating] = useState<1 | -1 | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const talliedRef = useRef(false);

  const fetchVotes = useCallback(async () => {
    const { data } = await supabase
      .from('votes')
      .select('voter_id, submission_id')
      .eq('round_id', round.id);
    setVotes(data ?? []);
  }, [round.id]);

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

  useEffect(() => {
    fetchVotes();
    const channel = supabase
      .channel(`votes-${round.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'votes', filter: `round_id=eq.${round.id}` },
        () => fetchVotes()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [round.id, fetchVotes]);

  const myVote = votes.find((v) => v.voter_id === myId);
  const voteCount = votes.length;
  // On ne peut voter que s'il existe au moins un doublage autre que le sien.
  const expectedVotes = subs.length >= 2 ? players.length : 0;

  // L'hôte dépouille dès que tout le monde a voté (ou immédiatement si vote impossible).
  useEffect(() => {
    if (!isHost || talliedRef.current || subs.length === 0) return;
    if (voteCount >= expectedVotes) {
      talliedRef.current = true;
      tallyAndScore(round.id, game.id).catch(() => {
        talliedRef.current = false;
      });
    }
  }, [isHost, voteCount, expectedVotes, subs.length, round.id, game.id]);

  function play(sub: Submission) {
    const video = videoRef.current;
    if (!video) return;
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(sub.audio_url);
    audioRef.current = audio;
    video.muted = true;
    video.currentTime = 0;
    video.play().catch(() => {});
    audio.play().catch(() => {});
    setPlayingId(sub.id);
    audio.addEventListener('ended', () => {
      video.pause();
      setPlayingId(null);
    });
  }

  async function vote(submissionId: string) {
    if (myVote) return;
    try {
      await castVote(round.id, submissionId);
      await fetchVotes();
    } catch {
      /* ignoré : double vote empêché par la contrainte unique */
    }
  }

  async function rate(value: 1 | -1) {
    if (!round.video_id) return;
    setMyRating(value);
    try {
      await rateVideo(round.video_id, value);
    } catch {
      /* best-effort */
    }
  }

  if (subs.length === 0) {
    return <p className="text-slate-300 text-center">Chargement des doublages…</p>;
  }

  return (
    <div className="bg-slate-800/60 rounded-2xl p-5 flex flex-col gap-4">
      <h2 className="text-center font-semibold text-slate-100">
        🗳️ Vote pour ton doublage préféré
      </h2>

      <video
        key={round.id}
        ref={videoRef}
        src={round.video_url}
        playsInline
        controls={false}
        crossOrigin={round.subtitles_url ? 'anonymous' : undefined}
        onLoadedMetadata={(e) => {
          const tt = e.currentTarget.textTracks;
          for (let i = 0; i < tt.length; i++) tt[i].mode = 'showing';
        }}
        className="w-full rounded-lg bg-black aspect-video"
      >
        {round.subtitles_url && (
          <track src={round.subtitles_url} kind="subtitles" srcLang="fr" label="Français" default />
        )}
      </video>

      <ul className="flex flex-col gap-2">
        {subs.map((s) => {
          const isMine = s.user_id === myId;
          const chosen = myVote?.submission_id === s.id;
          const votesForThis = votes.filter((v) => v.submission_id === s.id).length;
          return (
            <li
              key={s.id}
              className={
                'flex items-center gap-2 rounded-lg px-3 py-2 ' +
                (chosen ? 'bg-emerald-700/50' : 'bg-slate-900/70')
              }
            >
              <span className="flex-1">
                🎤 {s.pseudo}
                {isMine && <span className="text-slate-500 text-sm"> (toi)</span>}
                {myVote && (
                  <span className="text-slate-400 text-sm"> — {votesForThis} vote(s)</span>
                )}
              </span>

              <button
                onClick={() => play(s)}
                className="rounded-md bg-slate-700 hover:bg-slate-600 px-3 py-1 text-sm"
              >
                {playingId === s.id ? '♪…' : '▶'}
              </button>

              <button
                onClick={() => vote(s.id)}
                disabled={isMine || !!myVote}
                className="rounded-md bg-indigo-600 hover:bg-indigo-500 px-3 py-1 text-sm font-semibold disabled:opacity-30"
              >
                {chosen ? '✓ Voté' : 'Voter'}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="text-center text-slate-400 text-sm">
        {expectedVotes === 0
          ? 'Pas assez de joueurs pour voter — passage aux scores…'
          : `Votes : ${voteCount} / ${expectedVotes}`}
      </p>

      {round.video_id && (
        <div className="border-t border-slate-700 pt-3 flex items-center justify-center gap-3">
          <span className="text-sm text-slate-300">Cette vidéo t’a plu ?</span>
          <button
            onClick={() => rate(1)}
            className={
              'rounded-lg px-3 py-1.5 text-lg ' +
              (myRating === 1 ? 'bg-emerald-600' : 'bg-slate-700 hover:bg-slate-600')
            }
          >
            👍
          </button>
          <button
            onClick={() => rate(-1)}
            className={
              'rounded-lg px-3 py-1.5 text-lg ' +
              (myRating === -1 ? 'bg-rose-600' : 'bg-slate-700 hover:bg-slate-600')
            }
          >
            👎
          </button>
        </div>
      )}

      {isHost && expectedVotes > 0 && (
        <button
          onClick={() => {
            talliedRef.current = true;
            tallyAndScore(round.id, game.id).catch(() => {
              talliedRef.current = false;
            });
          }}
          className="rounded-lg bg-slate-700 hover:bg-slate-600 py-2 text-sm font-semibold"
        >
          Clôturer les votes maintenant
        </button>
      )}
    </div>
  );
}
