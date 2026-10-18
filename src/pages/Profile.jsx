import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { useUsers } from '../lib/users.jsx';
import { useI18n } from '../i18n/index.jsx';
import { Avatar, ErrorBox, Field } from '../components/ui.jsx';
import { PasswordForm } from './Auth.jsx';

export default function Profile() {
  const { t, setLang } = useI18n();
  const { profile, updateProfile } = useAuth();
  const { refresh } = useUsers();
  const [form, setForm] = useState({ full_name: profile.full_name, language: profile.language });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    setSaved(false);
    setError(null);
    try {
      await updateProfile({ full_name: form.full_name.trim() || profile.full_name, language: form.language });
      setLang(form.language);
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">{t('profile.title')}</h1>
      <form onSubmit={save} className="card space-y-4 p-5">
        <div className="flex items-center gap-3">
          <Avatar userId={profile.id} size="lg" />
          <div>
            <div className="font-semibold">{profile.full_name}</div>
            <div className="text-xs text-slate-500" dir="ltr">
              {profile.email}
            </div>
            <div className="text-xs text-slate-500">{t(`role.${profile.role}`)}</div>
          </div>
        </div>
        <Field label={t('users.fullName')} htmlFor="pr-name">
          <input id="pr-name" className="input" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
        </Field>
        <Field label={t('profile.language')} htmlFor="pr-lang">
          <select id="pr-lang" className="input" value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </Field>
        <ErrorBox error={error} />
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-emerald-700">{t('profile.saved')}</span>}
          <button className="btn-primary">{t('common.save')}</button>
        </div>
      </form>
      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">{t('profile.changePassword')}</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
