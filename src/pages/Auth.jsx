import { useState } from 'react';
import { supabase, supabaseHost } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { validatePassword } from '../lib/logic.js';
import { useI18n } from '../i18n/index.jsx';

function AuthCard({ title, children }) {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-slate-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xl font-bold text-brand-800">
            <img src="./favicon.svg" alt="" className="h-9 w-9" />
            {t('app.name')}
          </div>
          <button className="btn-ghost text-xs" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>
            {t('nav.language')}
          </button>
        </div>
        <div className="card p-6">
          <h1 className="mb-5 text-lg font-semibold">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

function Message({ kind = 'error', children }) {
  if (!children) return null;
  const styles = kind === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

// FR-01
export function LoginPage() {
  const { t } = useI18n();
  const { signIn, notice } = useAuth();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        // FR-02: reset link by email; it returns to this app.
        const redirectTo = window.location.origin + window.location.pathname;
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
        if (err && err.status !== 429) throw err;
        setInfo(t('auth.resetSent'));
      }
    } catch (err) {
      if (err.code?.startsWith?.('errors.')) setError(t(err.code, err.vars));
      else if (/failed to fetch|networkerror|load failed/i.test(err.message)) setError(t('errors.network', { host: supabaseHost }));
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title={mode === 'signin' ? t('auth.signIn') : t('auth.forgot')}>
      <form onSubmit={submit} className="space-y-4">
        {notice && <Message kind="info">{t(notice)}</Message>}
        <div>
          <label className="label" htmlFor="email">
            {t('auth.email')}
          </label>
          <input id="email" type="email" dir="ltr" autoComplete="username" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode === 'signin' && (
          <div>
            <label className="label" htmlFor="password">
              {t('auth.password')}
            </label>
            <input id="password" type="password" dir="ltr" autoComplete="current-password" required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        )}
        <Message>{error}</Message>
        <Message kind="info">{info}</Message>
        <button className="btn-primary w-full" disabled={busy}>
          {mode === 'signin' ? (busy ? t('auth.signingIn') : t('auth.signIn')) : t('auth.sendReset')}
        </button>
        <button
          type="button"
          className="block w-full text-center text-sm text-brand-700 hover:underline"
          onClick={() => {
            setMode(mode === 'signin' ? 'reset' : 'signin');
            setError(null);
            setInfo(null);
          }}
        >
          {mode === 'signin' ? t('auth.forgot') : t('auth.backToSignIn')}
        </button>
      </form>
    </AuthCard>
  );
}

export function PasswordForm({ onDone, submitLabel }) {
  const { t } = useI18n();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const problem = validatePassword(password, confirm);
    if (problem) return setError(t(`errors.${problem}`));
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      setDone(true);
      setPassword('');
      setConfirm('');
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="new-password">
          {t('auth.newPassword')}
        </label>
        <input id="new-password" type="password" dir="ltr" autoComplete="new-password" minLength={8} required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="confirm-password">
          {t('auth.confirmPassword')}
        </label>
        <input id="confirm-password" type="password" dir="ltr" autoComplete="new-password" required className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <Message>{error}</Message>
      {done && <Message kind="info">{t('auth.passwordChanged')}</Message>}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? t('common.saving') : submitLabel ?? t('common.save')}
      </button>
    </form>
  );
}

// FR-02: forced change of the temporary password, or reset via email link.
export function SetPasswordPage({ forced }) {
  const { t } = useI18n();
  const { signOut } = useAuth();
  return (
    <AuthCard title={forced ? t('auth.forcedTitle') : t('auth.resetTitle')}>
      {forced && <p className="mb-4 text-sm text-slate-600">{t('auth.forcedHint')}</p>}
      <PasswordForm />
      <button className="mt-4 block w-full text-center text-sm text-slate-500 hover:underline" onClick={signOut}>
        {t('nav.signOut')}
      </button>
    </AuthCard>
  );
}
