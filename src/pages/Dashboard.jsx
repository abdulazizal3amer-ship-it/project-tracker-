import { Link } from 'react-router-dom';
import * as api from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import {
  countByStatus,
  daysOverdue,
  groupAssignees,
  isDueWithin,
  overdueTasks,
  projectProgress,
  sortTasks,
  TASK_STATUSES,
  workloadByUser,
} from '../lib/logic.js';
import { useAsync } from '../lib/useAsync.js';
import { useUsers } from '../lib/users.jsx';
import { useI18n } from '../i18n/index.jsx';
import { Avatar, AvatarStack, DueDate, EmptyState, ErrorBox, PriorityBadge, ProgressBar, Spinner, UserName } from '../components/ui.jsx';

const STATUS_BAR = { new: 'bg-slate-400', in_progress: 'bg-sky-500', in_review: 'bg-amber-500', done: 'bg-emerald-500' };

function Stat({ label, value, tone = 'text-slate-900' }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function Section({ title, children, action }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// FR-24: one screen with status counts, overdue, this week, progress and workload.
export default function Dashboard() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const { users } = useUsers();
  const { data, loading, error, reload } = useAsync(async () => {
    const [projects, tasks, assignees] = await Promise.all([api.listProjects(), api.listTasks(), api.listAssignees()]);
    return { projects, tasks, assignees };
  }, []);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const liveProjects = data.projects.filter((p) => p.status !== 'archived');
  const liveIds = new Set(liveProjects.map((p) => p.id));
  const tasks = data.tasks.filter((tk) => liveIds.has(tk.project_id));
  const assigneeMap = groupAssignees(data.assignees);
  const projectName = Object.fromEntries(data.projects.map((p) => [p.id, p.name]));

  const counts = countByStatus(tasks);
  const overdue = overdueTasks(tasks);
  const week = sortTasks(tasks.filter((tk) => isDueWithin(tk, 7)), 'due_date');
  const workload = workloadByUser(tasks, data.assignees);
  const workloadRows = users
    .filter((u) => workload[u.id])
    .map((u) => ({ user: u, ...workload[u.id] }))
    .sort((a, b) => b.open - a.open);
  const maxOpen = Math.max(1, ...workloadRows.map((r) => r.open));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('dashboard.greeting', { name: profile.full_name })}</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('dashboard.totalTasks')} value={tasks.length} />
        <Stat label={t('dashboard.overdue')} value={overdue.length} tone={overdue.length ? 'text-red-600' : 'text-slate-900'} />
        <Stat label={t('dashboard.dueThisWeek')} value={week.length} />
        <Stat label={t('status.done')} value={counts.done} tone="text-emerald-600" />
      </div>

      <Section title={t('dashboard.byStatus')}>
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500">{t('tasks.empty')}</p>
        ) : (
          <>
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
              {TASK_STATUSES.map((s) =>
                counts[s] ? <div key={s} className={STATUS_BAR[s]} style={{ width: `${(counts[s] / tasks.length) * 100}%` }} /> : null,
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {TASK_STATUSES.map((s) => (
                <span key={s} className="inline-flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_BAR[s]}`} />
                  {t(`status.${s}`)} <span className="font-semibold tabular-nums">{counts[s]}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={`${t('dashboard.overdueList')} (${overdue.length})`}>
          {overdue.length === 0 ? (
            <p className="text-sm text-slate-500">{t('dashboard.noOverdue')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {overdue.slice(0, 15).map((tk) => (
                <li key={tk.id}>
                  <Link to={`/task/${tk.id}`} className="flex items-center gap-3 py-2 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{tk.title}</div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{projectName[tk.project_id]}</span>
                        <span>·</span>
                        <span className="flex flex-wrap gap-1">
                          {(assigneeMap[tk.id] ?? []).map((id, i) => (
                            <span key={id}>
                              {i > 0 && '، '}
                              <UserName userId={id} />
                            </span>
                          ))}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                      {t('dashboard.daysLate', { days: daysOverdue(tk) })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('dashboard.weekList')}>
          {week.length === 0 ? (
            <p className="text-sm text-slate-500">{t('dashboard.nothingThisWeek')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {week.slice(0, 15).map((tk) => (
                <li key={tk.id}>
                  <Link to={`/task/${tk.id}`} className="flex items-center gap-3 py-2 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{tk.title}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        {projectName[tk.project_id]} · <PriorityBadge priority={tk.priority} />
                      </div>
                    </div>
                    <AvatarStack userIds={assigneeMap[tk.id] ?? []} />
                    <DueDate task={tk} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('dashboard.projectsProgress')} action={<Link to="/projects" className="text-sm text-brand-700 hover:underline">{t('nav.projects')}</Link>}>
          {liveProjects.length === 0 ? (
            <EmptyState>{t('dashboard.noProjects')}</EmptyState>
          ) : (
            <ul className="space-y-3">
              {liveProjects.map((p) => {
                const pt = tasks.filter((tk) => tk.project_id === p.id);
                const pct = projectProgress(pt);
                return (
                  <li key={p.id}>
                    <Link to={`/projects/${p.id}`} className="block hover:opacity-80">
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="font-medium">{p.name}</span>
                        <span className="tabular-nums text-slate-500">{pct}%</span>
                      </div>
                      <ProgressBar value={pct} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title={t('dashboard.workload')}>
          {workloadRows.length === 0 ? (
            <p className="text-sm text-slate-500">{t('tasks.empty')}</p>
          ) : (
            <ul className="space-y-3">
              {workloadRows.map(({ user, open, overdue: late }) => (
                <li key={user.id} className="flex items-center gap-3">
                  <Avatar userId={user.id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-sm">
                      <UserName userId={user.id} />
                      <span className="tabular-nums text-slate-500">
                        {open} {t('dashboard.openTasks')}
                        {late > 0 && <span className="ms-2 font-semibold text-red-600">{late} {t('dashboard.overdue')}</span>}
                      </span>
                    </div>
                    <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="bg-red-500" style={{ width: `${(late / maxOpen) * 100}%` }} />
                      <div className="bg-brand-600" style={{ width: `${((open - late) / maxOpen) * 100}%` }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
