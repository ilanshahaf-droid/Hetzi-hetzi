-- הוצאה/הכנסה במימון של הורה אחד בלבד. להריץ פעם אחת ב-SQL Editor של פרויקט Down-to-the-bone.
-- split ריק = חצי־חצי; 'a' = על חשבון אילן; 'b' = על חשבון קרן
alter table public.hetzi_entries   add column if not exists split text check (split in ('a','b'));
alter table public.hetzi_recurring add column if not exists split text check (split in ('a','b'));
notify pgrst, 'reload schema';
