-- ============================================================================
-- Helpers
-- ============================================================================

create or replace function public.hash_secret(p_secret text)
returns text
language sql
immutable
as $$
  select md5(coalesce(p_secret, ''));
$$;

create or replace function public.secret_matches(p_secret text, p_hash text)
returns boolean
language sql
stable
as $$
  select md5(coalesce(p_secret, '')) = coalesce(p_hash, '');
$$;

create or replace function public.canonical_department_key(p_val text)
returns text
language sql
immutable
as $$
  select
    case regexp_replace(lower(coalesce(p_val, '')), '[^a-z]', '', 'g')
      when 'hr' then 'humanresources'
      when 'humanresources' then 'humanresources'
      when 'it' then 'informationtechnology'
      when 'informationtechnology' then 'informationtechnology'
      when 'op' then 'operations'
      when 'operations' then 'operations'
      when 'rs' then 'research'
      when 'research' then 'research'
      when 'eq' then 'equity'
      when 'equity' then 'equity'
      when 'dr' then 'directreportees'
      when 'directreportees' then 'directreportees'
      when 'mk' then 'marketing'
      when 'marketing' then 'marketing'
      else regexp_replace(lower(coalesce(p_val, '')), '[^a-z]', '', 'g')
    end;
$$;

create or replace function public.normalize_priority(p_val text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(trim(p_val), ''))
    when 'high' then 'High'
    when 'low' then 'Low'
    else 'Medium'
  end;
$$;

create or replace function public.approval_approvers_for_department(p_department text)
returns jsonb
language sql
immutable
as $$
  select
    case public.canonical_department_key(p_department)
      when 'advisory' then '["Vandana Manwani"]'::jsonb
      when 'marketing' then '["Chintan Dudhela", "Pranob Thachanthara"]'::jsonb
      when 'equity' then '["Ovesh Khatri", "Nehal Mota", "Naveen Singh"]'::jsonb
      when 'operations' then '["Naveen Singh", "Nehal Mota", "Pravin Mayekar"]'::jsonb
      when 'research' then '["Rushabh Dugad", "Riya Jain"]'::jsonb
      when 'directreportees' then '["Nehal Mota"]'::jsonb
      when 'humanresources' then '["Neha Sanghrajka", "Kainaz Tata"]'::jsonb
      when 'informationtechnology' then '["Naveen Singh"]'::jsonb
      else '[]'::jsonb
    end;
$$;

create or replace function public.to_date_safe(p_val text)
returns date
language plpgsql
immutable
as $$
declare
  d date;
begin
  begin
    d := p_val::date;
  exception when others then
    d := null;
  end;
  return d;
end;
$$;

create or replace function public.rfc3339_now()
returns text
language sql
stable
as $$
  select to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
$$;

create or replace function public.make_request_token(p_prefix text default 'req')
returns text
language sql
volatile
as $$
  select coalesce(nullif(trim(p_prefix), ''), 'req') || '-' || md5(clock_timestamp()::text || random()::text || coalesce(p_prefix, ''));
$$;

create or replace function public.event_digest_key(p_event_type text, p_payload jsonb)
returns text
language sql
immutable
as $$
  select 'adm-' || md5(coalesce(p_event_type, '') || '|' || coalesce(p_payload::text, ''));
$$;

create or replace function public.last_day_of_month(p_work_date date)
returns int
language sql
immutable
as $$
  select extract(day from (date_trunc('month', p_work_date) + interval '1 month - 1 day'))::int;
$$;

create or replace function public.min_people_for_org_workday()
returns int
language sql
immutable
as $$
  select 3;
$$;

create or replace function public.next_assignment_work_date(p_anchor_date date)
returns date
language plpgsql
stable
as $$
declare
  d date := coalesce(p_anchor_date, current_date);
begin
  while public.is_non_working_calendar_day(d) loop
    d := d + 1;
  end loop;
  return d;
end;
$$;

create or replace function public.is_non_working_calendar_day(p_date date)
returns boolean
language sql
immutable
as $$
  select
    p_date is null
    or extract(dow from p_date)::int = 0
    or p_date = any(array[
      date '2026-01-10', date '2026-01-24', date '2026-01-25', date '2026-01-26',
      date '2026-02-07', date '2026-02-21',
      date '2026-03-03', date '2026-03-07', date '2026-03-21',
      date '2026-04-03', date '2026-04-04', date '2026-04-05', date '2026-04-18',
      date '2026-05-01', date '2026-05-02', date '2026-05-03', date '2026-05-16', date '2026-05-23',
      date '2026-06-13', date '2026-06-26', date '2026-06-27', date '2026-06-28',
      date '2026-07-11', date '2026-07-18', date '2026-07-25',
      date '2026-08-01', date '2026-08-15', date '2026-08-29',
      date '2026-09-12', date '2026-09-13', date '2026-09-14', date '2026-09-26',
      date '2026-10-02', date '2026-10-03', date '2026-10-04', date '2026-10-10', date '2026-10-17', date '2026-10-20',
      date '2026-11-07', date '2026-11-08', date '2026-11-09', date '2026-11-10', date '2026-11-28',
      date '2026-12-12', date '2026-12-25', date '2026-12-26', date '2026-12-27'
    ]);
$$;

create or replace function public.is_org_working_day(
  p_date date,
  p_department text default null
)
returns boolean
language plpgsql
stable
as $$
declare
  v_people_count int := 0;
