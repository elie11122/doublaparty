'use client';

import { useRef, useState } from 'react';
import { submitDub } from '@/lib/game';
import ClipPlayer, { ClipPlayerHandle } from './ClipPlayer';

type Player = { user_id: string; pseudo: string };
type Round = {
  id: string;
  video_url: string;
  subtitles_url: string | null;
  youtube_id: string | null;
};

export default function RecordingPhase({
  round,
  players,
  submittedIds,
  myId,
}: {
  round: Round;
  players: Player[];
  submittedIds: string[];
  myId: string | null;
}) {
  const clipRef = useRef<ClipPlayerHandle>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const replayAudioRef = useRef<HTMLAudioElement | null>(null);

  const [recording, setRecording] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [hasTake, setHasTake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('Clique sur « Démarrer la prise » pour doubler la vidéo.');

  const iSubmitted = !!myId && submittedIds.includes(myId);

  // Fin de la vidéo : on arrête la prise si on enregistrait, et on sort de l'aperçu.
  function handleClipEnded() {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === 'recording') mr.stop();
    setPreviewing(false);
  }

  async function preview() {
    setPreviewing(true);
    setStatus('▶ Aperçu de la vidéo (avec le son)…');
    await clipRef.current?.playWithSound();
  }

  function stopPreview() {
    clipRef.current?.pause();
    setPreviewing(false);
    setStatus('Clique sur « Démarrer la prise » pour doubler la vidéo.');
  }

  async function startTake() {
    setPreviewing(false);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus('❌ Micro refusé ou indisponible.');
      return;
    }

    chunksRef.current = [];
    const mr = new MediaRecorder(stream);
    mediaRecorderRef.current = mr;
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      blobRef.current = new Blob(chunksRef.current, { type: 'audio/webm' });
      stream.getTracks().forEach((t) => t.stop());
      clipRef.current?.pause();
      setRecording(false);
      setHasTake(true);
      setStatus('Prise terminée. Réécoute, refais-en une, ou valide.');
    };

    await clipRef.current?.playMuted();
    mr.start();
    setRecording(true);
    setStatus('● Enregistrement… double la vidéo !');
  }

  function stopTake() {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === 'recording') mr.stop();
    clipRef.current?.pause();
  }

  async function replay() {
    if (!blobRef.current) return;
    await clipRef.current?.playMuted();
    const audio = new Audio(URL.createObjectURL(blobRef.current));
    replayAudioRef.current = audio;
    audio.play().catch(() => {});
    setStatus('▶ Réécoute de ta prise…');
  }

  async function validate() {
    if (!blobRef.current) return;
    setSubmitting(true);
    setStatus('Envoi du doublage…');
    try {
      await submitDub(round.id, blobRef.current);
      setStatus('✅ Doublage validé ! En attente des autres joueurs…');
    } catch (e) {
      setStatus('Erreur lors de l’envoi : ' + (e instanceof Error ? e.message : 'inconnue'));
    }
    setSubmitting(false);
  }

  return (
    <div className="bg-slate-800/60 rounded-2xl p-5 flex flex-col gap-4">
      <ClipPlayer
        key={round.id}
        ref={clipRef}
        videoUrl={round.video_url}
        youtubeId={round.youtube_id}
        subtitlesUrl={round.subtitles_url}
        onEnded={handleClipEnded}
        className="w-full rounded-lg bg-black aspect-video overflow-hidden"
      />

      {!iSubmitted ? (
        <>
          <div className="flex flex-wrap gap-2">
            {!recording && (
              <button
                onClick={previewing ? stopPreview : preview}
                disabled={submitting}
                className="rounded-lg bg-sky-700 hover:bg-sky-600 px-4 py-2 font-semibold disabled:opacity-40"
              >
                {previewing ? '■ Stop aperçu' : '▶ Aperçu (son)'}
              </button>
            )}
            {!recording ? (
              <button
                onClick={startTake}
                disabled={submitting}
                className="rounded-lg bg-rose-600 hover:bg-rose-500 px-4 py-2 font-semibold disabled:opacity-40"
              >
                ● {hasTake ? 'Refaire une prise' : 'Démarrer la prise'}
              </button>
            ) : (
              <button
                onClick={stopTake}
                className="rounded-lg bg-slate-600 hover:bg-slate-500 px-4 py-2 font-semibold"
              >
                ■ Arrêter
              </button>
            )}

            {hasTake && !recording && (
              <button
                onClick={replay}
                disabled={submitting}
                className="rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-2 font-semibold disabled:opacity-40"
              >
                ▶ Réécouter
              </button>
            )}

            {hasTake && !recording && (
              <button
                onClick={validate}
                disabled={submitting}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 font-semibold disabled:opacity-40 ml-auto"
              >
                ✓ Valider ce doublage
              </button>
            )}
          </div>
          <p className="text-sm text-slate-400">{status}</p>
        </>
      ) : (
        <p className="text-emerald-400 font-semibold text-center">
          ✅ Ton doublage est validé ! En attente des autres…
        </p>
      )}

      <div className="border-t border-slate-700 pt-3">
        <p className="text-sm text-slate-300 mb-2">
          Validés : {submittedIds.length} / {players.length}
        </p>
        <ul className="flex flex-wrap gap-2">
          {players.map((p) => {
            const done = submittedIds.includes(p.user_id);
            return (
              <li
                key={p.user_id}
                className={
                  'text-sm rounded-full px-3 py-1 ' +
                  (done ? 'bg-emerald-700/60 text-emerald-100' : 'bg-slate-700/60 text-slate-300')
                }
              >
                {done ? '✓ ' : '… '}
                {p.pseudo}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
