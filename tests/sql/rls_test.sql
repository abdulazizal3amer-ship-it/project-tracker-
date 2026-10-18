-- =====================================================================
-- RLS and business-rule tests (migrations 001–004).
-- Only admins and PMs sign in; team members are records without login.
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

\set ADMIN   '\'00000000-0000-0000-0000-00000000000a\''
\set PM1     '\'00000000-0000-0000-0000-0000000000b1\''
\set PM2     '\'00000000-0000-0000-0000-0000000000b2\''
\set PM3     '\'00000000-0000-0000-0000-0000000000b3\''
\set M1      '\'00000000-0000-0000-0000-0000000000c1\''
\set M2      '\'00000000-0000-0000-0000-0000000000c2\''
\set M3      '\'00000000-0000-0000-0000-0000000000c3\''
\set D1      '\'00000000-0000-0000-0000-0000000000d1\''
\set P1      '\'10000000-0000-0000-0000-000000000001\''

-- ---------------------------------------------------------------------
-- System users come from Supabase Auth (as the create-user function does)
-- ---------------------------------------------------------------------
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  (:ADMIN, 'admin@t.sa', '{"role":"admin"}', '{"full_name":"Admin"}'),
  (:PM1,   'pm1@t.sa',   '{"role":"pm"}',    '{"full_name":"PM One"}'),
  (:PM2,   'pm2@t.sa',   '{"role":"pm"}',    '{"full_name":"PM Two"}'),
  (:PM3,   'pm3@t.sa',   '{}',               '{"full_name":"No role given"}');

select test.ok((select role from public.users where id = :ADMIN) = 'admin', 'auth trigger copies admin role');
select test.ok((select role from public.users where id = :PM3) = 'pm', 'auth accounts without a role become PMs, never members');
select test.ok((select must_change_password from public.users where id = :PM1), 'new system users must change password');

-- ---------------------------------------------------------------------
-- Team members: added by admin / PM, no login, job title required
-- ---------------------------------------------------------------------
select test.as_user(:PM1);
select test.throws($$insert into public.users (full_name, role) values ('No job', 'member')$$, 'team member needs a job title');
select test.throws($$insert into public.users (full_name, role, email) values ('Sneaky', 'pm', 'x@t.sa')$$, 'pm cannot create a system user directly');
insert into public.users (id, full_name, role, job_title, must_change_password) values
  (:M1, 'سارة', 'member', 'developer', false),
  (:M2, 'خالد', 'member', 'tester', false),
  (:M3, 'Outsider', 'member', 'analyst', false),
  (:D1, 'Disabled', 'member', 'developer', false);
select test.ok((select count(*) from public.users where role = 'member') = 4, 'pm adds team members');
update public.users set job_title = 'analyst' where id = :M2;
update public.users set is_active = false where id = :D1;
select test.throws($$update public.users set role = 'pm' where id = '00000000-0000-0000-0000-0000000000c1'$$, 'pm cannot promote a team member');
update public.users set full_name = 'hacked' where id = :PM2;
reset role;
select test.ok((select job_title from public.users where id = :M2) = 'analyst', 'pm edits a team member job title');
select test.ok((select not is_active from public.users where id = :D1), 'pm deactivates a team member');
select test.ok((select full_name from public.users where id = :PM2) = 'PM Two', 'pm cannot edit another pm');
update public.users set job_title = 'tester' where id = :M2;

select test.as_user(:ADMIN);
select test.throws($$update public.users set role = 'pm' where id = '00000000-0000-0000-0000-0000000000c1'$$, 'admin cannot turn a team member into a login user');
select test.throws($$update public.users set role = 'member', job_title = 'developer' where id = '00000000-0000-0000-0000-0000000000b3'$$, 'admin cannot turn a login user into a team member');
update public.users set role = 'admin' where id = :PM3;
update public.users set role = 'pm' where id = :PM3;
select test.throws($$update public.users set role = 'pm' where id = auth.uid()$$, 'admin cannot demote themselves');
reset role;
select test.ok((select role from public.users where id = :PM3) = 'pm', 'admin switches roles between admin and pm');

select test.as_user(:PM1);
select test.throws($$update public.users set role = 'admin' where id = auth.uid()$$, 'pm cannot promote themselves');
update public.users set must_change_password = false, language = 'en' where id = auth.uid();
select test.ok((select not must_change_password from public.users where id = auth.uid()), 'pm clears own must_change_password');
reset role;

-- A team member has no account; even with a forged session they see nothing.
select test.as_user(:M1);
select test.ok((select count(*) from public.users) = 0, 'team member session sees no users');
select test.throws($$insert into public.users (full_name, role, job_title) values ('x', 'member', 'tester')$$, 'team member cannot add people');
reset role;

