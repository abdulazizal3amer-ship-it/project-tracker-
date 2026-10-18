import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import * as api from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import {
  canManageProject,
  canMoveTask,
  filterTasks,
  groupAssignees,
  isOverdue,
  PRIORITIES,
  projectProgress,
  sortTasks,
  TASK_STATUSES,
} from '../lib/logic.js';
import { useAsync } from '../lib/useAsync.js';
import { useUsers } from '../lib/users.jsx';
import { useI18n } from '../i18n/index.jsx';
import { NewTaskModal, TaskDetailModal } from '../components/TaskModals.jsx';
import { Avatar, AvatarStack, DueDate, EmptyState, ErrorBox, PriorityBadge, ProgressBar, Spinner, StatusBadge, UserName } from '../components/ui.jsx';
import { ProjectFormModal, ProjectStatusBadge } from './Projects.jsx';

const COLUMN_ACCENT = { new: 'border-t-slate-400', in_progress: 'border-t-sky-500', in_review: 'border-t-amber-500', done: 'border-t-emerald-500' };

function TaskCard({ task, assigneeIds, onOpen, dragging }) {
  const late = isOverdue(task);
  return (
    // A div, not a <button>: the drag library refuses to start drags from
    // interactive elements. The wrapping drag handle is focusable; Enter opens.
    <div
      onClick={onOpen}
      className={`block w-full cursor-pointer rounded-lg border bg-white p-3 text-start shadow-sm transition hover:border-brand-500 ${
        late ? 'border-red-300 bg-red-50/40' : 'border-slate-200'
      } ${dragging ? 'rotate-1 shadow-lg ring-2 ring-brand-500' : ''}`}
    >
      <div className="mb-2 text-sm font-medium leading-snug">{task.title}</div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <PriorityBadge priority={task.priority} />
          <DueDate task={task} />
        </div>
        <AvatarStack userIds={assigneeIds} max={4} />
      </div>
    </div>
  );
}

