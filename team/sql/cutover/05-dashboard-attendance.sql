
create or replace function public.rpc_resolve_failed_cliq_log(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text := coalesce(p_payload->>'admin', '');
  v_code text := coalesce(p_payload->>'code', '');
  v_id bigint := coalesce(nullif(p_payload->>'id','')::bigint, 0);
  v_resolution text := coalesce(nullif(p_payload->>'resolution',''), 'sent');
  v_allowed jsonb;
begin
  if v_id <= 0 then
    return jsonb_build_object('ok', false, 'message', 'Invalid id');
  end if;

  select a.allowed_departments_json
  into v_allowed
  from public.admins_directory a
  where lower(trim(a.admin_name)) = lower(trim(v_admin))
    and a.active = true
    and public.secret_matches(v_code, a.admin_code_hash)
  limit 1;

  if v_allowed is null then
    return jsonb_build_object('ok', false, 'message', 'Unauthorized');
  end if;

  update public.task_admin_events e
  set
    status = 'Resolved',
    changed_at = now(),
    payload_json = coalesce(e.payload_json, '{}'::jsonb) || jsonb_build_object(
      'resolvedAt', public.rfc3339_now(),
      'resolvedBy', v_admin,
      'resolution', v_resolution,
      'retryCount', coalesce((e.payload_json->>'retryCount')::int, 0) + 1
    )
  where e.id = v_id
    and e.event_type = 'cliq_webhook'
    and e.status = 'Failed'
    and (
      (v_allowed ? 'All')
      or exists (
        select 1
        from jsonb_array_elements_text(v_allowed) d(dep)
        where public.canonical_department_key(d.dep) = public.canonical_department_key(e.department)
      )
    );

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Log not found or already resolved.');
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

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
      from public.task_submissions s
      join emp e
        on public.canonical_department_key(s.department) = e.dep_key
      and lower(trim(s.employee_name)) = e.emp_key
      where s.stage = 'SOD'
        and s.work_date between v_from_date and v_to_date
      order by e.department, e.employee_name, s.work_date, s.submitted_at desc
    ),
    sod_all_latest as (
      select distinct on (e.department, e.employee_name, s.work_date)
        e.department, e.employee_name, s.work_date, s.submitted_at, s.task_count, s.payload_json
      from public.task_submissions s
      join emp e
        on public.canonical_department_key(s.department) = e.dep_key
      and lower(trim(s.employee_name)) = e.emp_key
      where s.stage = 'SOD'
        and s.work_date between (v_from_date - 365) and v_to_date
      order by e.department, e.employee_name, s.work_date, s.submitted_at desc
    ),
    eod_latest as (
      select distinct on (e.department, e.employee_name, s.work_date)
        e.department, e.employee_name, s.work_date, s.submitted_at, s.task_count, s.total_spent_minutes, s.payload_json
      from public.task_submissions s
      join emp e
        on public.canonical_department_key(s.department) = e.dep_key
      and lower(trim(s.employee_name)) = e.emp_key
      where s.stage = 'EOD'
        and s.work_date between v_from_date and v_to_date
      order by e.department, e.employee_name, s.work_date, s.submitted_at desc
    ),
    eod_all_latest as (
      select distinct on (e.department, e.employee_name, s.work_date)
        e.department, e.employee_name, s.work_date, s.submitted_at, s.task_count, s.total_spent_minutes, s.payload_json
      from public.task_submissions s
      join emp e
        on public.canonical_department_key(s.department) = e.dep_key
      and lower(trim(s.employee_name)) = e.emp_key
      where s.stage = 'EOD'
        and s.work_date between (v_from_date - 365) and v_to_date
      order by e.department, e.employee_name, s.work_date, s.submitted_at desc
    ),
    employee_working_days as (
      select
        e.department,
        e.employee_name,
        d.work_date
      from emp e
      cross join lateral (
        select gs::date as work_date
        from generate_series(v_from_date, v_to_date, interval '1 day') gs
      ) d
      where public.is_working_day_for_user(d.work_date, e.department, e.employee_name)
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
    sod_tasks_all as (
      select
        s.department,
        s.employee_name,
        s.work_date,
        s.submitted_at,
        row_number() over (
          partition by s.department, s.employee_name, s.work_date, s.submitted_at
          order by coalesce(t->>'taskId', lower(coalesce(t->>'title','')))
        ) as row_ord,
        coalesce(t->>'taskId', '') as task_id,
        coalesce(t->>'title', '') as title,
        nullif(trim(coalesce(t->>'project', '')), '') as project,
        coalesce(
          nullif(
            case
              when coalesce(t->>'taskId','') like 'co-%' then ''
              else coalesce(t->>'taskId','')
            end,
            ''
          ),
          lower(coalesce(t->>'title',''))
        ) as task_key,
        public.normalize_priority(coalesce(t->>'priority','Medium')) as priority
      from sod_all_latest s,
      lateral jsonb_array_elements(coalesce(s.payload_json->'tasks', '[]'::jsonb)) t
      where coalesce(t->>'title','') <> ''
    ),
    explicit_eod_updates_all as (
      select
        e.department,
        e.employee_name,
        e.work_date,
        e.submitted_at,
        row_number() over (
          partition by e.department, e.employee_name, e.work_date, e.submitted_at
          order by coalesce(u->>'taskId', lower(coalesce(u->>'title','')))
        ) as row_ord,
        coalesce(u->>'taskId', '') as task_id,
        coalesce(u->>'title', '') as title,
        nullif(trim(coalesce(u->>'project', '')), '') as project,
        case
          when coalesce(u->>'isExtra', 'false') = 'true'
            or coalesce(u->>'taskId','') like 'co-%'
          then lower(coalesce(u->>'title',''))
          else coalesce(nullif(u->>'taskId',''), lower(coalesce(u->>'title','')))
        end as task_key,
        coalesce(
          nullif(u->>'completionPercent','')::int,
          nullif(u->>'completion','')::int,
          nullif(u->>'progress','')::int,
          0
        )::int as completion
      from eod_all_latest e,
      lateral jsonb_array_elements(coalesce(e.payload_json->'updates', '[]'::jsonb)) u
      where coalesce(u->>'title','') <> ''
    ),
    sod_pending_updates_all as (
      select
        s.department,
        s.employee_name,
        s.work_date,
        s.submitted_at,
        200000 + row_number() over (
          partition by s.department, s.employee_name, s.work_date, s.submitted_at
          order by coalesce(t->>'taskId', lower(coalesce(t->>'title','')))
        ) as row_ord,
        coalesce(t->>'taskId', '') as task_id,
        coalesce(t->>'title', '') as title,
        nullif(trim(coalesce(t->>'project', '')), '') as project,
        coalesce(
          nullif(
            case when coalesce(t->>'taskId','') like 'co-%' then ''
                 else coalesce(t->>'taskId','') end,
            ''
          ),
          lower(coalesce(t->>'title',''))
        ) as task_key,
        coalesce(
          nullif(t->>'lastCompletion','')::int,
          nullif(t->>'completionPercent','')::int,
          nullif(t->>'completion','')::int,
          nullif(t->>'progress','')::int,
          0
        )::int as completion
      from sod_all_latest s,
      lateral jsonb_array_elements(coalesce(s.payload_json->'pendingTasks', '[]'::jsonb)) t
      where coalesce(t->>'title','') <> ''
        and coalesce(
              nullif(t->>'lastCompletion','')::int,
              nullif(t->>'completionPercent','')::int,
              nullif(t->>'completion','')::int,
              nullif(t->>'progress','')::int,
              0
            )::int < 100
        and not exists (
          -- Skip if the most recent explicit EOD before this SOD already marked it 100%
          select 1
          from explicit_eod_updates_all e
          where e.department = s.department
            and e.employee_name = s.employee_name
            and e.task_key = coalesce(
                nullif(
                  case when coalesce(t->>'taskId','') like 'co-%' then ''
                       else coalesce(t->>'taskId','') end,
                  ''
                ),
                lower(coalesce(t->>'title',''))
              )
            and e.work_date < s.work_date
            and e.completion >= 100
        )
    ),
    latest_explicit_before_sod as (
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
    inferred_missing_updates_all as (
      select
        s.department,
        s.employee_name,
        s.work_date,
        s.submitted_at,
        100000 + s.row_ord as row_ord,
        s.task_id,
        s.title,
        s.project,
        s.task_key,
        case
          when coalesce(p.prev_completion, 0) >= 100 then 0
          else coalesce(p.prev_completion, 0)
        end::int as completion
      from sod_tasks_all s
      left join explicit_eod_updates_all e
        on e.department = s.department
      and e.employee_name = s.employee_name
      and e.work_date = s.work_date
      and e.task_key = s.task_key
      left join latest_explicit_before_sod p
        on p.department = s.department
      and p.employee_name = s.employee_name
      and p.work_date = s.work_date
      and p.task_key = s.task_key
      where e.task_key is null
        and coalesce(p.prev_completion, 0) < 100
    ),
    all_updates as (
      select * from explicit_eod_updates_all
      union all
      select * from sod_pending_updates_all
      union all
      select * from inferred_missing_updates_all
    ),
    ordered_updates as (
      select
        x.*,
        sum(case when x.completion >= 100 then 1 else 0 end) over (
          partition by x.department, x.employee_name, x.task_key
          order by x.work_date, x.submitted_at, x.row_ord
          rows between unbounded preceding and current row
        ) as reset_count,
        lag(x.completion) over (
          partition by x.department, x.employee_name, x.task_key
          order by x.work_date, x.submitted_at, x.row_ord
        ) as prev_completion,
        row_number() over (
          partition by x.department, x.employee_name, x.task_key
          order by x.work_date desc, x.submitted_at desc, x.row_ord desc
        ) as latest_rn
      from all_updates x
    ),
    low_groups as (
      select
        department,
        employee_name,
        task_key,
        reset_count,
        min(work_date) as carry_start_date,
        max(work_date) as last_updated_date
      from ordered_updates
      where completion < 100
      group by department, employee_name, task_key, reset_count
    ),
    task_eod_status_all as (
      -- For each employee+task_key: find the most recent explicit EOD at 100% and at <100%
      select
        department,
        employee_name,
        task_key,
        max(work_date) filter (where completion >= 100) as last_done_date,
        max(work_date) filter (where completion < 100)  as last_incomplete_date
      from explicit_eod_updates_all
      group by department, employee_name, task_key
    ),
    task_done_by_id_all as (
      -- For each employee+task_id (UUID): check if there's a 100% EOD with no later incomplete.
      -- Catches isExtra→regular promotion: extra submission uses title as task_key,
      -- regular submission uses UUID as task_key — same taskId, different chains.
      select
        department,
        employee_name,
        task_id,
        max(work_date) filter (where completion >= 100) as last_done_date,
        max(work_date) filter (where completion < 100)  as last_incomplete_date
      from explicit_eod_updates_all
      where task_id <> ''
      group by department, employee_name, task_id
    ),
    task_done_by_title_all as (
      -- For each employee+lower(title): check if the most recent explicit EOD was 100% with no later incomplete.
      -- Catches orphaned carryover UUID vs completed UUID — different UUID chains, same title.
      select
        department,
        employee_name,
        lower(trim(title)) as title_key,
        max(work_date) filter (where completion >= 100) as last_done_date,
        max(work_date) filter (where completion < 100)  as last_incomplete_date
      from explicit_eod_updates_all
      where trim(title) <> ''
      group by department, employee_name, lower(trim(title))
    ),
    org_working_days_set as (
      select s.work_date
      from public.task_submissions s
      where s.stage in ('SOD', 'EOD')
        and s.work_date <= v_to_date
        and extract(dow from s.work_date) <> 0
        and not public.is_non_working_calendar_day(s.work_date)
      group by s.work_date
      having count(distinct lower(trim(s.employee_name))) >= 3
    ),
    emp_leave_days_set as (
      select
        public.canonical_department_key(l.department) as dep_key,
        lower(trim(l.employee_name)) as emp_key,
        l.leave_date
      from public.leave_days l
      where upper(coalesce(l.leave_status, 'LEAVE')) = 'LEAVE'
    ),
    open_carry_rows as (
      select
        l.department,
        l.employee_name,
        o.task_key,
        coalesce(nullif(o.title,''), '(untitled)') as title,
        o.project as project,
        o.completion as completion_percent,
        l.carry_start_date as pending_since_date,
        l.last_updated_date as last_updated_date,
        (
          select count(*)::int
          from org_working_days_set wd
          where wd.work_date between l.carry_start_date and v_to_date
            and not exists (
              select 1 from emp_leave_days_set ld
              where ld.leave_date = wd.work_date
                and ld.dep_key = public.canonical_department_key(o.department)
                and ld.emp_key = lower(trim(o.employee_name))
            )
        ) as pending_working_days
      from ordered_updates o
      join low_groups l
        on l.department = o.department
      and l.employee_name = o.employee_name
      and l.task_key = o.task_key
      and l.reset_count = o.reset_count
      left join task_eod_status_all es
        on es.department = o.department
       and es.employee_name = o.employee_name
       and es.task_key = o.task_key
      left join task_done_by_id_all eid
        on eid.department = o.department
       and eid.employee_name = o.employee_name
       and eid.task_id = o.task_id
       and o.task_id <> ''
      left join task_done_by_title_all et
        on et.department = o.department
       and et.employee_name = o.employee_name
       and et.title_key = lower(trim(o.title))
       and trim(o.title) <> ''
      where o.latest_rn = 1
        and o.completion < 100
        -- Exclude if the most recent explicit EOD (by task_key) was 100% with no later incomplete
        and not (
          es.last_done_date is not null
          and (es.last_incomplete_date is null or es.last_done_date > es.last_incomplete_date)
        )
        -- Also exclude if same task_id has a 100% explicit EOD with no later incomplete
        -- (handles isExtra→regular promotion with different task_key chains)
        and not (
          eid.last_done_date is not null
          and (eid.last_incomplete_date is null or eid.last_done_date > eid.last_incomplete_date)
        )
        -- Also exclude if any EOD with the same title was last completed at 100% with no later incomplete
        -- (handles orphaned carryover UUID vs completed UUID — different UUID chains, same title)
        and not (
          et.last_done_date is not null
          and (et.last_incomplete_date is null or et.last_done_date > et.last_incomplete_date)
        )
    ),
    assignment_latest_dashboard as (
      select distinct on (
        public.canonical_department_key(e.department),
        lower(trim(e.employee_name)),
        coalesce(
          nullif(e.task_id, ''),
          nullif(e.payload_json->>'taskId', ''),
          lower(trim(coalesce(e.title, '')))
        )
      )
        e.department,
        e.employee_name,
        coalesce(
          nullif(e.task_id, ''),
          nullif(e.payload_json->>'taskId', ''),
          lower(trim(coalesce(e.title, '')))
        ) as task_key,
        coalesce(nullif(e.title, ''), nullif(e.payload_json->>'title', ''), '(untitled)') as title,
        coalesce(e.work_date, v_to_date) as assigned_work_date,
        lower(coalesce(e.payload_json->>'status', e.status, 'assigned')) as status
      from public.task_admin_events e
      join emp u
        on public.canonical_department_key(e.department) = u.dep_key
      and lower(trim(e.employee_name)) = u.emp_key
      where e.event_type = 'assignment'
        and coalesce(e.work_date, v_to_date) <= v_to_date
      order by
        public.canonical_department_key(e.department),
        lower(trim(e.employee_name)),
        coalesce(
          nullif(e.task_id, ''),
          nullif(e.payload_json->>'taskId', ''),
          lower(trim(coalesce(e.title, '')))
        ),
        e.changed_at desc
    ),
    eod_assigned_updates_dashboard as (
      select
        e.department,
        e.employee_name,
        src.work_date,
        src.submitted_at,
        coalesce(nullif(src.u->>'taskId', ''), lower(trim(coalesce(src.u->>'title', '')))) as progress_key,
        coalesce(nullif(src.u->>'title', ''), '(untitled)') as title,
        coalesce(
          nullif(src.u->>'completionPercent', '')::int,
          nullif(src.u->>'completion', '')::int,
          nullif(src.u->>'progress', '')::int,
          0
        ) as completion_percent
      from eod_all_latest e
      cross join lateral (
        select e.work_date, e.submitted_at, value as u
        from jsonb_array_elements(coalesce(e.payload_json->'updates', '[]'::jsonb))
        union all
        select e.work_date, e.submitted_at, value as u
        from jsonb_array_elements(coalesce(e.payload_json->'completedTasks', '[]'::jsonb))
      ) src
      where coalesce(
        nullif(src.u->>'taskId', ''),
        lower(trim(coalesce(src.u->>'title', ''))),
        ''
      ) <> ''
    ),
    latest_assigned_progress_dashboard as (
      select distinct on (department, employee_name, progress_key)
        department,
        employee_name,
        progress_key,
        title,
        completion_percent,
        work_date,
        submitted_at
      from eod_assigned_updates_dashboard
      order by department, employee_name, progress_key, work_date desc, submitted_at desc
    ),
    open_assigned_rows as (
      select
        a.department,
        a.employee_name,
        a.task_key,
        coalesce(nullif(lp.title, ''), a.title, '(untitled)') as title,
        null::text as project,
        coalesce(lp.completion_percent, 0) as completion_percent,
        a.assigned_work_date as pending_since_date,
        coalesce(lp.work_date, a.assigned_work_date) as last_updated_date,
        (
          select count(*)::int
          from org_working_days_set wd
          where wd.work_date between a.assigned_work_date and v_to_date
            and not exists (
              select 1 from emp_leave_days_set ld
              where ld.leave_date = wd.work_date
                and ld.dep_key = public.canonical_department_key(a.department)
                and ld.emp_key = lower(trim(a.employee_name))
            )
        ) as pending_working_days
      from assignment_latest_dashboard a
      left join latest_assigned_progress_dashboard lp
        on lp.department = a.department
      and lp.employee_name = a.employee_name
      and lp.progress_key = a.task_key
      where a.status = 'assigned'
        and coalesce(lp.completion_percent, 0) < 100
        and not exists (
          select 1
          from open_carry_rows c
          where c.department = a.department
            and c.employee_name = a.employee_name
            and c.task_key = a.task_key
        )
    ),
    removed_markers as (
      select distinct on (
        public.canonical_department_key(e.department),
        lower(trim(e.employee_name)),
        coalesce(nullif(e.payload_json->>'taskKey',''), lower(trim(coalesce(e.title, ''))))
      )
        public.canonical_department_key(e.department) as dep_key,
        lower(trim(e.employee_name)) as emp_key,
        coalesce(nullif(e.payload_json->>'taskKey',''), lower(trim(coalesce(e.title, '')))) as task_key,
        coalesce(
          public.to_date_safe(e.payload_json->>'removedThroughWorkDate'),
          e.work_date,
          e.changed_at::date
        ) as removed_through_work_date
      from public.task_admin_events e
      where e.event_type = 'carryover_removed'
        and coalesce(nullif(e.payload_json->>'taskKey',''), lower(trim(coalesce(e.title, '')))) <> ''
      order by
        public.canonical_department_key(e.department),
        lower(trim(e.employee_name)),
        coalesce(nullif(e.payload_json->>'taskKey',''), lower(trim(coalesce(e.title, '')))),
        e.changed_at desc
    ),
    rename_markers as (
      select distinct on (
        public.canonical_department_key(e.department),
        lower(trim(e.employee_name)),
        coalesce(nullif(e.payload_json->>'taskKey',''), lower(trim(coalesce(e.title, ''))))
      )
        public.canonical_department_key(e.department) as dep_key,
        lower(trim(e.employee_name)) as emp_key,
        coalesce(nullif(e.payload_json->>'taskKey',''), lower(trim(coalesce(e.title, '')))) as task_key,
        nullif(trim(coalesce(e.payload_json->>'newTitle', e.title, '')), '') as new_title
      from public.task_admin_events e
      where e.event_type = 'carryover_renamed'
        and coalesce(nullif(e.payload_json->>'taskKey',''), lower(trim(coalesce(e.title, '')))) <> ''
      order by
        public.canonical_department_key(e.department),
        lower(trim(e.employee_name)),
        coalesce(nullif(e.payload_json->>'taskKey',''), lower(trim(coalesce(e.title, '')))),
        e.changed_at desc
    ),
    open_carry_rows_filtered as (
      select
        c.department,
        c.employee_name,
        c.task_key,
        coalesce(rn.new_title, c.title) as title,
        c.project,
        c.completion_percent,
        c.pending_since_date,
        c.last_updated_date,
        c.pending_working_days
      from open_carry_rows c
      left join removed_markers rmv
        on rmv.dep_key = public.canonical_department_key(c.department)
      and rmv.emp_key = lower(trim(c.employee_name))
      and rmv.task_key = c.task_key
      left join rename_markers rn
        on rn.dep_key = public.canonical_department_key(c.department)
      and rn.emp_key = lower(trim(c.employee_name))
      and rn.task_key = c.task_key
      where rmv.task_key is null
    ),
    open_carry_rows_all as (
      select * from open_carry_rows_filtered
      union all
      select
        a.department,
        a.employee_name,
        a.task_key,
        coalesce(rn.new_title, a.title) as title,
        a.project,
        a.completion_percent,
        a.pending_since_date,
        a.last_updated_date,
        a.pending_working_days
      from open_assigned_rows a
      left join removed_markers rmv
        on rmv.dep_key = public.canonical_department_key(a.department)
      and rmv.emp_key = lower(trim(a.employee_name))
      and rmv.task_key = a.task_key
      left join rename_markers rn
        on rn.dep_key = public.canonical_department_key(a.department)
      and rn.emp_key = lower(trim(a.employee_name))
      and rn.task_key = a.task_key
      where rmv.task_key is null
    ),
    completed_rows_auto as (
      select
        o.department,
        o.employee_name,
        coalesce(nullif(o.title,''), '(untitled)') as title,
        o.project as project,
        coalesce(l.carry_start_date, o.work_date) as added_date,
        o.work_date as completed_date,
        (
          select count(*)::int
          from org_working_days_set wd
          where wd.work_date between coalesce(l.carry_start_date, o.work_date) and o.work_date
            and not exists (
              select 1 from emp_leave_days_set ld
              where ld.leave_date = wd.work_date
                and ld.dep_key = public.canonical_department_key(o.department)
                and ld.emp_key = lower(trim(o.employee_name))
            )
        ) as days_taken_working,
        o.submitted_at,
        'Completed'::text as task_status
      from ordered_updates o
      left join low_groups l
        on l.department = o.department
      and l.employee_name = o.employee_name
      and l.task_key = o.task_key
      and l.reset_count = greatest(o.reset_count - 1, 0)
      where o.completion >= 100
        and (o.prev_completion is null or o.prev_completion < 100)
        and o.work_date between v_from_date and v_to_date
    ),
    completed_rows_admin as (
      select
        e.department,
        e.employee_name,
        coalesce(nullif(e.title,''), '(untitled)') as title,
        nullif(trim(coalesce(e.payload_json->>'project', '')), '') as project,
        coalesce(
          public.to_date_safe(e.payload_json->>'pendingSinceDate'),
          public.to_date_safe(e.payload_json->>'removedThroughWorkDate'),
          e.work_date
        ) as added_date,
        coalesce(
          public.to_date_safe(e.payload_json->>'completedOn'),
          e.work_date
        ) as completed_date,
        (
          select count(*)::int
          from org_working_days_set wd
          where wd.work_date between
            coalesce(
              public.to_date_safe(e.payload_json->>'pendingSinceDate'),
              public.to_date_safe(e.payload_json->>'removedThroughWorkDate'),
              e.work_date
            )
            and
            coalesce(
              public.to_date_safe(e.payload_json->>'completedOn'),
              e.work_date
            )
            and not exists (
              select 1 from emp_leave_days_set ld
              where ld.leave_date = wd.work_date
                and ld.dep_key = public.canonical_department_key(e.department)
                and ld.emp_key = lower(trim(e.employee_name))
            )
        ) as days_taken_working,
        e.changed_at as submitted_at,
        case
          when lower(coalesce(e.status, '')) = 'completed' then 'Completed'
          else 'Removed'
        end as task_status
      from public.task_admin_events e
      where e.event_type = 'carryover_removed'
        and lower(coalesce(e.status, '')) in ('completed', 'removed')
        and coalesce(
          public.to_date_safe(e.payload_json->>'completedOn'),
          public.to_date_safe(e.payload_json->>'removedThroughWorkDate'),
          e.work_date
        ) between v_from_date and v_to_date
        and exists (
          select 1
          from emp em
          where public.canonical_department_key(em.department) = public.canonical_department_key(e.department)
            and lower(trim(em.employee_name)) = lower(trim(e.employee_name))
        )
    ),
    completed_rows as (
      select * from completed_rows_auto
      union all
      select * from completed_rows_admin
    ),
    assign_counts as (
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
    open_carry as (
      select c.department, c.employee_name, count(*)::int as open_carryover
      from open_carry_rows_all c
      group by c.department, c.employee_name
    ),
    open_carry_rows_limited as (
      select *
      from open_carry_rows_all
      where (
        v_project_filter = 'All'
        or public.canonical_department_key(department) <> 'marketing'
        or nullif(trim(coalesce(project, '')), '') = nullif(trim(v_project_filter), '')
      )
      order by
        case when public.canonical_department_key(department) = 'marketing' then coalesce(project, '') else '' end,
        pending_working_days desc,
        employee_name,
        title
      limit v_carryover_limit
    ),
    completed_rows_limited as (
      select *
      from completed_rows
      where (
        v_project_filter = 'All'
        or public.canonical_department_key(department) <> 'marketing'
        or nullif(trim(coalesce(project, '')), '') = nullif(trim(v_project_filter), '')
      )
      order by
        case when public.canonical_department_key(department) = 'marketing' then coalesce(project, '') else '' end,
        completed_date desc,
        submitted_at desc,
        department,
        employee_name,
        title
      limit v_completed_limit
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
        coalesce(jsonb_agg(to_jsonb(d.work_date::text) order by d.work_date), '[]'::jsonb) as eod_submitted_dates,
        max(d.submitted_at) as last_eod_submission_at
      from eod_latest d
      group by d.department, d.employee_name
    ),
    eod_missing_summary as (
      select
        s.department,
        s.employee_name,
        count(*)::int as eod_missing_days
      from sod_latest s
      left join eod_latest d
        on d.department = s.department
       and d.employee_name = s.employee_name
       and d.work_date = s.work_date
      where d.work_date is null
      group by s.department, s.employee_name
    ),
    sod_missing_summary as (
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
    employee_rows as (
      select
        e.employee_name,
        e.department,
        coalesce(ss.sod_submitted_days, 0)::int as sod_submitted_days,
        coalesce(es.eod_submitted_days, 0)::int as eod_submitted_days,
        coalesce(ems.eod_missing_days, 0)::int as eod_missing_days,
        coalesce(ss.planned_tasks, 0)::int as planned_tasks,
        coalesce(es.tasks_submitted, 0)::int as tasks_submitted,
        coalesce(a.assigned_tasks, 0)::int as assigned_tasks,
        coalesce(oc.open_carryover, 0)::int as open_carryover,
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
      left join sod_missing_summary sms
        on sms.department = e.department
       and sms.employee_name = e.employee_name
      left join eod_missing_dates_summary emds
        on emds.department = e.department
       and emds.employee_name = e.employee_name
      left join assign_counts a
        on a.department = e.department
       and a.employee_name = e.employee_name
      left join open_carry oc
        on oc.department = e.department
       and oc.employee_name = e.employee_name
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
        coalesce(sum(open_carryover),0)::int as carryover_open_count
      from filtered_employee_rows
      group by department
    ),
    totals as (
      select
        coalesce(sum(planned_tasks),0)::int as planned_tasks,
        coalesce(sum(tasks_submitted),0)::int as tasks_submitted,
        coalesce(sum(eod_submitted_days),0)::int as eod_submitted_days,
        coalesce(sum(eod_missing_days),0)::int as eod_missing_days,
        coalesce(sum(open_carryover),0)::int as open_carryover
      from filtered_employee_rows
    ),
    completion_stats as (
      select
        coalesce(avg(completion)::numeric, 0) as completion_avg
      from eod_range_updates
      where completion is not null
    ),
    minutes_total as (
      select coalesce(sum(total_spent_minutes),0)::int as total_minutes
      from eod_latest
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
      'carryoverAging', coalesce((
        select jsonb_agg(jsonb_build_object(
          'employeeName', c.employee_name,
          'department', c.department,
          'taskKey', c.task_key,
          'title', c.title,
          'project', nullif(coalesce(c.project, ''), ''),
          'completionPercent', c.completion_percent,
          'pendingSinceDate', c.pending_since_date::text,
          'pendingWorkingDays', c.pending_working_days,
          'lastUpdatedDate', c.last_updated_date::text
        ) order by
          case when public.canonical_department_key(c.department) = 'marketing' then coalesce(c.project, '') else '' end,
          c.pending_working_days desc,
          c.employee_name,
          c.title)
        from open_carry_rows_limited c
      ), '[]'::jsonb),
      'completedTasks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'title', c.title,
          'project', nullif(coalesce(c.project, ''), ''),
          'employeeName', c.employee_name,
          'department', c.department,
          'addedDate', c.added_date::text,
          'completedDate', c.completed_date::text,
          'daysTakenWorking', c.days_taken_working,
          'status', c.task_status
        ) order by
          case when public.canonical_department_key(c.department) = 'marketing' then coalesce(c.project, '') else '' end,
          c.completed_date desc,
          c.submitted_at desc,
          c.department,
          c.employee_name,
          c.title)
        from completed_rows_limited c
      ), '[]'::jsonb),
      'meta', jsonb_build_object(
        'generatedAt', public.rfc3339_now(),
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
        'departmentOptions', coalesce((
          select jsonb_agg(distinct u.department order by u.department)
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
        ), '[]'::jsonb),
        'employeeOptions', coalesce((
          select jsonb_agg(distinct u.employee_name order by u.employee_name)
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
        ), '[]'::jsonb),
        'projectOptions', coalesce((
          select jsonb_agg(distinct p.project order by p.project)
          from (
            select nullif(trim(coalesce(c.project, '')), '') as project
            from open_carry_rows_all c
            where public.canonical_department_key(c.department) = 'marketing'
            union
            select nullif(trim(coalesce(c.project, '')), '') as project
            from completed_rows c
            where public.canonical_department_key(c.department) = 'marketing'
          ) p
          where p.project is not null
        ), '[]'::jsonb)
      )
    )
    into v_res;

    return v_res;
  end;
  $$;

