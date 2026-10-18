import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase.js';
import { useI18n } from '../i18n/index.jsx';

const IDLE_LIMIT_MS = 8 * 60 * 60 * 1000; // NFR-04: 8 hours of inactivity
const ACTIVITY_KEY = 'pt.lastActivity';

export class AuthError extends Error {
  constructor(code, vars) {
    super(code);
    this.code = code;
    this.vars = vars;
  }
}

function readLastActivity() {
  try {
    return Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
}

function touchActivity() {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { setLang } = useI18n();
  const [session, setSession] = useState(undefined); // undefined = still loading
  const [profile, setProfile] = useState(null);
  const [recovery, setRecovery] = useState(false);
  const [notice, setNotice] = useState(null);

  // Session lifecycle
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      const last = readLastActivity();
      if (s && last && Date.now() - last > IDLE_LIMIT_MS) {
        supabase.auth.signOut();
        setNotice('auth.idleSignedOut');
        setSession(null);
        return;
      }
      setSession(s);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
    });

    // Password-reset emails link back to the app with ?token_hash=…&type=recovery
    // (see README), so the token is verified through the app's own API URL
    // rather than a supabase.co link that some networks block.
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');
    if (tokenHash && params.get('type') === 'recovery') {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ error }) => {
        if (error) setNotice('auth.resetLinkInvalid');
        else setRecovery(true);
      });
    }

    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async (userId) => {
    const { data, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
    if (error) throw error;
    return data;
  }, []);

  // Profile (RLS hides it entirely when the account is deactivated)
  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    loadProfile(session.user.id)
      .then((p) => {
        if (cancelled) return;
        if (!p || !p.is_active) {
          setNotice('errors.deactivated');
          supabase.auth.signOut();
          return;
        }
        setProfile(p);
        setLang(p.language);
      })
      .catch(() => {
        if (!cancelled) setNotice('errors.notFound');
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, loadProfile, setLang]);

  // Idle timeout
  useEffect(() => {
    if (!session) return;
    touchActivity();
    let lastWrite = Date.now();
    const onActivity = () => {
      if (Date.now() - lastWrite > 60_000) {
        lastWrite = Date.now();
        touchActivity();
      }
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'visibilitychange'];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - readLastActivity() > IDLE_LIMIT_MS) {
        setNotice('auth.idleSignedOut');
        supabase.auth.signOut();
      }
    }, 60_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(timer);
    };
  }, [session]);

  const signIn = useCallback(async (email, password) => {
    setNotice(null);
    const normalized = email.trim().toLowerCase();
    const minutesLeft = (until) => Math.max(1, Math.ceil((new Date(until) - Date.now()) / 60_000));

    const { data: lockedUntil } = await supabase.rpc('login_lock_status', { p_email: normalized });
    if (lockedUntil) throw new AuthError('errors.locked', { minutes: minutesLeft(lockedUntil) });

    const { error } = await supabase.auth.signInWithPassword({ email: normalized, password });
    if (error) {
      if (error.status === 400 || /invalid/i.test(error.message)) {
        const { data: lock } = await supabase.rpc('register_login_failure', { p_email: normalized });
        if (lock) throw new AuthError('errors.locked', { minutes: minutesLeft(lock) });
        throw new AuthError('errors.invalidCredentials');
      }
      throw error;
    }
    touchActivity();
    await supabase.rpc('register_login_success');
  }, []);

  const signOut = useCallback(() => supabase.auth.signOut(), []);

  const updatePassword = useCallback(
    async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      if (session?.user) {
        const { error: e2 } = await supabase
          .from('users')
          .update({ must_change_password: false })
          .eq('id', session.user.id);
        if (e2) throw e2;
        setProfile((p) => (p ? { ...p, must_change_password: false } : p));
      }
      setRecovery(false);
    },
    [session?.user],
  );

  const updateProfile = useCallback(
    async (changes) => {
      const { data, error } = await supabase.from('users').update(changes).eq('id', profile.id).select().single();
      if (error) throw error;
      setProfile(data);
      return data;
    },
    [profile?.id],
  );

  const value = useMemo(
    () => ({
      loading: session === undefined || (session && !profile && !notice),
      session,
      profile,
      recovery,
      notice,
      setNotice,
      signIn,
      signOut,
      updatePassword,
      updateProfile,
    }),
    [session, profile, recovery, notice, signIn, signOut, updatePassword, updateProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
