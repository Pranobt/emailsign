-- ============================================================================

create or replace function public.rpc_validate_user_access(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department text := coalesce(p_payload->>'dept', p_payload->>'department', '');
  v_employee text := coalesce(p_payload->>'name', p_payload->>'employeeName', '');
  v_code text := coalesce(p_payload->>'code', p_payload->>'accessCode', '');
  rec record;
begin
  select * into rec
  from public.users_directory u
  where public.canonical_department_key(u.department) = public.canonical_department_key(v_department)
    and lower(trim(u.employee_name)) = lower(trim(v_employee))
    and u.active = true
  limit 1;

  if rec is null then
    return jsonb_build_object('ok', false, 'message', 'Invalid access.');
  end if;

  if not public.secret_matches(v_code, rec.access_code_hash) then
    return jsonb_build_object('ok', false, 'message', 'Invalid access.');
  end if;

  return jsonb_build_object('ok', true, 'dept', rec.department, 'name', rec.employee_name);
end;
$$;

create or replace function public.rpc_validate_admin_access(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text := coalesce(p_payload->>'admin', '');
  v_code text := coalesce(p_payload->>'code', '');
  rec record;
begin
  select * into rec
  from public.admins_directory a
  where lower(trim(a.admin_name)) = lower(trim(v_admin))
    and a.active = true
  limit 1;

  if rec is null then
    return jsonb_build_object('ok', false, 'message', 'Admin not found.');
  end if;
  if not public.secret_matches(v_code, rec.admin_code_hash) then
    return jsonb_build_object('ok', false, 'message', 'Invalid admin code.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'admin', rec.admin_name,
    'role', rec.role,
    'allowedDepartments', rec.allowed_departments_json
  );
end;
$$;

-- ============================================================================
-- Submission RPCs
-- ============================================================================

create or replace function public.rpc_get_start_draft(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department text := coalesce(p_payload->>'department', p_payload->>'dept', '');
  v_employee text := coalesce(p_payload->>'employeeName', p_payload->>'name', '');
  v_code text := coalesce(p_payload->>'accessCode', p_payload->>'code', '');
  v_work_date date := coalesce(public.to_date_safe(p_payload->>'workDate'), current_date);
  v_user record;
  v_payload jsonb := '{}'::jsonb;
begin
  select * into v_user
  from public.users_directory u
  where public.canonical_department_key(u.department) = public.canonical_department_key(v_department)
    and lower(trim(u.employee_name)) = lower(trim(v_employee))
    and u.active = true
  limit 1;

  if v_user is null or not public.secret_matches(v_code, v_user.access_code_hash) then
    return jsonb_build_object('ok', false, 'message', 'Invalid access.');
  end if;

  select d.payload_json
  into v_payload
  from public.task_start_drafts d
  where public.canonical_department_key(d.department) = public.canonical_department_key(v_user.department)
    and lower(trim(d.employee_name)) = lower(trim(v_user.employee_name))
    and d.work_date = v_work_date
  order by d.updated_at desc
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'workDate', v_work_date::text,
    'tasks', coalesce(v_payload->'tasks', '[]'::jsonb),
    'selectedTaskIds', coalesce(v_payload->'selectedTaskIds', '{}'::jsonb),
    'updatedAt', coalesce(v_payload->>'updatedAt', '')
  );
end;
$$;

create or replace function public.rpc_save_start_draft(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department text := coalesce(p_payload->>'department', p_payload->>'dept', '');
  v_employee text := coalesce(p_payload->>'employeeName', p_payload->>'name', '');
  v_code text := coalesce(p_payload->>'accessCode', p_payload->>'code', '');
  v_work_date date := coalesce(public.to_date_safe(p_payload->>'workDate'), current_date);
  v_tasks jsonb := coalesce(p_payload->'tasks', '[]'::jsonb);
  v_selected jsonb := coalesce(p_payload->'selectedTaskIds', '{}'::jsonb);
  v_user record;
begin
  select * into v_user
  from public.users_directory u
  where public.canonical_department_key(u.department) = public.canonical_department_key(v_department)
    and lower(trim(u.employee_name)) = lower(trim(v_employee))
    and u.active = true
  limit 1;

  if v_user is null or not public.secret_matches(v_code, v_user.access_code_hash) then
    return jsonb_build_object('ok', false, 'message', 'Invalid access.');
  end if;

  if coalesce(jsonb_array_length(v_tasks), 0) <= 0 then
    delete from public.task_start_drafts d
    where public.canonical_department_key(d.department) = public.canonical_department_key(v_user.department)
      and lower(trim(d.employee_name)) = lower(trim(v_user.employee_name))
      and d.work_date = v_work_date;

    return jsonb_build_object('ok', true, 'workDate', v_work_date::text, 'deleted', true);
  end if;

  insert into public.task_start_drafts (
    work_date, department, employee_name, payload_json, created_at, updated_at
  ) values (
    v_work_date,
    v_user.department,
    v_user.employee_name,
    jsonb_build_object(
      'tasks', v_tasks,
      'selectedTaskIds', v_selected,
      'updatedAt', public.rfc3339_now()
    ),
    now(),
    now()
  )
  on conflict (work_date, department, employee_name) do update
    set payload_json = excluded.payload_json,
        updated_at = now();

  return jsonb_build_object('ok', true, 'workDate', v_work_date::text, 'saved', true);
end;
$$;

create or replace function public.rpc_submit_sod(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_date date := coalesce(public.to_date_safe(p_payload->>'workDate'), current_date);
  v_task_count int := coalesce(jsonb_array_length(coalesce(p_payload->'tasks', '[]'::jsonb)), 0);
begin
  insert into public.task_submissions (
    request_id, stage, submitted_at, work_date, department, employee_name, access_code, task_count, total_spent_minutes, payload_json
  ) values (
    nullif(p_payload->>'requestId',''),
    'SOD',
    coalesce((p_payload->>'submittedAt')::timestamptz, now()),
    v_work_date,
    coalesce(p_payload->>'department',''),
    coalesce(p_payload->>'employeeName',''),
    coalesce(p_payload->>'accessCode', p_payload->>'code', ''),
    v_task_count,
    0,
    p_payload
  ) on conflict (request_id) do nothing;

  delete from public.task_start_drafts d
  where public.canonical_department_key(d.department) = public.canonical_department_key(coalesce(p_payload->>'department',''))
    and lower(trim(d.employee_name)) = lower(trim(coalesce(p_payload->>'employeeName','')))
    and d.work_date = v_work_date;

  return jsonb_build_object('ok', true, 'taskCount', v_task_count);
end;
$$;

create or replace function public.rpc_submit_eod(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_date date := coalesce(public.to_date_safe(p_payload->>'workDate'), current_date);
  v_task_count int := coalesce(jsonb_array_length(coalesce(p_payload->'updates', '[]'::jsonb)), 0);
  v_total_minutes int := coalesce(nullif(p_payload->>'totalSpentMinutes','')::int, 0);
  v_department text := coalesce(p_payload->>'department','');
  v_employee text := coalesce(p_payload->>'employeeName','');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_approval_requests jsonb := coalesce(p_payload->'approvalRequests', '[]'::jsonb);
  v_approval_count int := coalesce(jsonb_array_length(v_approval_requests), 0);
  v_approval_pending_count int := 0;
  v_attendance jsonb := coalesce(p_payload->'attendance', '{}'::jsonb);
  v_login_time text := coalesce(nullif(v_attendance->>'loginTime', ''), nullif(p_payload->>'loginTime', ''), nullif(p_payload->>'checkInTime', ''));
  v_logout_time text := coalesce(
    nullif(v_attendance->>'logoutTime', ''),
    nullif(v_attendance->>'checkoutTime', ''),
    nullif(v_attendance->>'checkOutTime', ''),
    nullif(p_payload->>'logoutTime', ''),
    nullif(p_payload->>'checkoutTime', ''),
    nullif(p_payload->>'checkOutTime', '')
  );
  v_missing_checkout_exception boolean := false;
  v_missing_checkout_limit int := 2;
  v_missing_checkout_used_count int := 0;
  v_missing_checkout_override_granted boolean := false;
  v_missing_checkout_override_event_key text := '';
  v_hist record;
  v_prev_current int := 0;
  v_prev_best int := 0;
  v_next_current int := 0;
  v_next_best int := 0;
  v_incremented boolean := false;
  v_milestone int := null;
begin
  v_missing_checkout_exception := coalesce(v_login_time, '') <> '' and coalesce(v_logout_time, '') = '';
  if v_missing_checkout_exception then
    select
      coalesce(e.event_key, ''),
      lower(coalesce(e.status, '')) = 'granted'
    into v_missing_checkout_override_event_key, v_missing_checkout_override_granted
    from public.task_admin_events e
    where e.event_type = 'attendance_override'
      and public.canonical_department_key(e.department) = public.canonical_department_key(v_department)
      and lower(trim(e.employee_name)) = lower(trim(v_employee))
      and coalesce(e.work_date, v_work_date) = v_work_date
      and lower(coalesce(e.payload_json->>'overrideType', '')) = 'missing_checkout_eod'
    order by e.changed_at desc
    limit 1;

    select count(*)::int
    into v_missing_checkout_used_count
    from public.task_submissions s
    where s.stage = 'EOD'
      and public.canonical_department_key(s.department) = public.canonical_department_key(v_department)
      and lower(trim(s.employee_name)) = lower(trim(v_employee))
      and date_trunc('month', s.work_date)::date = date_trunc('month', v_work_date)::date
      and coalesce(
        nullif(s.payload_json #>> '{attendance,loginTime}', ''),
        nullif(s.payload_json->>'loginTime', ''),
        nullif(s.payload_json->>'checkInTime', '')
      ) <> ''
      and coalesce(
        nullif(s.payload_json #>> '{attendance,logoutTime}', ''),
        nullif(s.payload_json #>> '{attendance,checkoutTime}', ''),
        nullif(s.payload_json #>> '{attendance,checkOutTime}', ''),
        nullif(s.payload_json->>'logoutTime', ''),
        nullif(s.payload_json->>'checkoutTime', ''),
        nullif(s.payload_json->>'checkOutTime', ''),
        ''
      ) = '';

    if v_missing_checkout_used_count >= v_missing_checkout_limit and not v_missing_checkout_override_granted then
      return jsonb_build_object(
        'ok', false,
        'message', format(
          'Monthly missing-checkout exception limit reached for %s. Only %s End-of-Day submissions without checkout are allowed per month.',
          to_char(v_work_date, 'Mon YYYY'),
          v_missing_checkout_limit
        ),
        'attendanceException', jsonb_build_object(
          'missingCheckout', true,
          'usedCount', v_missing_checkout_used_count,
          'limit', v_missing_checkout_limit,
          'remainingCount', 0,
          'monthKey', to_char(v_work_date, 'YYYY-MM')
        )
      );
    end if;

    v_payload := v_payload || jsonb_build_object(
      'attendanceException', jsonb_build_object(
        'missingCheckout', true,
        'usedCount', v_missing_checkout_used_count + 1,
        'limit', v_missing_checkout_limit,
        'remainingCount', greatest(v_missing_checkout_limit - (v_missing_checkout_used_count + 1), 0),
        'monthKey', to_char(v_work_date, 'YYYY-MM'),
        'overrideUsed', v_missing_checkout_override_granted
      )
    );
  end if;

  insert into public.task_submissions (
    request_id, stage, submitted_at, work_date, department, employee_name, access_code, task_count, total_spent_minutes, payload_json
  ) values (
    nullif(p_payload->>'requestId',''),
    'EOD',
    coalesce((p_payload->>'submittedAt')::timestamptz, now()),
    v_work_date,
    v_department,
    v_employee,
    coalesce(p_payload->>'accessCode', p_payload->>'code', ''),
    v_task_count,
    v_total_minutes,
    v_payload
  ) on conflict (request_id) do nothing;

  delete from public.task_start_drafts d
  where public.canonical_department_key(d.department) = public.canonical_department_key(v_department)
    and lower(trim(d.employee_name)) = lower(trim(v_employee))
    and d.work_date = v_work_date;

  if v_missing_checkout_exception and v_missing_checkout_override_granted then
    insert into public.task_admin_events(
      event_key, event_type, changed_at, work_date, department, employee_name, task_id, title, status, payload_json
    ) values (
      public.event_digest_key(
        'attendance_override',
        jsonb_build_object(
          'nonce', clock_timestamp()::text,
          'department', v_department,
          'employeeName', v_employee,
          'workDate', v_work_date::text,
          'overrideType', 'missing_checkout_eod',
          'sourceEventKey', v_missing_checkout_override_event_key,
          'status', 'Consumed'
        )
      ),
      'attendance_override',
      now(),
      v_work_date,
      v_department,
      v_employee,
      null,
      'Missing checkout override',
      'Consumed',
      jsonb_build_object(
        'overrideType', 'missing_checkout_eod',
        'sourceEventKey', v_missing_checkout_override_event_key,
        'consumedAt', public.rfc3339_now()
      )
    );
  end if;

  select
    coalesce(us.current_streak, 0),
    coalesce(us.best_streak, 0)
  into v_prev_current, v_prev_best
  from public.user_streaks us
  where public.canonical_department_key(us.department) = public.canonical_department_key(v_department)
    and lower(trim(us.employee_name)) = lower(trim(v_employee))
  limit 1;

  select *
  into v_hist
  from public.compute_user_streak_from_submissions(v_department, v_employee);
  v_next_current := coalesce(v_hist.current_streak, 0);
  v_next_best := greatest(v_next_current, coalesce(v_hist.best_streak, 0), coalesce(v_prev_best, 0));
  v_incremented := v_next_current > coalesce(v_prev_current, 0);

  insert into public.user_streaks (department, employee_name, current_streak, best_streak, last_counted_date, updated_at)
  values (
    v_department,
    v_employee,
    v_next_current,
    v_next_best,
    v_hist.last_counted_date,
    now()
  )
  on conflict (department, employee_name) do update
  set current_streak = excluded.current_streak,
      best_streak = greatest(public.user_streaks.best_streak, excluded.best_streak),
      last_counted_date = excluded.last_counted_date,
      updated_at = now();

  if v_incremented and v_next_current in (7, 30, 100, 365) then
    v_milestone := v_next_current;
  end if;

  select count(*)::int
  into v_approval_pending_count
  from jsonb_array_elements(v_approval_requests) r
  where lower(coalesce(r->>'approvalStatus', 'pending')) = 'pending';

  return jsonb_build_object(
    'ok', true,
    'taskCount', v_task_count,
    'totalSpentMinutes', v_total_minutes,
    'attendanceException', case
      when v_missing_checkout_exception then jsonb_build_object(
        'missingCheckout', true,
        'usedCount', v_missing_checkout_used_count + 1,
        'limit', v_missing_checkout_limit,
        'remainingCount', greatest(v_missing_checkout_limit - (v_missing_checkout_used_count + 1), 0),
        'monthKey', to_char(v_work_date, 'YYYY-MM'),
        'overrideUsed', v_missing_checkout_override_granted
      )
      else null
    end,
    'approvalSummary', jsonb_build_object(
      'requestedCount', v_approval_count,
      'pendingCount', v_approval_pending_count
    ),
    'streak', jsonb_build_object(
      'current', coalesce(v_next_current, 0),
      'best', coalesce(v_next_best, 0),
      'incremented', v_incremented,
      'milestone', v_milestone,
      'countedDate', v_work_date::text
    )
  );
end;
$$;

create or replace function public.rpc_get_user_streak(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department text := coalesce(p_payload->>'department', p_payload->>'dept', '');
  v_employee text := coalesce(p_payload->>'employeeName', p_payload->>'name', '');
  v_code text := coalesce(p_payload->>'accessCode', p_payload->>'code', '');
  v_hist record;
  v_sod_count int := 0;
  v_eod_count int := 0;
  v_today_ist date := (now() at time zone 'Asia/Kolkata')::date;
  v_start_date date;
  v_broken_since date := null;
  v_missing_sod boolean := false;
  v_missing_eod boolean := false;
  v_is_broken boolean := false;
  v_reason text := '';
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

  select *
  into v_hist
  from public.compute_user_streak_from_submissions(v_department, v_employee);

  insert into public.user_streaks (department, employee_name, current_streak, best_streak, last_counted_date, updated_at)
  values (
    v_department,
    v_employee,
    coalesce(v_hist.current_streak, 0),
    coalesce(v_hist.best_streak, 0),
    v_hist.last_counted_date,
    now()
  )
  on conflict (department, employee_name) do update
  set current_streak = excluded.current_streak,
      best_streak = greatest(public.user_streaks.best_streak, excluded.best_streak),
      last_counted_date = excluded.last_counted_date,
      updated_at = now();

  select count(distinct s.work_date)::int
  into v_sod_count
  from public.task_submissions s
  where s.stage = 'SOD'
    and public.canonical_department_key(s.department) = public.canonical_department_key(v_department)
    and lower(trim(s.employee_name)) = lower(trim(v_employee));

  select count(distinct s.work_date)::int
  into v_eod_count
  from public.task_submissions s
  where s.stage = 'EOD'
    and public.canonical_department_key(s.department) = public.canonical_department_key(v_department)
    and lower(trim(s.employee_name)) = lower(trim(v_employee));

  v_start_date := coalesce(v_hist.last_counted_date + 1, null);
  if v_start_date is not null and v_start_date <= (v_today_ist - 1) then
    with day_flags as (
      select
        s.work_date,
        bool_or(s.stage = 'SOD') as has_sod,
        bool_or(s.stage = 'EOD') as has_eod
      from public.task_submissions s
      where public.canonical_department_key(s.department) = public.canonical_department_key(v_department)
        and lower(trim(s.employee_name)) = lower(trim(v_employee))
      group by s.work_date
    ),
    day_seq as (
      select g::date as work_date
      from generate_series(v_start_date, v_today_ist - 1, interval '1 day') g
    )
    select
      d.work_date,
      not coalesce(f.has_sod, false) as miss_sod,
      not coalesce(f.has_eod, false) as miss_eod
    into v_broken_since, v_missing_sod, v_missing_eod
    from day_seq d
    left join day_flags f on f.work_date = d.work_date
    where public.is_working_day_for_user(d.work_date, v_department, v_employee)
      and not (coalesce(f.has_sod, false) and coalesce(f.has_eod, false))
    order by d.work_date
    limit 1;
  end if;

  v_is_broken := v_broken_since is not null;
  if v_is_broken then
    if v_missing_sod and v_missing_eod then
      v_reason := 'SOD and EOD were not submitted';
    elsif v_missing_sod then
      v_reason := 'SOD was not submitted';
    else
      v_reason := 'EOD was not submitted';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'current', coalesce(v_hist.current_streak, 0),
    'best', coalesce(v_hist.best_streak, 0),
    'lastCountedDate', case when v_hist.last_counted_date is null then null else v_hist.last_counted_date::text end,
    'sodSubmittedDays', coalesce(v_sod_count, 0),
    'eodSubmittedDays', coalesce(v_eod_count, 0),
    'isBroken', v_is_broken,
    'brokenSinceDate', case when v_broken_since is null then null else v_broken_since::text end,
    'brokenReason', case when v_is_broken then v_reason else null end
  );
end;
$$;

-- ============================================================================
-- Approval RPCs
-- ============================================================================

create or replace function public.rpc_get_department_approvers(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department text := coalesce(p_payload->>'department', p_payload->>'dept', '');
  v_employee text := coalesce(p_payload->>'employeeName', p_payload->>'name', '');
  v_code text := coalesce(p_payload->>'accessCode', p_payload->>'code', '');
  v_approvers jsonb;
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'admin', a.admin_name,
        'role', a.role
      )
      order by a.admin_name
    ),
    '[]'::jsonb
  )
  into v_approvers
  from public.admins_directory a
  where a.active = true
    and exists (
      select 1
      from jsonb_array_elements_text(public.approval_approvers_for_department(v_department)) ap(name)
      where lower(trim(ap.name)) = lower(trim(a.admin_name))
    )
    and (
      (a.allowed_departments_json ? 'All')
      or exists (
        select 1
        from jsonb_array_elements_text(a.allowed_departments_json) d(dep)
        where public.canonical_department_key(d.dep) = public.canonical_department_key(v_department)
      )
    );

  return jsonb_build_object(
    'ok', true,
    'approvers', coalesce(v_approvers, '[]'::jsonb)
  );
end;
$$;

create or replace function public.rpc_submit_approval_requests(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department text := coalesce(p_payload->>'department', p_payload->>'dept', '');
  v_employee text := coalesce(p_payload->>'employeeName', p_payload->>'name', '');
  v_code text := coalesce(p_payload->>'accessCode', p_payload->>'code', '');
  v_work_date date := coalesce(public.to_date_safe(p_payload->>'workDate'), current_date);
  r jsonb;
  v_request_id text;
  v_task_id text;
  v_title text;
  v_priority text;
  v_completion int;
  v_spent_minutes int;
  v_source_note text;
  v_request_note text;
  v_approver text;
  v_existing_request_id text;
  v_existing_status text;
  v_existing_approver text;
  v_task_key text;
  v_requests jsonb := '[]'::jsonb;
  v_allowed_approvers jsonb := public.approval_approvers_for_department(v_department);
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

  if coalesce(jsonb_array_length(coalesce(p_payload->'tasks', '[]'::jsonb)), 0) = 0 then
    return jsonb_build_object('ok', false, 'message', 'No approval tasks provided.');
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_payload->'tasks', '[]'::jsonb))
  loop
    v_task_id := coalesce(r->>'taskId', '');
    v_title := trim(coalesce(r->>'title', ''));
    v_priority := public.normalize_priority(coalesce(r->>'priority', 'Medium'));
    v_completion := greatest(0, least(coalesce(nullif(r->>'completionPercent', '')::int, 0), 100));
    v_spent_minutes := greatest(0, coalesce(nullif(r->>'spentMinutes', '')::int, 0));
    v_source_note := coalesce(r->>'sourceNote', r->>'note', '');
    v_request_note := coalesce(r->>'requestNote', '');
    v_approver := trim(coalesce(r->>'approverAdmin', r->>'approver', ''));
    v_request_id := coalesce(nullif(trim(r->>'requestId'), ''), public.make_request_token('apr'));
    v_task_key := coalesce(nullif(trim(v_task_id), ''), lower(v_title));

    if v_title = '' then
      return jsonb_build_object('ok', false, 'message', 'Approval task title is required.');
    end if;
    if v_approver = '' then
      return jsonb_build_object('ok', false, 'message', 'Approver is required for approval tasks.');
    end if;
    if not exists (
      select 1
      from jsonb_array_elements_text(v_allowed_approvers) ap(name)
      where lower(trim(ap.name)) = lower(trim(v_approver))
    ) then
      return jsonb_build_object('ok', false, 'message', concat('Approver not allowed for department: ', v_approver));
    end if;

    perform 1
    from public.admins_directory a
    where lower(trim(a.admin_name)) = lower(trim(v_approver))
      and a.active = true
      and (
        (a.allowed_departments_json ? 'All')
        or exists (
          select 1
          from jsonb_array_elements_text(a.allowed_departments_json) d(dep)
          where public.canonical_department_key(d.dep) = public.canonical_department_key(v_department)
        )
      )
    limit 1;
    if not found then
      return jsonb_build_object('ok', false, 'message', concat('Approver not allowed for department: ', v_approver));
    end if;

    v_existing_request_id := null;
    v_existing_status := null;
    v_existing_approver := null;
    select
      x.request_id,
      x.status,
      x.chosen_approver_admin_name
    into
      v_existing_request_id,
      v_existing_status,
      v_existing_approver
    from public.task_approval_requests x
    where x.work_date = v_work_date
      and public.canonical_department_key(x.department) = public.canonical_department_key(v_department)
      and lower(trim(x.requester_name)) = lower(trim(v_employee))
      and coalesce(nullif(trim(x.source_task_id), ''), lower(trim(x.source_task_title))) = v_task_key
      and lower(coalesce(x.status, '')) in ('pending', 'approved')
    order by x.created_at desc
    limit 1;

    if v_existing_request_id is not null then
      v_requests := v_requests || jsonb_build_array(jsonb_build_object(
        'requestId', v_existing_request_id,
        'taskId', v_task_id,
        'title', v_title,
        'approvalStatus', coalesce(v_existing_status, 'pending'),
        'approvalApprover', coalesce(v_existing_approver, v_approver)
      ));
      continue;
    end if;

    insert into public.task_approval_requests (
      request_id,
      parent_request_id,
      work_date,
      department,
      requester_name,
      source_task_id,
      source_task_title,
      source_task_priority,
      source_completion_percent,
      source_spent_minutes,
      source_note,
      chosen_approver_admin_name,
      request_note,
      status,
      payload_json,
      created_at,
      updated_at
    )
    values (
      v_request_id,
      nullif(trim(coalesce(r->>'parentApprovalRequestId', '')), ''),
      v_work_date,
      v_department,
      v_employee,
      v_task_id,
      v_title,
      v_priority,
      v_completion,
      v_spent_minutes,
      v_source_note,
      v_approver,
      v_request_note,
      'pending',
      coalesce(r, '{}'::jsonb) || jsonb_build_object(
        'requestId', v_request_id,
        'workDate', v_work_date::text,
        'department', v_department,
        'requesterName', v_employee,
        'approverAdmin', v_approver
      ),
      now(),
      now()
    );

    insert into public.task_approval_events (
      event_key,
      request_id,
      event_type,
      actor_name,
      event_note,
      payload_json
    )
    values (
      public.event_digest_key('approval_requested', jsonb_build_object('requestId', v_request_id, 'nonce', clock_timestamp()::text)),
      v_request_id,
      case when nullif(trim(coalesce(r->>'parentApprovalRequestId', '')), '') is null then 'requested' else 'resubmitted' end,
      v_employee,
      v_request_note,
      jsonb_build_object(
        'requestId', v_request_id,
        'taskId', v_task_id,
        'title', v_title,
        'approverAdmin', v_approver,
        'workDate', v_work_date::text
      )
    );

    v_requests := v_requests || jsonb_build_array(jsonb_build_object(
      'requestId', v_request_id,
      'taskId', v_task_id,
      'title', v_title,
      'approvalStatus', 'pending',
      'approvalApprover', v_approver
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'requests', v_requests
  );
end;
$$;

create or replace function public.rpc_get_user_approvals(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department text := coalesce(p_payload->>'department', p_payload->>'dept', '');
  v_employee text := coalesce(p_payload->>'employeeName', p_payload->>'name', '');
  v_code text := coalesce(p_payload->>'accessCode', p_payload->>'code', '');
  v_include_cancelled boolean := lower(coalesce(p_payload->>'includeCancelled', 'false')) = 'true';
  v_rows jsonb;
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requestId', r.request_id,
        'parentRequestId', nullif(r.parent_request_id, ''),
        'workDate', r.work_date::text,
        'department', r.department,
        'requesterName', r.requester_name,
        'taskId', nullif(r.source_task_id, ''),
        'title', r.source_task_title,
        'project', nullif(coalesce(r.payload_json->>'project', ''), ''),
        'priority', r.source_task_priority,
        'completionPercent', r.source_completion_percent,
        'spentMinutes', r.source_spent_minutes,
        'sourceNote', r.source_note,
        'requestNote', r.request_note,
        'approverAdmin', r.chosen_approver_admin_name,
        'status', r.status,
        'resolvedBy', nullif(r.resolved_by, ''),
        'resolvedAt', r.resolved_at,
        'resolutionNote', nullif(r.resolution_note, ''),
        'reassignedDepartment', nullif(r.reassigned_department, ''),
        'reassignedEmployeeName', nullif(r.reassigned_employee_name, ''),
        'linkedAssignmentEventKey', nullif(r.linked_assignment_event_key, ''),
        'createdAt', r.created_at,
        'updatedAt', r.updated_at
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.task_approval_requests r
  where public.canonical_department_key(r.department) = public.canonical_department_key(v_department)
    and lower(trim(r.requester_name)) = lower(trim(v_employee))
    and (v_include_cancelled or lower(coalesce(r.status, '')) <> 'cancelled');

  return jsonb_build_object(
    'ok', true,
    'approvals', coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;

create or replace function public.rpc_get_admin_approvals(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text := coalesce(p_payload->>'admin', '');
  v_code text := coalesce(p_payload->>'code', '');
  v_status text := lower(trim(coalesce(p_payload->>'status', 'all')));
  v_department text := trim(coalesce(p_payload->>'department', ''));
  v_requester text := trim(coalesce(p_payload->>'requesterName', p_payload->>'employeeName', ''));
  v_from_date date := public.to_date_safe(p_payload->>'fromDate');
  v_to_date date := public.to_date_safe(p_payload->>'toDate');
  v_include_cancelled boolean := lower(coalesce(p_payload->>'includeCancelled', 'false')) = 'true';
  v_allowed jsonb;
  v_rows jsonb;
begin
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'requestId', r.request_id,
        'parentRequestId', nullif(r.parent_request_id, ''),
        'workDate', r.work_date::text,
        'department', r.department,
        'requesterName', r.requester_name,
        'taskId', nullif(r.source_task_id, ''),
        'title', r.source_task_title,
        'project', nullif(coalesce(r.payload_json->>'project', ''), ''),
        'priority', r.source_task_priority,
        'completionPercent', r.source_completion_percent,
        'spentMinutes', r.source_spent_minutes,
        'sourceNote', r.source_note,
        'requestNote', r.request_note,
        'approverAdmin', r.chosen_approver_admin_name,
        'status', r.status,
        'resolvedBy', nullif(r.resolved_by, ''),
        'resolvedAt', r.resolved_at,
        'resolutionNote', nullif(r.resolution_note, ''),
        'reassignedDepartment', nullif(r.reassigned_department, ''),
        'reassignedEmployeeName', nullif(r.reassigned_employee_name, ''),
        'linkedAssignmentEventKey', nullif(r.linked_assignment_event_key, ''),
        'createdAt', r.created_at,
        'updatedAt', r.updated_at
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.task_approval_requests r
  where lower(trim(r.chosen_approver_admin_name)) = lower(trim(v_admin))
    and (
      (v_allowed ? 'All')
      or exists (
        select 1
        from jsonb_array_elements_text(v_allowed) d(dep)
        where public.canonical_department_key(d.dep) = public.canonical_department_key(r.department)
      )
    )
    and (v_status = 'all' or lower(r.status) = v_status)
    and (v_department = '' or public.canonical_department_key(r.department) = public.canonical_department_key(v_department))
    and (v_requester = '' or lower(trim(r.requester_name)) = lower(trim(v_requester)))
    and (v_from_date is null or r.work_date >= v_from_date)
    and (v_to_date is null or r.work_date <= v_to_date)
    and (v_include_cancelled or lower(coalesce(r.status, '')) <> 'cancelled');

  return jsonb_build_object(
    'ok', true,
    'approvals', coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;

create or replace function public.rpc_resolve_approval_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text := coalesce(p_payload->>'admin', '');
  v_code text := coalesce(p_payload->>'code', '');
  v_request_id text := trim(coalesce(p_payload->>'requestId', ''));
  v_action text := lower(trim(coalesce(p_payload->>'action', '')));
  v_resolution_note text := trim(coalesce(p_payload->>'resolutionNote', p_payload->>'note', ''));
  v_reassign_department text := trim(coalesce(p_payload->>'reassignDepartment', p_payload->>'department', ''));
  v_reassign_employee text := trim(coalesce(p_payload->>'reassignEmployeeName', p_payload->>'employeeName', ''));
  v_reassign_title text := trim(coalesce(p_payload->>'reassignTitle', ''));
  v_reassign_priority text := public.normalize_priority(coalesce(p_payload->>'reassignPriority', 'Medium'));
  v_reassign_deadline_days int := greatest(1, least(coalesce(nullif(p_payload->>'reassignDeadlineDays', '')::int, 1), 30));
  v_today_ist date := (now() at time zone 'Asia/Kolkata')::date;
  v_assignment_date date;
  v_assignment_event_key text := '';
  v_assignment_task_id text := '';
  v_allowed jsonb;
  v_request public.task_approval_requests%rowtype;
begin
  if v_request_id = '' then
    return jsonb_build_object('ok', false, 'message', 'requestId is required.');
  end if;
  if v_action not in ('approve', 'reject', 'cancel') then
    return jsonb_build_object('ok', false, 'message', 'action must be approve, reject, or cancel.');
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

  select *
  into v_request
  from public.task_approval_requests r
  where r.request_id = v_request_id
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Approval request not found.');
  end if;
  if lower(trim(coalesce(v_request.chosen_approver_admin_name, ''))) <> lower(trim(v_admin)) then
    return jsonb_build_object('ok', false, 'message', 'Only the chosen approver can resolve this request.');
  end if;
  if lower(coalesce(v_request.status, '')) <> 'pending' then
    return jsonb_build_object('ok', false, 'message', 'Only pending requests can be resolved.');
  end if;
  if not (
    (v_allowed ? 'All')
    or exists (
      select 1
      from jsonb_array_elements_text(v_allowed) d(dep)
      where public.canonical_department_key(d.dep) = public.canonical_department_key(v_request.department)
    )
  ) then
    return jsonb_build_object('ok', false, 'message', 'Unauthorized department');
  end if;

  if v_action = 'reject' and v_resolution_note = '' then
    return jsonb_build_object('ok', false, 'message', 'Rejection note is required.');
  end if;
  if v_action = 'cancel' and v_resolution_note = '' then
    v_resolution_note := 'Cancelled by admin (mistaken submission).';
  end if;

  if v_action = 'approve' and v_reassign_employee <> '' then
    if v_reassign_department = '' then
      v_reassign_department := v_request.department;
    end if;
    v_reassign_title := coalesce(nullif(v_reassign_title, ''), v_request.source_task_title);
    v_assignment_task_id := coalesce(nullif(v_request.source_task_id, ''), 'asg-' || md5(clock_timestamp()::text || random()::text || coalesce(v_reassign_title, '')));

    if exists (
      select 1
      from public.task_submissions s
      where s.stage = 'SOD'
        and s.work_date = v_today_ist
        and public.canonical_department_key(s.department) = public.canonical_department_key(v_reassign_department)
        and lower(trim(s.employee_name)) = lower(trim(v_reassign_employee))
    ) then
      v_assignment_date := public.next_assignment_work_date(v_today_ist + 1);
    else
      v_assignment_date := public.next_assignment_work_date(v_today_ist);
    end if;

    v_assignment_event_key := public.event_digest_key(
      'assignment',
      jsonb_build_object(
        'nonce', clock_timestamp()::text,
        'approvalRequestId', v_request.request_id,
        'department', v_reassign_department,
        'employeeName', v_reassign_employee,
        'workDate', v_assignment_date::text,
        'title', v_reassign_title
      )
    );

    insert into public.task_admin_events (
      event_key, event_type, changed_at, work_date, department, employee_name, task_id, title, status, payload_json
    )
    values (
      v_assignment_event_key,
      'assignment',
      now(),
      v_assignment_date,
      v_reassign_department,
      v_reassign_employee,
      v_assignment_task_id,
      v_reassign_title,
      'Assigned',
      jsonb_build_object(
        'taskId', v_assignment_task_id,
        'title', v_reassign_title,
        'priority', v_reassign_priority,
        'deadlineDays', v_reassign_deadline_days,
        'deadlineDate', (v_assignment_date + greatest(v_reassign_deadline_days - 1, 0))::text,
        'assignedAt', public.rfc3339_now(),
        'workDate', v_assignment_date::text,
        'department', v_reassign_department,
        'employeeName', v_reassign_employee,
        'assignedBy', v_admin,
        'status', 'Assigned',
        'approvalRequestId', v_request.request_id,
        'approvalRequesterName', v_request.requester_name,
        'approvalRequestNote', v_request.request_note,
        'approvalSourceWorkDate', v_request.work_date::text,
        'approvalSourceNote', v_request.source_note
      )
    );
  end if;

  update public.task_approval_requests r
  set status = case
      when v_action = 'approve' then 'approved'
      when v_action = 'reject' then 'rejected'
      else 'cancelled'
    end,
      resolved_by = v_admin,
      resolved_at = now(),
      resolution_note = v_resolution_note,
      reassigned_department = case when v_action = 'approve' then coalesce(v_reassign_department, '') else '' end,
      reassigned_employee_name = case when v_action = 'approve' then coalesce(v_reassign_employee, '') else '' end,
      linked_assignment_event_key = case when v_action = 'approve' then coalesce(v_assignment_event_key, '') else '' end,
      updated_at = now()
  where r.request_id = v_request.request_id;

  insert into public.task_approval_events (
    event_key,
    request_id,
    event_type,
    actor_name,
    event_note,
    payload_json
  )
  values (
    public.event_digest_key('approval_' || v_action, jsonb_build_object('requestId', v_request.request_id, 'nonce', clock_timestamp()::text)),
    v_request.request_id,
    case
      when v_action = 'approve' then 'approved'
      when v_action = 'reject' then 'rejected'
      else 'cancelled'
    end,
    v_admin,
    v_resolution_note,
    jsonb_build_object(
      'requestId', v_request.request_id,
      'action', v_action,
      'assignmentEventKey', v_assignment_event_key,
      'reassignedDepartment', coalesce(v_reassign_department, ''),
      'reassignedEmployeeName', coalesce(v_reassign_employee, '')
    )
  );

  if v_assignment_event_key <> '' then
    insert into public.task_approval_events (
      event_key,
      request_id,
      event_type,
      actor_name,
      event_note,
      payload_json
    )
    values (
      public.event_digest_key('approval_assigned', jsonb_build_object('requestId', v_request.request_id, 'eventKey', v_assignment_event_key)),
      v_request.request_id,
      'assigned',
      v_admin,
      v_resolution_note,
      jsonb_build_object(
        'requestId', v_request.request_id,
        'assignmentEventKey', v_assignment_event_key,
        'department', v_reassign_department,
        'employeeName', v_reassign_employee,
        'workDate', v_assignment_date::text
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'requestId', v_request.request_id,
    'status', case
      when v_action = 'approve' then 'approved'
      when v_action = 'reject' then 'rejected'
      else 'cancelled'
    end,
    'assignment', case
      when v_assignment_event_key = '' then null
      else jsonb_build_object(
        'eventKey', v_assignment_event_key,
        'department', v_reassign_department,
        'employeeName', v_reassign_employee,
        'workDate', v_assignment_date::text
      )
    end
  );
end;
$$;

create or replace function public.rpc_resubmit_approval_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department text := coalesce(p_payload->>'department', p_payload->>'dept', '');
  v_employee text := coalesce(p_payload->>'employeeName', p_payload->>'name', '');
  v_code text := coalesce(p_payload->>'accessCode', p_payload->>'code', '');
  v_request_id text := trim(coalesce(p_payload->>'requestId', ''));
  v_new_request_id text := public.make_request_token('apr');
  v_approver text := trim(coalesce(p_payload->>'approverAdmin', p_payload->>'approver', ''));
  v_request_note text := coalesce(p_payload->>'requestNote', '');
  v_parent public.task_approval_requests%rowtype;
  v_allowed_approvers jsonb := public.approval_approvers_for_department(v_department);
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

  if v_request_id = '' then
    return jsonb_build_object('ok', false, 'message', 'requestId is required.');
  end if;

  select *
  into v_parent
  from public.task_approval_requests r
  where r.request_id = v_request_id
    and public.canonical_department_key(r.department) = public.canonical_department_key(v_department)
    and lower(trim(r.requester_name)) = lower(trim(v_employee))
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Approval request not found.');
  end if;
  if lower(coalesce(v_parent.status, '')) <> 'rejected' then
    return jsonb_build_object('ok', false, 'message', 'Only rejected requests can be resubmitted.');
  end if;

  v_approver := coalesce(nullif(v_approver, ''), v_parent.chosen_approver_admin_name);
  if not exists (
    select 1
    from jsonb_array_elements_text(v_allowed_approvers) ap(name)
    where lower(trim(ap.name)) = lower(trim(v_approver))
  ) then
    return jsonb_build_object('ok', false, 'message', 'Approver not allowed for department.');
  end if;
  perform 1
  from public.admins_directory a
  where lower(trim(a.admin_name)) = lower(trim(v_approver))
    and a.active = true
    and (
      (a.allowed_departments_json ? 'All')
      or exists (
        select 1
        from jsonb_array_elements_text(a.allowed_departments_json) d(dep)
        where public.canonical_department_key(d.dep) = public.canonical_department_key(v_department)
      )
    )
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Approver not allowed for department.');
  end if;

  insert into public.task_approval_requests (
    request_id,
    parent_request_id,
    work_date,
    department,
    requester_name,
    source_task_id,
    source_task_title,
    source_task_priority,
    source_completion_percent,
    source_spent_minutes,
    source_note,
    chosen_approver_admin_name,
    request_note,
    status,
    payload_json,
    created_at,
    updated_at
  )
  values (
    v_new_request_id,
    v_parent.request_id,
    coalesce(public.to_date_safe(p_payload->>'workDate'), v_parent.work_date),
    v_parent.department,
    v_parent.requester_name,
    coalesce(p_payload->>'taskId', v_parent.source_task_id),
    coalesce(nullif(p_payload->>'title', ''), v_parent.source_task_title),
    public.normalize_priority(coalesce(nullif(p_payload->>'priority', ''), v_parent.source_task_priority)),
    greatest(0, least(coalesce(nullif(p_payload->>'completionPercent', '')::int, v_parent.source_completion_percent), 100)),
    greatest(0, coalesce(nullif(p_payload->>'spentMinutes', '')::int, v_parent.source_spent_minutes)),
    coalesce(p_payload->>'sourceNote', p_payload->>'note', v_parent.source_note),
    v_approver,
    coalesce(nullif(v_request_note, ''), v_parent.request_note),
    'pending',
    coalesce(v_parent.payload_json, '{}'::jsonb) || jsonb_build_object(
      'requestId', v_new_request_id,
      'parentRequestId', v_parent.request_id,
      'resubmittedFrom', v_parent.request_id
    ),
    now(),
    now()
  );

  insert into public.task_approval_events (
    event_key,
    request_id,
    event_type,
    actor_name,
    event_note,
    payload_json
  )
  values (
    public.event_digest_key('approval_resubmitted', jsonb_build_object('requestId', v_new_request_id, 'nonce', clock_timestamp()::text)),
    v_new_request_id,
    'resubmitted',
    v_employee,
    coalesce(nullif(v_request_note, ''), v_parent.request_note),
    jsonb_build_object(
      'requestId', v_new_request_id,
      'parentRequestId', v_parent.request_id,
      'approverAdmin', v_approver
    )
  );

  return jsonb_build_object(
    'ok', true,
    'request', jsonb_build_object(
      'requestId', v_new_request_id,
      'parentRequestId', v_parent.request_id,
      'status', 'pending',
      'approverAdmin', v_approver
    )
  );
end;
$$;

create or replace function public.rpc_cancel_approval_request(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department text := coalesce(p_payload->>'department', p_payload->>'dept', '');
  v_employee text := coalesce(p_payload->>'employeeName', p_payload->>'name', '');
  v_code text := coalesce(p_payload->>'accessCode', p_payload->>'code', '');
  v_request_id text := trim(coalesce(p_payload->>'requestId', ''));
  v_cancel_note text := trim(coalesce(p_payload->>'cancelNote', p_payload->>'note', 'Cancelled by requester before EOD submission.'));
  v_request public.task_approval_requests%rowtype;
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

  if v_request_id = '' then
    return jsonb_build_object('ok', false, 'message', 'requestId is required.');
  end if;

  select *
  into v_request
  from public.task_approval_requests r
  where r.request_id = v_request_id
    and public.canonical_department_key(r.department) = public.canonical_department_key(v_department)
    and lower(trim(r.requester_name)) = lower(trim(v_employee))
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Approval request not found.');
  end if;

  if lower(coalesce(v_request.status, '')) <> 'pending' then
    return jsonb_build_object('ok', false, 'message', 'Only pending requests can be cancelled.');
  end if;

  update public.task_approval_requests r
  set status = 'cancelled',
      resolved_by = v_employee,
      resolved_at = now(),
      resolution_note = v_cancel_note,
      updated_at = now()
  where r.request_id = v_request.request_id;

  insert into public.task_approval_events (
    event_key,
    request_id,
    event_type,
    actor_name,
    event_note,
    payload_json
  )
  values (
    public.event_digest_key('approval_cancelled', jsonb_build_object('requestId', v_request.request_id, 'nonce', clock_timestamp()::text)),
    v_request.request_id,
    'cancelled',
    v_employee,
    v_cancel_note,
    jsonb_build_object(
      'requestId', v_request.request_id,
      'cancelledBy', v_employee,
      'cancelledAt', public.rfc3339_now()
    )
  );

  return jsonb_build_object(
    'ok', true,
    'requestId', v_request.request_id,
    'status', 'cancelled'
  );
end;
$$;

create or replace function public.rpc_set_user_day_status(p_payload jsonb)
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
  v_status text := upper(trim(coalesce(p_payload->>'status', '')));
  v_reason text := coalesce(p_payload->>'reason', '');
  v_marked_by text := coalesce(p_payload->>'markedBy', v_employee);
  v_hist record;
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

  if v_status not in ('LEAVE', 'ABSENT', 'CLEAR') then
    return jsonb_build_object('ok', false, 'message', 'Invalid status. Use Leave, Absent, or Clear.');
  end if;

  if v_status = 'CLEAR' then
    delete from public.leave_days l
    where l.leave_date = v_work_date
      and public.canonical_department_key(l.department) = public.canonical_department_key(v_department)
      and lower(trim(l.employee_name)) = lower(trim(v_employee));
  else
    insert into public.leave_days (
      leave_date, department, employee_name, leave_status, reason, marked_by, source, updated_at
    ) values (
      v_work_date, v_department, v_employee,
      case when v_status = 'LEAVE' then 'Leave' else 'Absent' end,
      v_reason, v_marked_by, 'rpc_set_user_day_status', now()
    )
    on conflict (leave_date, department, employee_name) do update
    set leave_status = excluded.leave_status,
        reason = excluded.reason,
        marked_by = excluded.marked_by,
        source = excluded.source,
        updated_at = now();
  end if;

  select *
  into v_hist
  from public.compute_user_streak_from_submissions(v_department, v_employee);

  insert into public.user_streaks (department, employee_name, current_streak, best_streak, last_counted_date, updated_at)
  values (
    v_department,
    v_employee,
    coalesce(v_hist.current_streak, 0),
    coalesce(v_hist.best_streak, 0),
    v_hist.last_counted_date,
    now()
  )
  on conflict (department, employee_name) do update
  set current_streak = excluded.current_streak,
      best_streak = greatest(public.user_streaks.best_streak, excluded.best_streak),
      last_counted_date = excluded.last_counted_date,
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'workDate', v_work_date::text,
    'status', case when v_status = 'CLEAR' then null else (case when v_status = 'LEAVE' then 'Leave' else 'Absent' end) end,
    'streak', jsonb_build_object(
      'current', coalesce(v_hist.current_streak, 0),
      'best', coalesce(v_hist.best_streak, 0),
      'lastCountedDate', case when v_hist.last_counted_date is null then null else v_hist.last_counted_date::text end
    )
  );
end;
$$;

create or replace function public.rpc_get_streak_leaderboard(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text := coalesce(p_payload->>'admin', '');
  v_admin_code text := coalesce(p_payload->>'code', '');
  v_department text := coalesce(p_payload->>'department', '');
  v_user_dept text := coalesce(p_payload->>'dept', p_payload->>'department', '');
  v_user_name text := coalesce(p_payload->>'name', p_payload->>'employeeName', '');
  v_user_code text := coalesce(p_payload->>'accessCode', p_payload->>'code', '');
  v_limit int := greatest(1, least(coalesce(nullif(p_payload->>'limit', '')::int, 3), 20));
  v_allowed boolean := false;
  v_dep_filter text := nullif(trim(v_department), '');
  v_payload jsonb;
begin
  if nullif(trim(v_admin), '') is not null then
    perform 1
    from public.admins_directory a
    where lower(trim(a.admin_name)) = lower(trim(v_admin))
      and a.active = true
      and public.secret_matches(v_admin_code, a.admin_code_hash)
    limit 1;
    v_allowed := found;
  else
    perform 1
    from public.users_directory u
    where public.canonical_department_key(u.department) = public.canonical_department_key(v_user_dept)
      and lower(trim(u.employee_name)) = lower(trim(v_user_name))
      and u.active = true
      and public.secret_matches(v_user_code, u.access_code_hash)
    limit 1;
    v_allowed := found;
  end if;

  if not v_allowed then
    return jsonb_build_object('ok', false, 'message', 'Invalid access.');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', t.rn,
        'employeeName', t.employee_name,
        'department', t.department,
        'current', t.current_streak,
        'best', t.best_streak
      )
      order by t.rn
    ),
    '[]'::jsonb
  )
  into v_payload
  from (
    select
      row_number() over (
        order by
          coalesce(hist.current_streak, 0) desc,
          coalesce(hist.best_streak, 0) desc,
          coalesce(hist.last_counted_date, date '1900-01-01') desc,
          ud.employee_name asc
      ) as rn,
      ud.employee_name,
      ud.department,
      coalesce(hist.current_streak, 0) as current_streak,
      coalesce(hist.best_streak, 0) as best_streak
    from public.users_directory ud
    left join lateral public.compute_user_streak_from_submissions(ud.department, ud.employee_name) hist
      on true
    where ud.active = true
      and public.canonical_department_key(ud.department) <> 'directreportees'
      and (v_dep_filter is null or lower(v_dep_filter) = 'all' or public.canonical_department_key(ud.department) = public.canonical_department_key(v_dep_filter))
    order by
      coalesce(hist.current_streak, 0) desc,
      coalesce(hist.best_streak, 0) desc,
      coalesce(hist.last_counted_date, date '1900-01-01') desc,
      ud.employee_name asc
    limit v_limit
  ) t;

  return jsonb_build_object(
    'ok', true,
    'leaders', coalesce(v_payload, '[]'::jsonb)
  );
end;
$$;

create or replace function public.rpc_get_submitted_day_details(p_payload jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
with req as (
  select
    coalesce(p_payload->>'department','') as department,
    public.canonical_department_key(coalesce(p_payload->>'department','')) as dep_key,
    coalesce(p_payload->>'employeeName','') as employee_name,
    coalesce(public.to_date_safe(p_payload->>'workDate'), current_date) as work_date
),
sod as (
  select s.*
  from public.task_submissions s
  join req r on public.canonical_department_key(s.department) = r.dep_key and r.employee_name = s.employee_name and r.work_date = s.work_date
  where s.stage = 'SOD'
  order by s.submitted_at desc
  limit 1
),
eod as (
  select s.*
  from public.task_submissions s
  join req r on public.canonical_department_key(s.department) = r.dep_key and r.employee_name = s.employee_name and r.work_date = s.work_date
  where s.stage = 'EOD'
  order by s.submitted_at desc
  limit 1
)
select jsonb_build_object(
  'ok', true,
  'workDate', (select work_date::text from req),
  'hasSod', exists(select 1 from sod),
  'hasEod', exists(select 1 from eod),
  'sodTasks', coalesce((select coalesce(payload_json->'tasks', payload_json->'updates', '[]'::jsonb) from sod), '[]'::jsonb),
  'sodPendingTasks', coalesce((select coalesce(payload_json->'pendingTasks', '[]'::jsonb) from sod), '[]'::jsonb),
  'eodUpdates', coalesce((select coalesce(payload_json->'updates', payload_json->'tasks', payload_json->'completedTasks', '[]'::jsonb) from eod), '[]'::jsonb)
);
$$;
