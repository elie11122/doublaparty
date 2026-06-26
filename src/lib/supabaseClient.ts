import { createClient } from '@supabase/supabase-js';

// Les deux valeurs viennent de .env.local (et sont publiques : elles sont
// faites pour vivre dans le navigateur. La sécurité repose sur les règles RLS
// définies dans supabase/schema.sql, pas sur le secret de ces clés.)
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    '⚠️ Configuration Supabase manquante. Renseignez NEXT_PUBLIC_SUPABASE_URL ' +
      'et NEXT_PUBLIC_SUPABASE_ANON_KEY dans le fichier .env.local, puis relancez « npm run dev ».'
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '');
