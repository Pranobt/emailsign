create or replace function public.rpc_get_admin_dashboard(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text := coalesce(p_payload->>'admin', '');
  v_code text := coalesce(p_payload->>'code', '');
  v_anchor_date date := coalesce(public.to_date_safe(p_payload->>'workDate'), current_date);
  v_range text := lower(coalesce(p_payload->>'rangePreset', 'custom_day'));
  v_department_filter text := coalesce(p_payload->>'department', 'All');
  v_employee_filter text := coalesce(p_payload->>'employeeName', 'All');
  v_project_filter text := coalesce(p_payload->>'project', 'All');
  v_stage_filter text := coalesce(p_payload->>'stage', 'All');
  v_carryover_limit int := least(2000, greatest(50, coalesce(nullif(p_payload->>'carryoverLimit','')::int, 500)));
  v_completed_limit int := least(2000, greatest(50, coalesce(nullif(p_payload->>'completedLimit','')::int, 500)));
  v_from_date date := public.to_date_safe(p_payload->>'fromDate');
  v_to_date date := public.to_date_safe(p_payload->>'toDate');
  v_swap_date date;
  v_days int;
  v_allowed jsonb;
  v_res jsonb;
begin
  select allowed_departments_json
  into v_allowed
  from public.admins_directory a
  where lower(trim(a.admin_name)) = lower(trim(v_admin))
    and a.active = true
    and public.secret_matches(v_code, a.admin_code_hash)
  limit 1;

  if v_allowed is null then
    return jsonb_build_object('ok', false, 'message', 'Unauthorized');
  end if;

  if v_from_date is not null or v_to_date is not null then
    v_from_date := coalesce(v_from_date, v_to_date, v_anchor_date);
    v_to_date := coalesce(v_to_date, v_from_date, v_anchor_date);
    if v_from_date > v_to_date then
      v_swap_date := v_from_date;
      v_from_date := v_to_date;
      v_to_date := v_swap_date;
    end if;
    v_anchor_date := v_to_date;
  elsif v_range = 'last7' then
    v_from_date := v_anchor_date - 6;
    v_to_date := v_anchor_date;
  elsif v_range = 'last30' then
    v_from_date := v_anchor_date - 29;
    v_to_date := v_anchor_date;
  elsif v_range = 'last90' then
    v_from_date := v_anchor_date - 89;
    v_to_date := v_anchor_date;
  else
    v_from_date := v_anchor_date;
    v_to_date := v_anchor_date;
  end if;
  v_days := greatest(1, (v_to_date - v_from_date + 1));

  with emp as (
    select
      u.department,
      u.employee_name,
      public.canonical_department_key(u.department) as dep_key,
      lower(trim(u.employee_name)) as emp_key
    from public.users_directory u
    where u.active = true
      and (
        (v_allowed ? 'All')
        or exists (
          select 1
          from jsonb_array_elements_text(v_allowed) d(dep)
          where public.canonical_department_key(d.dep) = public.canonical_department_key(u.department)
        )
      )
      and (v_department_filter = 'All' or public.canonical_department_key(u.department) = public.canonical_department_key(v_department_filter))
      and (v_employee_filter = 'All' or lower(trim(u.employee_name)) = lower(trim(v_employee_filter)))
  ),
  sod_latest as (
    select distinct on (e.department, e.employee_name, s.work_date)
      e.department, e.employee_name, s.work_date, s.submitted_at, s.task_count, s.payload_json
    from emp e
    join public.task_submissions s
      on s.stage = 'SOD'
     and s.work_date between v_from_date and v_to_date
     and public.canonical_department_key(s.department) = e.dep_key
     and lower(trim(s.employee_name)) = e.emp_key
    order by e.department, e.employee_name, s.work_date, s.submitted_at desc
  ),
  eod_latest as (
    select distinct on (e.department, e.employee_name, s.work_date)
      e.department, e.employee_name, s.work_date, s.submitted_at, s.task_count, s.total_spent_minutes, s.payload_json
    from emp e
    join public.task_submissions s
      on s.stage = 'EOD'
     and s.work_date between v_from_date and v_to_date
     and public.canonical_department_key(s.department) = e.dep_key
     and lower(trim(s.employee_name)) = e.emp_key
    order by e.department, e.employee_name, s.work_date, s.submitted_at desc
  ),
  employee_working_days as (
    select e.department, e.employee_name, gs::date as work_date
    from emp e
    cross join generate_series(v_from_date, v_to_date, interval '1 day') gs
    where public.is_working_day_for_user(gs::date, e.department, e.employee_name)
  ),
  eod_range_updates as (
    select
      e.department,
      e.employee_name,
      coalesce(nullif(u->>'completionPercent','')::int, nullif(u->>'completion','')::int, nullif(u->>'progress','')::int) as completion
    from eod_latest e,
    lateral jsonb_array_elements(coalesce(e.payload_json->'updates', '[]'::jsonb)) u
    where coalesce(u->>'title','') <> ''
  ),
  assignment_counts as (
    select e.department, e.employee_name, count(*)::int as assigned_tasks
    from public.task_admin_events e
    join emp u
      on public.canonical_department_key(e.department) = u.dep_key
     and lower(trim(e.employee_name)) = u.emp_key
    where e.event_type = 'assignment'
      and coalesce(e.work_date, v_to_date) between v_from_date and v_to_date
      and lower(coalesce(e.status,'')) = 'assigned'
    group by e.department, e.employee_name
  ),
  sod_summary as (
    select
      s.department,
      s.employee_name,
      count(*)::int as sod_submitted_days,
      coalesce(sum(s.task_count), 0)::int as planned_tasks,
      coalesce(jsonb_agg(to_jsonb(s.work_date::text) order by s.work_date), '[]'::jsonb) as sod_submitted_dates,
      max(s.submitted_at) as last_sod_submission_at
    from sod_latest s
    group by s.department, s.employee_name
  ),
  eod_summary as (
    select
      d.department,
      d.employee_name,
      count(*)::int as eod_submitted_days,
      coalesce(sum(d.task_count), 0)::int as tasks_submitted,
      coalesce(sum(d.total_spent_minutes), 0)::int as total_spent_minutes,
      coalesce(jsonb_agg(to_jsonb(d.work_date::text) order by d.work_date), '[]'::jsonb) as eod_submitted_dates,
      max(d.submitted_at) as last_eod_submission_at
    from eod_latest d
    group by d.department, d.employee_name
  ),
  eod_missing_summary as (
    select s.department, s.employee_name, count(*)::int as eod_missing_days
    from sod_latest s
    left join eod_latest d
      on d.department = s.department
     and d.employee_name = s.employee_name
     and d.work_date = s.work_date
    where d.work_date is null
    group by s.department, s.employee_name
  ),
  sod_missing_dates_summary as (
    select
      wd.department,
      wd.employee_name,
      coalesce(jsonb_agg(to_jsonb(wd.work_date::text) order by wd.work_date), '[]'::jsonb) as sod_missing_dates
    from employee_working_days wd
    left join sod_latest s
      on s.department = wd.department
     and s.employee_name = wd.employee_name
     and s.work_date = wd.work_date
    where s.work_date is null
    group by wd.department, wd.employee_name
  ),
  eod_missing_dates_summary as (
    select
      wd.department,
      wd.employee_name,
      coalesce(jsonb_agg(to_jsonb(wd.work_date::text) order by wd.work_date), '[]'::jsonb) as eod_missing_dates
    from employee_working_days wd
    left join eod_latest d
      on d.department = wd.department
     and d.employee_name = wd.employee_name
     and d.work_date = wd.work_date
    where d.work_date is null
    group by wd.department, wd.employee_name
  ),
  attendance_day_rows as (
    select
      e.department,
      e.employee_name,
      coalesce(
        nullif(s.payload_json #>> '{attendance,loginTime}', ''),
        nullif(s.payload_json->>'loginTime', ''),
        nullif(s.payload_json->>'checkInTime', ''),
        nullif(d.payload_json #>> '{attendance,loginTime}', ''),
        nullif(d.payload_json->>'loginTime', ''),
        nullif(d.payload_json->>'checkInTime', '')
      ) as login_time,
      coalesce(
        nullif(d.payload_json #>> '{attendance,logoutTime}', ''),
        nullif(d.payload_json #>> '{attendance,checkoutTime}', ''),
        nullif(d.payload_json->>'logoutTime', ''),
        nullif(d.payload_json->>'checkoutTime', ''),
        nullif(d.payload_json->>'checkOutTime', ''),
        nullif(s.payload_json #>> '{attendance,logoutTime}', ''),
        nullif(s.payload_json #>> '{attendance,checkoutTime}', ''),
        nullif(s.payload_json->>'logoutTime', ''),
        nullif(s.payload_json->>'checkoutTime', ''),
        nullif(s.payload_json->>'checkOutTime', '')
      ) as checkout_time
    from emp e
    left join sod_latest s
      on s.department = e.department
     and s.employee_name = e.employee_name
     and s.work_date = v_to_date
    left join eod_latest d
      on d.department = e.department
     and d.employee_name = e.employee_name
     and d.work_date = v_to_date
  ),
  employee_rows as (
    select
      e.employee_name,
      e.department,
      coalesce(ss.sod_submitted_days, 0)::int as sod_submitted_days,
      coalesce(es.eod_submitted_days, 0)::int as eod_submitted_days,
      coalesce(ems.eod_missing_days, 0)::int as eod_missing_days,
      coalesce(ss.planned_tasks, 0)::int as planned_tasks,
      coalesce(es.tasks_submitted, 0)::int as tasks_submitted,
      coalesce(ac.assigned_tasks, 0)::int as assigned_tasks,
      0::int as open_carryover,
      coalesce(ss.sod_submitted_dates, '[]'::jsonb) as sod_submitted_dates,
      coalesce(es.eod_submitted_dates, '[]'::jsonb) as eod_submitted_dates,
      coalesce(sms.sod_missing_dates, '[]'::jsonb) as sod_missing_dates,
      coalesce(emds.eod_missing_dates, '[]'::jsonb) as eod_missing_dates,
      coalesce(adr.login_time, '') as login_time,
      coalesce(adr.checkout_time, '') as checkout_time,
      greatest(
        coalesce(ss.last_sod_submission_at, 'epoch'::timestamptz),
        coalesce(es.last_eod_submission_at, 'epoch'::timestamptz)
      ) as last_submission_at
    from emp e
    left join sod_summary ss
      on ss.department = e.department
     and ss.employee_name = e.employee_name
    left join eod_summary es
      on es.department = e.department
     and es.employee_name = e.employee_name
    left join eod_missing_summary ems
      on ems.department = e.department
     and ems.employee_name = e.employee_name
    left join sod_missing_dates_summary sms
      on sms.department = e.department
     and sms.employee_name = e.employee_name
    left join eod_missing_dates_summary emds
      on emds.department = e.department
     and emds.employee_name = e.employee_name
    left join assignment_counts ac
      on ac.department = e.department
     and ac.employee_name = e.employee_name
    left join attendance_day_rows adr
      on adr.department = e.department
     and adr.employee_name = e.employee_name
  ),
  filtered_employee_rows as (
    select * from employee_rows
    where
      (v_stage_filter = 'All')
      or (v_stage_filter = 'SOD' and sod_submitted_days > 0)
      or (v_stage_filter = 'EOD' and eod_submitted_days > 0)
      or (v_stage_filter = 'Carryover' and open_carryover > 0)
  ),
  department_rows as (
    select
      department,
      count(*)::int as employee_count,
      coalesce(sum(sod_submitted_days),0)::int as sod_submitted_days,
      coalesce(sum(eod_submitted_days),0)::int as eod_submitted_days,
      coalesce(sum(eod_missing_days),0)::int as eod_missing_days,
      coalesce(sum(planned_tasks),0)::int as planned_tasks,
      coalesce(sum(tasks_submitted),0)::int as tasks_submitted,
      coalesce(sum(assigned_tasks),0)::int as assigned_tasks,
      0::int as carryover_open_count
    from filtered_employee_rows
    group by department
  ),
  totals as (
    select
      coalesce(sum(planned_tasks),0)::int as planned_tasks,
      coalesce(sum(tasks_submitted),0)::int as tasks_submitted,
      coalesce(sum(eod_submitted_days),0)::int as eod_submitted_days,
      coalesce(sum(eod_missing_days),0)::int as eod_missing_days,
      0::int as open_carryover,
      coalesce(sum(tasks_submitted),0)::int as total_submitted_tasks
    from filtered_employee_rows
  ),
  completion_stats as (
    select coalesce(avg(completion)::numeric, 0) as completion_avg
    from eod_range_updates
    where completion is not null
  ),
  minutes_total as (
    select coalesce(sum(total_spent_minutes),0)::int as total_minutes
    from eod_latest
  ),
  department_options as (
    select coalesce(jsonb_agg(to_jsonb(department) order by department), '[]'::jsonb) as items
    from (
      select distinct u.department
      from public.users_directory u
      where u.active = true
        and (
          (v_allowed ? 'All')
          or exists (
            select 1
            from jsonb_array_elements_text(v_allowed) d(dep)
            where public.canonical_department_key(d.dep) = public.canonical_department_key(u.department)
          )
        )
    ) x
  ),
  employee_options as (
    select coalesce(jsonb_agg(to_jsonb(employee_name) order by employee_name), '[]'::jsonb) as items
    from (
      select distinct u.employee_name
      from public.users_directory u
      where u.active = true
        and (
          (v_allowed ? 'All')
          or exists (
            select 1
            from jsonb_array_elements_text(v_allowed) d(dep)
            where public.canonical_department_key(d.dep) = public.canonical_department_key(u.department)
          )
        )
        and (v_department_filter = 'All' or public.canonical_department_key(u.department) = public.canonical_department_key(v_department_filter))
    ) x
  )
  select jsonb_build_object(
    'ok', true,
    'kpis', jsonb_build_object(
      'plannedTasks', (select planned_tasks from totals),
      'tasksSubmittedCount', (select tasks_submitted from totals),
      'eodSubmittedCount', (select eod_submitted_days from totals),
      'eodMissingCount', (select count(*)::int from filtered_employee_rows where eod_missing_days > 0),
      'incompleteCarryoverCount', (select open_carryover from totals),
      'completionRate', (select round(completion_avg, 2) from completion_stats),
      'totalLoggedHours', round((select total_minutes from minutes_total)::numeric / 60.0, 2),
      'periodDays', v_days
    ),
    'departmentSummary', coalesce((
      select jsonb_agg(jsonb_build_object(
        'department', d.department,
        'employeeCount', d.employee_count,
        'sodSubmittedDays', d.sod_submitted_days,
        'eodSubmittedDays', d.eod_submitted_days,
        'eodMissingDays', d.eod_missing_days,
        'plannedTasks', d.planned_tasks,
        'tasksSubmitted', d.tasks_submitted,
        'assignedTasks', d.assigned_tasks,
        'carryoverOpenCount', d.carryover_open_count
      ) order by d.department)
      from department_rows d
    ), '[]'::jsonb),
    'employeeCompliance', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employeeName', r.employee_name,
        'department', r.department,
        'sodSubmittedDays', r.sod_submitted_days,
        'eodSubmittedDays', r.eod_submitted_days,
        'eodMissingDays', r.eod_missing_days,
        'plannedTasks', r.planned_tasks,
        'tasksSubmitted', r.tasks_submitted,
        'assignedTasks', r.assigned_tasks,
        'openCarryover', r.open_carryover,
        'sodSubmittedDates', r.sod_submitted_dates,
        'eodSubmittedDates', r.eod_submitted_dates,
        'sodMissingDates', r.sod_missing_dates,
        'eodMissingDates', r.eod_missing_dates,
        'loginTime', nullif(r.login_time, ''),
        'checkoutTime', nullif(r.checkout_time, ''),
        'lastSubmissionAt', case when r.last_submission_at = 'epoch'::timestamptz then null else r.last_submission_at end
      ) order by r.department, r.employee_name)
      from filtered_employee_rows r
    ), '[]'::jsonb),
    'carryoverAging', '[]'::jsonb,
    'completedTasks', '[]'::jsonb,
    'meta', jsonb_build_object(
      'generatedAt', public.rfc3339_now(),
      'degraded', true,
      'degradedReason', 'carryover_reconstruction_disabled_for_timeout',
      'filters', jsonb_build_object(
        'rangePreset', case
          when public.to_date_safe(p_payload->>'fromDate') is not null or public.to_date_safe(p_payload->>'toDate') is not null
            then 'custom_range'
          else coalesce(p_payload->>'rangePreset', 'custom_day')
        end,
        'workDate', v_anchor_date::text,
        'fromDate', v_from_date::text,
        'toDate', v_to_date::text,
        'department', v_department_filter,
        'employeeName', v_employee_filter,
        'project', v_project_filter,
        'stage', v_stage_filter
      ),
      'limits', jsonb_build_object(
        'carryover', v_carryover_limit,
        'completed', v_completed_limit
      ),
      'departmentOptions', (select items from department_options),
      'employeeOptions', (select items from employee_options),
      'projectOptions', '[]'::jsonb
    )
  )
  into v_res;

  return v_res;
end;
$$;