-- ============================================================================
-- One-time internal migration RPCs (service-role only)
-- ============================================================================

create or replace function public.internal_upsert_users_directory(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_count int := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_payload->'rows', '[]'::jsonb))
  loop
    insert into public.users_directory (
      department, employee_name, access_code_hash, email, changed_by, source, active
    ) values (
      coalesce(r->>'department',''),
      coalesce(r->>'employeeName',''),
      public.hash_secret(coalesce(r->>'accessCode','')),
      coalesce(r->>'email',''),
      coalesce(r->>'changedBy','migration'),
      coalesce(r->>'source','migration'),
      true
    )
    on conflict (department, employee_name) do update
      set access_code_hash = excluded.access_code_hash,
          email = excluded.email,
          changed_at = now(),
          changed_by = excluded.changed_by,
          source = excluded.source,
          active = true;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'upserted', v_count);
end;
$$;

create or replace function public.internal_upsert_admins_directory(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_count int := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_payload->'rows', '[]'::jsonb))
  loop
    insert into public.admins_directory (
      admin_name, admin_code_hash, role, allowed_departments_json, changed_by, source, active
    ) values (
      coalesce(r->>'adminName',''),
      public.hash_secret(coalesce(r->>'code','')),
      coalesce(r->>'role','Admin'),
      coalesce((r->>'allowedDepartments')::jsonb, '["All"]'::jsonb),
      coalesce(r->>'changedBy','migration'),
      coalesce(r->>'source','migration'),
      true
    )
    on conflict (admin_name) do update
      set admin_code_hash = excluded.admin_code_hash,
          role = excluded.role,
          allowed_departments_json = excluded.allowed_departments_json,
          changed_at = now(),
          changed_by = excluded.changed_by,
          source = excluded.source,
          active = true;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'upserted', v_count);
