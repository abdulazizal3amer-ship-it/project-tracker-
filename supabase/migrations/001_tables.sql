-- =====================================================================
-- 001_tables.sql — جداول نظام إدارة المشاريع والمهام
-- Tables, enums, business-rule triggers and RPCs.
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.user_role       as enum ('admin', 'pm', 'member');
create type public.project_status  as enum ('active', 'on_hold', 'completed', 'archived');
create type public.task_status     as enum ('new', 'in_progress', 'in_review', 'done');
create type public.task_priority   as enum ('low', 'medium', 'high', 'urgent');

-- ---------------------------------------------------------------------
-- users — linked 1:1 to auth.users (same id). Passwords live in
-- Supabase Auth (bcrypt), never here.
-- ---------------------------------------------------------------------
create table public.users (
  id                    uuid primary key references auth.users (id) on delete cascade,
  full_name             text not null check (length(trim(full_name)) > 0),
  email                 text not null unique,
  role                  public.user_role not null default 'member',
  language              text not null default 'ar' check (language in ('ar', 'en')),
  avatar_url            text,
  is_active             boolean not null default true,
  must_change_password  boolean not null default true,
  last_login_at         timestamptz,
  created_at            timestamptz not null default now()
);

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references public.users (id),
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.users (id) on delete cascade,
  primary key (group_id, user_id)
);

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) > 0),
  description  text,
  start_date   date,
  end_date     date not null,
  status       public.project_status not null default 'active',
  manager_id   uuid not null references public.users (id),
  created_at   timestamptz not null default now(),
  constraint projects_dates_chk check (start_date is null or end_date >= start_date)
);

create table public.project_members (
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references public.users (id) on delete cascade,
  added_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  title         text not null check (length(trim(title)) > 0),
  description   text,
  status        public.task_status not null default 'new',
  priority      public.task_priority not null default 'medium',
  due_date      date,
  created_by    uuid not null references public.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz,
  completed_by  uuid references public.users (id)
);

create table public.task_assignees (
  task_id      uuid not null references public.tasks (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  assigned_by  uuid references public.users (id),
  assigned_at  timestamptz not null default now(),
  primary key (task_id, user_id)
);

create table public.subtasks (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  title        text not null,
  assignee_id  uuid references public.users (id),
  is_done      boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid not null references public.users (id),
  body        text not null check (length(trim(body)) > 0 and length(body) <= 5000),
  created_at  timestamptz not null default now()
);

create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks (id) on delete cascade,
  file_name     text not null,
  storage_path  text not null,
  size          bigint not null check (size <= 5 * 1024 * 1024),
  uploaded_by   uuid not null references public.users (id),
  created_at    timestamptz not null default now()
);

create table public.activity_log (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  user_id     uuid references public.users (id),
  action      text not null,
  old_value   text,
  new_value   text,
  created_at  timestamptz not null default now()
);

create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.users (id) on delete cascade,
  type        text not null check (type in ('assigned', 'mention', 'comment', 'status', 'due_soon', 'member_removed')),
  task_id     uuid references public.tasks (id) on delete cascade,
  actor_id    uuid references public.users (id),
  message     text not null,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Failed sign-in tracking for the 5-attempt lockout (NFR-04).
create table public.login_attempts (
  email         text primary key,
  failed_count  int not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);

create index tasks_project_idx          on public.tasks (project_id);
create index tasks_due_idx              on public.tasks (due_date) where status <> 'done';
create index task_assignees_user_idx    on public.task_assignees (user_id);
create index project_members_user_idx   on public.project_members (user_id);
create index comments_task_idx          on public.comments (task_id, created_at);
create index activity_task_idx          on public.activity_log (task_id, created_at);
create index notifications_user_idx     on public.notifications (user_id, is_read, created_at desc);

-- ---------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so RLS policies can call them
-- without recursing into the tables they protect).
-- ---------------------------------------------------------------------
create or replace function public.current_role_of()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid() and is_active
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and is_active)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role_of() = 'admin', false)
$$;