-- ---------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------
select test.as_user(:PM1);
select test.throws($$insert into public.projects (name, start_date, end_date, manager_id)
                     values ('bad', current_date, current_date - 1, auth.uid())$$, 'end date before start date rejected');
select test.throws($$insert into public.projects (name, end_date, manager_id)
                     values ('other', current_date, '00000000-0000-0000-0000-0000000000b2')$$, 'pm cannot create a project for another manager');
with p as (insert into public.projects (name, end_date, manager_id)
           values ('Returning check', current_date, auth.uid()) returning id)
select test.ok(count(*) = 1, 'pm can read back the project it just created') from p;
insert into public.projects (id, name, start_date, end_date, manager_id)
values (:P1, 'Website', current_date - 30, current_date + 30, auth.uid());
insert into public.project_members (project_id, user_id) values (:P1, :M1), (:P1, :M2), (:P1, :D1);
select test.ok((select count(*) from public.project_members where project_id = :P1) = 4, 'manager auto-added as member');
reset role;

select test.as_user(:PM2);
select test.ok((select count(*) from public.projects) = 0, 'another pm does not see the project');
reset role;
select test.as_user(:M1);
select test.ok((select count(*) from public.projects) = 0, 'team member session sees no projects');
reset role;
select test.as_user(:ADMIN);
select test.ok((select count(*) from public.projects) = 2, 'admin sees every project');
reset role;

-- ---------------------------------------------------------------------
-- Tasks & group assignment
-- ---------------------------------------------------------------------
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated;

select test.as_user(:PM1);
select test.throws($$select public.create_task('10000000-0000-0000-0000-000000000001', 't', null, 'high', current_date, '{}')$$,
                   'task needs at least one assignee');
select test.throws($$select public.create_task('10000000-0000-0000-0000-000000000001', 't', null, 'high', current_date,
                     array['00000000-0000-0000-0000-0000000000c3']::uuid[])$$, 'cannot assign outside the project');
select test.throws($$select public.create_task('10000000-0000-0000-0000-000000000001', 't', null, 'high', current_date,
                     array['00000000-0000-0000-0000-0000000000d1']::uuid[])$$, 'cannot assign a deactivated member');
insert into ids values ('group', public.create_task(:P1, 'Design homepage', 'desc', 'high', current_date - 3,
  array[:M1, :M2]::uuid[]));
reset role;

select test.ok((select count(*) from public.task_assignees where task_id = (select id from ids where name = 'group')) = 2,
               'group task has two assignees');
select test.ok(not exists (select 1 from public.notifications where user_id in (:M1, :M2)),
               'no notifications stored for team members (they cannot sign in)');

-- Another PM who is not on the project cannot touch it
select test.as_user(:PM2);
update public.tasks set status = 'done' where id = (select id from ids where name = 'group');
delete from public.tasks where id = (select id from ids where name = 'group');
reset role;
select test.ok((select status from public.tasks where id = (select id from ids where name = 'group')) = 'new',
               'pm outside the project cannot change status');

-- Manager moves the status
select test.as_user(:PM1);
update public.tasks set status = 'in_progress' where id = (select id from ids where name = 'group');
update public.tasks set status = 'done' where id = (select id from ids where name = 'group');
reset role;
select test.ok(exists (select 1 from public.activity_log where action = 'status' and new_value = 'in_progress'
                       and user_id = :PM1), 'status change logged with who changed it');
select test.ok((select completed_at is not null and completed_by = :PM1 from public.tasks
                where id = (select id from ids where name = 'group')), 'completed_at / completed_by stamped');
select test.as_user(:PM1);
update public.tasks set status = 'in_review' where id = (select id from ids where name = 'group');
reset role;
select test.ok((select completed_at is null from public.tasks where id = (select id from ids where name = 'group')),
               'reopening clears completion stamp');

-- ---------------------------------------------------------------------
-- Comments and @mentions (between system users)
-- ---------------------------------------------------------------------
select test.as_user(:PM1);
insert into public.project_members (project_id, user_id) values (:P1, :PM2);
insert into public.comments (task_id, user_id, body)
values ((select id from ids where name = 'group'), auth.uid(), 'please check @[PM Two](00000000-0000-0000-0000-0000000000b2)');
select test.throws($$insert into public.comments (task_id, user_id, body)
                     values ((select id from ids where name = 'group'), '00000000-0000-0000-0000-0000000000b2', 'spoof')$$,
                   'cannot comment as someone else');
reset role;
select test.ok(exists (select 1 from public.notifications where user_id = :PM2 and type = 'mention'), 'mentioned pm notified');
select test.as_user(:PM3);
select test.throws($$insert into public.comments (task_id, user_id, body)
                     values ((select id from ids where name = 'group'), auth.uid(), 'hi')$$, 'pm outside the project cannot comment');
