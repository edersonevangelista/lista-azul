-- Lista Azul: estrutura inicial compartilhada com políticas RLS.
-- Execute no SQL Editor do seu projeto Supabase.
-- O ID da família/lista será gerado por este SQL. Copie o UUID retornado.
create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Lista da família',
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id)
);

create table if not exists public.shared_lists (
  household_id uuid primary key references public.households(id) on delete cascade,
  state jsonb not null default '{"catalog":[],"toBuy":[],"inCart":[]}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.shared_lists enable row level security;

drop policy if exists "Members can view their household" on public.households;
create policy "Members can view their household" on public.households
for select to authenticated
using (exists (select 1 from public.household_members m where m.household_id = id and m.user_id = auth.uid()));

drop policy if exists "Users can view own membership" on public.household_members;
create policy "Users can view own membership" on public.household_members
for select to authenticated using (user_id = auth.uid());

drop policy if exists "Members can read shared list" on public.shared_lists;
create policy "Members can read shared list" on public.shared_lists
for select to authenticated
using (exists (select 1 from public.household_members m where m.household_id = shared_lists.household_id and m.user_id = auth.uid()));

drop policy if exists "Members can create shared list" on public.shared_lists;
create policy "Members can create shared list" on public.shared_lists
for insert to authenticated
with check (exists (select 1 from public.household_members m where m.household_id = shared_lists.household_id and m.user_id = auth.uid()));

drop policy if exists "Members can update shared list" on public.shared_lists;
create policy "Members can update shared list" on public.shared_lists
for update to authenticated
using (exists (select 1 from public.household_members m where m.household_id = shared_lists.household_id and m.user_id = auth.uid()))
with check (exists (select 1 from public.household_members m where m.household_id = shared_lists.household_id and m.user_id = auth.uid()));

-- Crie a família/lista e copie o UUID retornado.
insert into public.households (name) values ('Lista da família') returning id;

-- Depois que ambos criarem contas em Authentication > Users, adicione os dois membros.
-- Substitua HOUSEHOLD_UUID, USER_UUID_EDERSON e USER_UUID_NARA pelos UUIDs reais:
-- insert into public.household_members (household_id, user_id) values
-- ('HOUSEHOLD_UUID', 'USER_UUID_EDERSON'),
-- ('HOUSEHOLD_UUID', 'USER_UUID_NARA');

-- Habilite Realtime para public.shared_lists em Database > Replication
-- (ou adicione a tabela à publicação supabase_realtime, se necessário).