create or replace function public.is_project_member(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user() and (
    public.is_admin()
    or exists (select 1 from public.project_members where project_id = p_project and user_id = auth.uid())
    or exists (select 1 from public.projects where id = p_project and manager_id = auth.uid())
  )
$$;

-- Admin, the project's manager, or a PM-role user who is a member of it.
create or replace function public.can_manage_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user() and (
    public.is_admin()
    or exists (select 1 from public.projects where id = p_project and manager_id = auth.uid())
    or (public.current_role_of() = 'pm'
        and exists (select 1 from public.project_members where project_id = p_project and user_id = auth.uid()))
  )
$$;

create or replace function public.is_task_assignee(p_task uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.task_assignees where task_id = p_task and user_id = auth.uid())
$$;

create or replace function public.task_project(p_task uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from public.tasks where id = p_task
$$;

create or replace function public.user_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select full_name from public.users where id = p_user
$$;

-- ---------------------------------------------------------------------
-- New auth user → public.users row. Role comes from app_metadata, which
-- only the service role (create-user Edge Function) can set.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, full_name, email, role, language)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    lower(new.email),
    coalesce((new.raw_app_meta_data ->> 'role')::public.user_role, 'member'),
    coalesce(new.raw_user_meta_data ->> 'language', 'ar')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Only admins may change role / is_active / email; users may only clear
-- their own must_change_password flag (never set it back for others).
create or replace function public.guard_user_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then  -- service role / SQL editor
    return new;
  end if;
  if not public.is_admin() then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.email is distinct from old.email then
      raise exception 'only admin can change role, status or email' using errcode = '42501';
    end if;
    if new.must_change_password and not old.must_change_password then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;
  -- An admin cannot lock themselves out.
  if new.id = auth.uid() and (new.role <> 'admin' or not new.is_active) and old.role = 'admin' then
    raise exception 'admin cannot demote or deactivate themselves' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger users_guard_update
  before update on public.users
  for each row execute function public.guard_user_update();

-- ---------------------------------------------------------------------
-- Projects: manager is always a member.
-- ---------------------------------------------------------------------
create or replace function public.add_manager_as_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, user_id)
  values (new.id, new.manager_id)
  on conflict do nothing;
  return new;
end $$;

create trigger projects_manager_member
  after insert or update of manager_id on public.projects
  for each row execute function public.add_manager_as_member();

-- Removing a member from a project removes them from its open tasks and
-- alerts the project manager (business rule, section 5).
create or replace function public.on_project_member_removed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_manager uuid;
  v_count   int;
begin
  select manager_id into v_manager from public.projects where id = old.project_id;
  if v_manager is null then
    return old;  -- project itself is being deleted
  end if;

  with removed as (
    delete from public.task_assignees ta
    using public.tasks t
    where ta.task_id = t.id
      and t.project_id = old.project_id
      and t.status <> 'done'
      and ta.user_id = old.user_id
    returning ta.task_id
  )
  select count(*) into v_count from removed;

  if v_count > 0 and v_manager <> old.user_id then
    insert into public.notifications (user_id, type, actor_id, message)
    values (v_manager, 'member_removed', auth.uid(),
            public.user_name(old.user_id) || ' — ' || v_count || ' task(s) left without this assignee');
  end if;
  return old;
end $$;

create trigger project_members_removed
  after delete on public.project_members
  for each row execute function public.on_project_member_removed();

-- ---------------------------------------------------------------------
-- Tasks: field-level guard, completion stamp, activity log, notifications
-- ---------------------------------------------------------------------
create or replace function public.guard_task_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.can_manage_project(old.project_id) then
    return new;
  end if;
  -- Assignees (members) may only move the status.
  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.priority is distinct from old.priority
     or new.due_date is distinct from old.due_date
     or new.project_id is distinct from old.project_id
     or new.created_by is distinct from old.created_by then
    raise exception 'members can only change the status of their tasks' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger tasks_guard_update
  before update on public.tasks
  for each row execute function public.guard_task_update();

create or replace function public.stamp_task()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
    new.completed_by := auth.uid();
  elsif new.status <> 'done' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end $$;

