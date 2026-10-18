import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as api from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { canCreateProject, PROJECT_STATUSES, projectProgress, validateProject } from '../lib/logic.js';
import { useAsync } from '../lib/useAsync.js';
import { useUsers } from '../lib/users.jsx';
import { useI18n } from '../i18n/index.jsx';
import AssigneePicker from '../components/AssigneePicker.jsx';
import { AvatarStack, EmptyState, ErrorBox, Field, Modal, ProgressBar, Spinner } from '../components/ui.jsx';

const STATUS_STYLES = {
  active: 'bg-emerald-100 text-emerald-800',
  on_hold: 'bg-amber-100 text-amber-800',
  completed: 'bg-sky-100 text-sky-800',
  archived: 'bg-slate-200 text-slate-600',
};

export function ProjectStatusBadge({ status }) {
  const { t } = useI18n();
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>{t(`projectStatus.${status}`)}</span>;
}

// FR-05 / FR-06 — create or edit a project (US-01)
export function ProjectFormModal({ open, onClose, project, onSaved }) {
  const { t } = useI18n();
  const { profile } = useAuth();
  const { users } = useUsers();
  const editing = Boolean(project);
  const managers = users.filter((u) => u.is_active && (u.role === 'pm' || u.role === 'admin'));
  const activeIds = users.filter((u) => u.is_active).map((u) => u.id);

  const blank = () => ({
    name: project?.name ?? '',
    description: project?.description ?? '',
    start_date: project?.start_date ?? '',
    end_date: project?.end_date ?? '',
    manager_id: project?.manager_id ?? profile.id,
    status: project?.status ?? 'active',
    members: [],
  });
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(blank());
      setErrors({});
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const v = validateProject(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        start_date: form.start_date || null,
        end_date: form.end_date,
        manager_id: form.manager_id,
      };
      const saved = editing
        ? await api.updateProject(project.id, { ...payload, status: form.status })
        : await api.createProject({ ...payload, members: form.members });
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? t('projects.edit') : t('projects.new')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('projects.name')} error={errors.name} htmlFor="p-name">
          <input id="p-name" className="input" value={form.name} onChange={set('name')} autoFocus maxLength={120} />
        </Field>
        <Field label={t('projects.description')} htmlFor="p-desc">
          <textarea id="p-desc" className="input min-h-20" value={form.description} onChange={set('description')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('projects.start')} htmlFor="p-start">
            <input id="p-start" type="date" className="input" value={form.start_date} onChange={set('start_date')} />
          </Field>
          <Field label={t('projects.end')} error={errors.end_date} htmlFor="p-end">
            <input id="p-end" type="date" className="input" value={form.end_date} min={form.start_date || undefined} onChange={set('end_date')} />
          </Field>
        </div>
        {profile.role === 'admin' && (
          <Field label={t('projects.manager')} htmlFor="p-manager">
            <select id="p-manager" className="input" value={form.manager_id} onChange={set('manager_id')}>
              {managers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} — {t(`role.${u.role}`)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {editing ? (
          <Field label={t('projects.status')} htmlFor="p-status">
            <select id="p-status" className="input" value={form.status} onChange={set('status')}>
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`projectStatus.${s}`)}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label={t('projects.members')}>
            <AssigneePicker
              memberIds={activeIds.filter((id) => id !== form.manager_id)}
              value={form.members}
              onChange={(members) => setForm((f) => ({ ...f, members }))}
            />
          </Field>
        )}
        <ErrorBox error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" disabled={saving}>
            {saving ? t('common.saving') : editing ? t('common.save') : t('common.create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Projects() {
  const { t, formatDate } = useI18n();
  const { profile } = useAuth();
  const { nameOf } = useUsers();
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data, loading, error, reload } = useAsync(async () => {
    const [projects, tasks, members] = await Promise.all([api.listProjects(), api.listTasks(), api.listProjectMembers()]);
    return { projects, tasks, members };
  }, []);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const visible = data.projects.filter((p) => showArchived || p.status !== 'archived');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{t('projects.title')}</h1>
        <label className="ms-auto flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {t('projects.showArchived')}
        </label>
        {canCreateProject(profile) && (
          <button className="btn-primary" onClick={() => setCreating(true)}>
            + {t('projects.new')}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState>{canCreateProject(profile) ? t('projects.empty') : t('projects.emptyMember')}</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => {
            const pt = data.tasks.filter((tk) => tk.project_id === p.id);
            const done = pt.filter((tk) => tk.status === 'done').length;
            const pct = projectProgress(pt);
            const memberIds = data.members.filter((m) => m.project_id === p.id).map((m) => m.user_id);
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="card flex flex-col gap-3 p-4 transition hover:border-brand-500 hover:shadow">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{p.name}</h2>
                  <ProjectStatusBadge status={p.status} />
                </div>
                {p.description && <p className="line-clamp-2 text-sm text-slate-500">{p.description}</p>}
                <div className="mt-auto space-y-2">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{t('projects.tasksCount', { done, total: pt.length })}</span>
                    <span className="font-semibold tabular-nums text-slate-700">{pct}%</span>
                  </div>
                  <ProgressBar value={pct} />
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {nameOf(p.manager_id)} · {t('projects.ends', { date: formatDate(p.end_date) })}
                    </span>
                    <AvatarStack userIds={memberIds} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <ProjectFormModal open={creating} onClose={() => setCreating(false)} onSaved={(p) => navigate(`/projects/${p.id}`)} />
    </div>
  );
}
