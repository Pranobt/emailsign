-- Daily compliance auto-send at 9:00 PM IST (15:30 UTC), working days only.
-- Prerequisites:
-- 1) Deploy edge function: daily-compliance
-- 2) Set edge function env vars:
--    - SUPABASE_URL
--    - SUPABASE_SERVICE_ROLE_KEY
--    - COMPLIANCE_WEBHOOK_URL
--    - CRON_SECRET
-- 3) Enable extensions once:
--    create extension if not exists pg_cron;
--    create extension if not exists pg_net;

-- Replace placeholders before executing:
--   <PROJECT_REF>  -> your Supabase project ref (e.g. uzhbqarchcbrwwfamuum)
--   <CRON_SECRET>  -> same secret set in edge function env

select cron.unschedule(jobid)
from cron.job
where jobname = 'daily-compliance-9pm-ist';

select cron.schedule(
  'daily-compliance-9pm-ist',
  '30 15 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/daily-compliance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 120000
  );
  $$
);

-- Verify schedule
select jobid, jobname, schedule, command
from cron.job
where jobname = 'daily-compliance-9pm-ist';
