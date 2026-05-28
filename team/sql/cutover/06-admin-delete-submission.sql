-- ============================================================================
-- Extend event_type constraint to include submission_deleted
-- ============================================================================

do $$
begin
  if exists (
    select 1
    from pg_constraint c
    where c.conname = 'task_admin_events_event_type_check'
      and c.conrelid = 'public.task_admin_events'::regclass
  ) then
    alter table public.task_admin_events drop constraint task_admin_events_event_type_check;
  end if;
  alter table public.task_admin_events
    add constraint task_admin_events_event_type_check
    check (event_type in ('assignment', 'recurring', 'planner_task', 'planner_consumed', 'cliq_webhook', 'carryover_removed', 'carryover_renamed', 'attendance_override', 'submission_deleted'));
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- Admin: delete a SOD or EOD submission for a given employee/date
-- ============================================================================

create or replace function public.rpc_admin_delete_submission(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin      text    := coalesce(p_payload->>'admin', '');
  v_code       text    := coalesce(p_payload->>'code', '');
  v_department text    := coalesce(p_payload->>'department', '');
  v_employee   text    := coalesce(p_payload->>'employeeName', '');
  v_stage      text    := upper(coalesce(p_payload->>'stage', ''));
  v_work_date  date    := coalesce(public.to_date_safe(p_payload->>'workDate'), current_date);
  v_allowed    jsonb;
  v_deleted    int;
  v_event_key  text;
begin
  -- basic validation
  if v_department = '' or v_employee = '' then
    return jsonb_build_object('ok', false, 'message', 'department and employeeName are required.');
  end if;
  if v_stage not in ('SOD', 'EOD') then
    return jsonb_build_object('ok', false, 'message', 'stage must be SOD or EOD.');
  end if;

  -- admin auth
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

  -- delete the submission(s)
  delete from public.task_submissions
  where stage = v_stage
    and public.canonical_department_key(department) = public.canonical_department_key(v_department)
    and lower(trim(employee_name)) = lower(trim(v_employee))
    and work_date = v_work_date;

  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    return jsonb_build_object(
      'ok', false,
      'message', v_stage || ' submission not found for ' || v_employee || ' on ' || v_work_date::text
    );
  end if;

  -- audit log
  v_event_key := public.event_digest_key(
    'submission_deleted',
    jsonb_build_object(
      'nonce',        clock_timestamp()::text,
      'department',   v_department,
      'employeeName', v_employee,
      'stage',        v_stage,
      'workDate',     v_work_date::text
    )
  );

  insert into public.task_admin_events(
    event_key, event_type, changed_at, work_date, department, employee_name,
    task_id, title, status, payload_json
  ) values (
    v_event_key,
    'submission_deleted',
    now(),
    v_work_date,
    v_department,
    v_employee,
    null,
    null,
    'Deleted',
    jsonb_build_object(
      'stage',       v_stage,
      'workDate',    v_work_date::text,
      'deletedBy',   v_admin,
      'deletedAt',   public.rfc3339_now(),
      'rowsDeleted', v_deleted
    )
  );

  return jsonb_build_object(
    'ok',          true,
    'stage',       v_stage,
    'department',  v_department,
    'employeeName', v_employee,
    'workDate',    v_work_date::text,
    'rowsDeleted', v_deleted
  );
end;
$$;
