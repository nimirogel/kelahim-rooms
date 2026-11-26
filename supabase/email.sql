-- ============================================================
--  התראות מייל על הזמנה חדשה — למנהל ולשוכר (דרך Gmail + Google Apps Script)
--  מריצים אחרי schema.sql.
--
--  איך זה עובד:
--  1. כשנוצרת הזמנה, המסד שולח לסקריפט רק את הקישור האישי (token).
--  2. הסקריפט מושך את הפרטים מהמסד (claim_booking_mail) ושולח את המיילים מה-Gmail.
--  3. הפרטים ניתנים פעם אחת בלבד, ורק ל־15 הדקות הראשונות אחרי ההזמנה,
--     כך שכתובת הסקריפט לא מאפשרת לשלוח מיילים שרירותיים.
--
--  כתובת הסקריפט נשמרת מוצפנת ב-Vault:
--    select vault.create_secret('<WEB APP URL>', 'mail_webhook_url');
-- ============================================================

create extension if not exists pg_net;

alter table public.bookings add column if not exists mailed_at timestamptz;

-- אחרי כל הזמנה חדשה: מודיעים לסקריפט (נשלח רק אחרי שההזמנה נשמרה בהצלחה)
create or replace function public.notify_new_booking() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare url text;
begin
  select decrypted_secret into url from vault.decrypted_secrets where name = 'mail_webhook_url';
  if coalesce(url, '') <> '' then
    perform net.http_post(url := url, body := jsonb_build_object('token', new.token),
                          headers := '{"Content-Type": "application/json"}'::jsonb);
  end if;
  return new;
exception when others then
  return new;  -- מייל שלא יצא לעולם לא מפיל הזמנה
end;
$$;

drop trigger if exists bookings_notify on public.bookings;
create trigger bookings_notify after insert on public.bookings
  for each row execute function public.notify_new_booking();

-- הסקריפט מבקש את פרטי ההזמנה, פעם אחת בלבד
create or replace function public.claim_booking_mail(tok text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb; b bookings; room jsonb; bld jsonb; sl jsonb;
begin
  update bookings set mailed_at = now()
    where token = tok and mailed_at is null and created_at > now() - interval '15 minutes'
    returning * into b;
  if b.id is null then return null; end if;
  select data into cfg from settings where id = 1;
  select r, bb into room, bld from jsonb_array_elements(cfg->'buildings') bb, jsonb_array_elements(bb->'rooms') r
    where r->>'id' = b.room_id limit 1;
  select jsonb_agg(jsonb_build_object(
      'day', (array['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'])[extract(dow from s.date)::int + 1],
      'date', to_char(s.date, 'DD.MM.YYYY'), 'start', s.start_time, 'end', s.end_time,
      'end_date', to_char(s.end_date, 'DD.MM.YYYY'), 'price', s.price) order by s.starts_at)
    into sl from slots s where s.booking_id = b.id;
  return jsonb_build_object(
    'site_name', coalesce(cfg->>'siteName', 'השכרת חדרים'),
    'site_url', coalesce(nullif(cfg->>'siteUrl', ''), ''),
    'manager_email', coalesce(cfg->>'notifyEmail', ''),
    'manager_name', coalesce(cfg->>'managerName', ''),
    'manager_phone', coalesce(cfg->>'managerPhone', ''),
    'refund_hours', coalesce(nullif(cfg->>'refundHours', '')::int, 24),
    'room', coalesce(room->>'name', b.room_id), 'building', coalesce(bld->>'name', ''), 'address', coalesce(bld->>'address', ''),
    'pay_link', coalesce(room->>'payLink', ''),
    'rules', concat_ws(E'\n\n', nullif(cfg->>'generalRules', ''), nullif(room->>'rules', '')),
    'token', b.token, 'name', b.name, 'phone', b.phone, 'email', coalesce(b.email, ''), 'purpose', coalesce(b.purpose, ''),
    'people', b.people, 'residency', b.residency, 'option', coalesce(b.option_name, ''), 'repeat', coalesce(b.repeat, ''),
    'total', b.total, 'deposit', b.deposit, 'source', b.source, 'slots', coalesce(sl, '[]'::jsonb));
end;
$$;

revoke all on function public.notify_new_booking() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.notify_new_booking() from anon, authenticated;
    grant execute on function public.claim_booking_mail(text) to anon, authenticated;
  end if;
end $$;