create trigger tasks_stamp
  before insert or update on public.tasks
  for each row execute function public.stamp_task();

create or replace function public.log_task_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (task_id, user_id, action, new_value)
    values (new.id, auth.uid(), 'created', new.title);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.activity_log (task_id, user_id, action, old_value, new_value)
    values (new.id, auth.uid(), 'status', old.status::text, new.status::text);

    insert into public.notifications (user_id, type, task_id, actor_id, message)
    select ta.user_id, 'status', new.id, auth.uid(), new.title || ': ' || new.status::text
    from public.task_assignees ta
    where ta.task_id = new.id and ta.user_id is distinct from auth.uid();
  end if;
  if new.title is distinct from old.title then
    insert into public.activity_log (task_id, user_id, action, old_value, new_value)
    values (new.id, auth.uid(), 'title', old.title, new.title);
  end if;
  if new.priority is distinct from old.priority then
    insert into public.activity_log (task_id, user_id, action, old_value, new_value)
    values (new.id, auth.uid(), 'priority', old.priority::text, new.priority::text);
  end if;
  if new.due_date is distinct from old.due_date then
    insert into public.activity_log (task_id, user_id, action, old_value, new_value)
    values (new.id, auth.uid(), 'due_date', old.due_date::text, new.due_date::text);
  end if;
  return new;
end $$;

create trigger tasks_log
  after insert or update on public.tasks
  for each row execute function public.log_task_changes();

-- Assignees must be members of the task's project.
create or replace function public.check_assignee_member()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_project uuid := public.task_project(new.task_id);
begin
  if not exists (select 1 from public.project_members where project_id = v_project and user_id = new.user_id) then
    raise exception 'assignee must be a member of the project' using errcode = '23514';
  end if;
  if not exists (select 1 from public.users where id = new.user_id and is_active) then
    raise exception 'cannot assign a deactivated user' using errcode = '23514';
  end if;
  new.assigned_by := coalesce(new.assigned_by, auth.uid());
  return new;
end $$;

create trigger task_assignees_check
  before insert on public.task_assignees
  for each row execute function public.check_assignee_member();

create or replace function public.on_assignee_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (task_id, user_id, action, new_value)
    values (new.task_id, auth.uid(), 'assigned', public.user_name(new.user_id));
    if new.user_id is distinct from auth.uid() then
      insert into public.notifications (user_id, type, task_id, actor_id, message)
      select new.user_id, 'assigned', new.task_id, auth.uid(), t.title
      from public.tasks t where t.id = new.task_id;
    end if;
    return new;
  end if;
  if exists (select 1 from public.tasks where id = old.task_id) then
    insert into public.activity_log (task_id, user_id, action, old_value)
    values (old.task_id, auth.uid(), 'unassigned', public.user_name(old.user_id));
  end if;
  return old;
end $$;

create trigger task_assignees_changed
  after insert or delete on public.task_assignees
  for each row execute function public.on_assignee_change();

-- ---------------------------------------------------------------------
-- Comments: notify assignees, and @mentions. Mentions are stored in the
-- body as @[Full Name](user-uuid).
-- ---------------------------------------------------------------------
create or replace function public.on_comment_created()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_project  uuid := public.task_project(new.task_id);
  v_title    text;
  v_mentions uuid[];
begin
  select title into v_title from public.tasks where id = new.task_id;

  select coalesce(array_agg(distinct m[1]::uuid), '{}')
  into v_mentions
  from regexp_matches(new.body, '@\[[^\]]*\]\(([0-9a-fA-F-]{36})\)', 'g') as m;

  insert into public.notifications (user_id, type, task_id, actor_id, message)
  select pm.user_id, 'mention', new.task_id, new.user_id, v_title
  from public.project_members pm
  where pm.project_id = v_project
    and pm.user_id = any (v_mentions)
    and pm.user_id <> new.user_id;

  insert into public.notifications (user_id, type, task_id, actor_id, message)
  select ta.user_id, 'comment', new.task_id, new.user_id, v_title
  from public.task_assignees ta
  where ta.task_id = new.task_id
    and ta.user_id <> new.user_id
    and not (ta.user_id = any (v_mentions));

  return new;
