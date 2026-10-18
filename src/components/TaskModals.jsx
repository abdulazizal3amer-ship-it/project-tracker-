import { useEffect, useState } from 'react';
import * as api from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { addWorkDays, allowedAssignees, canManageProject, canMoveTask, isWeekend, PRIORITIES, TASK_STATUSES, validateTask } from '../lib/logic.js';
import { useUsers } from '../lib/users.jsx';
import { useI18n } from '../i18n/index.jsx';
import AssigneePicker from './AssigneePicker.jsx';
import { CommentBody, MentionInput } from './MentionInput.jsx';
import { Avatar, DueDate, ErrorBox, Field, Modal, Spinner, StatusBadge, UserName } from './ui.jsx';

function TaskFields({ form, setForm, errors, assigneeOptions, onlySelf, disabled }) {
  const { t, formatDate } = useI18n();
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  // Start date + working days → end date (Friday/Saturday off). The
  // database recalculates it the same way on save.
  const scheduledEnd = addWorkDays(form.start_date, form.work_days);
  return (
    <div className="space-y-4">
      <Field label={t('tasks.title')} error={errors.title} htmlFor="task-title">
        <input id="task-title" className="input" value={form.title} onChange={set('title')} disabled={disabled} autoFocus maxLength={200} />
      </Field>
      <Field label={t('tasks.description')} htmlFor="task-desc">
        <textarea id="task-desc" className="input min-h-20" value={form.description} onChange={set('description')} disabled={disabled} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('tasks.priority')} htmlFor="task-priority">
          <select id="task-priority" className="input" value={form.priority} onChange={set('priority')} disabled={disabled}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {t(`priority.${p}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
        <Field label={t('tasks.startDate')} htmlFor="task-start">
          <input id="task-start" type="date" className="input" value={form.start_date} onChange={set('start_date')} disabled={disabled} />
        </Field>
        <Field label={t('tasks.workDays')} error={errors.work_days} htmlFor="task-days">
          <input
            id="task-days"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            step={1}
            className="input"
            value={form.work_days}
            onChange={set('work_days')}
            disabled={disabled}
          />
        </Field>
        <Field label={t('tasks.due')} htmlFor="task-due">
          {scheduledEnd ? (
            <div id="task-due" className="input bg-white font-medium text-brand-800">
              {formatDate(scheduledEnd)}
            </div>
          ) : (
            <input id="task-due" type="date" className="input" value={form.due_date} onChange={set('due_date')} disabled={disabled} />
          )}
        </Field>
        <p className="text-xs text-slate-500 sm:col-span-3">
          {scheduledEnd ? t('tasks.scheduleHint') : t('tasks.scheduleEmpty')}
          {form.start_date && isWeekend(form.start_date) && <span className="ms-1 text-amber-700">{t('tasks.startsOnWeekend')}</span>}
        </p>
      </div>
      <Field label={t('tasks.assignees')} error={errors.assignees}>
        {onlySelf && <p className="mb-1 text-xs text-slate-500">{t('tasks.onlySelf')}</p>}
        <AssigneePicker
          memberIds={assigneeOptions}
          value={form.assignees}
          onChange={(assignees) => setForm((f) => ({ ...f, assignees }))}
          disabled={disabled}
        />
      </Field>
    </div>
  );
}

// FR-08 / FR-09 — create a task (US-02)
export function NewTaskModal({ open, onClose, project, memberIds, onCreated, initialStatus }) {
  const { t } = useI18n();
  const { profile } = useAuth();
  const options = allowedAssignees(profile, project, memberIds);
  const manager = canManageProject(profile, project, memberIds);
  const blank = () => ({
    title: '',
    description: '',
    priority: 'medium',
    start_date: '',
    work_days: '',
    due_date: '',
    assignees: manager ? [] : [profile.id],
  });
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setForm(blank());
      setErrors({});
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    const v = validateTask(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    setSaving(true);
    setError(null);
    try {
      const id = await api.createTask({ ...form, project_id: project.id });
      if (initialStatus && initialStatus !== 'new') await api.updateTask(id, { status: initialStatus });
      onCreated?.(id);
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('tasks.new')}>
      <form onSubmit={submit} className="space-y-4">
        <TaskFields form={form} setForm={setForm} errors={errors} assigneeOptions={options} onlySelf={!manager} disabled={saving} />
        <ErrorBox error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" disabled={saving}>
            {saving ? t('common.saving') : t('common.create')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ActivityItem({ entry }) {
  const { t, formatDateTime, formatDate } = useI18n();
  const { nameOf } = useUsers();
  const label = (value) => {
    if (entry.action === 'status') return t(`status.${value}`);
    if (entry.action === 'priority') return t(`priority.${value}`);
    if (entry.action === 'due_date') return value ? formatDate(value) : t('tasks.noDue');
    return value;
  };
  const key = entry.action === 'title' ? 'activity.title_change' : `activity.${entry.action}`;
  return (
    <li className="flex gap-2 text-xs text-slate-600">
      <span className="font-medium text-slate-800">{entry.user_id ? nameOf(entry.user_id) : t('activity.system')}</span>
      <span>{t(key, { from: label(entry.old_value), to: label(entry.new_value) })}</span>
      <span className="ms-auto shrink-0 text-slate-400">{formatDateTime(entry.created_at)}</span>
    </li>
  );
}

// Task details: status for assignees, full edit for managers, comments and
// activity for everyone in the project (FR-10, FR-19, FR-21).
export function TaskDetailModal({ taskId, project, memberIds, onClose, onChanged }) {
  const { t, formatDate, formatDateTime } = useI18n();
  const { profile } = useAuth();
  const { nameOf } = useUsers();
  const [task, setTask] = useState(null);
  const [assignees, setAssignees] = useState([]);
  const [comments, setComments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState('');
  const [tab, setTab] = useState('comments');

  const manager = canManageProject(profile, project, memberIds);
  const movable = task && canMoveTask(profile, project, memberIds, assignees);

  const load = async () => {
    try {
      const [tk, as, cs, ac] = await Promise.all([
        api.getTask(taskId),
        api.listTaskAssignees(taskId),
        api.listComments(taskId),
        api.listActivity(taskId),
      ]);
      if (!tk) throw new Error('notFound');
      setTask(tk);
      setAssignees(as);
      setComments(cs);
      setActivity(ac);
      setForm({
        title: tk.title,
        description: tk.description ?? '',
        priority: tk.priority,
        due_date: tk.due_date ?? '',
        start_date: tk.start_date ?? '',
        work_days: tk.work_days ?? '',
        assignees: as,
      });
    } catch (err) {
      setLoadError(err);
    }
  };

  useEffect(() => {
    if (!taskId) return;
    setTask(null);
    setLoadError(null);
    setError(null);
    setComment('');
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const run = async (fn) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = (status) => run(() => api.updateTask(task.id, { status }));

  const saveDetails = (e) => {
    e.preventDefault();
    const v = validateTask(form);
    setErrors(v);
    if (Object.keys(v).length) return;
    run(async () => {
      await api.updateTask(task.id, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        due_date: form.due_date || null,
        start_date: form.start_date || null,
        work_days: form.work_days === '' ? null : Number(form.work_days),
      });
      const same = form.assignees.length === assignees.length && form.assignees.every((id) => assignees.includes(id));
      if (!same) await api.setTaskAssignees(task.id, form.assignees);
    });
  };

  const remove = async () => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    setSaving(true);
    try {
      await api.deleteTask(task.id);
      onChanged?.();
      onClose();
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  };

  const sendComment = () => {
    if (!comment.trim()) return;
    run(async () => {
      await api.addComment(task.id, profile.id, comment.trim());
      setComment('');
    });
  };

  return (
    <Modal open={Boolean(taskId)} onClose={onClose} title={task?.title ?? t('tasks.details')} wide>
      {loadError && <ErrorBox error={loadError} />}
      {!loadError && !task && <Spinner />}
      {task && form && (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="space-y-5">
            {manager ? (
              <form onSubmit={saveDetails} className="space-y-4">
                <TaskFields form={form} setForm={setForm} errors={errors} assigneeOptions={memberIds} disabled={saving} />
                <div className="flex flex-wrap justify-between gap-2">
                  <button type="button" className="btn-ghost text-red-600 hover:bg-red-50" onClick={remove} disabled={saving}>
                    {t('tasks.delete')}
                  </button>
                  <button className="btn-primary" disabled={saving}>
                    {saving ? t('common.saving') : t('common.save')}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                {task.description && <p className="whitespace-pre-wrap text-sm text-slate-700">{task.description}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  {assignees.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-0.5 pe-2 ps-0.5 text-xs">
                      <Avatar userId={id} size="sm" />
                      <UserName userId={id} />
                    </span>
                  ))}
                </div>
              </div>
            )}

            <ErrorBox error={error} />

            <div>
              <div className="mb-3 flex gap-1 border-b border-slate-200">
                {['comments', 'activity'].map((k) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500'}`}
                  >
                    {t(`${k}.title`)} {k === 'comments' && comments.length > 0 && `(${comments.length})`}
                  </button>
                ))}
              </div>
              {tab === 'comments' ? (
                <div className="space-y-4">
                  {comments.length === 0 && <p className="text-sm text-slate-500">{t('comments.empty')}</p>}
                  <ul className="space-y-3">
                    {comments.map((c) => (
                      <li key={c.id} className="flex gap-2">
                        <Avatar userId={c.user_id} size="sm" />
                        <div className="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2">
                          <div className="mb-0.5 flex justify-between gap-2 text-xs">
                            <span className="font-semibold text-slate-800">{nameOf(c.user_id)}</span>
                            <span className="text-slate-400">{formatDateTime(c.created_at)}</span>
                          </div>
                          <CommentBody body={c.body} />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="space-y-2">
                    <MentionInput
                      value={comment}
                      onChange={setComment}
                      memberIds={memberIds}
                      placeholder={t('comments.placeholder')}
                      onSubmit={sendComment}
                      disabled={saving}
                    />
                    <div className="flex justify-end">
                      <button className="btn-primary" onClick={sendComment} disabled={saving || !comment.trim()}>
                        {t('comments.send')}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <ul className="space-y-2">
                  {activity.map((a) => (
                    <ActivityItem key={a.id} entry={a} />
                  ))}
                </ul>
              )}
            </div>
          </div>

          <aside className="space-y-4 rounded-xl bg-slate-50 p-4 text-sm lg:self-start">
            <div>
              <div className="label">{t('tasks.status')}</div>
              {movable ? (
                <select className="input" value={task.status} onChange={(e) => changeStatus(e.target.value)} disabled={saving}>
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`status.${s}`)}
                    </option>
                  ))}
                </select>
              ) : (
                <StatusBadge status={task.status} />
              )}
            </div>
            <div>
              <div className="label">{t('tasks.due')}</div>
              <DueDate task={task} />
              {task.start_date && (
                <div className="mt-1 text-xs text-slate-500">
                  {t('tasks.scheduleSummary', { start: formatDate(task.start_date), days: task.work_days ?? '—' })}
                </div>
              )}
            </div>
            <div>
              <div className="label">{t('tasks.project')}</div>
              <span>{project.name}</span>
            </div>
            <div className="space-y-1 text-xs text-slate-500">
              <div>{t('tasks.createdBy', { name: nameOf(task.created_by) })}</div>
              <div>{formatDateTime(task.created_at)}</div>
              {task.completed_by && (
                <div className="text-emerald-700">
                  {t('tasks.completedBy', { name: nameOf(task.completed_by) })} · {formatDateTime(task.completed_at)}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </Modal>
  );
}
