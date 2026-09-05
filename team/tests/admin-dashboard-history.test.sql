-- Run with psql -v ON_ERROR_STOP=1 -f tests/admin-dashboard-history.test.sql.
-- Synthetic cases: same-day exclusion, duplicate EOD ordering, gaps, and task/employee isolation.
begin;
create temp table history_regression as
with
explicit_eod_updates_all(department, employee_name, task_key, work_date, submitted_at, row_ord, completion) as (
  values
    ('D','A','task',date '2026-01-01',timestamp '2026-01-01 18:00',1,20),
    ('D','A','task',date '2026-01-01',timestamp '2026-01-01 19:00',1,30),
    ('D','A','task',date '2026-01-03',timestamp '2026-01-03 18:00',1,60),
    ('D','A','task',date '2026-01-03',timestamp '2026-01-03 18:00',2,100),
    ('D','B','task',date '2026-01-01',timestamp '2026-01-01 18:00',1,80),
    ('Other','A','task',date '2026-01-01',timestamp '2026-01-01 18:00',1,90)
),
sod_tasks_all(department, employee_name, task_key, work_date) as (
  values
    ('D','A','task',date '2026-01-01'),
    ('D','A','task',date '2026-01-02'),
    ('D','A','task',date '2026-01-03'),
    ('D','A','task',date '2026-01-04'),
    ('D','A','new',date '2026-01-04'),
    ('D','B','task',date '2026-01-02'),
    ('Other','A','task',date '2026-01-02')
),
  -- Build non-overlapping date intervals once, instead of rescanning every
  -- historical update for each SOD task. A same-day EOD is deliberately excluded.
  explicit_eod_day_latest as (
    select distinct on (department, employee_name, task_key, work_date)
      department, employee_name, task_key, work_date, completion
    from explicit_eod_updates_all
    order by department, employee_name, task_key, work_date, submitted_at desc, row_ord desc
  ),
  explicit_eod_intervals as (
    select
      department, employee_name, task_key, work_date, completion,
      lead(work_date) over (
        partition by department, employee_name, task_key order by work_date
      ) as next_work_date
    from explicit_eod_day_latest
  ),
  latest_explicit_before_sod as (
    select
      s.department, s.employee_name, s.work_date, s.task_key,
      prev.completion as prev_completion
    from sod_tasks_all s
    left join explicit_eod_intervals prev
      on prev.department = s.department
     and prev.employee_name = s.employee_name
     and prev.task_key = s.task_key
     and prev.work_date < s.work_date
     and (prev.next_work_date is null or s.work_date <= prev.next_work_date)
  )
select * from latest_explicit_before_sod;
do $test$
declare
  actual jsonb;
  expected jsonb := '[null,30,30,100]'::jsonb;
begin
  select jsonb_agg(prev_completion order by work_date) into actual
    from history_regression where department='D' and employee_name='A' and task_key='task';
  if actual is distinct from expected then
    raise exception 'Date boundaries or EOD ordering changed: %', actual;
  end if;
  if (select count(*) from history_regression) <> 7
     or (select prev_completion from history_regression where department='D' and employee_name='B') <> 80
     or (select prev_completion from history_regression where department='Other') <> 90
     or (select prev_completion from history_regression where task_key='new') is not null then
    raise exception 'History rows duplicated or employee/task isolation changed';
  end if;
end;
$test$;
rollback;
