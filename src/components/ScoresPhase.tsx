'use client';

import { nextRound, setGamePhase } from '@/lib/game';

type Player = { user_id: string; pseudo: string; score: number };
type Game = { id: string; current_round: number; total_rounds: number };

function medal(rank: number): string {
  return ['🥇', '🥈', '🥉'][rank] ?? `${rank + 1}.`;
}

export default function ScoresPhase({
  game,
  players,
  myId,
  isHost,
}: {
  game: Game;
  players: Player[];
  myId: string | null;
  isHost: boolean;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const isLastRound = game.current_round >= game.total_rounds;

  return (
    <div className="bg-slate-800/60 rounded-2xl p-6 flex flex-col gap-5">
      <h2 className="text-center font-semibold text-slate-100">
        🏆 Scores — fin de la manche {game.current_round} / {game.total_rounds}
      </h2>

      <ol className="flex flex-col gap-2">
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

      {isHost ? (
        isLastRound ? (
          <button
            onClick={() => setGamePhase(game.id, 'finished').catch(() => {})}
            className="rounded-lg bg-amber-600 hover:bg-amber-500 py-2.5 font-semibold"
          >
            Voir le classement final 🏆
          </button>
        ) : (
          <button
            onClick={() => nextRound(game.id, game.current_round + 1).catch(() => {})}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 py-2.5 font-semibold"
          >
            Manche suivante ▶
          </button>
        )
      ) : (
        <p className="text-center text-slate-400 text-sm">En attente de l’hôte…</p>
      )}
    </div>
  );
}
