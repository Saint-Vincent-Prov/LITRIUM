-- Litrium: home dashboard layout, school grades and subject coefficients.

-- Home dashboard: which widgets, in which order and size.
alter table public.profiles add column if not exists dashboard jsonb
  check (dashboard is null or (jsonb_typeof(dashboard) = 'array' and jsonb_array_length(dashboard) <= 30));
grant update (dashboard) on public.profiles to authenticated;

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  coef numeric not null default 1 check (coef >= 0 and coef <= 100),
  unique (user_id, name)
);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject text not null check (length(subject) between 1 and 120),
  period text not null default '' check (length(period) <= 80),
  title text not null default '' check (length(title) <= 300),
  value numeric not null check (value >= 0),
  out_of numeric not null default 20 check (out_of > 0 and out_of <= 1000 and value <= out_of),
  coef numeric not null default 1 check (coef >= 0 and coef <= 100),
  date date not null default current_date,
  virtual boolean not null default false,
  excluded boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'ecoledirecte')),
  external_id text check (length(external_id) <= 80),
  class_average numeric,
  created_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);
create index grades_user on public.grades (user_id, date);

alter table public.subjects enable row level security;
alter table public.grades enable row level security;
create policy "own rows" on public.subjects for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.grades for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.subjects, public.grades to authenticated;
revoke all on public.subjects, public.grades from anon;
