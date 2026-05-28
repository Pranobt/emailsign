
create or replace function public.extract_employee_id_code(p_val text)
returns text
language sql
immutable
as $$
  select coalesce(
    (regexp_match(coalesce(p_val, ''), '(E[0-9A-Za-z]+)\s*$'))[1],
    (regexp_match(coalesce(p_val, ''), '([A-Za-z0-9]*[0-9][A-Za-z0-9]*)\s*$'))[1],
    ''
  );
$$;

create or replace function public.parse_hhmm_to_minutes(p_val text)
returns int
language plpgsql
immutable
as $$
declare
  v text := trim(coalesce(p_val, ''));
  v_h int;
  v_m int;
begin
  if v = '' then
    return null;
  end if;
  if v !~ '^\d{1,2}:\d{2}$' then
    return null;
  end if;
  v_h := split_part(v, ':', 1)::int;
  v_m := split_part(v, ':', 2)::int;
  return greatest(0, v_h * 60 + v_m);
exception when others then
  return null;
end;
$$;

create or replace function public.parse_zoho_people_date(p_val text)
returns date
language plpgsql
immutable
as $$
declare
  v date;
begin
  if trim(coalesce(p_val, '')) = '' then
    return null;
  end if;
  begin
    v := to_date(trim(p_val), 'DD-Mon-YYYY');
  exception when others then
    begin
      v := p_val::date;
    exception when others then
      v := null;
    end;
  end;
  return v;
end;
$$;

create or replace function public.parse_zoho_people_timestamp(p_val text)
returns timestamptz
language plpgsql
stable
as $$
declare
  v_ts timestamptz;
begin
  if trim(coalesce(p_val, '')) = '' then
    return null;
  end if;
  begin
    v_ts := (to_timestamp(trim(p_val), 'DD-Mon-YYYY HH24:MI:SS')::timestamp at time zone 'Asia/Kolkata');
  exception when others then
    begin
      v_ts := p_val::timestamptz;
    exception when others then
      v_ts := null;
    end;
  end;
  return v_ts;
end;
$$;

create or replace function public.parse_zoho_people_timestamp_on_day(p_val text, p_day date)
returns timestamptz
language plpgsql
stable
as $$
declare
  v text := trim(coalesce(p_val, ''));
  v_ts timestamptz;
begin
  if v = '' then
    return null;
  end if;

  v_ts := public.parse_zoho_people_timestamp(v);
  if v_ts is not null then
    return v_ts;
  end if;

  if p_day is null then
    return null;
  end if;

  begin
    v_ts := (to_timestamp(p_day::text || ' ' || v, 'YYYY-MM-DD HH24:MI:SS')::timestamp at time zone 'Asia/Kolkata');
  exception when others then
    v_ts := null;
  end;
  if v_ts is not null then return v_ts; end if;

  begin
    v_ts := (to_timestamp(p_day::text || ' ' || v, 'YYYY-MM-DD HH24:MI')::timestamp at time zone 'Asia/Kolkata');
  exception when others then
    v_ts := null;
  end;
  if v_ts is not null then return v_ts; end if;

  begin
    v_ts := (to_timestamp(p_day::text || ' ' || upper(v), 'YYYY-MM-DD HH12:MI:SS AM')::timestamp at time zone 'Asia/Kolkata');
  exception when others then
    v_ts := null;
  end;
  if v_ts is not null then return v_ts; end if;

  begin
    v_ts := (to_timestamp(p_day::text || ' ' || upper(v), 'YYYY-MM-DD HH12:MI AM')::timestamp at time zone 'Asia/Kolkata');
  exception when others then
    v_ts := null;
  end;

  return v_ts;
end;