select test.ok((select count(*) from public.comments) = 0, 'pm outside the project cannot read comments');
reset role;
select test.as_user(:PM2);
select test.ok((select count(*) from public.notifications) = 1, 'pm sees only own notifications');
select test.throws($$update public.notifications set message = 'x'$$, 'notification message is read-only');
reset role;

-- ---------------------------------------------------------------------
-- Removing a member strips them from open tasks and alerts the manager
-- ---------------------------------------------------------------------
select test.as_user(:PM1);
insert into ids values ('open', public.create_task(:P1, 'Open work', null, 'medium', null, array[:M1, :M2]::uuid[]));
update public.tasks set status = 'done' where id = (select id from ids where name = 'group');
delete from public.project_members where project_id = :P1 and user_id = :M2;
delete from public.project_members where project_id = :P1 and user_id = auth.uid();
reset role;
select test.ok(not exists (select 1 from public.task_assignees where user_id = :M2
                           and task_id = (select id from ids where name = 'open')), 'removed member dropped from open task');
select test.ok(exists (select 1 from public.task_assignees where user_id = :M2
                       and task_id = (select id from ids where name = 'group')), 'removed member kept on completed task');
select test.ok(exists (select 1 from public.notifications where user_id = :PM1 and type = 'member_removed'), 'manager alerted');
select test.ok(exists (select 1 from public.project_members where user_id = :PM1 and project_id = :P1),
               'manager cannot be removed from own project');

-- ---------------------------------------------------------------------
-- Archive, never delete; PM deletes tasks
-- ---------------------------------------------------------------------
select test.as_user(:PM1);
delete from public.projects;
select test.ok((select count(*) from public.projects) = 2, 'projects cannot be deleted');
delete from public.tasks where id = (select id from ids where name = 'group');
select test.ok(not exists (select 1 from public.tasks where id = (select id from ids where name = 'group')), 'pm deletes a task');
update public.projects set status = 'archived' where id = :P1;
select test.throws($$select public.create_task('10000000-0000-0000-0000-000000000001', 'late', null, 'low', null,
                     array['00000000-0000-0000-0000-0000000000c1']::uuid[])$$, 'no new tasks in archived project');
reset role;

-- ---------------------------------------------------------------------
-- Sign-in lockout
-- ---------------------------------------------------------------------
set role anon;
select test.ok(public.login_lock_status('pm1@t.sa') is null, 'not locked initially');
select public.register_login_failure('PM1@t.sa') from generate_series(1, 4);
select test.ok(public.login_lock_status('pm1@t.sa') is null, 'four failures do not lock');
select test.ok(public.register_login_failure('pm1@t.sa') > now(), 'fifth failure locks the account');
select test.ok(public.login_lock_status('pm1@t.sa') > now(), 'lock reported');
select test.ok((select count(*) from public.login_attempts) = 0, 'anon cannot read login_attempts directly');
select test.throws($$select public.notify_due_soon()$$, 'anon cannot run the scheduler function');
select test.ok((select count(*) from public.users) = 0, 'anon sees no users');
select test.throws($$insert into public.users (full_name, role, job_title) values ('x', 'member', 'tester')$$, 'anon cannot add people');
reset role;

-- Due-soon notifications go to signed-in users only (none here: members)
update public.projects set status = 'active';
update public.tasks set due_date = current_date + 1 where id = (select id from ids where name = 'open');
select test.ok(public.notify_due_soon() = 0, 'no due-soon notifications stored for team members');

-- ---------------------------------------------------------------------
-- Task schedule: start date + working days (Friday/Saturday off)
-- ---------------------------------------------------------------------
select test.ok(public.add_work_days('2026-10-18', 5) = '2026-10-22', 'Sun + 5 working days ends Thursday');
select test.ok(public.add_work_days('2026-10-22', 2) = '2026-10-25', 'Thu + 2 working days skips Fri/Sat');
select test.ok(public.add_work_days('2026-10-23', 1) = '2026-10-25', 'start on Friday begins on Sunday');
select test.ok(public.add_work_days('2026-10-18', 10) = '2026-10-29', 'two working weeks');
select test.ok(public.add_work_days('2026-10-18', null) is null, 'no work days, no calculation');

select test.as_user(:PM1);
update public.projects set status = 'active' where id = :P1;
insert into public.project_members (project_id, user_id) values (:P1, :M2) on conflict do nothing;
insert into ids values ('sched', public.create_task(:P1, 'Scheduled', null, 'medium', null, array[:M1]::uuid[], '2026-10-18', 5));
reset role;
select test.ok((select due_date from public.tasks where id = (select id from ids where name = 'sched')) = '2026-10-22',
               'create_task computes the due date from start + working days');