end;
$$;

create or replace function public.rpc_get_user_attendance(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department text := trim(coalesce(p_payload->>'department', p_payload->>'dept', ''));
  v_employee_name text := trim(coalesce(p_payload->>'employeeName', p_payload->>'name', ''));
  v_access_code text := trim(coalesce(p_payload->>'accessCode', p_payload->>'code', ''));
  v_admin text := trim(coalesce(p_payload->>'admin', ''));
  v_admin_code text := trim(coalesce(p_payload->>'adminCode', p_payload->>'admin_code', p_payload->>'code', ''));
  v_work_date date := coalesce(public.to_date_safe(p_payload->>'workDate'), (now() at time zone 'Asia/Kolkata')::date);
  v_is_direct_reportees boolean := (public.canonical_department_key(v_department) = 'directreportees');
  v_is_admin_allowed boolean := false;
  v_allowed_departments jsonb := null;
  v_user record;
  v_day_status text := '';
  v_user_email text := '';
  v_employee_name_key text := '';
  v_name_parts text[];
  v_first_name_key text := '';
  v_surname_initial_key text := '';
  v_row_count int := 0;
  v_first_in timestamptz := null;
  v_last_out timestamptz := null;
  v_working_minutes int := null;
  v_total_minutes int := null;
begin
  if nullif(v_admin, '') is not null and nullif(v_admin_code, '') is not null then
    select a.allowed_departments_json
    into v_allowed_departments
    from public.admins_directory a
    where lower(trim(a.admin_name)) = lower(trim(v_admin))
      and a.active = true
      and public.secret_matches(v_admin_code, a.admin_code_hash)
    limit 1;

    if v_allowed_departments is not null then
      v_is_admin_allowed := (
        (v_allowed_departments ? 'All')
        or exists (
          select 1
          from jsonb_array_elements_text(v_allowed_departments) d(dep)
          where public.canonical_department_key(d.dep) = public.canonical_department_key(v_department)
        )
      );
    end if;
  end if;

  if v_department = '' or v_employee_name = '' or (v_access_code = '' and not v_is_admin_allowed) then
    return jsonb_build_object('ok', false, 'message', 'Missing access payload.');
  end if;

  if v_is_admin_allowed then
    select
      u.department as department,
      u.employee_name as employee_name,
      coalesce(u.email, '') as email
    into v_user
    from public.users_directory u
    where u.active = true
      and lower(trim(u.employee_name)) = lower(trim(v_employee_name))
      and (
        v_is_direct_reportees
        or public.canonical_department_key(u.department) = public.canonical_department_key(v_department)
      )
    order by u.changed_at desc nulls last
    limit 1;
  else
    select
      u.department as department,
      u.employee_name as employee_name,
      coalesce(u.email, '') as email
    into v_user
    from public.users_directory u
    where u.active = true
      and lower(trim(u.employee_name)) = lower(trim(v_employee_name))
      and (
        v_is_direct_reportees
        or public.canonical_department_key(u.department) = public.canonical_department_key(v_department)
      )
      and public.secret_matches(v_access_code, u.access_code_hash)
    order by u.changed_at desc nulls last
    limit 1;
  end if;

  if not found then
    if v_is_admin_allowed then
      -- Admin path: fallback by first-name match in same department scope.
      select
        u.department as department,
        u.employee_name as employee_name,
        coalesce(u.email, '') as email
      into v_user
      from public.users_directory u
      where u.active = true
        and (
          v_is_direct_reportees
          or public.canonical_department_key(u.department) = public.canonical_department_key(v_department)
        )
        and regexp_replace(split_part(lower(trim(coalesce(u.employee_name, ''))), ' ', 1), '[^a-z0-9]', '', 'g')
            = regexp_replace(split_part(lower(trim(coalesce(v_employee_name, ''))), ' ', 1), '[^a-z0-9]', '', 'g')
      order by u.changed_at desc nulls last
      limit 1;
    else
      -- User path: fallback to code-based lookup inside the same department scope.
      select
        u.department as department,
        u.employee_name as employee_name,
        coalesce(u.email, '') as email
      into v_user
      from public.users_directory u
      where u.active = true
        and public.secret_matches(v_access_code, u.access_code_hash)
        and (
          v_is_direct_reportees
          or public.canonical_department_key(u.department) = public.canonical_department_key(v_department)
        )
      order by u.changed_at desc nulls last
      limit 1;
    end if;
  end if;

  if not found then
    if v_is_admin_allowed then
      -- Admin path: department-agnostic first-name fallback.
      select
        u.department as department,
        u.employee_name as employee_name,
        coalesce(u.email, '') as email
      into v_user
      from public.users_directory u
      where u.active = true
        and regexp_replace(split_part(lower(trim(coalesce(u.employee_name, ''))), ' ', 1), '[^a-z0-9]', '', 'g')
            = regexp_replace(split_part(lower(trim(coalesce(v_employee_name, ''))), ' ', 1), '[^a-z0-9]', '', 'g')
      order by u.changed_at desc nulls last
      limit 1;
    else
      -- Department-agnostic fallback for stale/legacy links.
      select
        u.department as department,
        u.employee_name as employee_name,
        coalesce(u.email, '') as email
      into v_user
      from public.users_directory u
      where u.active = true
        and public.secret_matches(v_access_code, u.access_code_hash)
      order by u.changed_at desc nulls last
      limit 1;
    end if;
  end if;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Invalid access.');
  end if;

  if v_is_direct_reportees then
    v_department := coalesce(v_user.department, v_department);
  end if;
  v_employee_name := coalesce(v_user.employee_name, v_employee_name);
  v_user_email := coalesce(v_user.email, '');
  v_employee_name_key := lower(regexp_replace(coalesce(v_employee_name, ''), '[^a-z0-9]', '', 'g'));
  v_name_parts := regexp_split_to_array(
    trim(regexp_replace(lower(coalesce(v_employee_name, '')), '\s+', ' ', 'g')),
    '\s+'
  );
  if coalesce(array_length(v_name_parts, 1), 0) >= 1 then
    v_first_name_key := regexp_replace(coalesce(v_name_parts[1], ''), '[^a-z0-9]', '', 'g');
  end if;
  if coalesce(array_length(v_name_parts, 1), 0) >= 2 then
    v_surname_initial_key := substr(
      regexp_replace(coalesce(v_name_parts[array_length(v_name_parts, 1)], ''), '[^a-z0-9]', '', 'g'),
      1,
      1
    );
  end if;

  select coalesce(l.leave_status, '')
  into v_day_status
  from public.leave_days l
  where l.leave_date = v_work_date
    and public.canonical_department_key(l.department) = public.canonical_department_key(v_department)
    and lower(trim(l.employee_name)) = lower(trim(v_employee_name))
  order by l.updated_at desc nulls last
  limit 1;

  if to_regclass('public.user_attendance_logs') is null then
    return jsonb_build_object(
      'ok', true,
      'workDate', v_work_date::text,
      'dayStatus', nullif(v_day_status, ''),
      'attendance', null
    );
  end if;

  execute $sql$
    select
      count(*)::int as row_count,
      min(l.from_time) filter (where l.from_time is not null) as first_in_time,
      max(l.to_time) filter (where l.to_time is not null) as last_out_time,
      max(l.working_minutes) as working_minutes,
      max(l.total_minutes) as total_minutes
    from public.user_attendance_logs l
    where public.to_date_safe(l.attendance_day::text) = $1
      and (
        (
          (
            public.canonical_department_key(coalesce(l.department, '')) = public.canonical_department_key($2)
            or nullif(trim(coalesce(l.department, '')), '') is null
            or public.canonical_department_key(coalesce(l.department, '')) like public.canonical_department_key($2) || '%'
            or public.canonical_department_key($2) like public.canonical_department_key(coalesce(l.department, '')) || '%'
          )
          and (
            lower(trim(coalesce(l.employee_name, ''))) = lower(trim($3))
            or lower(regexp_replace(coalesce(l.employee_name, ''), '[^a-z0-9]', '', 'g')) = $5
          )
        )
        or (
          nullif(trim($4), '') is not null
          and lower(trim(coalesce(l.employee_email, ''))) = lower(trim($4))
        )
      )
  $sql$
  into v_row_count, v_first_in, v_last_out, v_working_minutes, v_total_minutes
  using v_work_date, v_department, v_employee_name, v_user_email, v_employee_name_key;

  if coalesce(v_row_count, 0) = 0 then
    execute $sql$
      with normalized as (
        select
          l.from_time,
          l.to_time,
          l.working_minutes,
          l.total_minutes,
          lower(regexp_replace(coalesce(l.employee_name, ''), '[^a-z0-9]', '', 'g')) as full_key,
          regexp_replace(split_part(lower(trim(coalesce(l.employee_name, ''))), ' ', 1), '[^a-z0-9]', '', 'g') as first_key,
          case
            when strpos(trim(coalesce(l.employee_name, '')), ' ') > 0 then
              substr(
                regexp_replace(
                  (regexp_split_to_array(lower(trim(coalesce(l.employee_name, ''))), '\s+'))[
                    array_length(regexp_split_to_array(lower(trim(coalesce(l.employee_name, ''))), '\s+'), 1)
                  ],
                  '[^a-z0-9]',
                  '',
                  'g'
                ),
                1,
                1
              )
            else ''
          end as surname_initial
        from public.user_attendance_logs l
        where public.to_date_safe(l.attendance_day::text) = $1
      ),
      first_matches as (
        select *
        from normalized
        where first_key = $2
          and first_key <> ''
      ),
      first_name_count as (
        select count(distinct full_key) as people_count
        from first_matches
      ),
      pick as (
        select
          f.*,
          case
            when f.full_key = $4 then 3
            when $3 <> '' and f.surname_initial = $3 then 2
            else 1
          end as score
        from first_matches f
        cross join first_name_count c
        where c.people_count = 1
           or ($3 <> '' and f.surname_initial = $3)
      ),
      best as (
        select *
        from pick
        where score = (select max(score) from pick)
      ),
      best_unique as (
        select b.*
        from best b
        where (select count(distinct b2.full_key) from best b2) = 1
      )
      select
        count(*)::int as row_count,
        min(b.from_time) filter (where b.from_time is not null) as first_in_time,
        max(b.to_time) filter (where b.to_time is not null) as last_out_time,
        max(b.working_minutes) as working_minutes,
        max(b.total_minutes) as total_minutes
      from best_unique b
    $sql$
    into v_row_count, v_first_in, v_last_out, v_working_minutes, v_total_minutes
    using v_work_date, v_first_name_key, v_surname_initial_key, v_employee_name_key;
  end if;

  if coalesce(v_row_count, 0) = 0 and to_regclass('public.zoho_people_attendance_raw') is not null then
    execute $sql$
      with raw_rows as (
        select
          coalesce(
            public.parse_zoho_people_timestamp_on_day(
              r."FromTime",
              public.parse_zoho_people_date(r."AttendanceDay")
            ),
            public.parse_zoho_people_timestamp_on_day(
              r.payload_json->>'FromTime',
              public.parse_zoho_people_date(coalesce(r.payload_json->>'AttendanceDay', r."AttendanceDay"))
            ),
            public.parse_zoho_people_timestamp_on_day(
              r.payload_json->>'fromTime',
              public.parse_zoho_people_date(coalesce(r.payload_json->>'attendanceDay', r."AttendanceDay"))
            ),
            public.parse_zoho_people_timestamp_on_day(
              r.payload_json->>'loginTime',
              public.parse_zoho_people_date(coalesce(r.payload_json->>'attendanceDay', r."AttendanceDay"))
            )
          ) as from_time,
          coalesce(
            public.parse_zoho_people_timestamp_on_day(
              r."ToTime",
              public.parse_zoho_people_date(r."AttendanceDay")
            ),
            public.parse_zoho_people_timestamp_on_day(
              r.payload_json->>'ToTime',
              public.parse_zoho_people_date(coalesce(r.payload_json->>'AttendanceDay', r."AttendanceDay"))
            ),
            public.parse_zoho_people_timestamp_on_day(
              r.payload_json->>'toTime',
              public.parse_zoho_people_date(coalesce(r.payload_json->>'attendanceDay', r."AttendanceDay"))
            ),
            public.parse_zoho_people_timestamp_on_day(
              r.payload_json->>'logoutTime',
              public.parse_zoho_people_date(coalesce(r.payload_json->>'attendanceDay', r."AttendanceDay"))
            )
          ) as to_time,
          coalesce(
            public.parse_hhmm_to_minutes(r."WorkingHours"),
            public.parse_hhmm_to_minutes(r.payload_json->>'WorkingHours'),
            public.parse_hhmm_to_minutes(r.payload_json->>'workingHours')
          ) as working_minutes,
          coalesce(
            public.parse_hhmm_to_minutes(r."TotalHours"),
            public.parse_hhmm_to_minutes(r.payload_json->>'TotalHours'),
            public.parse_hhmm_to_minutes(r.payload_json->>'totalHours')
          ) as total_minutes
        from public.zoho_people_attendance_raw r
        where public.parse_zoho_people_date(coalesce(r."AttendanceDay", r.payload_json->>'AttendanceDay')) = $1
          and (
            lower(trim(regexp_replace(coalesce(r."EmployeeID", ''), '\s+E[0-9A-Za-z]+\s*$', '', 'i'))) = lower(trim($2))
            or lower(trim(regexp_replace(coalesce(r."EmployeeID", ''), '\s+E[0-9A-Za-z]+\s*$', '', 'i'))) like lower(trim($2)) || '%'
            or lower(trim($2)) like lower(trim(regexp_replace(coalesce(r."EmployeeID", ''), '\s+E[0-9A-Za-z]+\s*$', '', 'i'))) || '%'
            or (
              nullif(trim($3), '') is not null
              and lower(trim(coalesce(r.payload_json->>'employeeEmail', r.payload_json->>'Email', ''))) = lower(trim($3))
            )
          )
      )
      select
        count(*)::int as row_count,
        min(x.from_time) filter (where x.from_time is not null) as first_in_time,
        max(x.to_time) filter (where x.to_time is not null) as last_out_time,
        max(x.working_minutes) as working_minutes,
        max(x.total_minutes) as total_minutes
      from raw_rows x
    $sql$
    into v_row_count, v_first_in, v_last_out, v_working_minutes, v_total_minutes
    using v_work_date, v_employee_name, v_user_email;
  end if;

  if coalesce(v_row_count, 0) = 0 then
    return jsonb_build_object(
      'ok', true,
      'workDate', v_work_date::text,
      'dayStatus', nullif(v_day_status, ''),
      'attendance', null
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'workDate', v_work_date::text,
    'dayStatus', nullif(v_day_status, ''),
      'attendance', jsonb_build_object(
      'loginTime', case when v_first_in is null then '' else to_char(v_first_in at time zone 'Asia/Kolkata', 'HH24:MI') end,
      'logoutTime', case
        when v_last_out is not null then to_char(v_last_out at time zone 'Asia/Kolkata', 'HH24:MI')
        else ''
      end,
      'workingMinutes', case
        when v_first_in is not null
         and v_last_out is not null
         and v_last_out >= v_first_in
        then floor(extract(epoch from (v_last_out - v_first_in)) / 60)::int
        else coalesce(v_working_minutes, v_total_minutes)
      end
    )
  );
end;
$$;

create or replace function public.rpc_get_user_day_status(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department text := coalesce(p_payload->>'department', p_payload->>'dept', '');
  v_employee text := coalesce(p_payload->>'employeeName', p_payload->>'name', '');
  v_code text := coalesce(p_payload->>'accessCode', p_payload->>'code', '');
  v_work_date date := coalesce(public.to_date_safe(p_payload->>'workDate'), (now() at time zone 'Asia/Kolkata')::date);
  v_status text := '';
begin
  perform 1
  from public.users_directory u
  where public.canonical_department_key(u.department) = public.canonical_department_key(v_department)
    and lower(trim(u.employee_name)) = lower(trim(v_employee))
    and u.active = true
    and public.secret_matches(v_code, u.access_code_hash)
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Invalid access.');
  end if;

  select coalesce(l.leave_status, '')
  into v_status
  from public.leave_days l
  where l.leave_date = v_work_date
    and public.canonical_department_key(l.department) = public.canonical_department_key(v_department)
    and lower(trim(l.employee_name)) = lower(trim(v_employee))
  order by l.updated_at desc nulls last
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'workDate', v_work_date::text,
    'status', nullif(v_status, '')
  );
end;
$$;

create or replace function public.rpc_admin_grant_missing_checkout_override(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text := coalesce(p_payload->>'admin', '');
  v_code text := coalesce(p_payload->>'code', '');
  v_department text := coalesce(p_payload->>'department', '');
  v_employee text := coalesce(p_payload->>'employeeName', '');
  v_work_date date := coalesce(public.to_date_safe(p_payload->>'workDate'), current_date);
  v_reason text := left(trim(coalesce(p_payload->>'reason', 'Missing checkout override approved by admin.')), 500);
  v_allowed jsonb;
  v_event_key text;
begin
  if v_department = '' or v_employee = '' then
    return jsonb_build_object('ok', false, 'message', 'department and employeeName are required.');
  end if;

  select a.allowed_departments_json
  into v_allowed
  from public.admins_directory a
  where lower(trim(a.admin_name)) = lower(trim(v_admin))
    and a.active = true
    and public.secret_matches(v_code, a.admin_code_hash)
  limit 1;

  if v_allowed is null then
    return jsonb_build_object('ok', false, 'message', 'Unauthorized');
  end if;

  if not (
    (v_allowed ? 'All')
    or exists (
      select 1
      from jsonb_array_elements_text(v_allowed) d(dep)
      where public.canonical_department_key(d.dep) = public.canonical_department_key(v_department)
    )
  ) then
    return jsonb_build_object('ok', false, 'message', 'Unauthorized department');
  end if;

  v_event_key := public.event_digest_key(
    'attendance_override',
    jsonb_build_object(
      'nonce', clock_timestamp()::text,
      'department', v_department,
      'employeeName', v_employee,
      'workDate', v_work_date::text,
      'overrideType', 'missing_checkout_eod',
      'status', 'Granted'
    )
  );

  insert into public.task_admin_events(
    event_key, event_type, changed_at, work_date, department, employee_name, task_id, title, status, payload_json
  )
  values (
    v_event_key,
    'attendance_override',
    now(),
    v_work_date,
    v_department,
    v_employee,
    null,
    'Missing checkout override',
    'Granted',
    jsonb_build_object(
      'overrideType', 'missing_checkout_eod',
      'reason', v_reason,
      'grantedBy', v_admin,
      'grantedAt', public.rfc3339_now()
    )
  );

  return jsonb_build_object(
    'ok', true,
    'department', v_department,
    'employeeName', v_employee,
    'workDate', v_work_date::text,
    'overrideType', 'missing_checkout_eod',
    'status', 'Granted'
  );
end;
$$;

-- ============================================================================
-- Seed: Advisory department user(s)
-- ============================================================================

insert into public.users_directory (
  department, employee_name, access_code_hash, email, changed_by, source, active
)
values (
  'Advisory',
  'Rashi Panchal',
  public.hash_secret('AD-RP-5791'),
  '',
  'migration',
  'seed',
  true
)
on conflict (department, employee_name) do update
  set access_code_hash = excluded.access_code_hash,
      email = excluded.email,
      changed_at = now(),
      changed_by = excluded.changed_by,
      source = excluded.source,
      active = true;

-- ============================================================================
-- Grants
-- ============================================================================

grant usage on schema public to anon, authenticated;

do $$
declare
  fn_name text;
  grant_fns text[] := array[
    'rpc_validate_user_access',
    'rpc_validate_admin_access',
    'rpc_get_start_draft',
    'rpc_save_start_draft',
    'rpc_submit_sod',
    'rpc_submit_eod',
    'rpc_get_department_approvers',
    'rpc_submit_approval_requests',
    'rpc_get_user_approvals',
    'rpc_get_admin_approvals',
    'rpc_resolve_approval_request',
    'rpc_resubmit_approval_request',
    'rpc_cancel_approval_request',
    'rpc_get_user_streak',
    'rpc_get_user_attendance',
    'rpc_set_user_day_status',
    'rpc_get_user_day_status',
    'rpc_get_streak_leaderboard',
    'rpc_get_carryover',
    'rpc_get_assignments',
    'rpc_get_recurring_tasks',
    'rpc_get_submitted_day_details',
    'rpc_sync_recurring_tasks',
    'rpc_complete_recurring_tasks',
    'rpc_get_planner_tasks',
    'rpc_planner_add_tasks',
    'rpc_planner_move_to_sod',
    'rpc_planner_return_tasks',
    'rpc_planner_mark_consumed',
    'rpc_planner_update_task',
    'rpc_planner_delete_task',
    'rpc_get_user_directory',
    'rpc_get_admin_dashboard',
    'rpc_assign_tasks',
    'rpc_admin_remove_pending_task',
    'rpc_admin_complete_pending_task',
    'rpc_admin_rename_pending_task',
    'rpc_admin_grant_missing_checkout_override',
    'rpc_create_user',
    'rpc_deactivate_user',
    'rpc_reactivate_user',
    'rpc_list_all_users',
    'rpc_log_cliq_failure',
    'rpc_get_failed_cliq_logs',
    'rpc_resolve_failed_cliq_log'
  ];
  revoke_fns text[] := array[
    'internal_upsert_users_directory',
    'internal_upsert_admins_directory'
  ];
begin
  foreach fn_name in array grant_fns loop
    if to_regprocedure(format('public.%I(jsonb)', fn_name)) is not null then
      execute format('grant execute on function public.%I(jsonb) to anon, authenticated', fn_name);
    end if;
  end loop;

  foreach fn_name in array revoke_fns loop
    if to_regprocedure(format('public.%I(jsonb)', fn_name)) is not null then
      execute format('revoke execute on function public.%I(jsonb) from public, anon, authenticated', fn_name);
    end if;
  end loop;
end;
$$;
