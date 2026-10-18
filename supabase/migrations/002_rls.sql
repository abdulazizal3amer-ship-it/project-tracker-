-- =====================================================================
-- 002_rls.sql — Row Level Security (NFR-05)
-- Every table is protected inside the database, not in the browser.
-- A deactivated user (is_active = false) sees nothing.
-- =====================================================================

alter table public.users            enable row level security;
alter table public.groups           enable row level security;
alter table public.group_members    enable row level security;
alter table public.projects         enable row level security;
alter table public.project_members  enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_assignees   enable row level security;
alter table public.subtasks         enable row level security;
alter table public.comments         enable row level security;
alter table public.attachments      enable row level security;
alter table public.activity_log     enable row level security;
alter table public.notifications    enable row level security;
alter table public.login_attempts   enable row level security;  -- no policies: RPC only

-- users ---------------------------------------------------------------
create policy users_select on public.users for select to authenticated
  using (public.is_active_user());
create policy users_update on public.users for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
-- inserts come from the auth trigger; no deletes (deactivate instead).

-- groups ----------------------------------------------------------------
create policy groups_select on public.groups for select to authenticated
  using (public.is_active_user());
create policy groups_write on public.groups for all to authenticated
  using (public.current_role_of() in ('admin', 'pm'))
  with check (public.current_role_of() in ('admin', 'pm'));

create policy group_members_select on public.group_members for select to authenticated
  using (public.is_active_user());
create policy group_members_write on public.group_members for all to authenticated
  using (public.current_role_of() in ('admin', 'pm'))
  with check (public.current_role_of() in ('admin', 'pm'));

-- projects --------------------------------------------------------------
-- manager_id is checked on the row itself so INSERT … RETURNING works
-- (the helper's snapshot cannot see a row inserted by the same statement).
create policy projects_select on public.projects for select to authenticated
  using ((manager_id = auth.uid() and public.is_active_user()) or public.is_project_member(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_admin() or (public.current_role_of() = 'pm' and manager_id = auth.uid()));
create policy projects_update on public.projects for update to authenticated
  using (public.can_manage_project(id))
  with check (public.can_manage_project(id));
-- no delete policy: projects are archived, never deleted.

create policy project_members_select on public.project_members for select to authenticated
  using (public.is_project_member(project_id));
create policy project_members_insert on public.project_members for insert to authenticated
  with check (public.can_manage_project(project_id));
create policy project_members_delete on public.project_members for delete to authenticated
  using (public.can_manage_project(project_id)
         and user_id <> (select manager_id from public.projects where id = project_id));

-- tasks -----------------------------------------------------------------
create policy tasks_select on public.tasks for select to authenticated
  using (public.is_project_member(project_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.is_project_member(project_id)
    and exists (select 1 from public.projects p where p.id = project_id and p.status <> 'archived'));
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_manage_project(project_id) or public.is_task_assignee(id))
  with check (public.can_manage_project(project_id) or public.is_task_assignee(id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.can_manage_project(project_id));

-- task_assignees: managers assign anyone in the project; a member may
-- only assign themselves to a task they created.
create policy task_assignees_select on public.task_assignees for select to authenticated
  using (public.is_project_member(public.task_project(task_id)));
create policy task_assignees_insert on public.task_assignees for insert to authenticated
  with check (
    public.can_manage_project(public.task_project(task_id))
    or (user_id = auth.uid()
        and public.is_project_member(public.task_project(task_id))
        and exists (select 1 from public.tasks t where t.id = task_id and t.created_by = auth.uid())));
create policy task_assignees_delete on public.task_assignees for delete to authenticated
  using (public.can_manage_project(public.task_project(task_id)));

-- subtasks --------------------------------------------------------------
create policy subtasks_select on public.subtasks for select to authenticated
  using (public.is_project_member(public.task_project(task_id)));
create policy subtasks_write on public.subtasks for all to authenticated
  using (public.can_manage_project(public.task_project(task_id)) or public.is_task_assignee(task_id))
  with check (public.can_manage_project(public.task_project(task_id)) or public.is_task_assignee(task_id));

-- comments --------------------------------------------------------------
create policy comments_select on public.comments for select to authenticated
  using (public.is_project_member(public.task_project(task_id)));
create policy comments_insert on public.comments for insert to authenticated
  with check (user_id = auth.uid() and public.is_project_member(public.task_project(task_id)));
create policy comments_delete on public.comments for delete to authenticated
  using (user_id = auth.uid() or public.can_manage_project(public.task_project(task_id)));

-- attachments -----------------------------------------------------------
create policy attachments_select on public.attachments for select to authenticated
  using (public.is_project_member(public.task_project(task_id)));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and public.is_project_member(public.task_project(task_id)));
create policy attachments_delete on public.attachments for delete to authenticated
  using (uploaded_by = auth.uid() or public.can_manage_project(public.task_project(task_id)));

-- activity_log: read-only for project members; written by triggers.
create policy activity_select on public.activity_log for select to authenticated
  using (public.is_project_member(public.task_project(task_id)));

-- notifications: private to their recipient.
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid() and public.is_active_user());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());

-- Users may only flip is_read on their notifications.
revoke update on public.notifications from authenticated;
grant update (is_read) on public.notifications to authenticated;

-- Function privileges --------------------------------------------------
revoke execute on function public.notify_due_soon() from public, anon, authenticated;
revoke execute on function public.register_login_success() from public, anon;
revoke execute on function public.create_task(uuid, text, text, public.task_priority, date, uuid[]) from public, anon;
revoke execute on function public.set_task_assignees(uuid, uuid[]) from public, anon;
grant execute on function public.login_lock_status(text) to anon, authenticated;
grant execute on function public.register_login_failure(text) to anon, authenticated;
grant execute on function public.register_login_success() to authenticated;
grant execute on function public.create_task(uuid, text, text, public.task_priority, date, uuid[]) to authenticated;
grant execute on function public.set_task_assignees(uuid, uuid[]) to authenticated;
