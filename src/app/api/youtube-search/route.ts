import { NextResponse } from 'next/server';

// Route serveur : la clé API YouTube reste secrète (jamais envoyée au navigateur).
// Variable d'environnement YOUTUBE_API_KEY (non préfixée NEXT_PUBLIC).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();
  if (!q) return NextResponse.json({ items: [] });

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'Clé API YouTube manquante côté serveur.' },
      { status: 500 }
    );
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('key', key);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', q);
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '9');
  url.searchParams.set('videoEmbeddable', 'true'); // uniquement les vidéos intégrables
  url.searchParams.set('safeSearch', 'moderate');

  try {
    const r = await fetch(url.toString());
    if (!r.ok) {
      const body = await r.text();
      return NextResponse.json(
        { error: 'Erreur YouTube: ' + body.slice(0, 200) },
        { status: 502 }
      );
    }
    const data = await r.json();
    type YtItem = {
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        channelTitle?: string;
        thumbnails?: { medium?: { url?: string } };
      };
    };
    const items = (data.items ?? [])
      .filter((it: YtItem) => it.id?.videoId)
      .map((it: YtItem) => ({
        id: it.id!.videoId as string,
        title: it.snippet?.title ?? '(sans titre)',
        channel: it.snippet?.channelTitle ?? '',
        thumbnail: it.snippet?.thumbnails?.medium?.url ?? '',
      }));
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'Recherche YouTube indisponible.' }, { status: 502 });
  }
}
