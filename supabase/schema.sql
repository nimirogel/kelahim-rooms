-- ============================================================
--  חדרים להשכרה · קלחים — מבנה מסד הנתונים (Supabase / PostgreSQL)
--  מריצים פעם אחת ב-Supabase: SQL Editor → New query → הדבקה → Run
-- ============================================================

create extension if not exists btree_gist;

-- ---------- הגדרות האתר (מבנים, חדרים, מחירים, נהלים) ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- מנהלים ----------
create table if not exists public.admins (
  user_id uuid primary key,
  email text
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------- הזמנות (פרטי השוכר — גלויים רק למנהל) ----------
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  room_id text not null,
  option_id text,
  option_name text,
  name text not null,
  phone text not null,
  email text,
  purpose text,
  people int,
  residency text not null default 'local' check (residency in ('local', 'outside')),
  repeat text,
  until date,
  ranges jsonb,
  total int not null default 0,
  deposit int not null default 0,
  source text not null default 'self' check (source in ('self', 'manual')),
  created_at timestamptz not null default now()
);

-- ---------- מועדים (כל שורה = פרק זמן תפוס בחדר) ----------
create table if not exists public.slots (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  room_id text not null,
  date date not null,
  start_time text not null,
  end_time text not null,
  end_date date,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  blocked tstzrange not null,          -- מההתחלה ועד הסוף + זמן ההפרדה של החדר
  price int not null default 0,
  option_name text,
  series boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text,
  refund text check (refund in ('full', 'none')),
  refunded_at timestamptz,
  reminded_at timestamptz,
  deposit int not null default 0,
  deposit_status text check (deposit_status in ('review', 'returned', 'withheld')),
  deposit_at timestamptz,
  checkout jsonb,
  created_at timestamptz not null default now(),
  -- המסד עצמו מונע שתי הזמנות חופפות באותו חדר (כולל זמן ההפרדה)
  constraint no_overlap exclude using gist (room_id with =, blocked with &&) where (status <> 'cancelled')
);
create index if not exists slots_date_idx on public.slots (date);
create index if not exists slots_booking_idx on public.slots (booking_id);

-- ---------- מה שכולם רואים: רק מתי תפוס, בלי פרטים אישיים ----------
create or replace view public.public_slots as
  select id, room_id, date, start_time, end_time, end_date
  from public.slots
  where status <> 'cancelled' and coalesce(end_date, date) >= current_date - 62;

-- ============================================================
--  פונקציות
-- ============================================================

create or replace function public.local_ts(d date, t text) returns timestamptz
language sql immutable as $$
  select (d + t::time) at time zone 'Asia/Jerusalem';
$$;

-- יצירת הזמנה: המחיר מחושב כאן בשרת, לפי ההגדרות, ולא לפי מה שהדפדפן שולח
create or replace function public.create_booking(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cfg jsonb; room jsonb; opt jsonb;
  adm boolean := public.is_admin();
  mult numeric := 1;
  buf int; dep int;
  it jsonb; d date; ed date; s_at timestamptz; e_at timestamptz;
  hrs numeric; pr int; v_total int := 0; n int := 0;
  bid uuid; tok text;
  many boolean := jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) > 1;
begin
  select data into cfg from settings where id = 1;
  select r into room from jsonb_array_elements(cfg->'buildings') b, jsonb_array_elements(b->'rooms') r
    where r->>'id' = p->>'room_id' limit 1;
  if room is null then raise exception 'room_not_found'; end if;
  if length(coalesce(trim(p->>'name'), '')) < 2 or length(regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g')) < 9 then
    raise exception 'missing_details';
  end if;
  if not adm and coalesce(trim(p->>'email'), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'missing_email'; end if;
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) not between 1 and 120 then raise exception 'bad_items'; end if;

  buf := coalesce(nullif(room->>'bufferMin', '')::int, 0);
  dep := coalesce(nullif(room->>'deposit', '')::int, 0);
  if not adm then
    select o into opt from jsonb_array_elements(room->'options') o where o->>'id' = p->>'option_id' limit 1;
    if opt is null then raise exception 'option_not_found'; end if;
    if p->>'residency' = 'outside' then mult := coalesce(nullif(cfg->>'outsidePct', '')::numeric, 150) / 100; end if;
  end if;

  insert into bookings (room_id, option_id, option_name, name, phone, email, purpose, people, residency, repeat, until, ranges, deposit, source)
  values (p->>'room_id', p->>'option_id', coalesce(opt->>'name', p->>'option_name', 'הזמנה ידנית'),
          trim(p->>'name'), trim(p->>'phone'), nullif(p->>'email', ''), nullif(p->>'purpose', ''), nullif(p->>'people', '')::int,
          case when p->>'residency' = 'outside' then 'outside' else 'local' end,
          nullif(p->>'repeat', ''), nullif(p->>'until', '')::date, p->'ranges', dep,
          case when adm and p->>'source' = 'manual' then 'manual' else 'self' end)
  returning id, token into bid, tok;

  for it in select * from jsonb_array_elements(p->'items') loop
    d := (it->>'date')::date;
    ed := coalesce(nullif(it->>'end_date', '')::date, d);
    s_at := local_ts(d, it->>'start');
    e_at := local_ts(ed, it->>'end');
    if e_at <= s_at then raise exception 'bad_time'; end if;
    if not adm and s_at < now() then raise exception 'past_time'; end if;
    hrs := extract(epoch from (e_at - s_at)) / 3600;
    if adm then
      pr := coalesce(nullif(it->>'price', '')::int, 0);
    elsif opt->>'kind' = 'hourly' or coalesce(opt->>'kind', '') = '' then
      if hrs > coalesce(nullif(opt->>'maxHours', '')::numeric, 24) then raise exception 'too_long'; end if;
      pr := round((opt->>'price')::numeric * hrs * mult);
    elsif opt->>'kind' = 'block' then
      if abs(hrs - coalesce(nullif(opt->>'hours', '')::numeric, 24)) > 1.01 then raise exception 'bad_block'; end if;  -- 1.01 = מעבר שעון קיץ/חורף
      pr := round((opt->>'price')::numeric * mult);
    else
      pr := round((opt->>'price')::numeric * mult);
    end if;
    insert into slots (booking_id, room_id, date, start_time, end_time, end_date, starts_at, ends_at, blocked, price, option_name, series, status, paid_at, deposit)
    values (bid, p->>'room_id', d, it->>'start', it->>'end', case when ed <> d then ed end, s_at, e_at,
            tstzrange(s_at, e_at + make_interval(mins => buf), '[)'), pr,
            coalesce(opt->>'name', p->>'option_name', 'הזמנה ידנית'), many,
            case when adm and p->>'status' = 'paid' then 'paid' else 'pending' end,
            case when adm and p->>'status' = 'paid' then now() end, dep);
    v_total := v_total + pr; n := n + 1;
  end loop;

  update bookings set total = v_total where id = bid;
  return jsonb_build_object('id', bid, 'token', tok, 'total', v_total, 'count', n);
exception
  when exclusion_violation then raise exception 'clash';
end;
$$;

-- ההזמנות של השוכר (לפי הקישורים האישיים ששמורים אצלו)
create or replace function public.get_bookings(tokens text[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'token', b.token, 'room_id', b.room_id, 'option_name', b.option_name, 'repeat', b.repeat, 'until', b.until,
    'ranges', b.ranges, 'residency', b.residency, 'total', b.total, 'deposit', b.deposit,
    'slots', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'date', s.date, 'start', s.start_time, 'end', s.end_time, 'end_date', s.end_date, 'status', s.status,
        'price', s.price, 'deposit', s.deposit, 'deposit_status', s.deposit_status, 'checkout', s.checkout, 'series', s.series,
        'starts_at', s.starts_at, 'ends_at', s.ends_at) order by s.starts_at), '[]'::jsonb)
      from slots s where s.booking_id = b.id)
  )), '[]'::jsonb)
  from bookings b where b.token = any(tokens);
