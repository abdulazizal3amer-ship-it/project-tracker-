-- =====================================================================
-- 005_task_schedule.sql — تاريخ بداية المهمة وعدد أيام العمل
--
-- A task can have a start date and a number of working days. The due
-- date is then calculated automatically, skipping the weekend (Friday
-- and Saturday). The start date counts as day 1 when it is a working
-- day; a start on the weekend begins on the following Sunday.
-- Run after 001–004.
-- =====================================================================

alter table public.tasks
  add column start_date date,
  add column work_days int check (work_days between 1 and 365);

-- Date of the n-th working day counting from p_start (inclusive).
create or replace function public.add_work_days(p_start date, p_days int)
returns date language plpgsql immutable as $$
declare
  d date := p_start;
  n int := 0;
begin
  if p_start is null or p_days is null or p_days < 1 then
    return null;
  end if;
  loop
    if extract(isodow from d) not in (5, 6) then  -- 5 = Friday, 6 = Saturday
      n := n + 1;
      if n = p_days then
        return d;
      end if;
    end if;
    d := d + 1;
  end loop;
end $$;

create or replace function public.schedule_task()
returns trigger language plpgsql as $$
begin
  if new.start_date is not null and new.work_days is not null then
    new.due_date := public.add_work_days(new.start_date, new.work_days);
  end if;
  return new;
end $$;

create trigger tasks_schedule
  before insert or update of start_date, work_days, due_date on public.tasks
  for each row execute function public.schedule_task();

-- create_task gains the two scheduling fields.
drop function if exists public.create_task(uuid, text, text, public.task_priority, date, uuid[]);

create or replace function public.create_task(
  p_project     uuid,
  p_title       text,
  p_description text,
  p_priority    public.task_priority,
  p_due_date    date,
  p_assignees   uuid[],
  p_start_date  date default null,
  p_work_days   int default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_task uuid;
  v_uid  uuid;
begin
  if p_assignees is null or cardinality(p_assignees) = 0 then
    raise exception 'at least one assignee is required' using errcode = '23514';
  end if;

  insert into public.tasks (project_id, title, description, priority, due_date, start_date, work_days, created_by)
  values (p_project, trim(p_title), nullif(trim(p_description), ''), coalesce(p_priority, 'medium'),
          p_due_date, p_start_date, p_work_days, auth.uid())
  returning id into v_task;

  foreach v_uid in array (select array_agg(distinct x) from unnest(p_assignees) as x) loop
    insert into public.task_assignees (task_id, user_id, assigned_by) values (v_task, v_uid, auth.uid());
  end loop;

  return v_task;
end $$;

revoke execute on function public.create_task(uuid, text, text, public.task_priority, date, uuid[], date, int) from public, anon;
grant execute on function public.create_task(uuid, text, text, public.task_priority, date, uuid[], date, int) to authenticated;

notify pgrst, 'reload schema';
