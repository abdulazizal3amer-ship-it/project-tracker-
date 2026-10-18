import { describe, expect, it } from 'vitest';
import {
  activeMentionQuery,
  addDays,
  allowedAssignees,
  canCreateProject,
  canManageProject,
  canMoveTask,
  countByStatus,
  daysBetween,
  daysOverdue,
  filterTasks,
  groupAssignees,
  initials,
  insertMention,
  isDueWithin,
  isOverdue,
  isTeamMember,
  mentionToken,
  mentionedUserIds,
  overdueTasks,
  parseMentions,
  projectProgress,
  sortTasks,
  todayISO,
  validatePassword,
  validateProject,
  validateTask,
  workloadByJob,
  workloadByUser,
} from '../src/lib/logic.js';

const TODAY = '2026-10-18';
const U1 = '00000000-0000-0000-0000-0000000000c1';
const U2 = '00000000-0000-0000-0000-0000000000c2';

const task = (over) => ({ id: 't', title: 'Task', status: 'new', priority: 'medium', due_date: null, ...over });

describe('dates', () => {
  it('formats local dates', () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('counts days between dates', () => {
    expect(daysBetween('2026-10-01', TODAY)).toBe(17);
    expect(daysBetween(TODAY, TODAY)).toBe(0);
  });
});

describe('overdue (US-04)', () => {
  it('is overdue only when past due and not done', () => {
    expect(isOverdue(task({ due_date: '2026-10-17' }), TODAY)).toBe(true);
    expect(isOverdue(task({ due_date: '2026-10-17', status: 'done' }), TODAY)).toBe(false);
    expect(isOverdue(task({ due_date: TODAY }), TODAY)).toBe(false);
    expect(isOverdue(task({ due_date: null }), TODAY)).toBe(false);
  });
  it('reports days overdue', () => {
    expect(daysOverdue(task({ due_date: '2026-10-08' }), TODAY)).toBe(10);
    expect(daysOverdue(task({ due_date: '2026-10-20' }), TODAY)).toBe(0);
  });
  it('sorts overdue tasks oldest first', () => {
    const list = [
      task({ id: 'a', due_date: '2026-10-15' }),
      task({ id: 'b', due_date: '2026-10-01' }),
      task({ id: 'c', due_date: '2026-10-30' }),
      task({ id: 'd', due_date: '2026-09-01', status: 'done' }),
    ];
    expect(overdueTasks(list, TODAY).map((t) => t.id)).toEqual(['b', 'a']);
  });
  it('detects tasks due within N days', () => {
    expect(isDueWithin(task({ due_date: TODAY }), 7, TODAY)).toBe(true);
    expect(isDueWithin(task({ due_date: '2026-10-24' }), 7, TODAY)).toBe(true);
    expect(isDueWithin(task({ due_date: '2026-10-25' }), 7, TODAY)).toBe(false);
    expect(isDueWithin(task({ due_date: '2026-10-17' }), 7, TODAY)).toBe(false);
    expect(isDueWithin(task({ due_date: TODAY, status: 'done' }), 7, TODAY)).toBe(false);
  });
});

describe('progress and counts', () => {
  it('computes completion percentage (FR-07)', () => {
    expect(projectProgress([])).toBe(0);
    expect(projectProgress([task({ status: 'done' }), task(), task()])).toBe(33);
    expect(projectProgress([task({ status: 'done' })])).toBe(100);
  });
  it('counts tasks by status', () => {
    expect(countByStatus([task(), task({ status: 'done' }), task({ status: 'done' })])).toEqual({
      new: 1, in_progress: 0, in_review: 0, done: 2,
    });
  });
  it('counts a group task for every member, open tasks only', () => {
    const tasks = [
      task({ id: 'g', due_date: '2026-10-01' }),
      task({ id: 's' }),
      task({ id: 'x', status: 'done' }),
    ];
    const assignees = [
      { task_id: 'g', user_id: U1 },
      { task_id: 'g', user_id: U2 },
      { task_id: 's', user_id: U1 },
      { task_id: 'x', user_id: U2 },
    ];
    expect(workloadByUser(tasks, assignees, TODAY)).toEqual({
      [U1]: { open: 2, overdue: 1 },
      [U2]: { open: 1, overdue: 1 },
    });
    expect(groupAssignees(assignees)).toEqual({ g: [U1, U2], s: [U1], x: [U2] });
  });
});

describe('team workload by job title', () => {
  it('sums open and overdue tasks per job title for active team members', () => {
    const people = [
      { id: 'd1', role: 'member', job_title: 'developer', is_active: true },
      { id: 'd2', role: 'member', job_title: 'developer', is_active: true },
      { id: 't1', role: 'member', job_title: 'tester', is_active: true },
      { id: 'a0', role: 'member', job_title: 'analyst', is_active: false },
      { id: 'pm', role: 'pm', job_title: null, is_active: true },
    ];
    const workload = { d1: { open: 3, overdue: 1 }, d2: { open: 2, overdue: 0 }, a0: { open: 9, overdue: 9 }, pm: { open: 4, overdue: 4 } };
    expect(workloadByJob(people, workload)).toEqual({
      developer: { people: 2, open: 5, overdue: 1 },
      analyst: { people: 0, open: 0, overdue: 0 },
      tester: { people: 1, open: 0, overdue: 0 },
    });
  });
  it('identifies team members (no login)', () => {
    expect(isTeamMember({ role: 'member' })).toBe(true);
    expect(isTeamMember({ role: 'pm' })).toBe(false);
    expect(isTeamMember(undefined)).toBe(false);
  });
});

describe('permissions', () => {
  const admin = { id: 'a', role: 'admin', is_active: true };
  const pm = { id: 'p', role: 'pm', is_active: true };
  const otherPm = { id: 'p2', role: 'pm', is_active: true };
  const member = { id: U1, role: 'member', is_active: true };
  const project = { id: 'pr', manager_id: 'p' };
  const members = ['p', U1, U2];

  it('lets admins and the project manager manage', () => {
    expect(canManageProject(admin, project, [])).toBe(true);
    expect(canManageProject(pm, project, [])).toBe(true);
    expect(canManageProject(otherPm, project, ['p2'])).toBe(true);
    expect(canManageProject(otherPm, project, members)).toBe(false);
    expect(canManageProject(member, project, members)).toBe(false);
    expect(canManageProject({ ...admin, is_active: false }, project, [])).toBe(false);
    expect(canManageProject(null, project, [])).toBe(false);
  });
  it('only admins and PMs create projects', () => {
    expect(canCreateProject(admin)).toBe(true);
    expect(canCreateProject(pm)).toBe(true);
    expect(canCreateProject(member)).toBe(false);
  });
  it('lets assignees move their tasks (US-03)', () => {
    expect(canMoveTask(member, project, members, [U1, U2])).toBe(true);
    expect(canMoveTask(member, project, members, [U2])).toBe(false);
    expect(canMoveTask(pm, project, members, [U2])).toBe(true);
  });
  it('limits members to assigning themselves', () => {
    expect(allowedAssignees(member, project, members)).toEqual([U1]);
    expect(allowedAssignees(pm, project, members)).toEqual(members);
  });
});

describe('validation', () => {
  it('requires a project name and end date (US-01)', () => {
    expect(validateProject({ name: ' ', end_date: '' })).toEqual({ name: 'required', end_date: 'required' });
    expect(validateProject({ name: 'X', start_date: '2026-10-10', end_date: '2026-10-09' })).toEqual({ end_date: 'endBeforeStart' });
    expect(validateProject({ name: 'X', start_date: '2026-10-10', end_date: '2026-10-10' })).toEqual({});
    expect(validateProject({ name: 'X', end_date: '2026-10-10' })).toEqual({});
  });
  it('requires a title and at least one assignee (US-02)', () => {
    expect(validateTask({ title: '', assignees: [] })).toEqual({ title: 'required', assignees: 'atLeastOneAssignee' });
    expect(validateTask({ title: 'T', assignees: [U1] })).toEqual({});
  });
  it('enforces password rules (NFR-04)', () => {
    expect(validatePassword('short')).toBe('passwordTooShort');
    expect(validatePassword('longenough', 'different')).toBe('passwordMismatch');
    expect(validatePassword('longenough', 'longenough')).toBeNull();
    expect(validatePassword('longenough')).toBeNull();
  });
});

describe('filter and sort (FR-16)', () => {
  const tasks = [
    task({ id: '1', title: 'Homepage', status: 'new', priority: 'low', due_date: '2026-10-10' }),
    task({ id: '2', title: 'Logo', status: 'done', priority: 'urgent', due_date: '2026-10-19' }),
    task({ id: '3', title: 'API', status: 'in_progress', priority: 'high', due_date: '2026-10-20' }),
    task({ id: '4', title: 'Docs', status: 'new', priority: 'medium', due_date: null }),
  ];
  const map = { 1: [U1], 2: [U2], 3: [U1, U2], 4: [] };
  const ids = (list) => list.map((t) => t.id);

  it('filters by assignee, status, priority and due', () => {
    expect(ids(filterTasks(tasks, { assignee: U2 }, map, TODAY))).toEqual(['2', '3']);
    expect(ids(filterTasks(tasks, { status: 'new' }, map, TODAY))).toEqual(['1', '4']);
    expect(ids(filterTasks(tasks, { priority: 'high' }, map, TODAY))).toEqual(['3']);
    expect(ids(filterTasks(tasks, { due: 'overdue' }, map, TODAY))).toEqual(['1']);
    expect(ids(filterTasks(tasks, { due: 'week' }, map, TODAY))).toEqual(['3']);
    expect(ids(filterTasks(tasks, { due: 'none' }, map, TODAY))).toEqual(['4']);
    expect(ids(filterTasks(tasks, { query: 'log' }, map, TODAY))).toEqual(['2']);
    expect(ids(filterTasks(tasks, {}, map, TODAY))).toEqual(['1', '2', '3', '4']);
  });
  it('sorts by due date with empty dates last', () => {
    expect(ids(sortTasks(tasks, 'due_date'))).toEqual(['1', '2', '3', '4']);
    expect(ids(sortTasks(tasks, 'due_date', 'desc'))).toEqual(['4', '3', '2', '1']);
  });
  it('sorts by priority, status and title', () => {
    expect(ids(sortTasks(tasks, 'priority'))).toEqual(['2', '3', '4', '1']);
    expect(ids(sortTasks(tasks, 'status'))).toEqual(['1', '4', '3', '2']);
    expect(ids(sortTasks(tasks, 'title'))).toEqual(['3', '4', '1', '2']);
  });
});

describe('@mentions (FR-19)', () => {
  const sara = { id: U1, full_name: 'سارة [أحمد]' };

  it('builds and parses mention tokens', () => {
    const body = `Hi ${mentionToken(sara)} please review`;
    expect(body).toBe(`Hi @[سارة أحمد](${U1}) please review`);
    expect(parseMentions(body)).toEqual([
      { type: 'text', text: 'Hi ' },
      { type: 'mention', name: 'سارة أحمد', userId: U1 },
      { type: 'text', text: ' please review' },
    ]);
    expect(mentionedUserIds(`${body} ${mentionToken(sara)}`)).toEqual([U1]);
  });
  it('treats plain text and HTML as text', () => {
    expect(parseMentions('<b>x</b> a@b.com')).toEqual([{ type: 'text', text: '<b>x</b> a@b.com' }]);
  });
  it('detects the mention being typed', () => {
    expect(activeMentionQuery('hello @sa', 9)).toEqual({ query: 'sa', start: 6 });
    expect(activeMentionQuery('@', 1)).toEqual({ query: '', start: 0 });
    expect(activeMentionQuery('mail a@b', 8)).toBeNull();
    expect(activeMentionQuery('hello sa', 8)).toBeNull();
  });
  it('inserts the chosen user at the caret', () => {
    const result = insertMention('hi @sa done', 3, 6, { id: U2, full_name: 'Sam' });
    expect(result.text).toBe(`hi @[Sam](${U2})  done`);
    expect(result.caret).toBe(3 + `@[Sam](${U2}) `.length);
  });
  it('makes avatar initials', () => {
    expect(initials('Abdulaziz Al Amer')).toBe('AA');
    expect(initials('سارة')).toBe('س');
    expect(initials('')).toBe('?');
  });
});
