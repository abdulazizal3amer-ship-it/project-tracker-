// Pure business rules shared by the screens. No Supabase calls here, so
// everything in this file is covered by unit tests (NFR-11).

export const TASK_STATUSES = ['new', 'in_progress', 'in_review', 'done'];
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const PROJECT_STATUSES = ['active', 'on_hold', 'completed', 'archived'];
// Roles that sign in. Team members ('member') have no login and carry a
// job title instead.
export const LOGIN_ROLES = ['admin', 'pm'];
export const JOB_TITLES = ['developer', 'analyst', 'tester'];

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------
// Dates — due dates are plain 'YYYY-MM-DD' strings in local time.
// ---------------------------------------------------------------------
export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return todayISO(new Date(y, m - 1, d + days));
}

function dayNumber(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function daysBetween(fromISO, toISO) {
  return dayNumber(toISO) - dayNumber(fromISO);
}

// ---------------------------------------------------------------------
// Overdue (US-04): due date has passed and the task is not done.
// ---------------------------------------------------------------------
export function isOverdue(task, today = todayISO()) {
  return Boolean(task.due_date) && task.status !== 'done' && task.due_date < today;
}

export function daysOverdue(task, today = todayISO()) {
  return isOverdue(task, today) ? daysBetween(task.due_date, today) : 0;
}

export function isDueWithin(task, days, today = todayISO()) {
  if (!task.due_date || task.status === 'done') return false;
  return task.due_date >= today && task.due_date <= addDays(today, days - 1);
}

// Oldest overdue first.
export function overdueTasks(tasks, today = todayISO()) {
  return tasks
    .filter((t) => isOverdue(t, today))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

// ---------------------------------------------------------------------
// Progress (FR-07) — a group task counts once.
// ---------------------------------------------------------------------
export function projectProgress(tasks) {
  if (!tasks.length) return 0;
  const done = tasks.filter((t) => t.status === 'done').length;
  return Math.round((done / tasks.length) * 100);
}

export function countByStatus(tasks) {
  const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0]));
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
  return counts;
}

// Workload per member (FR-24) — a group task counts for each member.
// assignees: [{ task_id, user_id }]
export function workloadByUser(tasks, assignees, today = todayISO()) {
  const open = new Map(tasks.filter((t) => t.status !== 'done').map((t) => [t.id, t]));
  const result = {};
  for (const a of assignees) {
    const task = open.get(a.task_id);
    if (!task) continue;
    const row = (result[a.user_id] ??= { open: 0, overdue: 0 });
    row.open += 1;
    if (isOverdue(task, today)) row.overdue += 1;
  }
  return result;
}

// Workload totals per job title (developer / analyst / tester), using the
// per-person rows from workloadByUser. Only active team members count.
export function workloadByJob(people, workload) {
  const totals = Object.fromEntries(JOB_TITLES.map((j) => [j, { people: 0, open: 0, overdue: 0 }]));
  for (const person of people) {
    if (person.role !== 'member' || !person.is_active || !totals[person.job_title]) continue;
    const row = totals[person.job_title];
    row.people += 1;
    row.open += workload[person.id]?.open ?? 0;
    row.overdue += workload[person.id]?.overdue ?? 0;
  }
  return totals;
}

export function isTeamMember(person) {
  return person?.role === 'member';
}

export function groupAssignees(assignees) {
  const map = {};
  for (const a of assignees) (map[a.task_id] ??= []).push(a.user_id);
  return map;
}

// ---------------------------------------------------------------------
// Permissions — mirror of the RLS rules, used only to shape the UI.
// The database remains the real gatekeeper.
// ---------------------------------------------------------------------
export function canManageProject(user, project, memberIds = []) {
  if (!user || !project || !user.is_active) return false;
  if (user.role === 'admin') return true;
  if (project.manager_id === user.id) return true;
  return user.role === 'pm' && memberIds.includes(user.id);
}

export function canCreateProject(user) {
  return Boolean(user?.is_active) && (user.role === 'admin' || user.role === 'pm');
}

export function canMoveTask(user, project, memberIds, assigneeIds) {
  return canManageProject(user, project, memberIds) || assigneeIds.includes(user?.id);
}

// Members may only create tasks assigned to themselves.
export function allowedAssignees(user, project, memberIds) {
  return canManageProject(user, project, memberIds) ? memberIds : memberIds.filter((id) => id === user?.id);
}

// ---------------------------------------------------------------------
// Validation (US-01, US-02)
// ---------------------------------------------------------------------
export function validateProject({ name, start_date, end_date }) {
  const errors = {};
  if (!name || !name.trim()) errors.name = 'required';
  if (!end_date) errors.end_date = 'required';
  else if (start_date && end_date < start_date) errors.end_date = 'endBeforeStart';
  return errors;
}