select test.as_user(:PM1);
update public.tasks set work_days = 7 where id = (select id from ids where name = 'sched');
update public.tasks set due_date = '2030-01-01' where id = (select id from ids where name = 'sched');
reset role;
select test.ok((select due_date from public.tasks where id = (select id from ids where name = 'sched')) = '2026-10-26',
               'due date follows the schedule when work days change, and cannot drift from it');
select test.ok(exists (select 1 from public.activity_log where task_id = (select id from ids where name = 'sched')
                       and action = 'due_date' and new_value = '2026-10-26'), 'schedule change logged');
select test.throws($$update public.tasks set work_days = 0 where id = (select id from ids where name = 'sched')$$, 'work days must be at least 1');

-- ---------------------------------------------------------------------
-- Attachments (projects and tasks) + storage objects
-- ---------------------------------------------------------------------
select test.ok((select not public and file_size_limit = 5242880 from storage.buckets where id = 'attachments'),
               'private attachments bucket with 5 MB limit');

select test.as_user(:PM1);
insert into storage.objects (bucket_id, name) values ('attachments', '10000000-0000-0000-0000-000000000001/project/a.pdf');
insert into public.attachments (project_id, file_name, storage_path, size, uploaded_by)
values (:P1, 'خطة المشروع.pdf', '10000000-0000-0000-0000-000000000001/project/a.pdf', 1000, auth.uid());
insert into public.attachments (task_id, file_name, storage_path, size, uploaded_by)
values ((select id from ids where name = 'sched'), 'spec.docx', '10000000-0000-0000-0000-000000000001/x/b.docx', 2000, auth.uid());
select test.throws($$insert into public.attachments (project_id, file_name, storage_path, size, uploaded_by)
                     values ('10000000-0000-0000-0000-000000000001', 'big.zip', '10000000-0000-0000-0000-000000000001/project/c.zip',
                             6000000, auth.uid())$$, 'files over 5 MB are refused');
select test.throws($$insert into public.attachments (project_id, file_name, storage_path, size, uploaded_by)
                     values ('10000000-0000-0000-0000-000000000001', 'x', 'elsewhere/x', 10, auth.uid())$$,
                   'path must sit in the project folder');
reset role;
select test.ok((select project_id from public.attachments where file_name = 'spec.docx') = :P1,
               'task attachment takes its task''s project');
select test.ok(exists (select 1 from public.activity_log where action = 'attachment_added' and new_value = 'spec.docx'),
               'task attachment logged in activity');

select test.as_user(:PM3);
select test.ok((select count(*) from public.attachments) = 0, 'pm outside the project sees no attachments');
select test.ok((select count(*) from storage.objects) = 0, 'pm outside the project sees no files');
select test.throws($$insert into storage.objects (bucket_id, name)
                     values ('attachments', '10000000-0000-0000-0000-000000000001/project/evil.pdf')$$,
                   'pm outside the project cannot upload');
select test.throws($$insert into public.attachments (project_id, file_name, storage_path, size, uploaded_by)
                     values ('10000000-0000-0000-0000-000000000001', 'x', '10000000-0000-0000-0000-000000000001/project/x', 1, auth.uid())$$,
                   'pm outside the project cannot add attachment rows');
delete from public.attachments;
delete from storage.objects;
reset role;
select test.ok((select count(*) from public.attachments) = 2, 'outsider cannot delete attachments');

-- PM2 is a member of the project (added earlier) but not its manager.
select test.as_user(:PM2);
select test.ok((select count(*) from public.attachments) = 2, 'project member sees project and task attachments');
select test.ok((select count(*) from storage.objects) = 1, 'project member sees the files');
insert into storage.objects (bucket_id, name) values ('attachments', '10000000-0000-0000-0000-000000000001/project/pm2.txt');
insert into public.attachments (project_id, file_name, storage_path, size, uploaded_by)
values (:P1, 'pm2.txt', '10000000-0000-0000-0000-000000000001/project/pm2.txt', 5, auth.uid());
delete from public.attachments where file_name = 'pm2.txt';
reset role;
select test.ok(not exists (select 1 from public.attachments where file_name = 'pm2.txt'), 'uploader deletes own attachment');

select test.as_user(:PM1);
delete from public.attachments where file_name = 'spec.docx';
delete from storage.objects where name like '%/pm2.txt';
reset role;
select test.ok(not exists (select 1 from public.attachments where file_name = 'spec.docx'), 'project manager deletes any attachment');
select test.ok(not exists (select 1 from storage.objects where name like '%/pm2.txt'), 'project manager deletes any file');
select test.ok(exists (select 1 from public.activity_log where action = 'attachment_removed' and old_value = 'spec.docx'),
               'removal logged in activity');

\echo 'all RLS tests passed'
