-- Record the 20 supplied HR entries as leave. Two half-day entries fall on
-- 2026-09-02, so the day-based leave table stores 19 unique dates.
insert into public.leave_days (
  leave_date,
  department,
  employee_name,
  leave_status,
  reason,
  marked_by,
  source,
  updated_at
)
select
  entry.leave_date,
  'Marketing',
  'Deepti Baria',
  'Leave',
  entry.reason,
  'Pranob Thachanthara',
  'hr_leave_register_2026-09-05',
  now()
from (values
  (date '2026-09-03', 'Absent / Unpaid / 0.5 day'),
  (date '2026-09-02', 'Absent / Unpaid / 0.5 day + Casual Leave / Paid / 0.5 day'),
  (date '2026-08-31', 'Absent / Unpaid / 1 day'),
  (date '2026-08-28', 'Absent / Unpaid / 0.5 day'),
  (date '2026-08-27', 'Absent / Unpaid / 0.5 day'),
  (date '2026-08-24', 'Casual Leave / Paid / 1 day'),
  (date '2026-08-20', 'Casual Leave / Paid / 1 day'),
  (date '2026-08-05', 'Compensatory Off / 1 day'),
  (date '2026-07-22', 'Bereavement Leaves / Paid / 1 day'),
  (date '2026-07-16', 'Absent / Unpaid / 1 day'),
  (date '2026-07-13', 'Bereavement Leaves / Paid / 1 day'),
  (date '2026-07-10', 'Bereavement Leaves / Paid / 1 day'),
  (date '2026-07-09', 'Compensatory Off / 1 day'),
  (date '2026-06-24', 'Leave Without Pay / Unpaid / 1 day'),
  (date '2026-06-17', 'Leave Without Pay / Unpaid / 1 day'),
  (date '2026-06-16', 'Leave Without Pay / Unpaid / 1 day'),
  (date '2026-06-08', 'Casual Leave / Paid / 1 day'),
  (date '2026-06-05', 'PL / Paid / 0.5 day'),
  (date '2026-06-04', 'Absent / Unpaid / 1 day')
) as entry(leave_date, reason)
on conflict (leave_date, department, employee_name) do update
set leave_status = 'Leave',
    reason = excluded.reason,
    marked_by = excluded.marked_by,
    source = excluded.source,
    updated_at = now();

-- Refresh the cached value while preserving the approved anchored restoration.
with streak as (
  select *
  from public.compute_user_streak_from_submissions('Marketing', 'Deepti Baria')
)
update public.user_streaks u
set current_streak = streak.current_streak,
    best_streak = greatest(u.best_streak, streak.best_streak),
    last_counted_date = streak.last_counted_date,
    updated_at = now()
from streak
where public.canonical_department_key(u.department) = public.canonical_department_key('Marketing')
  and lower(trim(u.employee_name)) = lower('Deepti Baria');