begin
  if public.is_non_working_calendar_day(p_date) then
    return false;
  end if;

  select count(distinct lower(trim(s.employee_name)))::int
  into v_people_count
  from public.task_submissions s
  where s.work_date = p_date
    and s.stage in ('SOD', 'EOD');

  return v_people_count >= public.min_people_for_org_workday();
end;
$$;

create or replace function public.count_working_days_excluding_sunday_and_leave(
  p_from date,
  p_to date,
  p_department text default null,
  p_employee_name text default null
)
returns int
language plpgsql
stable
as $$
declare
  d date;
  v_count int := 0;
  v_leave_table_exists boolean := to_regclass('public.leave_days') is not null;
  v_is_leave boolean;
begin
  if p_from is null or p_to is null or p_to < p_from then
    return 0;
  end if;

  d := p_from;
  while d <= p_to loop
    if not public.is_non_working_calendar_day(d) and public.is_org_working_day(d, p_department) then
      if v_leave_table_exists then
        execute
          'select exists (
             select 1
             from public.leave_days l
             where l.leave_date = $1
               and ($2 is null or public.canonical_department_key(l.department) = public.canonical_department_key($2))
               and ($3 is null or lower(trim(l.employee_name)) = lower(trim($3)))
               and upper(coalesce(l.leave_status, ''LEAVE'')) = ''LEAVE''
           )'
          into v_is_leave
          using d, p_department, p_employee_name;
        if not coalesce(v_is_leave, false) then
          v_count := v_count + 1;
        end if;
      else
        v_count := v_count + 1;
      end if;
    end if;
    d := d + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.is_working_day_for_user(
  p_date date,
  p_department text default null,
  p_employee_name text default null
)
returns boolean
language plpgsql
stable
as $$
declare
  v_leave_table_exists boolean := to_regclass('public.leave_days') is not null;
  v_is_leave boolean := false;
begin
  if p_date is null then
    return false;
  end if;
  if public.is_non_working_calendar_day(p_date) then
    return false;
  end if;
  if not public.is_org_working_day(p_date, p_department) then
    return false;
  end if;
  if v_leave_table_exists then
    select exists (
      select 1
      from public.leave_days l
      where l.leave_date = p_date
        and (p_department is null or public.canonical_department_key(l.department) = public.canonical_department_key(p_department))
        and (p_employee_name is null or lower(trim(l.employee_name)) = lower(trim(p_employee_name)))
        and upper(coalesce(l.leave_status, 'LEAVE')) = 'LEAVE'
    ) into v_is_leave;
  end if;
  return not v_is_leave;
end;
$$;

create or replace function public.previous_working_day_for_user(
  p_date date,
  p_department text default null,
  p_employee_name text default null
)
returns date
language plpgsql
stable
as $$
declare
  d date := p_date - 1;
begin
  while d >= (p_date - 370) loop
    if public.is_working_day_for_user(d, p_department, p_employee_name) then
      return d;
    end if;
    d := d - 1;
  end loop;
  return null;
end;
$$;

create or replace function public.compute_user_streak_from_submissions(
  p_department text,
  p_employee_name text
)
returns table(
  current_streak int,
  best_streak int,
  last_counted_date date
)
language plpgsql
stable
as $$
declare
  d date;
  v_prev_working_day date;
  v_cur int := 0;
  v_best int := 0;
  v_last date := null;
  v_today_ist date := (now() at time zone 'Asia/Kolkata')::date;
  v_broken_after_last boolean := false;
begin
  for d in
    with day_flags as (
      select
        s.work_date,
        bool_or(s.stage = 'SOD') as has_sod,
        bool_or(s.stage = 'EOD') as has_eod
      from public.task_submissions s
      where public.canonical_department_key(s.department) = public.canonical_department_key(p_department)
        and lower(trim(s.employee_name)) = lower(trim(p_employee_name))
      group by s.work_date
    )
    select f.work_date
    from day_flags f
    where f.has_sod = true
      and f.has_eod = true
      and public.is_working_day_for_user(f.work_date, p_department, p_employee_name)
    order by f.work_date
  loop
    if v_last is null then
      v_cur := 1;
    else
      v_prev_working_day := public.previous_working_day_for_user(d, p_department, p_employee_name);
      if v_prev_working_day is not null and v_last = v_prev_working_day then
        v_cur := v_cur + 1;
      else
        v_cur := 1;
      end if;
    end if;
    v_best := greatest(v_best, v_cur);
    v_last := d;
  end loop;

  if v_last is not null and v_last < (v_today_ist - 0) then
    with day_flags as (
      select
        s.work_date,
        bool_or(s.stage = 'SOD') as has_sod,
        bool_or(s.stage = 'EOD') as has_eod
      from public.task_submissions s
      where public.canonical_department_key(s.department) = public.canonical_department_key(p_department)
        and lower(trim(s.employee_name)) = lower(trim(p_employee_name))
      group by s.work_date
    ),
    day_seq as (
      select g::date as work_date
      from generate_series(v_last + 1, v_today_ist - 1, interval '1 day') g
    )
    select exists(
      select 1
      from day_seq d2
      left join day_flags f on f.work_date = d2.work_date
      where public.is_working_day_for_user(d2.work_date, p_department, p_employee_name)
        and not (coalesce(f.has_sod, false) and coalesce(f.has_eod, false))
    )
    into v_broken_after_last;

    if v_broken_after_last then
      v_cur := 0;
    end if;
  end if;

  return query
  select v_cur, v_best, v_last;
end;
$$;
