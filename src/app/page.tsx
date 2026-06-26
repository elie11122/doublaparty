'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createRoom, joinRoom } from '@/lib/game';

export default function Home() {
  const router = useRouter();
  const [pseudo, setPseudo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // On se souvient du pseudo d'une fois sur l'autre.
  useEffect(() => {
    setPseudo(localStorage.getItem('pseudo') ?? '');
  }, []);

  function checkPseudo(): boolean {
    if (pseudo.trim().length < 2) {
      setError('Choisis un pseudo (2 caractères minimum).');
      return false;
    }
    localStorage.setItem('pseudo', pseudo.trim());
    setError('');
    return true;
  }

  async function handleCreate() {
    if (!checkPseudo()) return;
    setBusy(true);
    try {
      const newCode = await createRoom(pseudo.trim());
      router.push(`/room/${newCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.');
      setBusy(false);
    }
  }

  async function handleJoin() {
    if (!checkPseudo()) return;
    if (code.trim().length < 4) {
      setError('Entre un code de room valide.');
      return;
    }
    setBusy(true);
    try {
      const target = code.trim().toUpperCase();
      await joinRoom(target, pseudo.trim());
      router.push(`/room/${target}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Room introuvable.');
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-indigo-950 to-slate-900 text-slate-100 p-6">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight">🎙️ DoublaParty</h1>
        <p className="mt-2 text-slate-400">
          Doublez des vidéos entre amis et votez pour le meilleur doublage.
        </p>
      </div>

      <div className="w-full max-w-sm bg-slate-800/60 rounded-2xl p-6 shadow-xl flex flex-col gap-5">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-300">Ton pseudo</span>
          <input
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            placeholder="Ex. Léa"
            maxLength={20}
            className="rounded-lg bg-slate-900 px-3 py-2 outline-none focus:ring-2 ring-indigo-500"
          />
        </label>

        <button
          onClick={handleCreate}
          disabled={busy}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 py-2.5 font-semibold transition"
        >
          Créer une room
        </button>

        <div className="flex items-center gap-3 text-xs text-slate-500">
          <div className="h-px flex-1 bg-slate-700" /> ou rejoindre
          <div className="h-px flex-1 bg-slate-700" />
        </div>

        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            maxLength={6}
            className="flex-1 rounded-lg bg-slate-900 px-3 py-2 uppercase tracking-widest outline-none focus:ring-2 ring-emerald-500"
          />
          <button
            onClick={handleJoin}
            disabled={busy}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-4 font-semibold transition"
          >
            Rejoindre
          </button>
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>

      <button
        onClick={() => router.push('/videos')}
        className="text-sm text-slate-400 hover:text-slate-200 transition"
      >
        🎞️ Gérer / ajouter des vidéos
      </button>
    </main>
  );
}
