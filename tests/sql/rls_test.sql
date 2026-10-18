-- =====================================================================
-- RLS and business-rule tests, one block per role scenario.
-- Every check raises (and stops the run) on failure.
-- =====================================================================
\set QUIET on
set client_min_messages = warning;

create schema test;
grant usage on schema test to authenticated, anon;

create function test.ok(cond boolean, name text) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', name; end if;
  raise notice 'ok - %', name;
end $$;

create function test.throws(stmt text, name text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok - % (%)', name, sqlerrm;
    return;
  end;
  raise exception 'FAIL (no error): %', name;
end $$;

create function test.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, false);
  execute 'set role authenticated';
end $$;
grant execute on all functions in schema test to authenticated, anon;

set client_min_messages = notice;

-- ---------------------------------------------------------------------
-- Fixtures (as superuser, like the create-user Edge Function would)
-- ---------------------------------------------------------------------
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@t.sa', '{"role":"admin"}', '{"full_name":"Admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'pm1@t.sa',   '{"role":"pm"}',    '{"full_name":"PM One"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'pm2@t.sa',   '{"role":"pm"}',    '{"full_name":"PM Two"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'm1@t.sa',    '{}',               '{"full_name":"سارة"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'm2@t.sa',    '{}',               '{"full_name":"خالد"}'),
  ('00000000-0000-0000-0000-0000000000c3', 'm3@t.sa',    '{}',               '{"full_name":"Outsider"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'd1@t.sa',    '{}',               '{"full_name":"Disabled"}');

\set ADMIN   '\'00000000-0000-0000-0000-00000000000a\''
\set PM1     '\'00000000-0000-0000-0000-0000000000b1\''
\set PM2     '\'00000000-0000-0000-0000-0000000000b2\''
\set M1      '\'00000000-0000-0000-0000-0000000000c1\''
\set M2      '\'00000000-0000-0000-0000-0000000000c2\''
\set M3      '\'00000000-0000-0000-0000-0000000000c3\''
\set D1      '\'00000000-0000-0000-0000-0000000000d1\''

select test.ok((select role from public.users where id = :ADMIN) = 'admin', 'auth trigger copies admin role from app_metadata');
select test.ok((select role from public.users where id = :M1) = 'member', 'role defaults to member');
select test.ok((select must_change_password from public.users where id = :M1), 'new users must change password');

-- ---------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------
select test.as_user(:M1);
select test.throws($$update public.users set role = 'admin' where id = auth.uid()$$, 'member cannot promote themselves');
update public.users set must_change_password = false, language = 'en' where id = auth.uid();
select test.ok((select not must_change_password from public.users where id = auth.uid()), 'member clears own must_change_password');
update public.users set full_name = 'hacked' where id = '00000000-0000-0000-0000-0000000000c2';
reset role;
select test.ok((select full_name from public.users where id = :M2) = 'خالد', 'member cannot edit another user');

select test.as_user(:ADMIN);
update public.users set is_active = false where id = '00000000-0000-0000-0000-0000000000d1';
select test.throws($$update public.users set role = 'member' where id = auth.uid()$$, 'admin cannot demote themselves');
reset role;
select test.ok((select not is_active from public.users where id = :D1), 'admin deactivates a user');

-- ---------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------
select test.as_user(:M1);
select test.throws($$insert into public.projects (name, end_date, manager_id) values ('x', current_date, auth.uid())$$,
                   'member cannot create a project');
reset role;

select test.as_user(:PM1);
select test.throws($$insert into public.projects (name, start_date, end_date, manager_id)
                     values ('bad', current_date, current_date - 1, auth.uid())$$, 'end date before start date rejected');
select test.throws($$insert into public.projects (name, end_date, manager_id)
                     values ('other', current_date, '00000000-0000-0000-0000-0000000000b2')$$, 'pm cannot create a project for another manager');
-- The app inserts with RETURNING (insert … select()); that must be readable.
with p as (insert into public.projects (name, end_date, manager_id)
           values ('Returning check', current_date, auth.uid()) returning id)
select test.ok(count(*) = 1, 'pm can read back the project it just created') from p;
insert into public.projects (id, name, start_date, end_date, manager_id)
values ('10000000-0000-0000-0000-000000000001', 'Website', current_date - 30, current_date + 30, auth.uid());
insert into public.project_members (project_id, user_id) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000d1');
select test.ok((select count(*) from public.project_members where project_id = '10000000-0000-0000-0000-000000000001') = 4,
               'manager auto-added as member');
reset role;

select test.as_user(:M3);
select test.ok((select count(*) from public.projects) = 0, 'outsider sees no projects');
reset role;
select test.as_user(:PM2);
select test.ok((select count(*) from public.projects) = 0, 'another pm does not see the project');
reset role;
select test.as_user(:M1);
select test.ok((select count(*) from public.projects) = 1, 'member sees their project');
reset role;
select test.as_user(:D1);
select test.ok((select count(*) from public.projects) = 0, 'deactivated user sees nothing');
select test.ok((select count(*) from public.users) = 0, 'deactivated user cannot list users');
reset role;
select test.as_user(:ADMIN);
select test.ok((select count(*) from public.projects) = 2, 'admin sees every project');
reset role;

-- ---------------------------------------------------------------------
-- Tasks & group assignment
-- ---------------------------------------------------------------------
select test.as_user(:PM1);
select test.throws($$select public.create_task('10000000-0000-0000-0000-000000000001', 't', null, 'high', current_date, '{}')$$,
                   'task needs at least one assignee');
select test.throws($$select public.create_task('10000000-0000-0000-0000-000000000001', 't', null, 'high', current_date,
                     array['00000000-0000-0000-0000-0000000000c3']::uuid[])$$, 'cannot assign outside the project');
select test.throws($$select public.create_task('10000000-0000-0000-0000-000000000001', 't', null, 'high', current_date,
                     array['00000000-0000-0000-0000-0000000000d1']::uuid[])$$, 'cannot assign a deactivated user');
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;
insert into ids values ('group', public.create_task('10000000-0000-0000-0000-000000000001', 'Design homepage', 'desc', 'high',
  current_date - 3, array['00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2']::uuid[]));
reset role;

select test.ok((select count(*) from public.task_assignees where task_id = (select id from ids where name = 'group')) = 2,
               'group task has two assignees');
select test.ok((select count(*) from public.notifications where type = 'assigned'
                and task_id = (select id from ids where name = 'group')) = 2, 'each assignee notified');

-- Member moves the shared status
select test.as_user(:M1);
update public.tasks set status = 'in_progress' where id = (select id from ids where name = 'group');
select test.throws($$update public.tasks set title = 'renamed' where id = (select id from ids where name = 'group')$$,
                   'assignee cannot edit fields other than status');
select test.ok((select count(*) from public.notifications) = 1, 'member sees only own notifications');
select test.throws($$update public.notifications set message = 'x'$$, 'notification message is read-only');
update public.notifications set is_read = true;
reset role;

select test.ok((select status from public.tasks where id = (select id from ids where name = 'group')) = 'in_progress',
               'shared status changed for everyone');
select test.ok(exists (select 1 from public.activity_log where action = 'status' and new_value = 'in_progress'
                       and user_id = :M1), 'status change logged with who changed it');
select test.ok(exists (select 1 from public.notifications where user_id = :M2 and type = 'status'), 'other assignee notified of status');
select test.ok(not exists (select 1 from public.notifications where user_id = :M1 and type = 'status'), 'actor not notified of own change');

-- Outsider and non-assignee cannot move it
select test.as_user(:M3);
update public.tasks set status = 'done' where id = (select id from ids where name = 'group');
reset role;
select test.ok((select status from public.tasks where id = (select id from ids where name = 'group')) = 'in_progress',
               'outsider cannot change status');

-- Member creating tasks: only for themselves
select test.as_user(:M1);
insert into ids values ('own', public.create_task('10000000-0000-0000-0000-000000000001', 'My own', null, 'low', null,
  array['00000000-0000-0000-0000-0000000000c1']::uuid[]));
select test.throws($$select public.create_task('10000000-0000-0000-0000-000000000001', 'For Khaled', null, 'low', null,
                     array['00000000-0000-0000-0000-0000000000c2']::uuid[])$$, 'member cannot assign others');
delete from public.tasks where id = (select id from ids where name = 'own');
select test.ok(exists (select 1 from public.tasks where id = (select id from ids where name = 'own')), 'member cannot delete a task');
select test.throws($$select public.set_task_assignees((select id from ids where name = 'group'),
                     array['00000000-0000-0000-0000-0000000000c1']::uuid[])$$, 'member cannot change assignees');
reset role;
select test.as_user(:M2);
update public.tasks set status = 'done' where id = (select id from ids where name = 'own');
reset role;
select test.ok((select status from public.tasks where id = (select id from ids where name = 'own')) = 'new',
               'non-assignee member cannot change status');

-- Completion stamp
select test.as_user(:M2);
update public.tasks set status = 'done' where id = (select id from ids where name = 'group');
reset role;
select test.ok((select completed_at is not null and completed_by = :M2 from public.tasks
                where id = (select id from ids where name = 'group')), 'completed_at / completed_by stamped');
select test.as_user(:PM1);
update public.tasks set status = 'in_review' where id = (select id from ids where name = 'group');
reset role;
select test.ok((select completed_at is null from public.tasks where id = (select id from ids where name = 'group')),
               'reopening clears completion stamp');

-- ---------------------------------------------------------------------
-- Comments and @mentions
-- ---------------------------------------------------------------------
select test.as_user(:M1);
insert into public.comments (task_id, user_id, body)
values ((select id from ids where name = 'own'), auth.uid(), 'please check @[PM One](00000000-0000-0000-0000-0000000000b1)');
select test.throws($$insert into public.comments (task_id, user_id, body)
                     values ((select id from ids where name = 'own'), '00000000-0000-0000-0000-0000000000c2', 'spoof')$$,
                   'cannot comment as someone else');
reset role;
select test.ok(exists (select 1 from public.notifications where user_id = :PM1 and type = 'mention'), 'mentioned user notified');
select test.as_user(:M3);
select test.throws($$insert into public.comments (task_id, user_id, body)
                     values ((select id from ids where name = 'own'), auth.uid(), 'hi')$$, 'outsider cannot comment');
select test.ok((select count(*) from public.comments) = 0, 'outsider cannot read comments');
reset role;

-- ---------------------------------------------------------------------
-- Removing a member strips them from open tasks and alerts the manager
-- ---------------------------------------------------------------------
select test.as_user(:PM1);
insert into ids values ('open', public.create_task('10000000-0000-0000-0000-000000000001', 'Open work', null, 'medium', null,
  array['00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2']::uuid[]));
update public.tasks set status = 'done' where id = (select id from ids where name = 'group');
delete from public.project_members where project_id = '10000000-0000-0000-0000-000000000001'
  and user_id = '00000000-0000-0000-0000-0000000000c2';
delete from public.project_members where project_id = '10000000-0000-0000-0000-000000000001'
  and user_id = auth.uid();
reset role;
select test.ok(not exists (select 1 from public.task_assignees where user_id = :M2
                           and task_id = (select id from ids where name = 'open')), 'removed member dropped from open task');
select test.ok(exists (select 1 from public.task_assignees where user_id = :M2
                       and task_id = (select id from ids where name = 'group')), 'removed member kept on completed task');
select test.ok(exists (select 1 from public.notifications where user_id = :PM1 and type = 'member_removed'), 'manager alerted');
select test.ok(exists (select 1 from public.project_members where user_id = :PM1), 'manager cannot be removed from own project');

-- ---------------------------------------------------------------------
-- Archive, never delete; PM deletes tasks
-- ---------------------------------------------------------------------
select test.as_user(:PM1);
delete from public.projects;
select test.ok((select count(*) from public.projects) = 2, 'projects cannot be deleted');
delete from public.tasks where id = (select id from ids where name = 'own');
select test.ok(not exists (select 1 from public.tasks where id = (select id from ids where name = 'own')), 'pm deletes a task');
update public.projects set status = 'archived';
select test.throws($$select public.create_task('10000000-0000-0000-0000-000000000001', 'late', null, 'low', null,
                     array['00000000-0000-0000-0000-0000000000c1']::uuid[])$$, 'no new tasks in archived project');
reset role;

-- ---------------------------------------------------------------------
-- Sign-in lockout
-- ---------------------------------------------------------------------
set role anon;
select test.ok(public.login_lock_status('m1@t.sa') is null, 'not locked initially');
select public.register_login_failure('M1@t.sa') from generate_series(1, 4);
select test.ok(public.login_lock_status('m1@t.sa') is null, 'four failures do not lock');
select test.ok(public.register_login_failure('m1@t.sa') > now(), 'fifth failure locks the account');
select test.ok(public.login_lock_status('m1@t.sa') > now(), 'lock reported');
select test.ok((select count(*) from public.login_attempts) = 0, 'anon cannot read login_attempts directly');
select test.throws($$select public.notify_due_soon()$$, 'anon cannot run the scheduler function');
select test.ok((select count(*) from public.users) = 0, 'anon sees no users');
reset role;

-- Due-soon notifications
update public.projects set status = 'active';
update public.tasks set due_date = current_date + 1 where id = (select id from ids where name = 'open');
select test.ok(public.notify_due_soon() = 1, 'due tomorrow notified once per assignee');
select test.ok(public.notify_due_soon() = 0, 'due-soon not duplicated');

\echo 'all RLS tests passed'
