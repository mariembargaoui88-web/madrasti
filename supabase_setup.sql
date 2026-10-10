-- مدرستي: إعداد قاعدة البيانات الآمن في Supabase
-- الصقي هذا الملف كاملًا في SQL Editor داخل مشروع Supabase ثم اضغطي Run.

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  grade integer not null check (grade between 1 and 6),
  subject text not null,
  description text default '',
  resource_url text,
  storage_path text,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  teacher_name text default 'معلّم مدرستي',
  published boolean not null default true,
  created_at timestamptz not null default now(),
  constraint lessons_resource_required check (
    (resource_url is not null and length(resource_url) > 0)
    or (storage_path is not null and length(storage_path) > 0)
  )
);

alter table public.lessons enable row level security;

drop policy if exists "Anyone can read published lessons" on public.lessons;
create policy "Anyone can read published lessons"
on public.lessons for select
using (published = true or auth.uid() = teacher_id);

drop policy if exists "Teachers insert their own lessons" on public.lessons;
create policy "Teachers insert their own lessons"
on public.lessons for insert to authenticated
with check (auth.uid() = teacher_id);

drop policy if exists "Teachers update their own lessons" on public.lessons;
create policy "Teachers update their own lessons"
on public.lessons for update to authenticated
using (auth.uid() = teacher_id)
with check (auth.uid() = teacher_id);

drop policy if exists "Teachers delete their own lessons" on public.lessons;
create policy "Teachers delete their own lessons"
on public.lessons for delete to authenticated
using (auth.uid() = teacher_id);

-- مساحة التخزين: إنشاء bucket خاص بموارد الدروس.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-files',
  'lesson-files',
  true,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg','image/png','video/mp4','video/webm'
  ]
)
on conflict (id) do update set
  public = true,
  file_size_limit = 26214400,
  allowed_mime_types = excluded.allowed_mime_types;

alter table storage.objects enable row level security;

drop policy if exists "Public can read lesson files" on storage.objects;
create policy "Public can read lesson files"
on storage.objects for select
using (bucket_id = 'lesson-files');

drop policy if exists "Teachers upload to own folder" on storage.objects;
create policy "Teachers upload to own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'lesson-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Teachers update own files" on storage.objects;
create policy "Teachers update own files"
on storage.objects for update to authenticated
using (
  bucket_id = 'lesson-files'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'lesson-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Teachers delete own files" on storage.objects;
create policy "Teachers delete own files"
on storage.objects for delete to authenticated
using (
  bucket_id = 'lesson-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);
