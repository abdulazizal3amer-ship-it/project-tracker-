import { useState } from 'react';
import * as api from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { ROLES, validatePassword } from '../lib/logic.js';
import { useUsers } from '../lib/users.jsx';
import { useI18n } from '../i18n/index.jsx';
import { Avatar, ErrorBox, Field, Modal, errorMessage } from '../components/ui.jsx';

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

function NewUserModal({ open, onClose, onCreated }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ full_name: '', email: '', role: 'member', password: generatePassword() });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const close = () => {
    setForm({ full_name: '', email: '', role: 'member', password: generatePassword() });
    setErrors({});
    setError(null);
    setCreated(null);
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    const v = {};
    if (!form.full_name.trim()) v.full_name = 'required';
    if (!form.email.trim()) v.email = 'required';
    const pw = validatePassword(form.password);
    if (pw) v.password = pw;
    setErrors(v);
    if (Object.keys(v).length) return;
    setSaving(true);
    setError(null);
    try {
      await api.createUser(form);
      setCreated({ ...form });
      onCreated();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title={t('users.new')}>
      {created ? (
        <div className="space-y-4">
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{t('users.created', { name: created.full_name })}</p>
          <div className="rounded-lg bg-slate-50 p-3 font-mono text-sm" dir="ltr">
            <div>{created.email}</div>
            <div className="select-all font-semibold">{created.password}</div>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary" onClick={close}>
              {t('common.close')}
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('users.fullName')} error={errors.full_name} htmlFor="u-name">
            <input id="u-name" className="input" value={form.full_name} onChange={set('full_name')} autoFocus />
          </Field>
          <Field label={t('auth.email')} error={errors.email} htmlFor="u-email">
            <input id="u-email" type="email" dir="ltr" className="input" value={form.email} onChange={set('email')} />
          </Field>
          <Field label={t('users.role')} htmlFor="u-role">
            <select id="u-role" className="input" value={form.role} onChange={set('role')}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('users.tempPassword')} error={errors.password} htmlFor="u-pw">
            <div className="flex gap-2">
              <input id="u-pw" dir="ltr" className="input font-mono" value={form.password} onChange={set('password')} />
              <button type="button" className="btn-secondary" onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}>
                {t('users.generate')}
              </button>
            </div>
          </Field>
          <ErrorBox error={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={close}>
              {t('common.cancel')}
            </button>
            <button className="btn-primary" disabled={saving}>
              {saving ? t('common.saving') : t('common.create')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// FR-03 — admin-only user management. Deactivating keeps all data.
export default function Users() {
  const { t, formatDateTime } = useI18n();
  const { profile } = useAuth();
  const { users, refresh } = useUsers();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const change = async (id, changes) => {
    setError(null);
    try {
      await api.updateUser(id, changes);
      await refresh();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('users.title')}</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}>
          + {t('users.new')}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{errorMessage(error, t)}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:text-start [&>th]:font-medium">
              <th>{t('users.fullName')}</th>
              <th>{t('users.role')}</th>
              <th>{t('users.lastLogin')}</th>
              <th>{t('users.status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => {
              const self = u.id === profile.id;
              return (
                <tr key={u.id} className={u.is_active ? '' : 'bg-slate-50 text-slate-400'}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar userId={u.id} />
                      <div>
                        <div className="font-medium">
                          {u.full_name} {self && <span className="text-xs text-slate-400">({t('common.you')})</span>}
                        </div>
                        <div className="text-xs text-slate-500" dir="ltr">
                          {u.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select className="input w-auto py-1" value={u.role} disabled={self} onChange={(e) => change(u.id, { role: e.target.value })}>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`role.${r}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-xs">{u.last_login_at ? formatDateTime(u.last_login_at) : t('users.never')}</td>
                  <td className="px-4 py-3">
                    {self ? (
                      <span className="text-xs text-emerald-700">{t('users.active')}</span>
                    ) : (
                      <button
                        className={`btn-secondary py-1 text-xs ${u.is_active ? 'text-red-600' : 'text-emerald-700'}`}
                        onClick={() => change(u.id, { is_active: !u.is_active })}
                      >
                        {u.is_active ? t('users.deactivate') : t('users.activate')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <NewUserModal open={creating} onClose={() => setCreating(false)} onCreated={refresh} />
    </div>
  );
}
