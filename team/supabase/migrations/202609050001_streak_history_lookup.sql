-- Streak calculations filter by employee across all dates and stages.
-- Existing dashboard indexes start with stage/date and do not match this access path.
create index if not exists idx_task_submissions_streak_history
  on public.task_submissions (
    public.canonical_department_key(department),
    lower(trim(employee_name)),
    work_date
  )
  include (stage);
