-- קבלות מצורפות להוצאות. להריץ פעם אחת ב-SQL Editor של פרויקט Down-to-the-bone.

alter table public.hetzi_entries add column if not exists receipts jsonb not null default '[]'::jsonb;

-- תיקייה פרטית לקבלות (עד 10MB לקובץ, תמונות ו-PDF בלבד)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hetzi-receipts', 'hetzi-receipts', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do nothing;

-- כל משתמש ניגש רק לתיקייה שלו (<user id>/...)
drop policy if exists "hetzi receipts read own"   on storage.objects;
drop policy if exists "hetzi receipts add own"    on storage.objects;
drop policy if exists "hetzi receipts change own" on storage.objects;
drop policy if exists "hetzi receipts delete own" on storage.objects;

create policy "hetzi receipts read own" on storage.objects for select to authenticated
  using (bucket_id = 'hetzi-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "hetzi receipts add own" on storage.objects for insert to authenticated
  with check (bucket_id = 'hetzi-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "hetzi receipts change own" on storage.objects for update to authenticated
  using (bucket_id = 'hetzi-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "hetzi receipts delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'hetzi-receipts' and (storage.foldername(name))[1] = auth.uid()::text);