end $$;

create trigger comments_created
  after insert on public.comments
  for each row execute function public.on_comment_created();

-- ---------------------------------------------------------------------
-- RPC: create a task with its assignees in one transaction (FR-08/09).
-- SECURITY INVOKER: RLS still applies to every insert.
-- ---------------------------------------------------------------------
create or replace function public.create_task(
  p_project     uuid,
  p_title       text,
  p_description text,
  p_priority    public.task_priority,
  p_due_date    date,
  p_assignees   uuid[]
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_task uuid;
  v_uid  uuid;
begin
  if p_assignees is null or cardinality(p_assignees) = 0 then
    raise exception 'at least one assignee is required' using errcode = '23514';
  end if;

  insert into public.tasks (project_id, title, description, priority, due_date, created_by)
  values (p_project, trim(p_title), nullif(trim(p_description), ''), coalesce(p_priority, 'medium'), p_due_date, auth.uid())
  returning id into v_task;

  foreach v_uid in array (select array_agg(distinct x) from unnest(p_assignees) as x) loop
    insert into public.task_assignees (task_id, user_id, assigned_by) values (v_task, v_uid, auth.uid());
  end loop;

  return v_task;
end $$;

-- Replace the assignee set of a task (managers only via RLS).
create or replace function public.set_task_assignees(p_task uuid, p_assignees uuid[])
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_assignees is null or cardinality(p_assignees) = 0 then
    raise exception 'at least one assignee is required' using errcode = '23514';
  end if;
  if not public.can_manage_project(public.task_project(p_task)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.task_assignees where task_id = p_task and not (user_id = any (p_assignees));
  insert into public.task_assignees (task_id, user_id, assigned_by)
  select p_task, x, auth.uid() from (select distinct unnest(p_assignees) as x) s
  on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------
-- Sign-in lockout (NFR-04): 5 failures → locked for 15 minutes.
-- Callable before sign-in (anon). Returns the lock expiry or null.
-- ---------------------------------------------------------------------
create or replace function public.login_lock_status(p_email text)
returns timestamptz language sql stable security definer set search_path = public as $$
  select locked_until from public.login_attempts
  where email = lower(trim(p_email)) and locked_until > now()
$$;

create or replace function public.register_login_failure(p_email text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_row public.login_attempts;
begin
  insert into public.login_attempts as la (email, failed_count, updated_at)
  values (lower(trim(p_email)), 1, now())
  on conflict (email) do update
    set failed_count = case when la.locked_until is not null and la.locked_until <= now() then 1
                            else la.failed_count + 1 end,
        locked_until = case when la.locked_until is not null and la.locked_until <= now() then null
                            else la.locked_until end,
        updated_at = now()
  returning * into v_row;

  if v_row.failed_count >= 5 and v_row.locked_until is null then
    update public.login_attempts
      set locked_until = now() + interval '15 minutes'
      where email = v_row.email
      returning * into v_row;
  end if;
  return v_row.locked_until;
end $$;

-- Called by a signed-in user after a successful sign-in.
create or replace function public.register_login_success()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  select email into v_email from public.users where id = auth.uid();
  delete from public.login_attempts where email = v_email;
  update public.users set last_login_at = now() where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- Due-soon notifications (FR-22). Scheduled daily in 003_cron.sql.
-- ---------------------------------------------------------------------
create or replace function public.notify_due_soon()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_count int;
begin
  insert into public.notifications (user_id, type, task_id, message)
  select ta.user_id, 'due_soon', t.id, t.title
  from public.tasks t
  join public.task_assignees ta on ta.task_id = t.id
  join public.projects p on p.id = t.project_id
  where t.status <> 'done'
    and p.status <> 'archived'
    and t.due_date = current_date + 1
    and not exists (
      select 1 from public.notifications n
      where n.user_id = ta.user_id and n.task_id = t.id and n.type = 'due_soon'
        and n.created_at > now() - interval '2 days');
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------
-- Realtime: push new notifications and task changes to clients.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications, public.tasks;
  end if;
end $$;
