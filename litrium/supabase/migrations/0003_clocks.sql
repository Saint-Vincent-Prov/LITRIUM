-- Litrium: world clocks (cities whose local time a person follows).

create table public.clocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  admin text,
  country text not null default '',
  timezone text not null check (timezone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+)*$'),
  created_at timestamptz not null default now()
);
create index clocks_user on public.clocks (user_id, created_at);

alter table public.clocks enable row level security;
create policy "own rows" on public.clocks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.clocks to authenticated;
revoke all on public.clocks from anon;
