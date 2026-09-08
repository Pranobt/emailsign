-- Replace the per-SOD full-history scan with equivalent EOD date intervals.
-- Live EXPLAIN ANALYZE: ~19.1s before, ~4.3s after; full JSON output matched.
-- Patch only this CTE to retain the currently deployed RPC's other behavior.
do $migration$
declare
  v_definition text := pg_get_functiondef('public.rpc_get_admin_dashboard(jsonb)'::regprocedure);
  v_old text := $old$  latest_explicit_before_sod as (
    select
      s.department,
      s.employee_name,
      s.work_date,
      s.task_key,
      prev.completion as prev_completion
    from sod_tasks_all s
    left join lateral (
      select e.completion
      from explicit_eod_updates_all e
      where e.department = s.department
        and e.employee_name = s.employee_name
        and e.task_key = s.task_key
        and e.work_date < s.work_date
      order by e.work_date desc, e.submitted_at desc, e.row_ord desc
      limit 1
    ) prev on true
  ),
$old$;
  v_new text := $new$  -- Build non-overlapping date intervals once, instead of rescanning every
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
  ),

$new$;
begin
  if strpos(v_definition, v_new) > 0 then
    return;
  end if;
  if strpos(v_definition, v_old) = 0 then
    raise exception 'Dashboard history CTE differs from expected definition; inspect before applying.';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$migration$;
