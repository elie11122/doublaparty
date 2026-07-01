'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// Lecteur unifié : une vidéo peut être un fichier (<video>) ou une vidéo YouTube
// (lecteur IFrame). Expose les mêmes commandes impératives aux deux cas.
export type ClipPlayerHandle = {
  playMuted: () => Promise<void>;
  playWithSound: () => Promise<void>;
  pause: () => void;
};

type Props = {
  videoUrl: string;
  youtubeId: string | null;
  subtitlesUrl: string | null;
  onEnded?: () => void;
  className?: string;
};

type YTPlayer = {
  mute: () => void;
  unMute: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: () => void;
            onStateChange?: (e: { data: number }) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: { ENDED: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Charge l'API IFrame de YouTube une seule fois.
function loadYouTubeApi(): Promise<void> {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.body.appendChild(tag);
    }
    const iv = setInterval(() => {
      if (window.YT && window.YT.Player) {
        clearInterval(iv);
        resolve();
      }
    }, 100);
  });
}

const ClipPlayer = forwardRef<ClipPlayerHandle, Props>(function ClipPlayer(
  { videoUrl, youtubeId, subtitlesUrl, onEnded, className },
  ref
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ytRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef<Promise<void> | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  // Création du lecteur YouTube (si vidéo YouTube).
  useEffect(() => {
    if (!youtubeId) return;
    let destroyed = false;
    let resolveReady: () => void = () => {};
    readyRef.current = new Promise((res) => (resolveReady = res));

    loadYouTubeApi().then(() => {
      if (destroyed || !containerRef.current || !window.YT) return;
      ytRef.current = new window.YT.Player(containerRef.current, {
        videoId: youtubeId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          fs: 0,
          cc_load_policy: 1, // affiche les sous-titres
          cc_lang_pref: 'fr',
        },
        events: {
          onReady: () => resolveReady(),
          onStateChange: (e) => {
            if (window.YT && e.data === window.YT.PlayerState.ENDED) onEndedRef.current?.();
          },
        },
      });
    });

    return () => {
      destroyed = true;
      try {
        ytRef.current?.destroy();
      } catch {
        /* ignore */
      }
      ytRef.current = null;
    };
  }, [youtubeId]);

  useImperativeHandle(ref, () => ({
    playMuted: async () => {
      if (youtubeId) {
        await readyRef.current;
        const p = ytRef.current;
        if (!p) return;
        p.mute();
        p.seekTo(0, true);
        p.playVideo();
      } else {
        const v = videoRef.current;
        if (!v) return;
        v.muted = true;
        v.currentTime = 0;
        await v.play().catch(() => {});
      }
    },
    playWithSound: async () => {
      if (youtubeId) {
        await readyRef.current;
        const p = ytRef.current;
        if (!p) return;
        p.unMute();
        p.seekTo(0, true);
        p.playVideo();
      } else {
        const v = videoRef.current;
        if (!v) return;
        v.muted = false;
        v.currentTime = 0;
        await v.play().catch(() => {});
      }
    },
    pause: () => {
      if (youtubeId) ytRef.current?.pauseVideo();
      else videoRef.current?.pause();
    },
  }));

  if (youtubeId) {
    // YT.Player remplace ce div par une iframe.
    return (
      <div className={className}>
        <div ref={containerRef} className="w-full h-full" />
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={videoUrl}
      playsInline
      controls={false}
      crossOrigin={subtitlesUrl ? 'anonymous' : undefined}
      onEnded={() => onEndedRef.current?.()}
      onLoadedMetadata={(e) => {
        const tt = e.currentTarget.textTracks;
        for (let i = 0; i < tt.length; i++) tt[i].mode = 'showing';
      }}
      className={className}
    >
      {subtitlesUrl && (
        <track src={subtitlesUrl} kind="subtitles" srcLang="fr" label="Français" default />
      )}
    </video>
  );
});

export default ClipPlayer;
