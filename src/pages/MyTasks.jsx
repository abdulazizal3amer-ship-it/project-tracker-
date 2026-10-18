import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { filterTasks, groupAssignees } from '../lib/logic.js';
import { useAsync } from '../lib/useAsync.js';
import { useI18n } from '../i18n/index.jsx';
import { ErrorBox, Spinner } from '../components/ui.jsx';
import { EMPTY_FILTERS, TaskFilters, TaskTable } from './ProjectView.jsx';

// FR-17 — every task assigned to me (alone or in a group), by due date.
export default function MyTasks() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [hideDone, setHideDone] = useState(true);

  const { data, loading, error, reload } = useAsync(async () => {
    const [projects, tasks, assignees] = await Promise.all([api.listProjects(), api.listTasks(), api.listAssignees()]);
    return { projects, tasks, assignees };
  }, []);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const assigneeMap = groupAssignees(data.assignees);
  const live = new Set(data.projects.filter((p) => p.status !== 'archived').map((p) => p.id));
  const names = Object.fromEntries(data.projects.map((p) => [p.id, p.name]));
  const mine = data.tasks.filter(
    (tk) => live.has(tk.project_id) && (assigneeMap[tk.id] ?? []).includes(profile.id) && (!hideDone || tk.status !== 'done'),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t('myTasks.title')}</h1>
        <p className="text-sm text-slate-500">{t('myTasks.subtitle')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <TaskFilters filters={filters} setFilters={setFilters} memberIds={[]} showAssignee={false} />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          {t('filters.hideDone')}
        </label>
      </div>
      <TaskTable
        tasks={filterTasks(mine, filters, assigneeMap)}
        assigneeMap={assigneeMap}
        projectName={(pid) => names[pid]}
        onOpen={(task) => navigate(`/projects/${task.project_id}?task=${task.id}`)}
      />
    </div>
  );
}
