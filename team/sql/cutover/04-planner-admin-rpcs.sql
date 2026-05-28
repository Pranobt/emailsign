-- Carryover / assignments / recurring
-- ============================================================================

create or replace function public.rpc_get_carryover(p_payload jsonb)
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
sod_latest_per_day as (
  select distinct on (s.work_date)
    s.work_date,
    s.submitted_at,
    s.payload_json
  from public.task_submissions s
  join req r on public.canonical_department_key(s.department) = r.dep_key and r.employee_name = s.employee_name
  where s.stage = 'SOD'
    and s.work_date < r.work_date
  order by s.work_date, s.submitted_at desc
),
eod_latest_per_day as (
  select distinct on (s.work_date)
    s.work_date,
    s.submitted_at,
    s.payload_json
  from public.task_submissions s
  join req r on public.canonical_department_key(s.department) = r.dep_key and r.employee_name = s.employee_name
  where s.stage = 'EOD'
    and s.work_date < r.work_date
  order by s.work_date, s.submitted_at desc
),
sod_tasks as (
  select
    d.work_date,
    d.submitted_at,
    row_number() over (
      partition by d.work_date, d.submitted_at
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
  from sod_latest_per_day d,
  lateral jsonb_array_elements(coalesce(d.payload_json->'tasks', '[]'::jsonb)) t
  where coalesce(t->>'title','') <> ''
),
explicit_eod_updates as (
  select
    d.work_date,
    d.submitted_at,
    row_number() over (
      partition by d.work_date, d.submitted_at
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
    public.normalize_priority(coalesce(u->>'priority','Medium')) as priority,
    coalesce(
      nullif(u->>'completionPercent','')::int,
      nullif(u->>'completion','')::int,
      nullif(u->>'progress','')::int,
      0
    )::int as completion,
    coalesce(u->>'note','') as note
  from eod_latest_per_day d,
  lateral jsonb_array_elements(coalesce(d.payload_json->'updates', '[]'::jsonb)) u
  where coalesce(u->>'title','') <> ''
),
sod_pending_updates as (
  select
    d.work_date,
    d.submitted_at,
    200000 + row_number() over (
      partition by d.work_date, d.submitted_at
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
    public.normalize_priority(coalesce(t->>'priority','Medium')) as priority,
    coalesce(
      nullif(t->>'lastCompletion','')::int,
      nullif(t->>'completionPercent','')::int,
      nullif(t->>'completion','')::int,
      nullif(t->>'progress','')::int,
      0
    )::int as completion,
    coalesce(t->>'lastNote','', t->>'note','') as note
  from sod_latest_per_day d,
  lateral jsonb_array_elements(coalesce(d.payload_json->'pendingTasks', '[]'::jsonb)) t
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
      from explicit_eod_updates e
      where e.task_key = coalesce(
          nullif(
            case when coalesce(t->>'taskId','') like 'co-%' then ''
                 else coalesce(t->>'taskId','') end,
            ''
          ),
          lower(coalesce(t->>'title',''))
        )
        and e.work_date < d.work_date
        and e.completion >= 100
    )
),
latest_explicit_before_sod as (
  select
    s.work_date,
    s.task_key,
    prev.completion as prev_completion
  from sod_tasks s
  left join lateral (
    select e.completion
    from explicit_eod_updates e
    where e.task_key = s.task_key
      and e.work_date < s.work_date
    order by e.work_date desc, e.submitted_at desc, e.row_ord desc
    limit 1
  ) prev on true
),
inferred_missing_updates as (
  select
    s.work_date,
    s.submitted_at,
    100000 + s.row_ord as row_ord,
    s.task_id,
    s.title,
    s.project,
    s.task_key,
    s.priority,
    case
      when coalesce(p.prev_completion, 0) >= 100 then 0
      else coalesce(p.prev_completion, 0)
    end::int as completion,
    ''::text as note
  from sod_tasks s
  left join explicit_eod_updates e
    on e.work_date = s.work_date
   and e.task_key = s.task_key
  left join latest_explicit_before_sod p
    on p.work_date = s.work_date
   and p.task_key = s.task_key
  where e.task_key is null
    and coalesce(p.prev_completion, 0) < 100
),
all_updates as (
  select * from explicit_eod_updates
  union all
  select * from sod_pending_updates
  union all
  select * from inferred_missing_updates
),
ordered_updates as (
  select
    x.*,
    sum(case when x.completion >= 100 then 1 else 0 end) over (
      partition by x.task_key
      order by x.work_date, x.submitted_at, x.row_ord
      rows between unbounded preceding and current row
    ) as reset_count,
    row_number() over (
      partition by x.task_key
      order by x.work_date desc, x.submitted_at desc, x.row_ord desc
    ) as latest_rn
  from all_updates x
),
low_groups as (
  select
    task_key,
    reset_count,
    min(work_date) as carry_start_date
  from ordered_updates
  where completion < 100
  group by task_key, reset_count
),
task_eod_status as (
  -- For each task_key: find the most recent explicit EOD date at 100% and at <100%
  select
    task_key,
    max(work_date) filter (where completion >= 100) as last_done_date,
    max(work_date) filter (where completion < 100)  as last_incomplete_date
  from explicit_eod_updates
  group by task_key
),
task_done_by_id as (
  -- For each task_id (UUID): check if there's a 100% EOD with no later incomplete EOD.
  -- Catches the pattern: task submitted as isExtra (title-key, <100%) then later as
  -- regular (UUID-key, 100%) — they share the same taskId but have different task_keys.
  select
    task_id,
    max(work_date) filter (where completion >= 100) as last_done_date,
    max(work_date) filter (where completion < 100)  as last_incomplete_date
  from explicit_eod_updates
  where task_id <> ''
  group by task_id
),
task_done_by_title as (
  -- For each lower(title): check if the most recent explicit EOD was 100% with no later incomplete.
  -- Catches the pattern: carryover task has UUID A, but completed EOD used UUID B (or isExtra)
  -- with the same title — different UUID chains, title is the only common key.
  select
    lower(trim(title)) as title_key,
    max(work_date) filter (where completion >= 100) as last_done_date,
    max(work_date) filter (where completion < 100)  as last_incomplete_date
  from explicit_eod_updates
  where trim(title) <> ''
  group by lower(trim(title))
),
open_rows as (
  select
    o.task_key,
    o.task_id,
    o.title,
    o.project,
    o.priority,
    o.completion,
    o.note,
    l.carry_start_date,
    o.work_date as last_work_date
  from ordered_updates o
  join low_groups l
    on l.task_key = o.task_key
   and l.reset_count = o.reset_count
  left join task_eod_status es
    on es.task_key = o.task_key
  left join task_done_by_id eid
    on eid.task_id = o.task_id
   and o.task_id <> ''
  left join task_done_by_title et
    on et.title_key = lower(trim(o.title))
   and trim(o.title) <> ''
  where o.latest_rn = 1
    and o.completion < 100
    -- Exclude if the most recent explicit EOD (by task_key) was 100% with no later incomplete
    and not (
      es.last_done_date is not null
      and (es.last_incomplete_date is null or es.last_done_date > es.last_incomplete_date)
    )
    -- Also exclude if the same task_id has a 100% explicit EOD with no later incomplete
    -- (handles isExtra→regular promotion with different task_key chains)
    and not (
      eid.last_done_date is not null
      and (eid.last_incomplete_date is null or eid.last_done_date > eid.last_incomplete_date)
    )
    -- Also exclude if any EOD with the same title was last completed at 100% with no later incomplete
    -- (handles different UUID per submission — orphaned carryover UUID vs completed UUID)
    and not (
      et.last_done_date is not null
      and (et.last_incomplete_date is null or et.last_done_date > et.last_incomplete_date)
    )
),
removed_markers as (
  select distinct on (coalesce(nullif(e.payload_json->>'taskKey',''), lower(trim(coalesce(e.title, '')))))
    coalesce(nullif(e.payload_json->>'taskKey',''), lower(trim(coalesce(e.title, '')))) as task_key,
    coalesce(
      public.to_date_safe(e.payload_json->>'removedThroughWorkDate'),
      e.work_date,
      e.changed_at::date
    ) as removed_through_work_date
  from public.task_admin_events e
  join req r
    on public.canonical_department_key(e.department) = r.dep_key
   and lower(trim(e.employee_name)) = lower(trim(r.employee_name))
  where e.event_type = 'carryover_removed'
    and coalesce(nullif(e.payload_json->>'taskKey',''), lower(trim(coalesce(e.title, '')))) <> ''
  order by coalesce(nullif(e.payload_json->>'taskKey',''), lower(trim(coalesce(e.title, '')))), e.changed_at desc
),
rename_markers as (
  select distinct on (coalesce(nullif(e.payload_json->>'taskKey',''), lower(trim(coalesce(e.title, '')))))
    coalesce(nullif(e.payload_json->>'taskKey',''), lower(trim(coalesce(e.title, '')))) as task_key,
    nullif(trim(coalesce(e.payload_json->>'newTitle', e.title, '')), '') as new_title
  from public.task_admin_events e
  join req r
    on public.canonical_department_key(e.department) = r.dep_key
   and lower(trim(e.employee_name)) = lower(trim(r.employee_name))
  where e.event_type = 'carryover_renamed'
    and coalesce(nullif(e.payload_json->>'taskKey',''), lower(trim(coalesce(e.title, '')))) <> ''
  order by coalesce(nullif(e.payload_json->>'taskKey',''), lower(trim(coalesce(e.title, '')))), e.changed_at desc
),
open_rows_renamed as (
  select
    o.task_key,
    o.task_id,
    coalesce(rn.new_title, o.title) as title,
    o.project,
    o.priority,
    o.completion,
    o.note,
    o.carry_start_date,
    o.last_work_date
  from open_rows o
  left join rename_markers rn
    on rn.task_key = o.task_key
),
open_rows_filtered as (
  select o.*
  from open_rows_renamed o
  left join removed_markers rm
    on rm.task_key = o.task_key
  where rm.task_key is null
)
select jsonb_build_object(
  'ok', true,
  'tasks', coalesce(jsonb_agg(jsonb_build_object(
    'taskId', coalesce(
      nullif(task_id,''),
      'co-' || md5(coalesce(task_key,'') || '|' || coalesce(carry_start_date::text,''))
    ),
    'title', title,
    'project', project,
    'priority', priority,
    'addedDate', carry_start_date::text,
    'lastCompletion', completion,
    'lastNote', note
  ) order by last_work_date desc, title) filter (where title <> ''), '[]'::jsonb),
  'sourceWorkDate', coalesce((select max(work_date)::text from eod_latest_per_day), '')
)
from open_rows_filtered;
$$;

create or replace function public.rpc_get_assignments(p_payload jsonb)
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
assignment_latest as (
  select distinct on (coalesce(nullif(e.task_id, ''), nullif(e.payload_json->>'taskId', ''), lower(trim(coalesce(e.title, '')))))
    coalesce(nullif(e.task_id, ''), nullif(e.payload_json->>'taskId', ''), '') as task_id,
    coalesce(e.title, '') as title,
    public.normalize_priority(coalesce(e.payload_json->>'priority', 'Medium')) as priority,
    coalesce(e.payload_json->>'assignedBy', '') as assigned_by,
    coalesce(e.payload_json->>'assignedAt', '') as assigned_at,
    coalesce(nullif(e.payload_json->>'deadlineDays', '')::int, 1) as deadline_days,
    coalesce(e.payload_json->>'deadlineDate', '') as deadline_date,
    coalesce(e.payload_json->>'status', e.status, 'Assigned') as status
  from public.task_admin_events e
  join req r on public.canonical_department_key(e.department) = r.dep_key and e.employee_name = r.employee_name
  where e.event_type = 'assignment'
    and coalesce(e.work_date, r.work_date) <= r.work_date
  order by coalesce(nullif(e.task_id, ''), nullif(e.payload_json->>'taskId', ''), lower(trim(coalesce(e.title, '')))), e.changed_at desc
),
completed_assigned as (
  select distinct
    nullif(u->>'taskId', '') as task_id,
    lower(trim(coalesce(u->>'title', ''))) as title_key
  from public.task_submissions s
  join req r
    on public.canonical_department_key(s.department) = r.dep_key
   and s.employee_name = r.employee_name
   and s.stage = 'EOD'
   and s.work_date <= r.work_date
  cross join lateral (
    select value as u
    from jsonb_array_elements(coalesce(s.payload_json->'updates', '[]'::jsonb))
    union all
    select value as u
    from jsonb_array_elements(coalesce(s.payload_json->'completedTasks', '[]'::jsonb))
  ) src
  where coalesce(nullif(u->>'taskId', ''), lower(trim(coalesce(u->>'title', ''))), '') <> ''
    and coalesce(nullif(u->>'completionPercent', '')::int, nullif(u->>'completion', '')::int, 0) >= 100
),
eod_assigned_updates as (
  select
    s.work_date,
    s.submitted_at,
    nullif(u->>'taskId', '') as task_id,
    lower(trim(coalesce(u->>'title', ''))) as title_key,
    coalesce(nullif(u->>'completionPercent', '')::int, nullif(u->>'completion', '')::int, 0) as completion_percent,
    coalesce(u->>'note', '') as note
  from public.task_submissions s
  join req r
    on public.canonical_department_key(s.department) = r.dep_key
   and s.employee_name = r.employee_name
   and s.stage = 'EOD'
   and s.work_date <= r.work_date
  cross join lateral (
    select value as u
    from jsonb_array_elements(coalesce(s.payload_json->'updates', '[]'::jsonb))
    union all
    select value as u
    from jsonb_array_elements(coalesce(s.payload_json->'completedTasks', '[]'::jsonb))
  ) src
  where coalesce(nullif(src.u->>'taskId', ''), lower(trim(coalesce(src.u->>'title', ''))), '') <> ''
),
latest_assigned_progress as (
  select distinct on (coalesce(task_id, title_key))
    coalesce(task_id, title_key) as progress_key,
    completion_percent,
    note
  from eod_assigned_updates
  where coalesce(task_id, title_key) is not null
  order by coalesce(task_id, title_key), work_date desc, submitted_at desc
),
tasks as (
  select jsonb_build_object(
    'taskId', coalesce(
      nullif(a.task_id, ''),
      'asg-' || md5(lower(coalesce(a.title, '')) || '|' || coalesce(a.assigned_at, '') || '|' || coalesce(a.deadline_date, ''))
    ),
    'title', a.title,
    'priority', a.priority,
    'assignedBy', a.assigned_by,
    'assignedAt', a.assigned_at,
    'deadlineDays', a.deadline_days,
    'deadlineDate', a.deadline_date,
    'lastCompletion', coalesce(lp.completion_percent, 0),
    'lastNote', coalesce(lp.note, ''),
    'source', 'admin-assigned'
  ) as t
  from assignment_latest a
  left join latest_assigned_progress lp
    on lp.progress_key = coalesce(nullif(a.task_id, ''), lower(trim(coalesce(a.title, ''))))
  where lower(coalesce(a.status, 'assigned')) = 'assigned'
    and not exists (
      select 1
      from completed_assigned c
      where (
        c.task_id is not null
        and nullif(a.task_id, '') is not null
        and c.task_id = nullif(a.task_id, '')
      )
      or (
        c.title_key <> ''
        and c.title_key = lower(trim(coalesce(a.title, '')))
      )
    )
)
select jsonb_build_object(
  'ok', true,
  'tasks', coalesce(jsonb_agg(t) filter (where (t->>'title') <> ''), '[]'::jsonb),
  'sourceWorkDate', (select work_date::text from req)
) from tasks;
$$;

create or replace function public.rpc_get_recurring_tasks(p_payload jsonb)
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
ev as (
  select
    e.*,
    coalesce(e.payload_json->>'taskId', e.task_id, '') as task_id_k,
    coalesce(e.payload_json->>'title', e.title, '') as title_k
  from public.task_admin_events e
  join req r on r.dep_key = public.canonical_department_key(e.department) and r.employee_name = e.employee_name
  where e.event_type = 'recurring'
),
latest as (
  select distinct on (coalesce(nullif(task_id_k,''), lower(title_k)))
    coalesce(
      e.payload_json->>'taskId',
      e.task_id,
      'rec-' || md5(lower(coalesce(e.payload_json->>'title', e.title, '')) || '|' || coalesce(e.payload_json->>'startDate', ''))
    ) as task_id,
    coalesce(e.payload_json->>'title', e.title, '') as title,
    public.normalize_priority(coalesce(e.payload_json->>'priority', 'Medium')) as priority,
    coalesce(e.payload_json->>'frequency', 'Daily') as frequency,
    coalesce(public.to_date_safe(e.payload_json->>'startDate'), current_date) as start_date,
    nullif(e.payload_json->>'recurrenceWeekday','')::int as recurrence_weekday,
    nullif(e.payload_json->>'recurrenceDayOfMonth','')::int as recurrence_day_of_month,
    coalesce(e.payload_json->>'status', e.status, 'Active') as status,
    coalesce(nullif(e.payload_json->>'plannedHours','')::int, 0) as planned_hours,
    coalesce(nullif(e.payload_json->>'plannedMinutes','')::int, 0) as planned_minutes
  from ev e
  order by coalesce(nullif(task_id_k,''), lower(title_k)), e.changed_at desc
),
due as (
  select l.*
  from latest l, req r
  where lower(l.status) <> 'inactive'
    and r.work_date >= l.start_date
    and (
      lower(l.frequency) = 'daily'
      or (lower(l.frequency) = 'weekly' and extract(dow from r.work_date)::int = coalesce(l.recurrence_weekday, extract(dow from l.start_date)::int))
      or (lower(l.frequency) = 'monthly' and extract(day from r.work_date)::int = least(coalesce(l.recurrence_day_of_month, extract(day from l.start_date)::int), public.last_day_of_month(r.work_date)))
    )
)
select jsonb_build_object(
  'ok', true,
  'tasks', coalesce(jsonb_agg(jsonb_build_object(
    'taskId', task_id,
    'title', title,
    'priority', priority,
    'frequency', frequency,
    'startDate', start_date::text,
    'recurrenceWeekday', recurrence_weekday,
    'recurrenceDayOfMonth', recurrence_day_of_month,
    'plannedHours', planned_hours,
    'plannedMinutes', planned_minutes,
    'source', 'recurring',
    'lastCompletion', null,
    'lastNote', ''
  )) filter (where title <> ''), '[]'::jsonb),
  'sourceWorkDate', (select work_date::text from req)
) from due;
$$;

create or replace function public.rpc_sync_recurring_tasks(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  i jsonb;
  v_count int := 0;
  v_work_date date := coalesce(public.to_date_safe(p_payload->>'workDate'), current_date);
begin
  for i in select * from jsonb_array_elements(coalesce(p_payload->'tasks','[]'::jsonb))
  loop
    insert into public.task_admin_events(event_key,event_type,changed_at,work_date,department,employee_name,task_id,title,status,payload_json)
    values (
      public.event_digest_key('recurring', i || jsonb_build_object('changedAt', public.rfc3339_now())),
      'recurring',
      now(),
      v_work_date,
      coalesce(p_payload->>'department',''),
      coalesce(p_payload->>'employeeName',''),
      nullif(i->>'taskId',''),
      i->>'title',
      'Active',
      i || jsonb_build_object('status','Active','changedAt', public.rfc3339_now(), 'startDate', coalesce(i->>'startDate', v_work_date::text))
    ) on conflict (event_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'upsertedCount', v_count, 'sourceWorkDate', v_work_date::text);
end;
$$;

create or replace function public.rpc_complete_recurring_tasks(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_work_date date := coalesce(public.to_date_safe(p_payload->>'workDate'), current_date);
  t text;
begin
  for t in select jsonb_array_elements_text(coalesce(p_payload->'taskIds', '[]'::jsonb))
  loop
    insert into public.task_admin_events(event_key,event_type,changed_at,work_date,department,employee_name,task_id,title,status,payload_json)
    values (
      public.event_digest_key('recurring', jsonb_build_object('taskId', t, 'status', 'Inactive', 'workDate', v_work_date::text)),
      'recurring', now(), v_work_date,
      coalesce(p_payload->>'department',''),
      coalesce(p_payload->>'employeeName',''),
      t, '', 'Inactive',
      jsonb_build_object('taskId', t, 'status', 'Inactive', 'endedOn', v_work_date::text, 'changedAt', public.rfc3339_now())
    ) on conflict (event_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'deactivatedCount', v_count, 'sourceWorkDate', v_work_date::text);
end;
$$;

-- ============================================================================
-- Planner RPCs
-- ============================================================================

create or replace function public.rpc_get_planner_tasks(p_payload jsonb)
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
latest as (
  select distinct on (coalesce(e.task_id, e.payload_json->>'taskId'))
    coalesce(e.payload_json->>'taskId', e.task_id) as task_id,
    coalesce(e.payload_json->>'title', e.title, '') as title,
    public.normalize_priority(coalesce(e.payload_json->>'priority','Medium')) as priority,
    coalesce(nullif(e.payload_json->>'plannedHours','')::int, 0) as planned_hours,
    coalesce(nullif(e.payload_json->>'plannedMinutes','')::int, 0) as planned_minutes,
    coalesce(e.payload_json->>'status', e.status, 'Open') as status,
    coalesce(e.payload_json->>'workDateRef','') as work_date_ref
  from public.task_admin_events e
  join req r on public.canonical_department_key(e.department) = r.dep_key and e.employee_name = r.employee_name
  where e.event_type = 'planner_task'
  order by coalesce(e.task_id, e.payload_json->>'taskId'), e.changed_at desc
),
open_tasks as (
  select jsonb_build_object(
    'taskId', task_id, 'title', title, 'priority', priority,
    'plannedHours', planned_hours, 'plannedMinutes', planned_minutes, 'status', 'Open'
  ) as t
  from latest where lower(status) = 'open'
),
in_sod as (
  select jsonb_build_object(
    'taskId', task_id, 'title', title, 'priority', priority,
    'plannedHours', planned_hours, 'plannedMinutes', planned_minutes, 'status', 'InSOD', 'source', 'planner'
  ) as t
  from latest, req
  where lower(status) = 'insod'
    and coalesce(work_date_ref,'') = req.work_date::text
),
consumed as (
  select distinct coalesce(e.payload_json->>'titleKey', '') as title_key
  from public.task_admin_events e
  join req r on public.canonical_department_key(e.department) = r.dep_key and e.employee_name = r.employee_name
  where e.event_type = 'planner_consumed'
)
select jsonb_build_object(
  'ok', true,
  'tasks', coalesce((select jsonb_agg(t) from open_tasks), '[]'::jsonb),
  'inSodTasks', coalesce((select jsonb_agg(t) from in_sod), '[]'::jsonb),
  'consumedTitleKeys', coalesce((select jsonb_agg(title_key) from consumed where title_key <> ''), '[]'::jsonb)
);
$$;

create or replace function public.rpc_planner_add_tasks(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  i jsonb;
  v_count int := 0;
begin
  for i in select * from jsonb_array_elements(coalesce(p_payload->'tasks','[]'::jsonb))
  loop
    insert into public.task_admin_events(event_key,event_type,changed_at,work_date,department,employee_name,task_id,title,status,payload_json)
    values (
      public.event_digest_key('planner_task', i || jsonb_build_object('status','Open','changedAt',public.rfc3339_now())),
      'planner_task', now(), null,
      coalesce(p_payload->>'department',''),
      coalesce(p_payload->>'employeeName',''),
      coalesce(nullif(i->>'taskId',''), 'pln-' || md5(clock_timestamp()::text || random()::text || coalesce(i->>'title',''))),
      i->>'title',
      'Open',
      i || jsonb_build_object('status','Open','changedAt',public.rfc3339_now(),'titleKey',lower(trim(coalesce(i->>'title',''))))
    ) on conflict (event_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'addedCount', v_count, 'skippedLockedTitles', '[]'::jsonb, 'skippedExistingTitles', '[]'::jsonb);
end;
$$;

create or replace function public.rpc_planner_move_to_sod(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_date date := coalesce(public.to_date_safe(p_payload->>'workDate'), current_date);
  v_department text := coalesce(p_payload->>'department','');
  v_employee text := coalesce(p_payload->>'employeeName','');
  v_ids text[];
  v_id text;
  v_row record;
  v_out jsonb := '[]'::jsonb;
begin
  select coalesce(array_agg(value), '{}') into v_ids
  from jsonb_array_elements_text(coalesce(p_payload->'taskIds','[]'::jsonb));

  foreach v_id in array v_ids loop
    select
      coalesce(e.payload_json->>'taskId', e.task_id) as task_id,
      coalesce(e.payload_json->>'title', e.title, '') as title,
      public.normalize_priority(coalesce(e.payload_json->>'priority','Medium')) as priority,
      coalesce(nullif(e.payload_json->>'plannedHours','')::int, 0) as planned_hours,
      coalesce(nullif(e.payload_json->>'plannedMinutes','')::int, 0) as planned_minutes
    into v_row
    from public.task_admin_events e
    where e.event_type = 'planner_task'
      and public.canonical_department_key(e.department) = public.canonical_department_key(v_department)
      and e.employee_name = v_employee
      and coalesce(e.payload_json->>'taskId', e.task_id) = v_id
    order by e.changed_at desc
    limit 1;

    if v_row.task_id is null or coalesce(v_row.title,'') = '' then
      continue;
    end if;

    insert into public.task_admin_events(event_key,event_type,changed_at,work_date,department,employee_name,task_id,title,status,payload_json)
    values (
      public.event_digest_key('planner_task', jsonb_build_object('taskId', v_row.task_id, 'status', 'InSOD', 'workDateRef', v_work_date::text, 'changedAt', public.rfc3339_now())),
      'planner_task', now(), v_work_date, v_department, v_employee, v_row.task_id, v_row.title, 'InSOD',
      jsonb_build_object(
        'changedAt', public.rfc3339_now(),
        'department', v_department,
        'employeeName', v_employee,
        'taskId', v_row.task_id,
        'title', v_row.title,
        'titleKey', lower(trim(v_row.title)),
        'priority', v_row.priority,
        'plannedHours', v_row.planned_hours,
        'plannedMinutes', v_row.planned_minutes,
        'status', 'InSOD',
        'workDateRef', v_work_date::text
      )
    ) on conflict (event_key) do nothing;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'taskId', v_row.task_id,
      'title', v_row.title,
      'priority', v_row.priority,
      'plannedHours', v_row.planned_hours,
      'plannedMinutes', v_row.planned_minutes,
      'source', 'planner'
    ));
  end loop;

  return jsonb_build_object('ok', true, 'movedTasks', v_out);
end;
$$;

create or replace function public.rpc_planner_return_tasks(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_date date := coalesce(public.to_date_safe(p_payload->>'workDate'), current_date);
  v_department text := coalesce(p_payload->>'department','');
  v_employee text := coalesce(p_payload->>'employeeName','');
  v_ids text[];
  v_id text;
  v_row record;
  v_count int := 0;
begin
  select coalesce(array_agg(value), '{}') into v_ids
  from jsonb_array_elements_text(coalesce(p_payload->'taskIds','[]'::jsonb));

  foreach v_id in array v_ids loop
    select
      coalesce(e.payload_json->>'taskId', e.task_id) as task_id,
      coalesce(e.payload_json->>'title', e.title, '') as title,
      public.normalize_priority(coalesce(e.payload_json->>'priority','Medium')) as priority,
      coalesce(nullif(e.payload_json->>'plannedHours','')::int, 0) as planned_hours,
      coalesce(nullif(e.payload_json->>'plannedMinutes','')::int, 0) as planned_minutes
    into v_row
    from public.task_admin_events e
    where e.event_type = 'planner_task'
      and public.canonical_department_key(e.department) = public.canonical_department_key(v_department)
      and e.employee_name = v_employee
      and coalesce(e.payload_json->>'taskId', e.task_id) = v_id
    order by e.changed_at desc
    limit 1;

    if v_row.task_id is null then continue; end if;

    insert into public.task_admin_events(event_key,event_type,changed_at,work_date,department,employee_name,task_id,title,status,payload_json)
    values (
      public.event_digest_key('planner_task', jsonb_build_object('taskId', v_row.task_id, 'status', 'Open', 'changedAt', public.rfc3339_now())),
      'planner_task', now(), null, v_department, v_employee, v_row.task_id, v_row.title, 'Open',
      jsonb_build_object(
        'changedAt', public.rfc3339_now(),
        'department', v_department,
        'employeeName', v_employee,
        'taskId', v_row.task_id,
        'title', v_row.title,
        'titleKey', lower(trim(v_row.title)),
        'priority', v_row.priority,
        'plannedHours', v_row.planned_hours,
        'plannedMinutes', v_row.planned_minutes,
        'status', 'Open',
        'workDateRef', ''
      )
    ) on conflict (event_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('ok', true, 'returnedCount', v_count, 'sourceWorkDate', v_work_date::text);
end;
$$;

create or replace function public.rpc_planner_mark_consumed(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_date date := coalesce(public.to_date_safe(p_payload->>'workDate'), current_date);
  v_department text := coalesce(p_payload->>'department','');
  v_employee text := coalesce(p_payload->>'employeeName','');
  v_ids text[];
  v_id text;
  v_row record;
  v_count int := 0;
begin
  select coalesce(array_agg(value), '{}') into v_ids
  from jsonb_array_elements_text(coalesce(p_payload->'taskIds','[]'::jsonb));

  foreach v_id in array v_ids loop
    select
      coalesce(e.payload_json->>'taskId', e.task_id) as task_id,
      coalesce(e.payload_json->>'title', e.title, '') as title,
      public.normalize_priority(coalesce(e.payload_json->>'priority','Medium')) as priority,
      coalesce(nullif(e.payload_json->>'plannedHours','')::int, 0) as planned_hours,
      coalesce(nullif(e.payload_json->>'plannedMinutes','')::int, 0) as planned_minutes
    into v_row
    from public.task_admin_events e
    where e.event_type = 'planner_task'
      and public.canonical_department_key(e.department) = public.canonical_department_key(v_department)
      and e.employee_name = v_employee
      and coalesce(e.payload_json->>'taskId', e.task_id) = v_id
    order by e.changed_at desc
    limit 1;

    if v_row.task_id is null then continue; end if;

    insert into public.task_admin_events(event_key,event_type,changed_at,work_date,department,employee_name,task_id,title,status,payload_json)
    values (
      public.event_digest_key('planner_task', jsonb_build_object('taskId', v_row.task_id, 'status', 'Consumed', 'workDateRef', v_work_date::text, 'changedAt', public.rfc3339_now())),
      'planner_task', now(), v_work_date, v_department, v_employee, v_row.task_id, v_row.title, 'Consumed',
      jsonb_build_object(
        'changedAt', public.rfc3339_now(),
        'department', v_department,
        'employeeName', v_employee,
        'taskId', v_row.task_id,
        'title', v_row.title,
        'titleKey', lower(trim(v_row.title)),
        'priority', v_row.priority,
        'plannedHours', v_row.planned_hours,
        'plannedMinutes', v_row.planned_minutes,
        'status', 'Consumed',
        'workDateRef', v_work_date::text,
        'consumedOn', v_work_date::text
      )
    ) on conflict (event_key) do nothing;

    insert into public.task_admin_events(event_key,event_type,changed_at,work_date,department,employee_name,task_id,title,status,payload_json)
    values (
      public.event_digest_key('planner_consumed', jsonb_build_object('titleKey', lower(trim(v_row.title)), 'taskId', v_row.task_id, 'consumedOn', v_work_date::text)),
      'planner_consumed', now(), v_work_date, v_department, v_employee, v_row.task_id, v_row.title, 'Consumed',
      jsonb_build_object(
        'changedAt', public.rfc3339_now(),
        'department', v_department,
        'employeeName', v_employee,
        'titleKey', lower(trim(v_row.title)),
        'sourceTaskId', v_row.task_id,
        'consumedOn', v_work_date::text
      )
    ) on conflict (event_key) do nothing;
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'consumedCount', v_count);
end;
$$;

create or replace function public.rpc_planner_update_task(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department text := coalesce(p_payload->>'department','');
  v_employee text := coalesce(p_payload->>'employeeName','');
  v_task_id text := coalesce(p_payload->>'taskId','');
  v_title text := coalesce(p_payload->>'title','');
  v_priority text := public.normalize_priority(coalesce(p_payload->>'priority','Medium'));
  v_h int := coalesce(nullif(p_payload->>'plannedHours','')::int, 0);
  v_m int := coalesce(nullif(p_payload->>'plannedMinutes','')::int, 0);
begin
  insert into public.task_admin_events(event_key,event_type,changed_at,work_date,department,employee_name,task_id,title,status,payload_json)
  values (
    public.event_digest_key('planner_task', jsonb_build_object('taskId', v_task_id, 'status', 'Open', 'title', v_title, 'changedAt', public.rfc3339_now())),
    'planner_task', now(), null, v_department, v_employee, v_task_id, v_title, 'Open',
    jsonb_build_object(
      'changedAt', public.rfc3339_now(),
      'department', v_department,
      'employeeName', v_employee,
      'taskId', v_task_id,
      'title', v_title,
      'titleKey', lower(trim(v_title)),
      'priority', v_priority,
      'plannedHours', greatest(v_h, 0),
      'plannedMinutes', greatest(v_m, 0),
      'status', 'Open',
      'workDateRef', ''
    )
  ) on conflict (event_key) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.rpc_planner_delete_task(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_department text := coalesce(p_payload->>'department','');
  v_employee text := coalesce(p_payload->>'employeeName','');
  v_task_id text := coalesce(p_payload->>'taskId','');
begin
  insert into public.task_admin_events(event_key,event_type,changed_at,work_date,department,employee_name,task_id,title,status,payload_json)
  values (
    public.event_digest_key('planner_task', jsonb_build_object('taskId', v_task_id, 'status', 'Deleted', 'changedAt', public.rfc3339_now())),
    'planner_task', now(), null, v_department, v_employee, v_task_id, '', 'Deleted',
    jsonb_build_object(
      'changedAt', public.rfc3339_now(),
      'department', v_department,
      'employeeName', v_employee,
      'taskId', v_task_id,
      'status', 'Deleted',
      'workDateRef', ''
    )
  ) on conflict (event_key) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

-- ============================================================================
-- Admin RPCs
-- ============================================================================

create or replace function public.rpc_get_user_directory(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text := coalesce(p_payload->>'admin', '');
  v_code text := coalesce(p_payload->>'code', '');
  v_allowed jsonb;
  v_res jsonb;
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

  with u as (
    select u0.department, u0.employee_name, u0.email
    from public.users_directory u0
    where u0.active = true
      and (
        (v_allowed ? 'All')
        or exists (
          select 1
          from jsonb_array_elements_text(v_allowed) d(dep)
          where public.canonical_department_key(d.dep) = public.canonical_department_key(u0.department)
        )
      )
  )
  select jsonb_build_object(
    'ok', true,
    'directory', coalesce((
      select jsonb_object_agg(d.department, d.people)
      from (
        select department, jsonb_object_agg(employee_name, 'MASKED') as people
        from u
        group by department
      ) d
    ), '{}'::jsonb),
    'emailDirectory', coalesce((
      select jsonb_object_agg(d.department, d.people)
      from (
        select department, jsonb_object_agg(employee_name, coalesce(email,'')) as people
        from u
        group by department
      ) d
    ), '{}'::jsonb)
  )
  into v_res;

  return v_res;
end;
$$;

create or replace function public.rpc_assign_tasks(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  i jsonb;
  v_count int := 0;
  v_work_date date := coalesce(public.to_date_safe(p_payload->>'workDate'), current_date);
begin
  for i in select * from jsonb_array_elements(coalesce(p_payload->'tasks','[]'::jsonb))
  loop
    insert into public.task_admin_events(event_key,event_type,changed_at,work_date,department,employee_name,task_id,title,status,payload_json)
    values (
      public.event_digest_key('assignment', i || jsonb_build_object('workDate', v_work_date::text)),
      'assignment', now(), v_work_date,
      coalesce(p_payload->>'department',''),
      coalesce(p_payload->>'employeeName',''),
      coalesce(nullif(i->>'taskId',''), 'asg-' || md5(clock_timestamp()::text || random()::text || coalesce(i->>'title',''))),
      coalesce(i->>'title',''),
      'Assigned',
      i || jsonb_build_object(
        'assignedAt', public.rfc3339_now(),
        'workDate', v_work_date::text,
        'department', coalesce(p_payload->>'department',''),
        'employeeName', coalesce(p_payload->>'employeeName',''),
        'assignedBy', coalesce(p_payload->>'admin',''),
        'status', 'Assigned'
      )
    ) on conflict (event_key) do nothing;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object(
    'ok', true,
    'assignedCount', v_count,
    'workDate', v_work_date::text,
    'department', coalesce(p_payload->>'department',''),
    'employeeName', coalesce(p_payload->>'employeeName','')
  );
end;
$$;

create or replace function public.rpc_admin_remove_pending_task(p_payload jsonb)
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
  v_title text := coalesce(p_payload->>'title', '');
  v_task_key text := lower(trim(coalesce(p_payload->>'taskKey', '')));
  v_removed_through date := coalesce(
    public.to_date_safe(p_payload->>'lastUpdatedDate'),
    public.to_date_safe(p_payload->>'pendingSinceDate'),
    public.to_date_safe(p_payload->>'workDate'),
    current_date
  );
  v_allowed jsonb;
  v_event_key text;
begin
  if v_department = '' or v_employee = '' then
    return jsonb_build_object('ok', false, 'message', 'department and employeeName are required.');
  end if;
  if v_task_key = '' then
    return jsonb_build_object('ok', false, 'message', 'taskKey is required.');
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
    'carryover_removed',
    jsonb_build_object(
      'nonce', clock_timestamp()::text,
      'department', v_department,
      'employeeName', v_employee,
      'taskKey', v_task_key,
      'removedThroughWorkDate', v_removed_through::text
    )
  );

  insert into public.task_admin_events(
    event_key, event_type, changed_at, work_date, department, employee_name, task_id, title, status, payload_json
  )
  values (
    v_event_key,
    'carryover_removed',
    now(),
    v_removed_through,
    v_department,
    v_employee,
    null,
    v_title,
    'Removed',
    jsonb_build_object(
      'taskKey', v_task_key,
      'title', v_title,
      'removedThroughWorkDate', v_removed_through::text,
      'removedBy', v_admin,
      'removedAt', public.rfc3339_now()
    )
  );

  return jsonb_build_object(
    'ok', true,
    'department', v_department,
    'employeeName', v_employee,
    'taskKey', v_task_key,
    'removedThroughWorkDate', v_removed_through::text
  );
end;
$$;

create or replace function public.rpc_admin_complete_pending_task(p_payload jsonb)
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
  v_title text := coalesce(p_payload->>'title', '');
  v_task_key text := lower(trim(coalesce(p_payload->>'taskKey', '')));
  v_completed_on date := coalesce(
    public.to_date_safe(p_payload->>'workDate'),
    current_date
  );
  v_pending_since date := coalesce(
    public.to_date_safe(p_payload->>'pendingSinceDate'),
    public.to_date_safe(p_payload->>'lastUpdatedDate'),
    v_completed_on
  );
  v_allowed jsonb;
  v_event_key text;
begin
  if v_department = '' or v_employee = '' then
    return jsonb_build_object('ok', false, 'message', 'department and employeeName are required.');
  end if;
  if v_task_key = '' then
    return jsonb_build_object('ok', false, 'message', 'taskKey is required.');
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
    'carryover_removed',
    jsonb_build_object(
      'nonce', clock_timestamp()::text,
      'department', v_department,
      'employeeName', v_employee,
      'taskKey', v_task_key,
      'completedOn', v_completed_on::text
    )
  );

  insert into public.task_admin_events(
    event_key, event_type, changed_at, work_date, department, employee_name, task_id, title, status, payload_json
  )
  values (
    v_event_key,
    'carryover_removed',
    now(),
    v_completed_on,
    v_department,
    v_employee,
    null,
    v_title,
    'Completed',
    jsonb_build_object(
      'taskKey', v_task_key,
      'title', v_title,
      'removedThroughWorkDate', v_completed_on::text,
      'pendingSinceDate', v_pending_since::text,
      'completedOn', v_completed_on::text,
      'completedBy', v_admin,
      'completedAt', public.rfc3339_now()
    )
  );

  return jsonb_build_object(
    'ok', true,
    'department', v_department,
    'employeeName', v_employee,
    'taskKey', v_task_key,
    'completedOn', v_completed_on::text
  );
end;
$$;

create or replace function public.rpc_admin_rename_pending_task(p_payload jsonb)
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
  v_old_title text := coalesce(p_payload->>'title', '');
  v_task_key text := lower(trim(coalesce(p_payload->>'taskKey', '')));
  v_new_title text := trim(coalesce(p_payload->>'newTitle', ''));
  v_allowed jsonb;
  v_event_key text;
begin
  if v_department = '' or v_employee = '' then
    return jsonb_build_object('ok', false, 'message', 'department and employeeName are required.');
  end if;
  if v_task_key = '' then
    return jsonb_build_object('ok', false, 'message', 'taskKey is required.');
  end if;
  if v_new_title = '' then
    return jsonb_build_object('ok', false, 'message', 'newTitle is required.');
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
    'carryover_renamed',
    jsonb_build_object(
      'nonce', clock_timestamp()::text,
      'department', v_department,
      'employeeName', v_employee,
      'taskKey', v_task_key,
      'newTitle', v_new_title
    )
  );

  insert into public.task_admin_events(
    event_key, event_type, changed_at, work_date, department, employee_name, task_id, title, status, payload_json
  )
  values (
    v_event_key,
    'carryover_renamed',
    now(),
    current_date,
    v_department,
    v_employee,
    null,
    v_new_title,
    'Renamed',
    jsonb_build_object(
      'taskKey', v_task_key,
      'oldTitle', v_old_title,
      'newTitle', v_new_title,
      'renamedBy', v_admin,
      'renamedAt', public.rfc3339_now()
    )
  );

  return jsonb_build_object(
    'ok', true,
    'department', v_department,
    'employeeName', v_employee,
    'taskKey', v_task_key,
    'newTitle', v_new_title
  );
end;
$$;

create or replace function public.rpc_create_user(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text := coalesce(p_payload->>'admin', '');
  v_admin_code text := coalesce(p_payload->>'code', p_payload->>'adminCode', '');
  v_department text := coalesce(p_payload->>'department','');
  v_name text := coalesce(p_payload->>'employeeName', p_payload->>'name', '');
  v_code text := coalesce(p_payload->>'accessCode','');
  v_email text := coalesce(p_payload->>'email','');
  v_allowed jsonb;
begin
  if v_department = '' or v_name = '' then
    return jsonb_build_object('ok', false, 'message', 'department and employeeName are required.');
  end if;

  select a.allowed_departments_json
  into v_allowed
  from public.admins_directory a
  where lower(trim(a.admin_name)) = lower(trim(v_admin))
    and a.active = true
    and public.secret_matches(v_admin_code, a.admin_code_hash)
  limit 1;

  if v_allowed is null then
    return jsonb_build_object('ok', false, 'message', 'Unauthorized');
  end if;

  if not (
    (v_allowed ? 'All')
    or exists (
      select 1 from jsonb_array_elements_text(v_allowed) d(dep)
      where public.canonical_department_key(d.dep) = public.canonical_department_key(v_department)
    )
  ) then
    return jsonb_build_object('ok', false, 'message', 'Unauthorized department');
  end if;

  insert into public.users_directory(department, employee_name, access_code_hash, email, changed_by, source, active)
  values (
    v_department,
    v_name,
    public.hash_secret(case when v_code = '' then 'TEMP-CHANGE-ME' else v_code end),
    v_email,
    v_admin,
    'rpc_create_user',
    true
  )
  on conflict (department, employee_name) do update
  set
    email = excluded.email,
    changed_at = now(),
    changed_by = excluded.changed_by,
    access_code_hash = case
      when excluded.access_code_hash <> public.hash_secret('TEMP-CHANGE-ME')
      then excluded.access_code_hash
      else users_directory.access_code_hash
    end,
    active = true;

  return jsonb_build_object(
    'ok', true,
    'role', coalesce(p_payload->>'role', 'User'),
    'department', v_department,
    'employeeName', v_name,
    'accessCode', v_code,
    'email', v_email
  );
end;
$$;

create or replace function public.rpc_deactivate_user(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text := coalesce(p_payload->>'admin', '');
  v_code text := coalesce(p_payload->>'code', '');
  v_department text := coalesce(p_payload->>'department', '');
  v_name text := coalesce(p_payload->>'employeeName', '');
  v_allowed jsonb;
begin
  if v_department = '' or v_name = '' then
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
      select 1 from jsonb_array_elements_text(v_allowed) d(dep)
      where public.canonical_department_key(d.dep) = public.canonical_department_key(v_department)
    )
  ) then
    return jsonb_build_object('ok', false, 'message', 'Unauthorized department');
  end if;

  update public.users_directory
  set active = false,
      changed_at = now(),
      changed_by = v_admin
  where lower(trim(employee_name)) = lower(trim(v_name))
    and public.canonical_department_key(department) = public.canonical_department_key(v_department);

  if not found then
    return jsonb_build_object('ok', false, 'message', 'User not found.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'department', v_department,
    'employeeName', v_name,
    'active', false
  );
end;
$$;

create or replace function public.rpc_reactivate_user(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text := coalesce(p_payload->>'admin', '');
  v_code text := coalesce(p_payload->>'code', '');
  v_department text := coalesce(p_payload->>'department', '');
  v_name text := coalesce(p_payload->>'employeeName', '');
  v_allowed jsonb;
begin
  if v_department = '' or v_name = '' then
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
      select 1 from jsonb_array_elements_text(v_allowed) d(dep)
      where public.canonical_department_key(d.dep) = public.canonical_department_key(v_department)
    )
  ) then
    return jsonb_build_object('ok', false, 'message', 'Unauthorized department');
  end if;

  update public.users_directory
  set active = true,
      changed_at = now(),
      changed_by = v_admin
  where lower(trim(employee_name)) = lower(trim(v_name))
    and public.canonical_department_key(department) = public.canonical_department_key(v_department);

  if not found then
    return jsonb_build_object('ok', false, 'message', 'User not found.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'department', v_department,
    'employeeName', v_name,
    'active', true
  );
end;
$$;

create or replace function public.rpc_list_all_users(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text := coalesce(p_payload->>'admin', '');
  v_code text := coalesce(p_payload->>'code', '');
  v_allowed jsonb;
  v_res jsonb;
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

  select jsonb_build_object(
    'ok', true,
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'department', u.department,
        'employeeName', u.employee_name,
        'email', coalesce(u.email, ''),
        'active', u.active
      ) order by u.department, u.employee_name)
      from public.users_directory u
      where (
        (v_allowed ? 'All')
        or exists (
          select 1 from jsonb_array_elements_text(v_allowed) d(dep)
          where public.canonical_department_key(d.dep) = public.canonical_department_key(u.department)
        )
      )
    ), '[]'::jsonb)
  )
  into v_res;

  return v_res;
end;
$$;

create or replace function public.rpc_log_cliq_failure(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text := coalesce(p_payload->>'admin', '');
  v_code text := coalesce(p_payload->>'code', '');
  v_user_code text := coalesce(p_payload->>'accessCode', p_payload->>'code', '');
  v_stage text := upper(coalesce(p_payload->>'stage', ''));
  v_department text := coalesce(p_payload->>'department', '');
  v_employee text := coalesce(p_payload->>'employeeName', '');
  v_work_date date := public.to_date_safe(p_payload->>'workDate');
  v_error text := left(coalesce(p_payload->>'error', 'Unknown webhook error'), 1000);
  v_flow_payload jsonb := coalesce(p_payload->'flowPayload', '{}'::jsonb);
  v_allowed jsonb;
  v_event_key text;
  v_logged_by text := '';
begin
  if v_stage not in ('SOD', 'EOD', 'APPROVAL_REQUEST', 'APPROVAL_RESOLUTION') then
    return jsonb_build_object('ok', false, 'message', 'Invalid stage');
  end if;

  select a.allowed_departments_json
  into v_allowed
  from public.admins_directory a
  where lower(trim(a.admin_name)) = lower(trim(v_admin))
    and a.active = true
    and public.secret_matches(v_code, a.admin_code_hash)
  limit 1;

  if v_allowed is null then
    if v_stage = 'APPROVAL_REQUEST' then
      perform 1
      from public.users_directory u
      where public.canonical_department_key(u.department) = public.canonical_department_key(v_department)
        and lower(trim(u.employee_name)) = lower(trim(v_employee))
        and u.active = true
        and public.secret_matches(v_user_code, u.access_code_hash)
      limit 1;
      if not found then
        return jsonb_build_object('ok', false, 'message', 'Unauthorized');
      end if;
      v_logged_by := v_employee;
    else
      return jsonb_build_object('ok', false, 'message', 'Unauthorized');
    end if;
  else
    v_logged_by := v_admin;
  end if;

  if v_allowed is not null and not (
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
    'cliq_webhook',
    jsonb_build_object(
      'nonce', clock_timestamp()::text,
      'stage', v_stage,
      'department', v_department,
      'employeeName', v_employee,
      'workDate', coalesce(v_work_date::text, '')
    )
  );

  insert into public.task_admin_events(
    event_key, event_type, changed_at, work_date, department, employee_name, task_id, title, status, payload_json
  )
  values (
    v_event_key,
    'cliq_webhook',
    now(),
    v_work_date,
    coalesce(v_department, ''),
    coalesce(v_employee, ''),
    null,
    concat(v_stage, ' Cliq webhook'),
    'Failed',
    jsonb_build_object(
      'stage', v_stage,
      'error', v_error,
      'retryCount', 0,
      'flowPayload', v_flow_payload,
      'loggedBy', v_logged_by,
      'loggedAt', public.rfc3339_now()
    )
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.rpc_get_failed_cliq_logs(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text := coalesce(p_payload->>'admin', '');
  v_code text := coalesce(p_payload->>'code', '');
  v_stage_filter text := upper(coalesce(p_payload->>'stage', 'All'));
  v_limit int := least(1000, greatest(1, coalesce(nullif(p_payload->>'limit','')::int, 200)));
  v_allowed jsonb;
  v_logs jsonb;
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

  with rows as (
    select
      e.id,
      e.changed_at,
      e.work_date,
      e.department,
      e.employee_name,
      coalesce(e.payload_json->>'stage', '') as stage,
      coalesce(e.payload_json->>'error', '') as error,
      coalesce((e.payload_json->>'retryCount')::int, 0) as retry_count,
      coalesce(e.payload_json->>'loggedBy', '') as logged_by,
      coalesce(e.payload_json->'flowPayload', '{}'::jsonb) as flow_payload
    from public.task_admin_events e
    where e.event_type = 'cliq_webhook'
      and e.status = 'Failed'
      and (
        (v_allowed ? 'All')
        or exists (
          select 1
          from jsonb_array_elements_text(v_allowed) d(dep)
          where public.canonical_department_key(d.dep) = public.canonical_department_key(e.department)
        )
      )
      and (v_stage_filter = 'ALL' or upper(coalesce(e.payload_json->>'stage', '')) = v_stage_filter)
    order by e.changed_at desc
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'changedAt', r.changed_at,
    'workDate', r.work_date,
    'department', r.department,
    'employeeName', r.employee_name,
    'stage', r.stage,
    'error', r.error,
    'retryCount', r.retry_count,
    'loggedBy', r.logged_by,
    'flowPayload', r.flow_payload
  )), '[]'::jsonb)
  into v_logs
  from rows r;

  return jsonb_build_object('ok', true, 'logs', coalesce(v_logs, '[]'::jsonb));
end;
$$;
