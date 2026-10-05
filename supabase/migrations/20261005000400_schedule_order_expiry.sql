-- Expire unpaid orders on a timer.
--
-- An order that is never paid stays pending, and until it is expired it keeps
-- its capacity out of reach of other buyers and holds the points spent on it.
-- expire_stale_orders() already does the work; nothing called it except
-- my_points() and a points purchase, which only reach the one buyer's own
-- orders. This runs it every five minutes for everyone. Expiring fires
-- orders_refund_points, so points come back with it.
--
-- pg_cron is a Supabase extension and is not present everywhere this
-- migration runs (the local test database has none), so this does nothing
-- rather than fail when it is missing. Enable it in the dashboard under
-- Database > Extensions, then run this migration again or call cron.schedule
-- by hand.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    -- Re-running replaces the job rather than adding a second one.
    perform cron.unschedule(jobid) from cron.job where jobname = 'expire-stale-orders';
    perform cron.schedule(
      'expire-stale-orders',
      '*/5 * * * *',
      'select public.expire_stale_orders()'
    );
  else
    raise notice 'pg_cron is not available: expire_stale_orders() is not scheduled';
  end if;
end $$;
