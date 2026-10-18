import { describe, expect, it } from 'vitest';
import { buildProjectReport, summarizeReports, toCsv } from '../src/lib/logic.js';

const TODAY = '2026-10-18';
const P = { id: 'p1', name: 'Website' };
const tasks = [
  { id: 'a', project_id: 'p1', title: 'A', status: 'done', priority: 'low', due_date: '2026-10-01' },
  { id: 'b', project_id: 'p1', title: 'B', status: 'in_progress', priority: 'high', due_date: '2026-10-10' },
  { id: 'c', project_id: 'p1', title: 'C', status: 'new', priority: 'medium', due_date: '2026-10-25' },
  { id: 'd', project_id: 'p1', title: 'D', status: 'new', priority: 'urgent', due_date: '2026-10-15' },
  { id: 'x', project_id: 'p2', title: 'X', status: 'new', priority: 'low', due_date: '2026-10-01' },
];
const assignees = [
  { task_id: 'a', user_id: 'dev' },
  { task_id: 'b', user_id: 'dev' },
  { task_id: 'b', user_id: 'qa' },
  { task_id: 'c', user_id: 'qa' },
  { task_id: 'x', user_id: 'dev' },
];

describe('project report', () => {
  const r = buildProjectReport(P, tasks, assignees, TODAY);

  it('counts only the project tasks', () => {
    expect(r.total).toBe(4);
    expect(r.progress).toBe(25);
    expect(r.counts).toEqual({ new: 2, in_progress: 1, in_review: 0, done: 1 });
  });
  it('lists overdue tasks oldest first with days late', () => {
    expect(r.overdue.map((t) => [t.id, t.daysLate])).toEqual([['b', 8], ['d', 3]]);
  });
  it('totals work per member, a group task counting for each', () => {
    expect(r.byMember).toEqual([
      { userId: 'qa', total: 2, done: 0, open: 2, overdue: 1 },
      { userId: 'dev', total: 2, done: 1, open: 1, overdue: 1 },
    ]);
    expect(r.assigneeMap.b).toEqual(['dev', 'qa']);
  });
  it('sorts tasks by due date', () => {
    expect(r.tasks.map((t) => t.id)).toEqual(['a', 'b', 'd', 'c']);
  });
});

describe('summary over selected projects', () => {
  it('adds up totals and computes overall progress', () => {
    const reports = [
      buildProjectReport(P, tasks, assignees, TODAY),
      buildProjectReport({ id: 'p2', name: 'Other' }, tasks, assignees, TODAY),
    ];
    expect(summarizeReports(reports)).toEqual({
      projects: 2, total: 5, overdue: 3, progress: 20,
      counts: { new: 3, in_progress: 1, in_review: 0, done: 1 },
    });
    expect(summarizeReports([])).toEqual({ projects: 0, total: 0, overdue: 0, progress: 0, counts: { new: 0, in_progress: 0, in_review: 0, done: 0 } });
  });
});

describe('csv', () => {
  it('quotes cells that need it and starts with a BOM', () => {
    expect(toCsv([['اسم', 'a,b'], ['say "hi"', null]])).toBe('﻿اسم,"a,b"\r\n"say ""hi""",');
  });
});
