-- חצי חצי: טבלאות עם קידומת hetzi_ כדי לא להתנגש בטבלאות של אפליקציות אחרות באותו פרויקט.
-- להריץ פעם אחת ב-Supabase → SQL Editor.

create table if not exists public.hetzi_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type        text not null check (type in ('expense','income','transfer')),
  payer       text not null check (payer in ('a','b')),        -- a = אילן, b = קרן
  amount      numeric(12,2) not null check (amount > 0),
  date        date not null,
  description text not null default '',
  category    text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists hetzi_entries_user_date on public.hetzi_entries (user_id, date desc);

create table if not exists public.hetzi_settings (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  categories jsonb not null default '[]'::jsonb,
  name_a     text not null default 'אילן',
  name_b     text not null default 'קרן',
  updated_at timestamptz not null default now()
);

alter table public.hetzi_entries  enable row level security;
alter table public.hetzi_settings enable row level security;

drop policy if exists "hetzi_entries own rows" on public.hetzi_entries;
create policy "hetzi_entries own rows" on public.hetzi_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "hetzi_settings own row" on public.hetzi_settings;
create policy "hetzi_settings own row" on public.hetzi_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
