import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { buildProjectReport, summarizeReports, TASK_STATUSES, todayISO, toCsv } from '../lib/logic.js';
import { useAsync } from '../lib/useAsync.js';
import { useUsers } from '../lib/users.jsx';
import { useI18n } from '../i18n/index.jsx';
import { DueDate, ErrorBox, JobLabel, PriorityBadge, ProgressBar, Spinner, StatusBadge, UserName } from '../components/ui.jsx';
import { ProjectStatusBadge } from './Projects.jsx';

const STATUS_BAR = { new: 'bg-slate-400', in_progress: 'bg-sky-500', in_review: 'bg-amber-500', done: 'bg-emerald-500' };

function StatusStrip({ counts, total }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 print:border print:border-slate-300">
        {total > 0 &&
          TASK_STATUSES.map((s) =>
            counts[s] ? <div key={s} className={STATUS_BAR[s]} style={{ width: `${(counts[s] / total) * 100}%` }} /> : null,
          )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {TASK_STATUSES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_BAR[s]}`} />
            {t(`status.${s}`)} <b className="tabular-nums">{counts[s]}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

const th = 'border-b border-slate-300 bg-slate-50 px-3 py-2 text-start text-xs font-semibold text-slate-600';
const td = 'border-b border-slate-100 px-3 py-1.5 align-top';

function Section({ title, children }) {
  return (
    <section className="break-inside-avoid-page space-y-2">
      <h3 className="font-semibold text-slate-800">{title}</h3>
      {children}
    </section>
  );
}

function ProjectReport({ report, pageBreak }) {
  const { t, formatDate } = useI18n();
  const { nameOf } = useUsers();
  const { project } = report;
  return (
    <article className={`card space-y-6 p-6 print:rounded-none print:border-0 print:p-0 print:shadow-none ${pageBreak ? 'print:break-before-page' : ''}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="text-xs text-slate-500">{t('reports.projectReport')}</div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            {project.name} <ProjectStatusBadge status={project.status} />
          </h2>
          {project.description && <p className="mt-1 text-sm text-slate-600">{project.description}</p>}
          <p className="mt-1 text-xs text-slate-500">
            {t('projects.manager')}: {nameOf(project.manager_id)}
            {project.start_date && ` · ${formatDate(project.start_date)}`} → {formatDate(project.end_date)}
          </p>
        </div>
        <div className="text-end">
          <div className="text-3xl font-bold tabular-nums">{report.progress}%</div>
          <div className="text-xs text-slate-500">{t('projects.tasksCount', { done: report.counts.done, total: report.total })}</div>
        </div>
      </header>

      <ProgressBar value={report.progress} />

      <Section title={t('reports.byStatus')}>
        <StatusStrip counts={report.counts} total={report.total} />
      </Section>

      <Section title={t('reports.byMember')}>
        {report.byMember.length === 0 ? (
          <p className="text-sm text-slate-500">{t('reports.none')}</p>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[32rem] text-sm print:min-w-0">
            <thead>
              <tr>
                <th className={th}>{t('reports.member')}</th>
                <th className={th}>{t('reports.total')}</th>
                <th className={th}>{t('reports.open')}</th>
                <th className={th}>{t('status.done')}</th>
                <th className={th}>{t('dashboard.overdue')}</th>
              </tr>
            </thead>
            <tbody>
              {report.byMember.map((m) => (
                <tr key={m.userId}>
                  <td className={td}>
                    <span className="inline-flex items-center gap-2">
                      <UserName userId={m.userId} /> <JobLabel userId={m.userId} />
                    </span>
                  </td>
                  <td className={`${td} tabular-nums`}>{m.total}</td>
                  <td className={`${td} tabular-nums`}>{m.open}</td>
                  <td className={`${td} tabular-nums`}>{m.done}</td>
                  <td className={`${td} tabular-nums ${m.overdue ? 'font-semibold text-red-600' : ''}`}>{m.overdue}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Section>

      <Section title={`${t('reports.overdueList')} (${report.overdue.length})`}>
        {report.overdue.length === 0 ? (
          <p className="text-sm text-slate-500">{t('reports.none')}</p>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[32rem] text-sm print:min-w-0">
            <thead>
              <tr>
                <th className={th}>{t('tasks.title')}</th>
                <th className={th}>{t('tasks.assignees')}</th>
                <th className={th}>{t('tasks.due')}</th>
                <th className={th}>{t('reports.daysLate')}</th>
              </tr>
            </thead>
            <tbody>
              {report.overdue.map((task) => (
                <tr key={task.id}>
                  <td className={td}>
                    <div className="font-medium">{task.title}</div>
                    {task.description && <div className="mt-0.5 whitespace-pre-wrap text-xs text-slate-500">{task.description}</div>}
                  </td>
                  <td className={td}>{(report.assigneeMap[task.id] ?? []).map(nameOf).join('، ')}</td>
                  <td className={td}>{formatDate(task.due_date)}</td>
                  <td className={`${td} font-semibold tabular-nums text-red-600`}>{task.daysLate}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Section>

      <Section title={`${t('reports.allTasks')} (${report.total})`}>
        {report.tasks.length === 0 ? (
          <p className="text-sm text-slate-500">{t('reports.noTasks')}</p>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[32rem] text-sm print:min-w-0">
            <thead>
              <tr>
                <th className={th}>{t('tasks.title')}</th>
                <th className={th}>{t('tasks.assignees')}</th>
                <th className={th}>{t('tasks.status')}</th>
                <th className={th}>{t('tasks.priority')}</th>
                <th className={th}>{t('tasks.startDate')}</th>
                <th className={th}>{t('tasks.workDays')}</th>
                <th className={th}>{t('tasks.due')}</th>
              </tr>
            </thead>
            <tbody>
              {report.tasks.map((task) => (
                <tr key={task.id} className="break-inside-avoid">
                  <td className={td}>
                    <div className="font-medium">{task.title}</div>
                    {task.description && <div className="mt-0.5 whitespace-pre-wrap text-xs text-slate-500">{task.description}</div>}
                  </td>
                  <td className={td}>{(report.assigneeMap[task.id] ?? []).map(nameOf).join('، ')}</td>
                  <td className={td}>
                    <StatusBadge status={task.status} />
                  </td>
                  <td className={td}>
                    <PriorityBadge priority={task.priority} />
                  </td>
                  <td className={td}>{task.start_date ? formatDate(task.start_date) : '—'}</td>
                  <td className={`${td} tabular-nums`}>{task.work_days ?? '—'}</td>
                  <td className={td}>
                    <DueDate task={task} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Section>
    </article>
  );
}

function SummaryReport({ reports }) {
  const { t } = useI18n();
  const { nameOf } = useUsers();
  const sum = summarizeReports(reports);
  return (
    <article className="card space-y-5 p-6 print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <h2 className="text-xl font-bold">{t('reports.summaryTitle')}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t('reports.projects'), sum.projects],
          [t('dashboard.totalTasks'), sum.total],
          [t('dashboard.overdue'), sum.overdue],
          [t('projects.progress'), `${sum.progress}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="text-2xl font-bold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <StatusStrip counts={sum.counts} total={sum.total} />
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full min-w-[32rem] text-sm print:min-w-0">
        <thead>
          <tr>
            <th className={th}>{t('projects.name')}</th>
            <th className={th}>{t('projects.manager')}</th>
            <th className={th}>{t('projects.status')}</th>
            <th className={th}>{t('reports.total')}</th>
            <th className={th}>{t('status.done')}</th>
            <th className={th}>{t('dashboard.overdue')}</th>
            <th className={`${th} w-40`}>{t('projects.progress')}</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.project.id}>
              <td className={`${td} font-medium`}>{r.project.name}</td>
              <td className={td}>{nameOf(r.project.manager_id)}</td>
              <td className={td}>
                <ProjectStatusBadge status={r.project.status} />
              </td>
              <td className={`${td} tabular-nums`}>{r.total}</td>
              <td className={`${td} tabular-nums`}>{r.counts.done}</td>
              <td className={`${td} tabular-nums ${r.overdue.length ? 'font-semibold text-red-600' : ''}`}>{r.overdue.length}</td>
              <td className={td}>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <ProgressBar value={r.progress} />
                  </div>
                  <span className="w-10 text-end text-xs tabular-nums">{r.progress}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </article>
  );
}

// FR-26 / US-06 — printable report for one project or a set of projects.
export default function Reports() {
  const { t, formatDate } = useI18n();
  const { profile } = useAuth();
  const { nameOf } = useUsers();
  const [params, setParams] = useSearchParams();
  const [showArchived, setShowArchived] = useState(false);

  const selected = useMemo(() => (params.get('ids') ?? '').split(',').filter(Boolean), [params]);
  const setSelected = (ids) => setParams(ids.length ? { ids: ids.join(',') } : {});

  const { data, loading, error, reload } = useAsync(async () => {
    const [projects, tasks, assignees] = await Promise.all([api.listProjects(), api.listTasks(), api.listAssignees()]);
    return { projects, tasks, assignees };
  }, []);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const choices = data.projects.filter((p) => showArchived || p.status !== 'archived' || selected.includes(p.id));
  const reports = data.projects
    .filter((p) => selected.includes(p.id))
    .map((p) => buildProjectReport(p, data.tasks, data.assignees));

  const toggle = (id) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const exportCsv = () => {
    const rows = [[t('tasks.project'), t('tasks.title'), t('tasks.description'), t('tasks.assignees'), t('tasks.status'), t('tasks.priority'), t('tasks.startDate'), t('tasks.workDays'), t('tasks.due'), t('reports.daysLate')]];
    for (const r of reports) {
      const late = Object.fromEntries(r.overdue.map((o) => [o.id, o.daysLate]));
      for (const task of r.tasks) {
        rows.push([
          r.project.name,
          task.title,
          task.description ?? '',
          (r.assigneeMap[task.id] ?? []).map(nameOf).join('، '),
          t(`status.${task.status}`),
          t(`priority.${task.priority}`),
          task.start_date ?? '',
          task.work_days ?? '',
          task.due_date ?? '',
          late[task.id] ?? '',
        ]);
      }
    }
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `report-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4 print:hidden">
        <h1 className="text-2xl font-bold">{t('reports.title')}</h1>
        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold">{t('reports.choose')}</span>
            <button className="btn-ghost text-xs" onClick={() => setSelected(choices.map((p) => p.id))}>
              {t('reports.selectAll')}
            </button>
            <button className="btn-ghost text-xs" onClick={() => setSelected([])}>
              {t('reports.clear')}
            </button>
            <label className="ms-auto flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              {t('reports.includeArchived')}
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {choices.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                  selected.includes(p.id) ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 bg-white'
                }`}
              >
                <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                {p.name}
              </label>
            ))}
          </div>
          {reports.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <button className="btn-primary" onClick={() => window.print()}>
                🖨 {t('reports.print')}
              </button>
              <button className="btn-secondary" onClick={exportCsv}>
                {t('reports.csv')}
              </button>
              <span className="text-xs text-slate-500">{t('reports.printHint')}</span>
            </div>
          )}
        </div>
      </div>

      {reports.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 print:hidden">{t('reports.empty')}</p>
      ) : (
        <div className="space-y-6">
          <div className="hidden text-xs text-slate-500 print:block">
            {t('app.name')} · {t('reports.generated', { date: formatDate(todayISO()), name: profile.full_name })}
          </div>
          {reports.length > 1 && <SummaryReport reports={reports} />}
          {reports.map((r, i) => (
            <ProjectReport key={r.project.id} report={r} pageBreak={reports.length > 1 || i > 0} />
          ))}
        </div>
      )}
    </div>
  );
}
