# Daily Compliance Scheduler

This edge function sends one Cliq compliance message per department for a given work date.

## Behavior

- Uses `Asia/Kolkata` date by default.
- Checks `public.is_org_working_day(workDate)` first.
- If non-working day, it exits without sending.
- Builds one-line-per-user status:
  - `✅✅` = SOD+EOD submitted
  - `✅❌` = SOD submitted, EOD missing
  - `❌✅` = SOD missing, EOD submitted
  - `❌❌` = both missing
- Logs failures via `rpc_log_cliq_failure`.

## Required function secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `COMPLIANCE_WEBHOOK_URL`
- `CRON_SECRET`
- Optional: `COMPLIANCE_SENDER_EMAIL`

## Deploy

```bash
supabase functions deploy daily-compliance --no-verify-jwt
```

## Manual test

```bash
curl -X POST "https://<PROJECT_REF>.functions.supabase.co/daily-compliance" \
  -H "Content-Type: application/json" \
  -H "x-cron-secret: <CRON_SECRET>" \
  -d '{"workDate":"2026-02-28"}'
```

## Schedule

Run SQL from:

`supabase/daily-compliance-cron.sql`

This schedules execution at `30 15 * * *` (9:00 PM IST).
