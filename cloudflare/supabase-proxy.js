// Cloudflare Worker: forwards the app's Supabase traffic through a domain
// that networks blocking *.supabase.co can still reach.
//
// Deploy (free plan, no maintenance): Cloudflare dashboard → Workers & Pages
// → Create → "Hello World" worker → Edit code → paste this file → Deploy.
// Then set the GitHub secret SUPABASE_URL to the worker's URL. See README.

// Your project: Supabase → Project Settings → General → Project ID.
const SUPABASE_URL = 'https://goztkntmbjkarnbgmsho.supabase.co';

// Only Supabase API paths are forwarded, so this is not an open proxy.
const ALLOWED_PATH = /^\/(rest|auth|functions|realtime|storage)\/v1(\/|$)/;

export function upstreamUrl(requestUrl, upstream = SUPABASE_URL) {
  const url = new URL(requestUrl);
  if (!ALLOWED_PATH.test(url.pathname)) return null;
  return new URL(url.pathname + url.search, upstream).toString();
}

export default {
  async fetch(request, env) {
    const target = upstreamUrl(request.url, env?.SUPABASE_URL || SUPABASE_URL);
    if (!target) return new Response('Not found', { status: 404 });

    // new Request(url, request) keeps the method, headers, body and the
    // WebSocket upgrade used by Realtime notifications. Redirects (e.g. from
    // auth endpoints) are passed back to the browser untouched.
    return fetch(new Request(target, request), { redirect: 'manual' });
  },
};
