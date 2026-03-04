# Zoho People -> Supabase Attendance Ingest

## 1) Run SQL once
In Supabase SQL Editor, run:
- `supabase/zoho-attendance.sql`

This creates:
- `zoho_people_attendance_raw` (exact Zoho payload-shaped table)
- `user_attendance_logs`
- `zoho_people_user_map`
- `rpc_get_user_attendance(jsonb)` (task page uses this)
- `internal_ingest_zoho_people_attendance(jsonb)` (edge function uses this)

## 2) Deploy function
```bash
supabase functions deploy zoho-people-attendance --no-verify-jwt
```

## 3) Set secrets
```bash
supabase secrets set \
  ZOHO_PEOPLE_WEBHOOK_SECRET="<your-secret>"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already available in hosted functions.

## 4) Configure Zoho Flow webhook target
Use this URL:
```text
https://<project-ref>.supabase.co/functions/v1/zoho-people-attendance
```

Set header:
- `x-webhook-secret: <your-secret>`

Body: pass Zoho People attendance payload JSON (raw payload works).

## 5) Optional mapping table (if payload has no department/employeeName)
Insert mapping rows:
```sql
insert into public.zoho_people_user_map (employeeid, department, employeename, email, source)
values
('E00062', 'Direct Reportees', 'Pranob Thachanthara', 'pranob.thachanthara@finnovate.in', 'manual')
on conflict (employeeid) do update
set department = excluded.department,
    employeename = excluded.employeename,
    email = excluded.email,
    active = true,
    updatedat = now();
```

## 6) Raw table schema (for manual inspection/mapping)
`public.zoho_people_attendance_raw` stores these Zoho fields directly:
- `Status`, `OverTime`, `Description`, `TotalHours`, `orgID`, `ExpectedToTime`, `WorkingHours`, `ToTime`, `InputType`, `form`, `isdebug`, `ExpectedFromTime`, `id`, `AttendanceDay`, `DeviationTime`, `EmployeeID`, `BreakTime`, `FromTime`

When webhook hits edge function:
1. Row is inserted/updated in `zoho_people_attendance_raw`
2. Mapping resolution happens (`zoho_people_user_map`, then `users_directory` email fallback)
3. Resolved output is written into `user_attendance_logs`

## 7) Reprocess unresolved raw rows after adding mapping
```sql
select public.internal_reprocess_zoho_people_attendance_raw('{"limit":500}'::jsonb);
```

## 8) Test quickly
```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/zoho-people-attendance" \
  -H "content-type: application/json" \
  -H "x-webhook-secret: <your-secret>" \
  -d '{
    "Status":"Present",
    "AttendanceDay":"02-Mar-2026",
    "EmployeeID":"Pranob T E00062",
    "FromTime":"02-Mar-2026 08:49:54",
    "ToTime":"02-Mar-2026 18:21:12",
    "WorkingHours":"09:31",
    "department":"Direct Reportees",
    "employeeName":"Pranob Thachanthara"
  }'
```

Expected response: `{ "ok": true, ... }`
