-- ============================================================
--  תזכורות אוטומטיות בוואטסאפ (WhatsApp Cloud API של Meta)
--  מריצים אחרי schema.sql. רץ כל 15 דקות ושולח לשוכר תזכורת
--  X שעות לפני ההשכרה (ברירת מחדל 24, לפי "reminderHours" בהגדרות).
--
--  מה צריך מ-Meta (נשמר מוצפן ב-Vault, לא בקוד):
--    wa_token     — Access token קבוע (System User)
--    wa_phone_id  — Phone number ID של המספר השולח
--  ותבנית הודעה מאושרת בשם booking_reminder (עברית), עם 4 משתנים:
--    {{1}} שם השוכר · {{2}} החדר · {{3}} היום והתאריך · {{4}} השעות
--  ההפעלה: בהגדרות האתר (ניהול ← כללי ונהלים) מסמנים "תזכורת אוטומטית".
-- ============================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.slots add column if not exists reminder_via text;          -- manual / whatsapp / whatsapp_failed
alter table public.slots add column if not exists reminder_request bigint;    -- מזהה הבקשה ב-pg_net
alter table public.slots add column if not exists reminder_error text;

-- מספר טלפון ישראלי בפורמט הבינלאומי ש-Meta דורשת (9725XXXXXXXX)
create or replace function public.wa_number(p text) returns text
language sql immutable as $$
  select case
    when d like '972%' then d
    when d like '0%' then '972' || substr(d, 2)
    else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

-- התזכורות שהגיע זמנן (משמש גם את הבדיקות)
create or replace function public.due_reminders() returns table (slot_id uuid, phone text, name text, room text, day text, hours text)
language sql stable security definer set search_path = public as $$
  with cfg as (select data from settings where id = 1)
  select s.id, wa_number(b.phone), b.name,
    coalesce((select rm->>'name' from cfg, jsonb_array_elements(cfg.data->'buildings') bb, jsonb_array_elements(bb->'rooms') rm where rm->>'id' = s.room_id limit 1), 'החדר'),
    'יום ' || (array['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'])[extract(dow from s.date)::int + 1] || ' ' || to_char(s.date, 'DD.MM'),
    s.start_time || '–' || s.end_time
  from slots s join bookings b on b.id = s.booking_id, cfg
  where s.status <> 'cancelled' and s.reminded_at is null
    and s.starts_at > now()
    and s.starts_at <= now() + make_interval(hours => coalesce(nullif(cfg.data->>'reminderHours', '')::int, 24))
    and length(wa_number(b.phone)) between 11 and 13
  order by s.starts_at
  limit 50;
$$;

-- שליחה: נקראת כל 15 דקות על ידי pg_cron
create or replace function public.send_due_reminders() returns int
language plpgsql security definer set search_path = public, extensions as $$
declare
  cfg jsonb; tok text; pid text; tpl text; lang text; r record; rid bigint; n int := 0;
begin
  -- תזכורות קודמות שנכשלו אצל Meta: מסמנים, כדי שהמנהל יראה וישלח ידנית
  update slots s set reminder_via = 'whatsapp_failed', reminded_at = null,
         reminder_error = left(coalesce(h.content::text, h.error_msg, 'error ' || h.status_code), 300)
  from net._http_response h
  where s.reminder_request = h.id and s.reminder_via = 'whatsapp' and (h.status_code is null or h.status_code >= 300);

  select data into cfg from settings where id = 1;
  if coalesce((cfg->>'waAuto')::boolean, false) is not true then return 0; end if;
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'wa_token';
  select decrypted_secret into pid from vault.decrypted_secrets where name = 'wa_phone_id';
  if coalesce(tok, '') = '' or coalesce(pid, '') = '' then return 0; end if;
  tpl := coalesce(nullif(cfg->>'waTemplate', ''), 'booking_reminder');
  lang := coalesce(nullif(cfg->>'waLang', ''), 'he');

  for r in select * from due_reminders() d
           where not exists (select 1 from slots x where x.id = d.slot_id and x.reminder_via = 'whatsapp_failed') loop
    select net.http_post(
      url := 'https://graph.facebook.com/v21.0/' || pid || '/messages',
      headers := jsonb_build_object('Authorization', 'Bearer ' || tok, 'Content-Type', 'application/json'),
      body := jsonb_build_object(
        'messaging_product', 'whatsapp', 'to', r.phone, 'type', 'template',
        'template', jsonb_build_object('name', tpl, 'language', jsonb_build_object('code', lang),
          'components', jsonb_build_array(jsonb_build_object('type', 'body', 'parameters', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', r.name),
            jsonb_build_object('type', 'text', 'text', r.room),
            jsonb_build_object('type', 'text', 'text', r.day),
            jsonb_build_object('type', 'text', 'text', r.hours)))))))
    into rid;
    update slots set reminded_at = now(), reminder_via = 'whatsapp', reminder_request = rid, reminder_error = null where id = r.slot_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- רק המערכת מריצה את אלה — לא מבקרים באתר
revoke all on function public.send_due_reminders() from public;
revoke all on function public.due_reminders() from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.send_due_reminders() from anon, authenticated;
    revoke all on function public.due_reminders() from anon, authenticated;
  end if;
end $$;

-- כל 15 דקות
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'kelahim-whatsapp-reminders';
    perform cron.schedule('kelahim-whatsapp-reminders', '*/15 * * * *', 'select public.send_due_reminders()');
  end if;
end $$;
