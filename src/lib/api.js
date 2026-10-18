// Data access. Every call goes through RLS, so a query only ever returns
// what the signed-in user is allowed to see.
import { fetchAll, supabase } from './supabase.js';
import { attachmentPath } from './logic.js';

const TASK_COLUMNS =
  'id, project_id, title, description, status, priority, due_date, created_by, created_at, completed_at, completed_by, start_date, work_days';

function check({ data, error }) {
  if (error) throw error;
  return data;
}

// Users --------------------------------------------------------------
export async function listUsers() {
  return check(await supabase.from('users').select('*').order('full_name'));
}

export async function updateUser(id, changes) {
  return check(await supabase.from('users').update(changes).eq('id', id).select().single());
}

// Team members (developer / analyst / tester) have no sign-in account.
export async function createTeamMember({ full_name, job_title, email }) {
  return check(
    await supabase
      .from('users')
      .insert({
        full_name: full_name.trim(),
        job_title,
        email: email?.trim().toLowerCase() || null,
        role: 'member',
        must_change_password: false,
      })
      .select()
      .single(),
  );
}

export async function createUser(payload) {
  const { data, error } = await supabase.functions.invoke('create-user', { body: payload });
  if (error) {
    // The function replies with { error: code }; surface that code.
    let code = error.message;
    try {
      code = (await error.context.json()).error ?? code;
    } catch {
      /* not JSON */
    }
    throw new Error(code);
  }
  return data;
}

// Projects ------------------------------------------------------------
export async function listProjects() {
  return check(await supabase.from('projects').select('*').order('created_at', { ascending: false }));
}

export async function getProject(id) {
  return check(await supabase.from('projects').select('*').eq('id', id).maybeSingle());
}

export async function createProject({ members, ...project }) {
  const created = check(await supabase.from('projects').insert(project).select().single());
  const rows = [...new Set(members)].filter((u) => u !== created.manager_id).map((user_id) => ({ project_id: created.id, user_id }));
  if (rows.length) check(await supabase.from('project_members').insert(rows));
  return created;
}

export async function updateProject(id, changes) {
  return check(await supabase.from('projects').update(changes).eq('id', id).select().single());
}

export async function listProjectMembers(projectId) {
  const query = supabase.from('project_members').select('project_id, user_id');
  return check(await (projectId ? query.eq('project_id', projectId) : query));
}

export async function addProjectMembers(projectId, userIds) {
  if (!userIds.length) return;
  check(await supabase.from('project_members').insert(userIds.map((user_id) => ({ project_id: projectId, user_id }))));
}

export async function removeProjectMember(projectId, userId) {
  check(await supabase.from('project_members').delete().eq('project_id', projectId).eq('user_id', userId));
}

// Tasks ---------------------------------------------------------------
export async function listTasks({ projectId, taskIds } = {}) {
  return fetchAll(() => {
    let q = supabase.from('tasks').select(TASK_COLUMNS).order('created_at');
    if (projectId) q = q.eq('project_id', projectId);
    if (taskIds) q = q.in('id', taskIds);
    return q;
  });
}

export async function listAssignees({ projectId, userId } = {}) {
  if (projectId) {
    return fetchAll(() =>
      supabase.from('task_assignees').select('task_id, user_id, tasks!inner(project_id)').eq('tasks.project_id', projectId),
    ).then((rows) => rows.map(({ task_id, user_id }) => ({ task_id, user_id })));
  }
  return fetchAll(() => {
    const q = supabase.from('task_assignees').select('task_id, user_id');
    return userId ? q.eq('user_id', userId) : q;
  });
}

export async function listTaskAssignees(taskId) {
  const rows = check(await supabase.from('task_assignees').select('user_id').eq('task_id', taskId));
  return rows.map((r) => r.user_id);
}

export async function getTask(id) {
  return check(await supabase.from('tasks').select(TASK_COLUMNS).eq('id', id).maybeSingle());
}

export async function createTask({ project_id, title, description, priority, due_date, start_date, work_days, assignees }) {
  return check(
    await supabase.rpc('create_task', {
      p_project: project_id,
      p_title: title,
      p_description: description ?? '',
      p_priority: priority,
      p_due_date: due_date || null,
      p_assignees: assignees,
      p_start_date: start_date || null,
      p_work_days: work_days === '' || work_days == null ? null : Number(work_days),
    }),
  );
}

export async function updateTask(id, changes) {
  return check(await supabase.from('tasks').update(changes).eq('id', id).select(TASK_COLUMNS).single());
}

export async function setTaskAssignees(taskId, userIds) {
  check(await supabase.rpc('set_task_assignees', { p_task: taskId, p_assignees: userIds }));
}

export async function deleteTask(id) {
  check(await supabase.from('tasks').delete().eq('id', id));
}

// Comments & activity ---------------------------------------------------
export async function listComments(taskId) {
  return check(await supabase.from('comments').select('*').eq('task_id', taskId).order('created_at'));
}

export async function addComment(taskId, userId, body) {
  return check(await supabase.from('comments').insert({ task_id: taskId, user_id: userId, body }).select().single());
}

export async function listActivity(taskId) {
  return check(
    await supabase.from('activity_log').select('*').eq('task_id', taskId).order('created_at', { ascending: false }).limit(100),
  );
}

// Attachments ------------------------------------------------------------
const BUCKET = 'attachments';

export async function listAttachments({ projectId, taskId }) {
  let q = supabase.from('attachments').select('*').order('created_at', { ascending: false });
  q = taskId ? q.eq('task_id', taskId) : q.eq('project_id', projectId);
  return check(await q);
}

// Upload the file, then record it; remove the file again if recording fails.
export async function uploadAttachment({ projectId, taskId, file, userId }) {
  const path = attachmentPath(projectId, taskId, file.name, crypto.randomUUID());
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (upErr) throw upErr;
  const { data, error } = await supabase
    .from('attachments')
    .insert({
      project_id: projectId,
      task_id: taskId ?? null,
      file_name: file.name,
      storage_path: path,
      size: file.size,
      content_type: file.type || null,
      uploaded_by: userId,
    })
    .select()
    .single();
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return data;
}

// Short-lived signed link that downloads with the original file name.
export async function attachmentUrl(attachment, { download = true } = {}) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(attachment.storage_path, 60, download ? { download: attachment.file_name } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteAttachment(attachment) {
  const removed = check(await supabase.from('attachments').delete().eq('id', attachment.id).select('id'));
  if (!removed.length) throw Object.assign(new Error('forbidden'), { code: '42501' });
  await supabase.storage.from(BUCKET).remove([attachment.storage_path]);
}

// Notifications -----------------------------------------------------------
export async function listNotifications() {
  return check(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50));
}

export async function markNotificationsRead(ids) {
  if (!ids.length) return;
  check(await supabase.from('notifications').update({ is_read: true }).in('id', ids));
}

export function subscribe(channelName, table, filter, onChange) {
  const channel = supabase
    .channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
