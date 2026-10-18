import { useState } from 'react';
import * as api from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { JOB_TITLES, LOGIN_ROLES, validatePassword, workloadByJob, workloadByUser } from '../lib/logic.js';
import { useAsync } from '../lib/useAsync.js';
import { useUsers } from '../lib/users.jsx';
import { useI18n } from '../i18n/index.jsx';
import { Avatar, ErrorBox, Field, Modal, errorMessage } from '../components/ui.jsx';

function generatePassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

// System users (admin / PM) sign in, so they are created through the
// create-user Edge Function with a temporary password.
function NewUserModal({ open, onClose, onCreated }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ full_name: '', email: '', role: 'pm', password: generatePassword() });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const close = () => {
    setForm({ full_name: '', email: '', role: 'pm', password: generatePassword() });
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
              {LOGIN_ROLES.map((r) => (
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

// Team members have no account: a name and a job title are enough.
function NewMemberModal({ open, onClose, onCreated }) {
  const { t } = useI18n();
  const blank = { full_name: '', job_title: 'developer', email: '' };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const close = () => {
    setForm(blank);
    setErrors({});
    setError(null);
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) return setErrors({ full_name: 'required' });
    setSaving(true);
    setError(null);
    try {
      await api.createTeamMember(form);
      await onCreated();
      close();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title={t('team.newMember')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('users.fullName')} error={errors.full_name} htmlFor="m-name">
          <input id="m-name" className="input" value={form.full_name} onChange={set('full_name')} autoFocus />
        </Field>
        <Field label={t('team.jobTitle')} htmlFor="m-job">
          <select id="m-job" className="input" value={form.job_title} onChange={set('job_title')}>
            {JOB_TITLES.map((j) => (
              <option key={j} value={j}>
                {t(`job.${j}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('team.emailOptional')} htmlFor="m-email">
          <input id="m-email" type="email" dir="ltr" className="input" value={form.email} onChange={set('email')} />
        </Field>
        <ErrorBox error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={close}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" disabled={saving}>
            {saving ? t('common.saving') : t('common.add')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const JOB_STYLES = {
  developer: 'bg-sky-100 text-sky-800',
  analyst: 'bg-violet-100 text-violet-800',
  tester: 'bg-amber-100 text-amber-800',
};

export function JobBadge({ job }) {
  const { t } = useI18n();
  if (!job) return null;
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${JOB_STYLES[job]}`}>{t(`job.${job}`)}</span>;
}

function ActiveToggle({ person, onChange }) {
  const { t } = useI18n();
  return (
    <button
      className={`btn-secondary py-1 text-xs ${person.is_active ? 'text-red-600' : 'text-emerald-700'}`}
      onClick={() => onChange(person.id, { is_active: !person.is_active })}
    >
      {person.is_active ? t('users.deactivate') : t('users.activate')}
    </button>
  );
}

// Team screen: team members for admins and PMs; system users for admins.
export default function Users() {
  const { t, formatDateTime } = useI18n();
  const { profile } = useAuth();
  const { users, refresh } = useUsers();
  const [creatingUser, setCreatingUser] = useState(false);
  const [creatingMember, setCreatingMember] = useState(false);
  const [error, setError] = useState(null);
  const isAdmin = profile.role === 'admin';

  const { data: work } = useAsync(async () => {
    const [tasks, assignees] = await Promise.all([api.listTasks(), api.listAssignees()]);
    return workloadByUser(tasks, assignees);
  }, []);
  const workload = work ?? {};

  const members = users.filter((u) => u.role === 'member');
  const systemUsers = users.filter((u) => u.role !== 'member');
  const byJob = workloadByJob(users, workload);

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
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">{t('users.title')}</h1>
      {error && <p className="text-sm text-red-600">{errorMessage(error, t)}</p>}

      {/* Team members ------------------------------------------------------ */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t('team.members')}</h2>
            <p className="text-sm text-slate-500">{t('team.membersHint')}</p>
          </div>
          <button className="btn-primary" onClick={() => setCreatingMember(true)}>
            + {t('team.newMember')}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(byJob).map(([job, row]) => (
            <div key={job} className="card p-4">
              <div className="flex items-center justify-between">
                <JobBadge job={job} />
                <span className="text-xs text-slate-500">{t('team.people', { count: row.people })}</span>
              </div>
              <div className="mt-2 text-2xl font-bold tabular-nums">
                {row.open} <span className="text-sm font-normal text-slate-500">{t('team.openTasks')}</span>
              </div>
              {row.overdue > 0 && <div className="text-xs font-semibold text-red-600">{row.overdue} {t('dashboard.overdue')}</div>}
            </div>
          ))}
        </div>

        <div className="card overflow-x-auto">
          {members.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">{t('team.noMembers')}</p>
          ) : (
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:text-start [&>th]:font-medium">
                  <th>{t('users.fullName')}</th>
                  <th>{t('team.jobTitle')}</th>
                  <th>{t('team.openTasks')}</th>
                  <th>{t('users.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => (
                  <tr key={m.id} className={m.is_active ? '' : 'bg-slate-50 text-slate-400'}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar userId={m.id} />
                        <div>
                          <div className="font-medium">{m.full_name}</div>
                          {m.email && (
                            <div className="text-xs text-slate-500" dir="ltr">
                              {m.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select className="input w-auto py-1" value={m.job_title ?? ''} onChange={(e) => change(m.id, { job_title: e.target.value })}>
                        {JOB_TITLES.map((j) => (
                          <option key={j} value={j}>
                            {t(`job.${j}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {workload[m.id]?.open ?? 0}
                      {workload[m.id]?.overdue > 0 && (
                        <span className="ms-2 text-xs font-semibold text-red-600">
                          · {workload[m.id].overdue} {t('dashboard.overdue')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ActiveToggle person={m} onChange={change} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* System users (admin only) -------------------------------------------- */}
      {isAdmin && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t('team.systemUsers')}</h2>
              <p className="text-sm text-slate-500">{t('team.systemUsersHint')}</p>
            </div>
            <button className="btn-secondary" onClick={() => setCreatingUser(true)}>
              + {t('users.new')}
            </button>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:text-start [&>th]:font-medium">
                  <th>{t('users.fullName')}</th>
                  <th>{t('users.role')}</th>
                  <th>{t('users.lastLogin')}</th>
                  <th>{t('users.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {systemUsers.map((u) => {
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
                          {LOGIN_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t(`role.${r}`)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-xs">{u.last_login_at ? formatDateTime(u.last_login_at) : t('users.never')}</td>
                      <td className="px-4 py-3">
                        {self ? <span className="text-xs text-emerald-700">{t('users.active')}</span> : <ActiveToggle person={u} onChange={change} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <NewMemberModal open={creatingMember} onClose={() => setCreatingMember(false)} onCreated={refresh} />
      {isAdmin && <NewUserModal open={creatingUser} onClose={() => setCreatingUser(false)} onCreated={refresh} />}
    </div>
  );
}
