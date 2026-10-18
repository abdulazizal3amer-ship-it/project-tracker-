import { describe, expect, it } from 'vitest';
import { upstreamUrl } from '../cloudflare/supabase-proxy.js';

const UP = 'https://abc.supabase.co';

describe('Supabase proxy worker', () => {
  it('forwards Supabase API paths with their query string', () => {
    expect(upstreamUrl('https://p.workers.dev/rest/v1/tasks?select=*&id=eq.1', UP)).toBe(
      'https://abc.supabase.co/rest/v1/tasks?select=*&id=eq.1',
    );
    expect(upstreamUrl('https://p.workers.dev/auth/v1/token?grant_type=password', UP)).toBe(
      'https://abc.supabase.co/auth/v1/token?grant_type=password',
    );
    expect(upstreamUrl('https://p.workers.dev/functions/v1/create-user', UP)).toBe('https://abc.supabase.co/functions/v1/create-user');
    expect(upstreamUrl('https://p.workers.dev/realtime/v1/websocket?apikey=k&vsn=1.0.0', UP)).toBe(
      'https://abc.supabase.co/realtime/v1/websocket?apikey=k&vsn=1.0.0',
    );
  });

  it('refuses anything else so it is not an open proxy', () => {
    expect(upstreamUrl('https://p.workers.dev/', UP)).toBeNull();
    expect(upstreamUrl('https://p.workers.dev/admin', UP)).toBeNull();
    expect(upstreamUrl('https://p.workers.dev/rest/v2/x', UP)).toBeNull();
    expect(upstreamUrl('https://p.workers.dev/restv1/x', UP)).toBeNull();
  });

  it('cannot be pointed at another host', () => {
    expect(upstreamUrl('https://p.workers.dev/rest/v1//evil.com/x', UP)).toMatch(/^https:\/\/abc\.supabase\.co\//);
  });
});