// FR-15 / US-03 — drag a card to the next column to change its status.
function Kanban({ tasks, assigneeMap, project, memberIds, onOpen, onMove, onAdd }) {
  const { t } = useI18n();
  const { profile } = useAuth();
  const manager = canManageProject(profile, project, memberIds);
  const columns = Object.fromEntries(TASK_STATUSES.map((s) => [s, []]));
  for (const task of sortTasks(tasks, 'due_date')) columns[task.status].push(task);

  const onDragEnd = ({ draggableId, destination, source }) => {
    if (!destination || destination.droppableId === source.droppableId) return;
    onMove(draggableId, destination.droppableId);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 lg:grid lg:grid-cols-4 lg:overflow-visible">
        {TASK_STATUSES.map((status) => (
          <div key={status} className={`flex w-[78vw] max-w-xs shrink-0 snap-start flex-col rounded-xl border-t-4 bg-slate-100 sm:w-72 lg:w-auto lg:max-w-none ${COLUMN_ACCENT[status]}`}>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-semibold">
                {t(`status.${status}`)} <span className="text-slate-400">{columns[status].length}</span>
              </span>
              {project.status !== 'archived' && (
                <button className="rounded px-1.5 text-lg leading-none text-slate-500 hover:bg-slate-200" onClick={() => onAdd(status)} aria-label={t('tasks.new')}>
                  +
                </button>
              )}
            </div>
            <Droppable droppableId={status}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex min-h-32 flex-1 flex-col gap-2 rounded-b-xl p-2 transition ${snapshot.isDraggingOver ? 'bg-brand-50' : ''}`}
                >
                  {columns[status].map((task, index) => {
                    const ids = assigneeMap[task.id] ?? [];
                    const movable = manager || ids.includes(profile.id);
                    return (
                      <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={!movable}>
                        {(drag, dragSnap) => (
                          <div
                            ref={drag.innerRef}
                            {...drag.draggableProps}
                            {...drag.dragHandleProps}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') onOpen(task.id);
                              else drag.dragHandleProps?.onKeyDown?.(e);
                            }}
                            title={movable ? undefined : t('tasks.cannotMove')}
                          >
                            <TaskCard task={task} assigneeIds={ids} onOpen={() => onOpen(task.id)} dragging={dragSnap.isDragging} />
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                  {columns[status].length === 0 && !snapshot.isDraggingOver && (
                    <div className="py-6 text-center text-xs text-slate-400">{t('tasks.emptyColumn')}</div>
                  )}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}

export function TaskFilters({ filters, setFilters, memberIds, showAssignee = true }) {
  const { t } = useI18n();
  const { byId } = useUsers();
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className="input w-full sm:w-56" placeholder={t('filters.searchTitle')} value={filters.query} onChange={set('query')} />
      {showAssignee && (
        <select className="input w-auto" value={filters.assignee} onChange={set('assignee')} aria-label={t('filters.assignee')}>
          <option value="">{t('filters.assignee')}: {t('common.all')}</option>
          {memberIds.map((id) => (
            <option key={id} value={id}>
              {byId[id]?.full_name}
            </option>
          ))}
        </select>
      )}
      <select className="input w-auto" value={filters.status} onChange={set('status')} aria-label={t('tasks.status')}>
        <option value="">{t('tasks.status')}: {t('common.all')}</option>
        {TASK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`status.${s}`)}
          </option>
        ))}
      </select>
      <select className="input w-auto" value={filters.priority} onChange={set('priority')} aria-label={t('tasks.priority')}>
        <option value="">{t('tasks.priority')}: {t('common.all')}</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {t(`priority.${p}`)}
          </option>
        ))}
      </select>
      <select className="input w-auto" value={filters.due} onChange={set('due')} aria-label={t('filters.due')}>
        <option value="">{t('filters.due')}: {t('common.all')}</option>
        <option value="overdue">{t('filters.overdue')}</option>
        <option value="week">{t('filters.week')}</option>
        <option value="none">{t('filters.noDue')}</option>
      </select>
    </div>
  );
}

export const EMPTY_FILTERS = { query: '', assignee: '', status: '', priority: '', due: '' };

function SortHeader({ label, column, sort, setSort }) {
  const active = sort.key === column;
  return (
    <th className="px-3 py-2 font-medium">
      <button
        className={`inline-flex items-center gap-1 ${active ? 'text-brand-800' : ''}`}
        onClick={() => setSort({ key: column, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}
      >
        {label}
        <span className="text-[10px]">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}

// FR-16 — table view with sorting and filtering.
export function TaskTable({ tasks, assigneeMap, onOpen, projectName }) {
  const { t } = useI18n();
  const [sort, setSort] = useState({ key: 'due_date', dir: 'asc' });
  const rows = sortTasks(tasks, sort.key, sort.dir);
  if (!rows.length) return <EmptyState>{t('tasks.empty')}</EmptyState>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-start text-xs text-slate-500">
          <tr className="text-start [&>th]:text-start">
            <SortHeader label={t('tasks.title')} column="title" sort={sort} setSort={setSort} />
            {projectName && <th className="px-3 py-2 font-medium">{t('tasks.project')}</th>}
            <th className="px-3 py-2 font-medium">{t('tasks.assignees')}</th>
            <SortHeader label={t('tasks.status')} column="status" sort={sort} setSort={setSort} />
            <SortHeader label={t('tasks.priority')} column="priority" sort={sort} setSort={setSort} />
            <SortHeader label={t('tasks.due')} column="due_date" sort={sort} setSort={setSort} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((task) => (
            <tr key={task.id} className={`cursor-pointer hover:bg-slate-50 ${isOverdue(task) ? 'bg-red-50/50' : ''}`} onClick={() => onOpen(task)}>
              <td className="px-3 py-2 font-medium">{task.title}</td>
              {projectName && <td className="px-3 py-2 text-slate-500">{projectName(task.project_id)}</td>}
              <td className="px-3 py-2">
                <AvatarStack userIds={assigneeMap[task.id] ?? []} />
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={task.status} />
              </td>
              <td className="px-3 py-2">
                <PriorityBadge priority={task.priority} />
              </td>
              <td className="px-3 py-2">
                <DueDate task={task} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Members({ project, memberIds, onChanged }) {
  const { t } = useI18n();
  const { profile } = useAuth();
  const { users, byId } = useUsers();
  const manager = canManageProject(profile, project, memberIds);
  const [adding, setAdding] = useState('');
  const [error, setError] = useState(null);
  const candidates = users.filter((u) => u.is_active && !memberIds.includes(u.id));

  const run = async (fn) => {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="space-y-4">
      <ErrorBox error={error} />
      {manager && project.status !== 'archived' && candidates.length > 0 && (
        <div className="flex gap-2">
          <select className="input max-w-xs" value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">{t('projects.addMember')}…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
          <button
            className="btn-primary"
            disabled={!adding}
            onClick={() => run(async () => {
              await api.addProjectMembers(project.id, [adding]);
              setAdding('');
            })}
          >
            {t('common.add')}
          </button>
        </div>
      )}
      <ul className="card divide-y divide-slate-100">
        {memberIds.map((id) => (
          <li key={id} className="flex items-center gap-3 px-4 py-3">
            <Avatar userId={id} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                <UserName userId={id} />
              </div>
              <div className="text-xs text-slate-500">
                {id === project.manager_id ? t('projects.manager') : t(`role.${byId[id]?.role ?? 'member'}`)}
              </div>
            </div>
            {manager && id !== project.manager_id && (
              <button
                className="btn-ghost text-xs text-red-600 hover:bg-red-50"
                onClick={() => window.confirm(t('projects.removeMemberConfirm')) && run(() => api.removeProjectMember(project.id, id))}
              >
                {t('common.delete')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ProjectView() {
  const { id } = useParams();
  const { t, formatDate } = useI18n();
  const { profile } = useAuth();
  const { nameOf } = useUsers();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem('pt.view') ?? 'kanban';
    } catch {
      return 'kanban';
    }
  });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [newTask, setNewTask] = useState(null);
  const [editing, setEditing] = useState(false);
  const [moveError, setMoveError] = useState(null);

  const { data, loading, error, reload, setData } = useAsync(async () => {
    const [project, tasks, assignees, members] = await Promise.all([
      api.getProject(id),
      api.listTasks({ projectId: id }),
      api.listAssignees({ projectId: id }),
      api.listProjectMembers(id),
    ]);
    if (!project) throw new Error('notFound');
    return { project, tasks, assignees, memberIds: members.map((m) => m.user_id) };
  }, [id]);

  // Live updates from teammates (Supabase Realtime)
  useEffect(() => subscribe(), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  function subscribe() {
    return api.subscribe(`project-${id}`, 'tasks', `project_id=eq.${id}`, () => reload({ silent: true }));
  }

  useEffect(() => {
    try {
      localStorage.setItem('pt.view', view);
    } catch {
      /* ignore */
    }
  }, [view]);

  const assigneeMap = useMemo(() => groupAssignees(data?.assignees ?? []), [data?.assignees]);

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;

  const { project, tasks, memberIds } = data;
  const manager = canManageProject(profile, project, memberIds);
  const openTaskId = params.get('task');
  const openTask = (taskId) => setParams({ task: taskId });
  const closeTask = () => setParams({});

  // Optimistic status change; the database (RLS) has the final say.
  const moveTask = async (taskId, status) => {
    const task = tasks.find((tk) => tk.id === taskId);
    if (!canMoveTask(profile, project, memberIds, assigneeMap[taskId] ?? [])) return;
    setMoveError(null);
    setData((d) => ({ ...d, tasks: d.tasks.map((tk) => (tk.id === taskId ? { ...tk, status } : tk)) }));
    try {
      const updated = await api.updateTask(taskId, { status });
      setData((d) => ({ ...d, tasks: d.tasks.map((tk) => (tk.id === taskId ? updated : tk)) }));
    } catch (err) {
      setData((d) => ({ ...d, tasks: d.tasks.map((tk) => (tk.id === taskId ? task : tk)) }));
      setMoveError(err);
    }
  };

  const archive = async () => {
    if (!window.confirm(t('projects.confirmArchive'))) return;
    await api.updateProject(project.id, { status: 'archived' }).catch(setMoveError);
    reload({ silent: true });
  };

  const filtered = filterTasks(tasks, filters, assigneeMap);
  const pct = projectProgress(tasks);
  const done = tasks.filter((tk) => tk.status === 'done').length;

  return (
    <div className="space-y-5">
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-[60%] flex-1">
            <Link to="/projects" className="text-xs text-slate-500 hover:underline">
              {t('projects.title')}
            </Link>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
              {project.name} <ProjectStatusBadge status={project.status} />
            </h1>
            {project.description && <p className="mt-1 text-sm text-slate-600">{project.description}</p>}
            <p className="mt-1 text-xs text-slate-500">
              {t('projects.manager')}: {nameOf(project.manager_id)}
              {project.start_date && ` · ${formatDate(project.start_date)}`} → {formatDate(project.end_date)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {project.status !== 'archived' && (
              <button className="btn-primary" onClick={() => setNewTask('new')}>
                + {t('tasks.new')}
              </button>
            )}
            {manager && (
              <button className="btn-secondary" onClick={() => setEditing(true)}>
                {t('common.edit')}
              </button>
            )}
            {manager && project.status !== 'archived' && (
              <button className="btn-ghost text-xs" onClick={archive}>
                {t('projects.archive')}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <ProgressBar value={pct} />
          </div>
          <span className="text-sm font-semibold tabular-nums">{pct}%</span>
          <span className="text-xs text-slate-500">{t('projects.tasksCount', { done, total: tasks.length })}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {['kanban', 'list', 'members'].map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === v ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {t(`view.${v}`)}
            </button>
          ))}
        </div>
        {view !== 'members' && <TaskFilters filters={filters} setFilters={setFilters} memberIds={memberIds} />}
      </div>

      <ErrorBox error={moveError} />

      {view === 'kanban' && (
        <Kanban
          tasks={filtered}
          assigneeMap={assigneeMap}
          project={project}
          memberIds={memberIds}
          onOpen={openTask}
          onMove={moveTask}
          onAdd={(status) => setNewTask(status)}
        />
      )}
      {view === 'list' && <TaskTable tasks={filtered} assigneeMap={assigneeMap} onOpen={(task) => openTask(task.id)} />}
      {view === 'members' && <Members project={project} memberIds={memberIds} onChanged={() => reload({ silent: true })} />}

      <NewTaskModal
        open={Boolean(newTask)}
        initialStatus={newTask}
        onClose={() => setNewTask(null)}
        project={project}
        memberIds={memberIds}
        onCreated={() => reload({ silent: true })}
      />
      <TaskDetailModal taskId={openTaskId} project={project} memberIds={memberIds} onClose={closeTask} onChanged={() => reload({ silent: true })} />
      <ProjectFormModal open={editing} onClose={() => setEditing(false)} project={project} onSaved={() => reload({ silent: true })} />
    </div>
  );
}
