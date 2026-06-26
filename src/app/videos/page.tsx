'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { uploadVideo } from '@/lib/game';

type Video = {
  id: string;
  title: string;
  video_url: string;
  subtitles_url: string | null;
  up_votes: number;
  down_votes: number;
  plays: number;
};

export default function VideosPage() {
  const router = useRouter();
  const [videos, setVideos] = useState<Video[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const videoInput = useRef<HTMLInputElement>(null);
  const subInput = useRef<HTMLInputElement>(null);

  async function fetchVideos() {
    const { data } = await supabase
      .from('videos')
      .select('id, title, video_url, subtitles_url, up_votes, down_votes, plays')
      .order('created_at', { ascending: false });
    setVideos(data ?? []);
  }

  useEffect(() => {
    fetchVideos();
  }, []);

  async function handleUpload() {
    const file = videoInput.current?.files?.[0] ?? null;
    const sub = subInput.current?.files?.[0] ?? null;

    if (!title.trim()) {
      setStatus('Donne un titre à la vidéo.');
      return;
    }
    if (!file) {
      setStatus('Choisis un fichier vidéo.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setStatus('Vidéo trop lourde (max 50 Mo). Choisis un extrait plus court.');
      return;
    }

    setBusy(true);
    setStatus('Envoi en cours… (cela peut prendre quelques secondes)');
    try {
      await uploadVideo(file, title.trim(), sub);
      setStatus('✅ Vidéo ajoutée à la bibliothèque !');
      setTitle('');
      if (videoInput.current) videoInput.current.value = '';
      if (subInput.current) subInput.current.value = '';
      await fetchVideos();
    } catch (e) {
      setStatus('Erreur : ' + (e instanceof Error ? e.message : 'inconnue'));
    }
    setBusy(false);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-950 to-slate-900 text-slate-100 p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold">🎞️ Bibliothèque de vidéos</h1>
          <button
            onClick={() => router.push('/')}
            className="text-sm rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-1.5"
          >
            ← Accueil
          </button>
        </div>

        {/* Formulaire d'upload */}
        <div className="bg-slate-800/60 rounded-2xl p-5 flex flex-col gap-3">
          <h2 className="font-semibold">Ajouter une vidéo</h2>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre (ex. Scène culte de…)"
            maxLength={80}
            className="rounded-lg bg-slate-900 px-3 py-2 outline-none focus:ring-2 ring-indigo-500"
          />
          <label className="text-sm text-slate-300">
            Fichier vidéo (max 50 Mo, idéalement court)
            <input
              ref={videoInput}
              type="file"
              accept="video/*"
              className="mt-1 block w-full text-sm text-slate-400"
            />
          </label>
          <label className="text-sm text-slate-300">
            Sous-titres .vtt (optionnel)
            <input
              ref={subInput}
              type="file"
              accept=".vtt,text/vtt"
              className="mt-1 block w-full text-sm text-slate-400"
            />
          </label>
          <button
            onClick={handleUpload}
            disabled={busy}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 py-2.5 font-semibold transition"
          >
            {busy ? 'Envoi…' : 'Ajouter à la bibliothèque'}
          </button>
          {status && <p className="text-sm text-slate-300">{status}</p>}
        </div>

        {/* Liste des vidéos */}
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold text-slate-300">
            {videos.length} vidéo(s) dans la bibliothèque
          </h2>
          {videos.map((v) => (
            <div key={v.id} className="bg-slate-800/60 rounded-xl p-4 flex gap-4 items-center">
              <video
                src={v.video_url}
                className="w-32 rounded-lg bg-black aspect-video shrink-0"
                muted
                preload="metadata"
              />
              <div className="flex-1">
                <p className="font-semibold">{v.title}</p>
                <p className="text-sm text-slate-400">
                  👍 {v.up_votes} · 👎 {v.down_votes} · ▶ {v.plays} lecture(s)
                  {v.subtitles_url && ' · 💬 sous-titrée'}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