$$;

-- ביטול על ידי השוכר: ההחזר נקבע בשרת לפי תנאי הביטול
create or replace function public.cancel_booking(tok text, slot_ids uuid[] default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb; hrs numeric; n int; full_n int;
begin
  select data into cfg from settings where id = 1;
  hrs := coalesce(nullif(cfg->>'refundHours', '')::numeric, 24);
  with upd as (
    update slots s set status = 'cancelled', cancelled_at = now(), cancelled_by = 'renter',
      refund = case when s.starts_at - now() >= make_interval(secs => hrs * 3600) then 'full' else 'none' end,
      paid_at = case when s.status = 'paid' then coalesce(s.paid_at, s.created_at) else s.paid_at end
    from bookings b
    where s.booking_id = b.id and b.token = tok and s.status <> 'cancelled' and s.starts_at > now()
      and (slot_ids is null or s.id = any(slot_ids))
    returning s.refund
  ) select count(*), count(*) filter (where refund = 'full') into n, full_n from upd;
  if n = 0 then raise exception 'nothing_to_cancel'; end if;
  return jsonb_build_object('cancelled', n, 'full_refund', full_n);
end;
$$;

-- הזדכות: תמונות והערה, להחזרת הפיקדון
create or replace function public.submit_checkout(tok text, slot uuid, photos text[], note text, via text default 'upload') returns void
language plpgsql security definer set search_path = public as $$
begin
  update slots s set checkout = jsonb_build_object('photos', to_jsonb(coalesce(photos, '{}')), 'note', note, 'via', via, 'at', now()),
                     deposit_status = 'review'
  from bookings b
  where s.id = slot and s.booking_id = b.id and b.token = tok and s.status <> 'cancelled' and s.checkout is null and s.starts_at <= now();
  if not found then raise exception 'checkout_not_allowed'; end if;
end;
$$;

-- בדיקה שקישור אישי קיים (משמש את הרשאות העלאת התמונות)
create or replace function public.token_ok(tok text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bookings where token = tok);
$$;

-- ============================================================
--  הרשאות (Row Level Security)
-- ============================================================
alter table public.settings enable row level security;
alter table public.admins enable row level security;
alter table public.bookings enable row level security;
alter table public.slots enable row level security;

drop policy if exists "everyone reads settings" on public.settings;
create policy "everyone reads settings" on public.settings for select using (true);
drop policy if exists "admins write settings" on public.settings;
create policy "admins write settings" on public.settings for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins see themselves" on public.admins;
create policy "admins see themselves" on public.admins for select using (user_id = auth.uid());

drop policy if exists "admins manage bookings" on public.bookings;
create policy "admins manage bookings" on public.bookings for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage slots" on public.slots;
create policy "admins manage slots" on public.slots for all using (public.is_admin()) with check (public.is_admin());

-- תפקידי הגישה של Supabase (קיימים רק ב-Supabase)
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.bookings, public.slots, public.admins from anon;
    grant select on public.settings, public.public_slots to anon, authenticated;
    grant execute on function public.create_booking(jsonb), public.get_bookings(text[]), public.cancel_booking(text, uuid[]),
      public.submit_checkout(text, uuid, text[], text, text), public.token_ok(text) to anon, authenticated;
  end if;
end $$;

insert into public.settings (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;
