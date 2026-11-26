-- ============================================================
--  אחסון תמונות — מריצים אחרי schema.sql
--  checkout: תמונות הזדכות (פרטי, רק מנהלים רואים)
--  site: לוגו ותמונות חדרים (ציבורי)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkout', 'checkout', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
       ('site', 'site', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

-- שוכר מעלה תמונות לתיקייה של הקישור האישי שלו בלבד
drop policy if exists "renters upload checkout photos" on storage.objects;
create policy "renters upload checkout photos" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'checkout' and public.token_ok((storage.foldername(name))[1]));

drop policy if exists "admins read checkout photos" on storage.objects;
create policy "admins read checkout photos" on storage.objects for select to authenticated
  using (bucket_id = 'checkout' and public.is_admin());

drop policy if exists "admins delete checkout photos" on storage.objects;
create policy "admins delete checkout photos" on storage.objects for delete to authenticated
  using (bucket_id = 'checkout' and public.is_admin());

drop policy if exists "admins manage site images" on storage.objects;
create policy "admins manage site images" on storage.objects for all to authenticated
  using (bucket_id = 'site' and public.is_admin()) with check (bucket_id = 'site' and public.is_admin());
