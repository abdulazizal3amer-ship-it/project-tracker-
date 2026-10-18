-- =====================================================================
-- 003_cron.sql — daily "due tomorrow" notifications (FR-22)
-- Uses pg_cron, available on the Supabase free plan
-- (Dashboard → Database → Extensions → pg_cron). Safe to re-run.
-- =====================================================================
create extension if not exists pg_cron;

select cron.unschedule('notify-due-soon')
where exists (select 1 from cron.job where jobname = 'notify-due-soon');

-- 05:00 UTC = 08:00 Riyadh
select cron.schedule('notify-due-soon', '0 5 * * *', $$select public.notify_due_soon()$$);
