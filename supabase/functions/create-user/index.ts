// Supabase Edge Function: create-user
// Lets an admin create an account (name, email, role, temporary password)
// from the Users screen. Holds the service_role key, which must never be
// shipped to the browser (NFR-06).
//
// Deploy:  supabase functions deploy create-user
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ROLES = ['admin', 'pm', 'member'];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1. Caller must be an active admin.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller?.user) return json({ error: 'unauthorized' }, 401);

  const { data: profile } = await admin
    .from('users')
    .select('role, is_active')
    .eq('id', caller.user.id)
    .single();
  if (!profile || profile.role !== 'admin' || !profile.is_active) {
    return json({ error: 'forbidden' }, 403);
  }

  // 2. Validate input.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const fullName = String(body.full_name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const role = String(body.role ?? 'member');
  const password = String(body.password ?? '');
  const language = body.language === 'en' ? 'en' : 'ar';

  if (!fullName) return json({ error: 'full_name_required' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'invalid_email' }, 400);
  if (!ROLES.includes(role)) return json({ error: 'invalid_role' }, 400);
  if (password.length < 8) return json({ error: 'weak_password' }, 400);

  // 3. Create the auth user. The on_auth_user_created trigger inserts the
  //    public.users row with must_change_password = true.
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { full_name: fullName, language },
  });
  if (error) {
    const exists = /already/i.test(error.message);
    return json({ error: exists ? 'email_exists' : error.message }, exists ? 409 : 400);
  }

  return json({ id: created.user.id, email, full_name: fullName, role }, 201);
});
