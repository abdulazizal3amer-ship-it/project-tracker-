-- =====================================================================
-- 006_attachments.sql — مرفقات المشاريع والمهام
--
-- Files live in a private Supabase Storage bucket "attachments" under
--   <project_id>/<task_id | 'project'>/<random>.<ext>
-- and every file has a row in public.attachments. Both are protected by
-- project membership: members see and upload; the uploader or a project
-- manager deletes. Max 5 MB per file (NFR-09). Run after 001–005.
-- =====================================================================

-- Attachments now belong to a project, optionally to one of its tasks.
alter table public.attachments alter column task_id drop not null;
alter table public.attachments
  add column project_id uuid references public.projects (id) on delete cascade,
  add column content_type text;
update public.attachments a set project_id = t.project_id from public.tasks t where t.id = a.task_id;
alter table public.attachments alter column project_id set not null;
create index if not exists attachments_project_idx on public.attachments (project_id, created_at desc);
create index if not exists attachments_task_idx on public.attachments (task_id);

-- A task attachment always takes its task's project; the stored path
-- must sit in that project's folder.
create or replace function public.prepare_attachment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.task_id is not null then
    new.project_id := public.task_project(new.task_id);
  end if;
  if split_part(new.storage_path, '/', 1) <> new.project_id::text then
    raise exception 'attachment path must start with its project id' using errcode = '23514';
  end if;
  new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
  return new;
end $$;

create trigger attachments_prepare
  before insert on public.attachments
  for each row execute function public.prepare_attachment();

create or replace function public.log_attachment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.task_id is not null then
    insert into public.activity_log (task_id, user_id, action, new_value)
    values (new.task_id, auth.uid(), 'attachment_added', new.file_name);
  elsif tg_op = 'DELETE' and old.task_id is not null and exists (select 1 from public.tasks where id = old.task_id) then
    insert into public.activity_log (task_id, user_id, action, old_value)
    values (old.task_id, auth.uid(), 'attachment_removed', old.file_name);
  end if;
  return null;
end $$;

create trigger attachments_log
  after insert or delete on public.attachments
  for each row execute function public.log_attachment();

-- RLS on the table, by project.
drop policy if exists attachments_select on public.attachments;
drop policy if exists attachments_insert on public.attachments;
drop policy if exists attachments_delete on public.attachments;

create policy attachments_select on public.attachments for select to authenticated
  using (public.is_project_member(project_id));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and public.is_project_member(project_id));
create policy attachments_delete on public.attachments for delete to authenticated
  using (uploaded_by = auth.uid() or public.can_manage_project(project_id));

-- ---------------------------------------------------------------------
-- Storage bucket (private) and its policies
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 5242880)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Project id from an object path, or null if the path is malformed.
create or replace function public.attachment_project(p_name text)
returns uuid language sql immutable as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
              then split_part(p_name, '/', 1)::uuid end
$$;

drop policy if exists attachments_objects_select on storage.objects;
drop policy if exists attachments_objects_insert on storage.objects;
drop policy if exists attachments_objects_delete on storage.objects;

create policy attachments_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.is_project_member(public.attachment_project(name)));
create policy attachments_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.is_project_member(public.attachment_project(name)));
create policy attachments_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments'
         and (owner = auth.uid() or public.can_manage_project(public.attachment_project(name))));

notify pgrst, 'reload schema';
