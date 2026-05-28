-- Admin streaks RPC: returns all active employees with freshly-computed streak data and ALL broken days.
-- Uses compute_user_streak_from_submissions (live) instead of the cached user_streaks table,
-- so admins always see up-to-date counts even if the employee hasn't opened the app today.

create or replace function public.rpc_get_admin_streaks(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin      text := coalesce(nullif(trim(p_payload->>'admin'), ''), '');
  v_admin_code text := coalesce(p_payload->>'code', '');
  v_department text := coalesce(p_payload->>'department', 'All');
  v_dep_filter text := nullif(trim(v_department), '');
  v_today_ist  date := (now() at time zone 'Asia/Kolkata')::date;
  v_payload    jsonb;
begin
  -- Validate admin credentials
  perform 1
  from public.admins_directory a
  where lower(trim(a.admin_name)) = lower(trim(v_admin))
    and a.active = true
    and public.secret_matches(v_admin_code, a.admin_code_hash)
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Invalid admin access.');
  end if;

  -- Use compute_user_streak_from_submissions for fresh (not cached) streak counts.
  -- Then compute all broken days: working days after last_counted_date where SOD or EOD is missing.
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'employeeName',    ud.employee_name,
        'department',      ud.department,
        'current',         coalesce(hist.current_streak, 0),
        'best',            greatest(coalesce(hist.current_streak, 0), coalesce(hist.best_streak, 0), coalesce(us.best_streak, 0)),
        'lastCountedDate', case when hist.last_counted_date is null then null else hist.last_counted_date::text end,
        'isBroken',        jsonb_array_length(coalesce(all_broken.broken_days, '[]'::jsonb)) > 0,
        'brokenSinceDate', all_broken.first_broken_date,
        'brokenDays',      coalesce(all_broken.broken_days, '[]'::jsonb)
      )
      order by ud.department asc, ud.employee_name asc
    ),
    '[]'::jsonb
  )
  into v_payload
  from public.users_directory ud
  -- Fresh streak computation (same as leaderboard)
  left join lateral public.compute_user_streak_from_submissions(ud.department, ud.employee_name) hist
    on true
  -- Also join cached table only to preserve all-time best streak
  left join public.user_streaks us
    on  public.canonical_department_key(us.department) = public.canonical_department_key(ud.department)
    and lower(trim(us.employee_name)) = lower(trim(ud.employee_name))
  -- Aggregate ALL working days after last_counted_date where SOD or EOD is missing
  left join lateral (
    with day_flags as (
      select
        s.work_date,
        bool_or(s.stage = 'SOD') as has_sod,
        bool_or(s.stage = 'EOD') as has_eod
      from public.task_submissions s
      where public.canonical_department_key(s.department) = public.canonical_department_key(ud.department)
        and lower(trim(s.employee_name)) = lower(trim(ud.employee_name))
        and s.work_date >= coalesce(hist.last_counted_date + 1, v_today_ist)
        and s.work_date  < v_today_ist
      group by s.work_date
    ),
    broken_days_cte as (
      select
        d.work_date::text as work_date,
        case
          when not coalesce(f.has_sod, false) and not coalesce(f.has_eod, false)
            then 'SOD and EOD were not submitted'
          when not coalesce(f.has_sod, false)
            then 'SOD was not submitted'
          else
            'EOD was not submitted'
        end as reason
      from (
        select g::date as work_date
        from generate_series(
          (hist.last_counted_date + 1)::timestamp,
          (v_today_ist - 1)::timestamp,
          interval '1 day'
        ) g
      ) d
      left join day_flags f on f.work_date = d.work_date
      where hist.last_counted_date is not null
        and hist.last_counted_date + 1 <= v_today_ist - 1
        and public.is_working_day_for_user(d.work_date, ud.department, ud.employee_name)
        and not (coalesce(f.has_sod, false) and coalesce(f.has_eod, false))
      order by d.work_date
    )
    select
      coalesce(
        jsonb_agg(jsonb_build_object('date', bd.work_date, 'reason', bd.reason) order by bd.work_date),
        '[]'::jsonb
      ) as broken_days,
      min(bd.work_date) as first_broken_date
    from broken_days_cte bd
  ) all_broken on true
  where ud.active = true
    and public.canonical_department_key(ud.department) <> 'directreportees'
    and (
      v_dep_filter is null
      or lower(v_dep_filter) = 'all'
      or public.canonical_department_key(ud.department) = public.canonical_department_key(v_dep_filter)
    );

  return jsonb_build_object('ok', true, 'streaks', coalesce(v_payload, '[]'::jsonb));
end;
$$;

grant execute on function public.rpc_get_admin_streaks(jsonb) to anon, authenticated;
