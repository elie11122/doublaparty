'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
  uploadVideo,
  adminCheck,
  adminDeleteVideo,
  adminSetVideoSubtitles,
} from '@/lib/game';

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

  // Mode admin
  const [secret, setSecret] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminMsg, setAdminMsg] = useState('');

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

  async function handleUnlock() {
    const ok = await adminCheck(secret);
    if (ok) {
      setIsAdmin(true);
      setAdminMsg('');
    } else {
      setAdminMsg('Mot de passe incorrect.');
    }
  }

  async function handleDelete(videoId: string, t: string) {
    if (!confirm(`Supprimer définitivement « ${t} » ?`)) return;
    try {
      await adminDeleteVideo(secret, videoId);
      await fetchVideos();
    } catch (e) {
      setAdminMsg('Erreur suppression : ' + (e instanceof Error ? e.message : 'inconnue'));
    }
  }

  async function handleSetSubs(videoId: string, file: File | undefined) {
    if (!file) return;
    setAdminMsg('Envoi des sous-titres…');
    try {
      await adminSetVideoSubtitles(secret, videoId, file);
      setAdminMsg('✅ Sous-titres mis à jour.');
      await fetchVideos();
    } catch (e) {
      setAdminMsg('Erreur sous-titres : ' + (e instanceof Error ? e.message : 'inconnue'));
    }
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

        {/* Mode admin */}
        <div className="bg-slate-800/40 rounded-2xl p-4 flex flex-col gap-2">
          {!isAdmin ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="Mot de passe admin"
                  className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 ring-amber-500"
                />
                <button
                  onClick={handleUnlock}
                  className="rounded-lg bg-amber-600 hover:bg-amber-500 px-4 text-sm font-semibold"
                >
                  Déverrouiller
                </button>
              </div>
              {adminMsg && <p className="text-sm text-rose-400">{adminMsg}</p>}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-amber-300 text-sm font-semibold">🔓 Mode admin activé</span>
              <button
                onClick={() => {
                  setIsAdmin(false);
                  setSecret('');
                }}
                className="text-xs rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-1"
              >
                Verrouiller
              </button>
            </div>
          )}
          {isAdmin && adminMsg && <p className="text-sm text-slate-300">{adminMsg}</p>}
        </div>

        {/* Liste des vidéos */}
        <div className="flex flex-col gap-3">
          <h2 className="font-semibold text-slate-300">
            {videos.length} vidéo(s) dans la bibliothèque
          </h2>
          {videos.map((v) => (
            <div key={v.id} className="bg-slate-800/60 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex gap-4 items-start">
                <video
                  src={v.video_url}
                  className="w-56 rounded-lg bg-black aspect-video shrink-0"
                  controls
                  preload="metadata"
                  crossOrigin={v.subtitles_url ? 'anonymous' : undefined}
                >
                  {v.subtitles_url && (
                    <track
                      src={v.subtitles_url}
                      kind="subtitles"
                      srcLang="fr"
                      label="Français"
                      default
                    />
                  )}
                </video>
                <div className="flex-1">
                  <p className="font-semibold">{v.title}</p>
                  <p className="text-sm text-slate-400">
                    👍 {v.up_votes} · 👎 {v.down_votes} · ▶ {v.plays} lecture(s)
                    {v.subtitles_url && ' · 💬 sous-titrée'}
                  </p>
                </div>
              </div>

              {isAdmin && (
                <div className="flex flex-wrap gap-2 border-t border-slate-700 pt-3">
                  <label className="cursor-pointer rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm font-semibold">
                    💬 {v.subtitles_url ? 'Remplacer' : 'Ajouter'} les sous-titres
                    <input
                      type="file"
                      accept=".vtt,text/vtt"
                      className="hidden"
                      onChange={(e) => handleSetSubs(v.id, e.target.files?.[0])}
                    />
                  </label>
                  <button
                    onClick={() => handleDelete(v.id, v.title)}
                    className="rounded-lg bg-rose-700 hover:bg-rose-600 px-3 py-1.5 text-sm font-semibold ml-auto"
                  >
                    🗑 Supprimer
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
