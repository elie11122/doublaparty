'use client';

import { startGame } from '@/lib/game';

type Player = { user_id: string; pseudo: string; score: number };
type Game = { id: string; total_rounds: number };

function medal(rank: number): string {
  return ['🥇', '🥈', '🥉'][rank] ?? `${rank + 1}.`;
}

export default function FinishedPhase({
  game,
  players,
  roomId,
  myId,
  isHost,
  onLeave,
}: {
  game: Game;
  players: Player[];
  roomId: string;
  myId: string | null;
  isHost: boolean;
  onLeave: () => void;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  return (
    <div className="bg-slate-800/60 rounded-2xl p-6 flex flex-col gap-5 text-center">
      <div>
        <p className="text-slate-400">Vainqueur</p>
        <h1 className="text-4xl font-extrabold text-amber-400">🏆 {winner?.pseudo}</h1>
        <p className="text-slate-300 mt-1">{winner?.score} points</p>
      </div>

      <ol className="flex flex-col gap-2 text-left">
        {sorted.map((p, i) => (
          <li
            key={p.user_id}
            className={
              'flex items-center justify-between rounded-lg px-4 py-2 ' +
              (i === 0 ? 'bg-amber-600/30' : 'bg-slate-900/70')
            }
          >
            <span>
              <span className="mr-2">{medal(i)}</span>
              {p.pseudo}
              {p.user_id === myId && <span className="text-slate-500 text-sm"> (toi)</span>}
            </span>
            <span className="font-bold">{p.score} pts</span>
          </li>
        ))}
      </ol>

      {isHost && (
        <button
          onClick={() => startGame(roomId, game.total_rounds).catch(() => {})}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 py-2.5 font-semibold"
        >
          Rejouer une partie
        </button>
      )}
      <button
        onClick={onLeave}
        className="text-sm text-slate-400 hover:text-slate-200 transition"
      >
        Retour à l’accueil
      </button>
    </div>
  );
}
