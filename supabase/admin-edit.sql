-- ============================================================
--  פעולות מנהל על הזמנות: עריכה (מחיר, מועד, פרטי השוכר) ומחיקה.
--  מריצים אחרי schema.sql. אפשר להריץ שוב בבטחה.
-- ============================================================

-- עריכת מועד אחד ופרטי ההזמנה שלו. שדות שלא נשלחים נשארים כמו שהם.
-- p: { slot_id, price, date, start, end, end_date, name, phone, email, purpose, people, residency }
create or replace function public.admin_update_slot(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s slots; cfg jsonb; room jsonb; buf int; d date; ed date; s_at timestamptz; e_at timestamptz;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select * into s from slots where id = (p->>'slot_id')::uuid;
  if s.id is null then raise exception 'not_found'; end if;

  if (p ? 'name' and length(trim(coalesce(p->>'name', ''))) < 2)
     or (p ? 'phone' and length(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g')) < 9) then
    raise exception 'missing_details';
  end if;
  if coalesce(trim(p->>'email'), '') <> '' and trim(p->>'email') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'missing_email'; end if;

  update bookings set
    name = case when p ? 'name' then trim(p->>'name') else name end,
    phone = case when p ? 'phone' then trim(p->>'phone') else phone end,
    email = case when p ? 'email' then nullif(trim(p->>'email'), '') else email end,
    purpose = case when p ? 'purpose' then nullif(trim(p->>'purpose'), '') else purpose end,
    people = case when p ? 'people' then nullif(p->>'people', '')::int else people end,
    residency = case when p->>'residency' in ('local', 'outside') then p->>'residency' else residency end
  where id = s.booking_id;

  if p ? 'date' or p ? 'start' or p ? 'end' or p ? 'end_date' then
    d := coalesce(nullif(p->>'date', '')::date, s.date);
    ed := case when p ? 'end_date' then coalesce(nullif(p->>'end_date', '')::date, d)
               else d + coalesce(s.end_date - s.date, 0) end;  -- שומרים על אורך ההשכרה (למשל 24 שעות)
    s_at := local_ts(d, coalesce(nullif(p->>'start', ''), s.start_time));
    e_at := local_ts(ed, coalesce(nullif(p->>'end', ''), s.end_time));
    if e_at <= s_at then raise exception 'bad_time'; end if;
    select data into cfg from settings where id = 1;
    select r into room from jsonb_array_elements(cfg->'buildings') b, jsonb_array_elements(b->'rooms') r where r->>'id' = s.room_id limit 1;
    buf := coalesce(nullif(room->>'bufferMin', '')::int, 0);
    begin
      update slots set date = d, end_date = case when ed <> d then ed end,
        start_time = coalesce(nullif(p->>'start', ''), s.start_time), end_time = coalesce(nullif(p->>'end', ''), s.end_time),
        starts_at = s_at, ends_at = e_at, blocked = tstzrange(s_at, e_at + make_interval(mins => buf), '[)'),
        reminded_at = case when s_at <> s.starts_at then null else reminded_at end
      where id = s.id;
    exception when exclusion_violation then raise exception 'clash';
    end;
  end if;

  if p ? 'price' then
    update slots set price = greatest(0, coalesce(nullif(p->>'price', '')::int, 0)) where id = s.id;
  end if;
  update bookings set total = (select coalesce(sum(price), 0) from slots where booking_id = s.booking_id and status <> 'cancelled')
    where id = s.booking_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- מחיקה לצמיתות: מועד אחד, או כל ההזמנה (כל המועדים שלה). לא נשלח מייל.
create or replace function public.admin_delete_slot(slot_id uuid, whole boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare bid uuid; n int;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select booking_id into bid from slots where id = slot_id;
  if bid is null then raise exception 'not_found'; end if;
  if whole then
    select count(*) into n from slots where booking_id = bid;
    delete from bookings where id = bid;
    return n;
  end if;
  delete from slots where id = slot_id;
  if not exists (select 1 from slots where booking_id = bid) then
    delete from bookings where id = bid;
  else
    update bookings set total = (select coalesce(sum(price), 0) from slots where booking_id = bid and status <> 'cancelled') where id = bid;
  end if;
  return 1;
end;
$$;

revoke all on function public.admin_update_slot(jsonb) from public;
revoke all on function public.admin_delete_slot(uuid, boolean) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.admin_update_slot(jsonb) from anon;
    revoke all on function public.admin_delete_slot(uuid, boolean) from anon;
    grant execute on function public.admin_update_slot(jsonb), public.admin_delete_slot(uuid, boolean) to authenticated;
  end if;
end $$;
