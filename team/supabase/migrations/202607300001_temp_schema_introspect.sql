-- Temporary introspection helper, to be removed once the real delete
-- migration is written. Returns column info for tables/functions related to
-- assignments and recurring tasks so we can write compatible DDL.

create or replace function public.rpc_debug_introspect(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin text := coalesce(p_payload->>'admin', '');
  v_code text := coalesce(p_payload->>'code', '');
  v_allowed jsonb;
  v_tables jsonb;
  v_functions jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'table_name', c.table_name,
    'column_name', c.column_name,
    'data_type', c.data_type
  ) order by c.table_name, c.ordinal_position), '[]'::jsonb)
  into v_tables
  from information_schema.columns c
  where c.table_schema = 'public'
    and (
      c.table_name ilike '%assign%'
      or c.table_name ilike '%recurring%'
      or c.table_name ilike '%planner%'
      or c.table_name ilike '%carryover%'
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'routine_name', r.routine_name,
    'data_type', r.data_type
  ) order by r.routine_name), '[]'::jsonb)
  into v_functions
  from information_schema.routines r
  where r.routine_schema = 'public'
    and (
      r.routine_name ilike '%assign%'
      or r.routine_name ilike '%recurring%'
      or r.routine_name ilike '%planner%'
      or r.routine_name ilike '%carryover%'
      or r.routine_name ilike '%pending_task%'
    );

  return jsonb_build_object('ok', true, 'columns', v_tables, 'functions', v_functions);
end;
$$;