export function validateTask({ title, assignees }) {
  const errors = {};
  if (!title || !title.trim()) errors.title = 'required';
  if (!assignees || assignees.length === 0) errors.assignees = 'atLeastOneAssignee';
  return errors;
}

export function validatePassword(password, confirm) {
  if (!password || password.length < 8) return 'passwordTooShort';
  if (confirm !== undefined && password !== confirm) return 'passwordMismatch';
  return null;
}

// ---------------------------------------------------------------------
// Filtering & sorting for the list view (FR-16) and "My tasks" (FR-17)
// ---------------------------------------------------------------------
export function filterTasks(tasks, filters, assigneeMap = {}, today = todayISO()) {
  const { assignee, status, priority, due, query } = filters;
  const q = query?.trim().toLowerCase();
  return tasks.filter((t) => {
    if (assignee && !(assigneeMap[t.id] ?? []).includes(assignee)) return false;
    if (status && t.status !== status) return false;
    if (priority && t.priority !== priority) return false;
    if (due === 'overdue' && !isOverdue(t, today)) return false;
    if (due === 'week' && !isDueWithin(t, 7, today)) return false;
    if (due === 'none' && t.due_date) return false;
    if (q && !t.title.toLowerCase().includes(q)) return false;
    return true;
  });
}

const SORTERS = {
  due_date: (a, b) => (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31'),
  priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  status: (a, b) => TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status),
  title: (a, b) => a.title.localeCompare(b.title, 'ar'),
};

export function sortTasks(tasks, key = 'due_date', dir = 'asc') {
  const cmp = SORTERS[key] ?? SORTERS.due_date;
  const sign = dir === 'desc' ? -1 : 1;
  return [...tasks].sort((a, b) => sign * cmp(a, b) || SORTERS.due_date(a, b));
}

// ---------------------------------------------------------------------
// @mentions (FR-19) — stored in the comment body as @[Full Name](uuid)
// ---------------------------------------------------------------------
const MENTION_RE = /@\[([^\]]*)\]\(([0-9a-fA-F-]{36})\)/g;

export function mentionToken(user) {
  return `@[${user.full_name.replace(/[[\]]/g, '')}](${user.id})`;
}

export function parseMentions(body) {
  const parts = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    if (m.index > last) parts.push({ type: 'text', text: body.slice(last, m.index) });
    parts.push({ type: 'mention', name: m[1], userId: m[2] });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ type: 'text', text: body.slice(last) });
  return parts;
}

export function mentionedUserIds(body) {
  return [...new Set([...body.matchAll(MENTION_RE)].map((m) => m[2]))];
}

// Returns the partial name after an "@" right before the caret, or null.
export function activeMentionQuery(text, caret) {
  const before = text.slice(0, caret);
  const m = before.match(/(?:^|\s)@([^\s@[\]]{0,30})$/);
  return m ? { query: m[1], start: caret - m[1].length - 1 } : null;
}

export function insertMention(text, start, caret, user) {
  const token = mentionToken(user) + ' ';
  return { text: text.slice(0, start) + token + text.slice(caret), caret: start + token.length };
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

// ---------------------------------------------------------------------
// Reports (FR-26) — one project, or a summary over several.
// ---------------------------------------------------------------------
export function buildProjectReport(project, tasks, assignees, today = todayISO()) {
  const own = tasks.filter((t) => t.project_id === project.id);
  const ids = new Set(own.map((t) => t.id));
  const ownAssignees = assignees.filter((a) => ids.has(a.task_id));
  const assigneeMap = groupAssignees(ownAssignees);

  const byMember = {};
  for (const a of ownAssignees) {
    const task = own.find((t) => t.id === a.task_id);
    const row = (byMember[a.user_id] ??= { userId: a.user_id, total: 0, done: 0, open: 0, overdue: 0 });
    row.total += 1;
    if (task.status === 'done') row.done += 1;
    else row.open += 1;
    if (isOverdue(task, today)) row.overdue += 1;
  }

  return {
    project,
    total: own.length,
    progress: projectProgress(own),
    counts: countByStatus(own),
    overdue: overdueTasks(own, today).map((t) => ({ ...t, daysLate: daysOverdue(t, today) })),
    byMember: Object.values(byMember).sort((a, b) => b.open - a.open || b.total - a.total),
    tasks: sortTasks(own, 'due_date'),
    assigneeMap,
  };
}

export function summarizeReports(reports) {
  const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0]));
  let total = 0;
  let overdue = 0;
  for (const r of reports) {
    total += r.total;
    overdue += r.overdue.length;
    for (const s of TASK_STATUSES) counts[s] += r.counts[s];
  }
  return { projects: reports.length, total, overdue, counts, progress: total ? Math.round((counts.done / total) * 100) : 0 };
}

// CSV for Excel: quoted cells and a BOM so Arabic opens correctly.
export function toCsv(rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
