-- =====================================================================
-- 004_team_members.sql — أعضاء الفريق بدون دخول للنظام
--
-- Only admins and project managers sign in. Team members (developer,
-- analyst, tester) are records the managers add so work can be
-- assigned to them and their workload tracked; they have no auth
-- account and can never sign in.
--
-- Run after 001–003. Safe on a database that already has data, as long
-- as no existing user has the 'member' role.
-- =====================================================================

create type public.job_title as enum ('developer', 'analyst', 'tester');

-- People no longer need an auth account.
alter table public.users drop constraint if exists users_id_fkey;
alter table public.users alter column id set default gen_random_uuid();
alter table public.users alter column email drop not null;
alter table public.users add column job_title public.job_title;
alter table public.users
  add constraint users_member_job_chk check (role <> 'member' or job_title is not null);

-- Accounts created in Supabase Auth are always system users (PM unless
-- the create-user function says admin); never team members.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, full_name, email, role, language)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    lower(new.email),
    case when new.raw_app_meta_data ->> 'role' = 'admin' then 'admin'::public.user_role else 'pm'::public.user_role end,
    coalesce(new.raw_user_meta_data ->> 'language', 'ar')
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Only active admins / PMs count as signed-in users. Even if a team
-- member somehow obtained a session, every RLS policy would hide all data.
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and is_active and role in ('admin', 'pm'))
$$;

create or replace function public.current_role_of()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid() and is_active and role in ('admin', 'pm')
$$;

-- Field rules for updates on users.
create or replace function public.guard_user_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then  -- service role / SQL editor
    return new;
  end if;

  -- A team member can never become a system user or vice versa: one has
  -- no sign-in account, the other would lose it.
  if new.role is distinct from old.role and (old.role = 'member' or new.role = 'member') then
    raise exception 'team members and system users cannot switch roles' using errcode = '42501';
  end if;

  if not public.is_admin() then
    if old.role = 'member' then
      -- PMs maintain team members (name, job, email, active) but nothing else.
      if public.current_role_of() is distinct from 'pm' then
        raise exception 'not allowed' using errcode = '42501';
      end if;
    else
      if new.role is distinct from old.role
         or new.is_active is distinct from old.is_active
         or new.email is distinct from old.email then
        raise exception 'only admin can change role, status or email' using errcode = '42501';
      end if;
      if new.must_change_password and not old.must_change_password then
        raise exception 'not allowed' using errcode = '42501';
      end if;
    end if;
  end if;

  if new.id = auth.uid() and (new.role <> 'admin' or not new.is_active) and old.role = 'admin' then
    raise exception 'admin cannot demote or deactivate themselves' using errcode = '42501';
  end if;
  return new;
end $$;

-- RLS: admins and PMs add and edit team members.
drop policy if exists users_update on public.users;
create policy users_update on public.users for update to authenticated
  using (id = auth.uid() or public.is_admin() or (role = 'member' and public.current_role_of() = 'pm'))
  with check (id = auth.uid() or public.is_admin() or (role = 'member' and public.current_role_of() = 'pm'));

create policy users_insert_member on public.users for insert to authenticated
  with check (role = 'member' and public.current_role_of() in ('admin', 'pm'));

-- Notifications only make sense for people who can sign in.
create or replace function public.skip_member_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.users where id = new.user_id and role = 'member') then
    return null;
  end if;
  return new;
end $$;

create trigger notifications_skip_members
  before insert on public.notifications
  for each row execute function public.skip_member_notification();
