import { createClient } from '@supabase/supabase-js';

// Values come from GitHub secrets, where stray spaces, newlines or a
// missing scheme are easy to paste in; normalise them here.
function normaliseUrl(raw) {
  let value = (raw ?? '').trim().replace(/\/+$/, '');
  if (value && !/^https?:\/\//i.test(value)) value = `https://${value}`;
  return value;
}

const url = normaliseUrl(import.meta.env.VITE_SUPABASE_URL);
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

// Shown on the sign-in screen when the server cannot be reached at all.
export const supabaseHost = url.replace(/^https?:\/\//i, '');

export const isConfigured = Boolean(url && anonKey);

// Only the public anon key is used in the browser (NFR-06).
export const supabase = isConfigured
  ? createClient(url, anonKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

// PostgREST returns at most 1,000 rows per request; page through larger sets.
export async function fetchAll(buildQuery, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}
