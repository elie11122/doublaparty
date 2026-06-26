'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { joinRoom, leaveRoom, startGame, claimHost } from '@/lib/game';
import GameView from '@/components/GameView';

type Player = { user_id: string; pseudo: string; score: number };
type Room = { id: string; code: string; host_id: string; status: string };
type Game = {
  id: string;
  total_rounds: number;
  current_round: number;
  phase: string;
  viewing_index: number;
};

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const code = String(params.code).toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [game, setGame] = useState<Game | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [pseudo, setPseudo] = useState('');
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [rounds, setRounds] = useState(3);
  const [starting, setStarting] = useState(false);
  const [onlineIds, setOnlineIds] = useState<string[]>([]);

  const fetchPlayers = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from('room_players')
      .select('user_id, pseudo, score')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });
    setPlayers(data ?? []);
    return data ?? [];
  }, []);

  const fetchGame = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from('games')
      .select('id, total_rounds, current_round, phase, viewing_index')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setGame(data ?? null);
    return data;
  }, []);

  const fetchRoom = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from('rooms')
      .select('id, code, host_id, status')
      .eq('id', roomId)
      .single();
    if (data) setRoom(data);
  }, []);

  // Chargement initial + abonnement temps réel
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user.id ?? null;
      setMyId(uid);
      setPseudo(localStorage.getItem('pseudo') ?? '');

      const { data: roomRow, error: rErr } = await supabase
        .from('rooms')
        .select('id, code, host_id, status')
        .eq('code', code)
        .single();

      if (rErr || !roomRow) {
        setError("Cette room n'existe pas.");
        setLoading(false);
        return;
      }
      setRoom(roomRow);

      const list = await fetchPlayers(roomRow.id);
      if (uid && list.some((p) => p.user_id === uid)) setJoined(true);
      await fetchGame(roomRow.id);

      channel = supabase
        .channel(`room-${roomRow.id}-${Math.random().toString(36).slice(2)}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomRow.id}` },
          () => fetchPlayers(roomRow.id)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'games', filter: `room_id=eq.${roomRow.id}` },
          () => fetchGame(roomRow.id)
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomRow.id}` },
          () => fetchRoom(roomRow.id)
        )
        .subscribe();

      setLoading(false);
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [code, fetchPlayers, fetchGame, fetchRoom]);

  // Présence en ligne : détecte les joueurs réellement connectés (même après une
  // fermeture brutale d'onglet), pour repérer un hôte qui a disparu.
  useEffect(() => {
    if (!room?.id || !myId) return;
    const presence = supabase.channel(`presence-${room.id}`, {
      config: { presence: { key: myId } },
    });
    presence.on('presence', { event: 'sync' }, () => {
      setOnlineIds(Object.keys(presence.presenceState()));
    });
    presence.subscribe((status) => {
      if (status === 'SUBSCRIBED') presence.track({ online_at: Date.now() });
    });
    return () => {
      supabase.removeChannel(presence);
    };
  }, [room?.id, myId]);

  async function handleJoin() {
    if (pseudo.trim().length < 2) {
      setError('Choisis un pseudo (2 caractères minimum).');
      return;
    }
    setError('');
    try {
      localStorage.setItem('pseudo', pseudo.trim());
      await joinRoom(code, pseudo.trim());
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setMyId(session?.user.id ?? null);
      if (room) await fetchPlayers(room.id);
      setJoined(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion impossible.');
    }
  }

  async function handleLaunch() {
    if (!room) return;
    setStarting(true);
    setError('');
    try {
      await startGame(room.id, rounds);
      await fetchGame(room.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lancement impossible.');
    }
    setStarting(false);
  }

  async function handleLeave() {
    if (room) await leaveRoom(room.id);
    router.push('/');
  }

  async function handleClaimHost() {
    if (!room) return;
    try {
      await claimHost(room.id);
      await fetchRoom(room.id);
      await fetchPlayers(room.id);
    } catch {
      /* best-effort */
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-300">
        Chargement…
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-900 text-slate-200">
        <p className="text-rose-400">{error}</p>
        <button onClick={() => router.push('/')} className="rounded-lg bg-indigo-600 px-4 py-2">
          Retour à l&apos;accueil
        </button>
      </main>
    );
  }

  const isHost = !!myId && room?.host_id === myId;

  return (
    <main className="min-h-screen flex flex-col items-center gap-6 bg-gradient-to-b from-indigo-950 to-slate-900 text-slate-100 p-6">
      {joined &&
        room &&
        myId &&
        onlineIds.includes(myId) &&
        !onlineIds.includes(room.host_id) && (
          <div className="w-full max-w-sm bg-amber-900/40 border border-amber-700 rounded-xl p-3 text-center text-amber-100 text-sm flex flex-col gap-2">
            L’hôte a quitté la partie.
            <button
              onClick={handleClaimHost}
              className="rounded-lg bg-amber-600 hover:bg-amber-500 py-1.5 font-semibold"
            >
              Devenir hôte
            </button>
          </div>
        )}

      {!game && (
        <div className="text-center mt-6">
          <p className="text-slate-400 text-sm">Code de la room</p>
          <h1 className="text-5xl font-extrabold tracking-[0.3em]">{code}</h1>
          <button
            onClick={copyLink}
            className="mt-3 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-1.5 transition"
          >
            {copied ? '✅ Lien copié' : '🔗 Copier le lien d’invitation'}
          </button>
        </div>
      )}

      {!joined ? (
        <div className="w-full max-w-sm bg-slate-800/60 rounded-2xl p-6 flex flex-col gap-4">
          <p className="text-slate-300 text-sm">Choisis ton pseudo pour rejoindre :</p>
          <input
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            placeholder="Ton pseudo"
            maxLength={20}
            className="rounded-lg bg-slate-900 px-3 py-2 outline-none focus:ring-2 ring-indigo-500"
          />
          <button
            onClick={handleJoin}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2.5 font-semibold transition"
          >
            Rejoindre la partie
          </button>
          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      ) : game ? (
        <GameView
          game={game}
          players={players}
          myId={myId}
          isHost={isHost}
          roomId={room?.id ?? ''}
          onLeave={() => router.push('/')}
        />
      ) : (
        <div className="w-full max-w-sm bg-slate-800/60 rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-slate-200">Joueurs ({players.length})</h2>
          <ul className="flex flex-col gap-2">
            {players.map((p) => (
              <li
                key={p.user_id}
                className="flex items-center justify-between rounded-lg bg-slate-900/70 px-3 py-2"
              >
                <span>
                  {room?.host_id === p.user_id && '👑 '}
                  {p.pseudo}
                  {p.user_id === myId && <span className="text-slate-500 text-sm"> (toi)</span>}
                </span>
              </li>
            ))}
          </ul>

          {isHost ? (
            <div className="flex flex-col gap-3 border-t border-slate-700 pt-4">
              <label className="flex items-center justify-between text-sm">
                <span className="text-slate-300">Nombre de manches</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={rounds}
                  onChange={(e) => setRounds(Math.max(1, Math.min(10, Number(e.target.value))))}
                  className="w-20 rounded-lg bg-slate-900 px-3 py-1.5 text-center outline-none focus:ring-2 ring-indigo-500"
                />
              </label>
              <button
                onClick={handleLaunch}
                disabled={starting || players.length < 1}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 py-2.5 font-semibold disabled:opacity-40 transition"
              >
                {starting ? 'Lancement…' : 'Lancer la partie'}
              </button>
            </div>
          ) : (
            <p className="text-center text-slate-400 text-sm">
              En attente que l’hôte lance la partie…
            </p>
          )}

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button
            onClick={handleLeave}
            className="text-sm text-slate-400 hover:text-rose-400 transition"
          >
            Quitter la room
          </button>
        </div>
      )}
    </main>
  );
}
