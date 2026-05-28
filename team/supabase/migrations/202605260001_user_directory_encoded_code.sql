-- Add access_code_encoded column so rpc_get_user_directory can return real codes
-- instead of "MASKED". This fixes the broken live-link issue for users not in
-- the hardcoded static fallback (task-data.js / admin.html).
--
-- Root cause: syncUserToStaticFiles_ POSTs to /update-user-directory which only
-- exists in local server.js, not on production Apache. New users added via admin
-- panel never get their code written to the static fallback, so after a page
-- refresh the admin sees code="" in the copied link.

-- ─── 1. Add column ──────────────────────────────────────────────────────────

alter table public.users_directory
  add column if not exists access_code_encoded text not null default '';

-- ─── 2. Backfill existing users from known static fallback codes ─────────────

update public.users_directory u
set access_code_encoded = t.encoded
from (values
  ('Information Technology', 'Shalin Bhavsar',       'SVQtU0ItNzM5MQ=='),
  ('Information Technology', 'Pranav Shah',           'SVQtUFMtMTg0Mg=='),
  ('Information Technology', 'Anoj Tambe',            'SVQtQVQtNTYyNw=='),
  ('Information Technology', 'Gunjan Rusia',          'SVQtR1ItOTAzNA=='),
  ('Information Technology', 'Thakur Prasad',         'SVQtVFAtNDQ3OA=='),
  ('Operations',             'Rahul Meher',           'T1AtUk0tNjE4Mw=='),
  ('Operations',             'Nagma Shaikh',          'T1AtTlMtODUwMQ=='),
  ('Operations',             'Amit Lad',              'T1AtQUwtMzkyNg=='),
  ('Operations',             'Akshay Jadhav',         'T1AtQUotNzc1NA=='),
  ('Human Resources',        'Vibha Vashistha',       'SFItVlYtNjIwNA=='),
  ('Human Resources',        'Akshata Kochrekar',     'SFItQUstNzM5Ng=='),
  ('Human Resources',        'Ajay Chariya',          'SFItQUMtNjczMg=='),
  ('Human Resources',        'Nimisha Gaonkar',       'SFItTkctNTE4Mg=='),
  ('Research',               'Humaid Khot',           'UlMtSEstNDE3NQ=='),
  ('Research',               'Yash Asrani',           'UlMtWUEtMjg2NA=='),
  ('Research',               'Vinjal Rao',            'UlMtVlItNjQxMg=='),
  ('Research',               'Ria Ignatious',         'UlMtUkktODA5Nw=='),
  ('Equity',                 'Gaurav Haldankar',      'RVEtR0gtMTUzOQ=='),
  ('Equity',                 'Milind Jain',           'RVEtTUotNzIwNA=='),
  ('Equity',                 'Ovesh Khatri',          'RVEtT0stNjQyNw=='),
  ('Advisory',               'Rashi Panchal',         'QUQtUlAtNTc5MQ=='),
  ('Direct Reportees',       'Pranob Thachanthara',   'RFItUFQtMzMyOA=='),
  ('Direct Reportees',       'Rajvi Gori',            'RFItUkctNjgxNQ=='),
  ('Direct Reportees',       'Chintan Dudhela',       'RFItQ0QtOTA0Mw=='),
  ('Direct Reportees',       'Sagar Maheshwari',      'RFItU00tMjU3Ng=='),
  ('Direct Reportees',       'Jignesh Gajjar',        'RFItSkctNTQ2Mg=='),
  ('Direct Reportees',       'Jayant Furia',          'RFItSkYtMTE5OA=='),
  ('Direct Reportees',       'Vandana Manwani',       'RFItVk0tODczMA=='),
  ('Direct Reportees',       'Neha Sanghrajka',       'SFItTlMtNDQ3MQ=='),
  ('Direct Reportees',       'Kainaz Tata',           'SFItS1QtMjQwMQ=='),
  ('Direct Reportees',       'Priyanka Kelkar',       'RFItUEstNDgyNg=='),
  ('Direct Reportees',       'Pravin Mayekar',        'T1AtUE0tMjc0OQ=='),
  ('Direct Reportees',       'Riya Jain',             'UlMtUkotNTMxOA=='),
  ('Direct Reportees',       'Rushabh Dugad',         'UlMtUkQtOTYyMA=='),
  ('Marketing',              'Aishwarya Krishnan',    'TUstQUstNDgyNw=='),
  ('Marketing',              'Aastha Tiwari',         'TUstQVQtNDQxMg=='),
  ('Marketing',              'Anas Ansari',           'TUstQUEtNTgzNw=='),
  ('Marketing',              'Deepti Baria',          'TUstREItNzI5NA=='),
  ('Marketing',              'Pavan Dhake',           'TUstUEQtMzY4MQ=='),
  ('Marketing',              'Omkar Kandalekar',      'TUstT0stOTE1Ng=='),
  ('Marketing',              'Himanshi Makhe',        'TUstSE0tMjQwNw=='),
  ('Marketing',              'Renu Agarwal',          'TUstUkEtNjU0Mw=='),
  ('Marketing',              'Shruti Wagaralkar',     'TUstU1ctNzQxOQ==')
) as t(dept, name, encoded)
where lower(trim(u.employee_name)) = lower(trim(t.name))
  and public.canonical_department_key(u.department) = public.canonical_department_key(t.dept);

-- ─── 3. Upsert Hitesh Nagvekar with a fresh known code ───────────────────────
-- Code: MK-HN-4619  →  base64: TUstSE4tNDYxOQ==
-- Any old hash is overwritten (old link was already broken / code=empty).

insert into public.users_directory
  (department, employee_name, access_code_hash, access_code_encoded,
   email, changed_at, changed_by, source, active)
values
  ('Marketing', 'Hitesh Nagvekar',
   public.hash_secret('MK-HN-4619'),
   'TUstSE4tNDYxOQ==',
   '',
   now(), 'migration', 'migration', true)
on conflict (department, employee_name) do update set
  access_code_hash    = public.hash_secret('MK-HN-4619'),
  access_code_encoded = 'TUstSE4tNDYxOQ==',
  changed_at          = now(),
  changed_by          = 'migration',
  active              = true;

-- ─── 4. Update rpc_create_user to store access_code_encoded ─────────────────

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
  v_encoded text;
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

  -- Compute base64-encoded version of the plaintext code (same format as task-data.js).
  -- This lets rpc_get_user_directory return real codes so admin live-link copies work
  -- even after page refresh (without depending on the local /update-user-directory endpoint).
  v_encoded := case
    when v_code = '' then ''
    else replace(encode(convert_to(v_code, 'UTF8'), 'base64'), E'\n', '')
  end;

  insert into public.users_directory(
    department, employee_name, access_code_hash, access_code_encoded,
    email, changed_by, source, active
  )
  values (
    v_department,
    v_name,
    public.hash_secret(case when v_code = '' then 'TEMP-CHANGE-ME' else v_code end),
    v_encoded,
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
    access_code_encoded = case
      when excluded.access_code_encoded <> ''
      then excluded.access_code_encoded
      else users_directory.access_code_encoded
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

-- ─── 5. Update rpc_get_user_directory to return real codes ───────────────────

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
    select u0.department, u0.employee_name, u0.email,
           coalesce(nullif(u0.access_code_encoded, ''), 'MASKED') as code_val
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
        select department, jsonb_object_agg(employee_name, code_val) as people
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
