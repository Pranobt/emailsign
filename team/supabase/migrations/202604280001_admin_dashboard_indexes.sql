create index if not exists idx_task_submissions_dashboard_lookup
  on public.task_submissions (
    stage,
    work_date,
    public.canonical_department_key(department),
    lower(trim(employee_name)),
    submitted_at desc
  );

create index if not exists idx_task_admin_events_dashboard_lookup
  on public.task_admin_events (
    event_type,
    work_date,
    public.canonical_department_key(department),
    lower(trim(employee_name)),
    changed_at desc
  );

create index if not exists idx_task_admin_events_dashboard_changed_lookup
  on public.task_admin_events (
    event_type,
    public.canonical_department_key(department),
    lower(trim(employee_name)),
    changed_at desc
  );
