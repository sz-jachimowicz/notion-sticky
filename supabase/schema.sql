-- Notatki: schemat bazy dla synchronizacji (Supabase → SQL Editor → wklej → Run)

create table if not exists public.notes (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content     jsonb,
  text        text    not null default '',
  title       text    not null default '',
  auto_title  text    not null default '',
  empty       boolean not null default false,
  color       text    not null default 'default',
  font        text    not null default 'default',
  small       boolean not null default false,
  favorite    boolean not null default false,
  deleted     boolean not null default false,
  deleted_at  bigint,
  purged      boolean not null default false,  -- usunięta na zawsze (zostaje znacznik, żeby inne urządzenia też ją usunęły)
  created_at  bigint  not null,                -- ms od 1970
  updated_at  bigint  not null,                -- ostatnia zmiana treści (ms)
  modified    bigint  not null                 -- ostatnia jakakolwiek zmiana (ms), decyduje przy konfliktach
);

create index if not exists notes_user_modified on public.notes (user_id, modified);

-- każdy widzi i zmienia tylko swoje notatki
alter table public.notes enable row level security;

drop policy if exists "notes_select_own" on public.notes;
drop policy if exists "notes_insert_own" on public.notes;
drop policy if exists "notes_update_own" on public.notes;
drop policy if exists "notes_delete_own" on public.notes;

create policy "notes_select_own" on public.notes for select using (auth.uid() = user_id);
create policy "notes_insert_own" on public.notes for insert with check (auth.uid() = user_id);
create policy "notes_update_own" on public.notes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notes_delete_own" on public.notes for delete using (auth.uid() = user_id);

-- zmiany na żywo między urządzeniami
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table public.notes;
  end if;
end $$;
