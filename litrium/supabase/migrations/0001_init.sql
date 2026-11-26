-- Litrium: initial schema.
-- Every table is protected by Row Level Security: a person only ever reads
-- and writes their own rows, plus the shared rows of their friendships.

-- gen_random_uuid() is built into Postgres 13+, no extension needed

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null,
  unit text not null default 'C' check (unit in ('C', 'F')),
  notifications boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email));

-- ---------------------------------------------------------------- personal data
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  color text not null default 'sky' check (color in ('mint', 'violet', 'peach', 'sky')),
  location text,
  note text,
  created_at timestamptz not null default now(),
  check (end_at >= start_at)
);
create index events_user_start on public.events (user_id, start_at);

create table public.alarms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  time text not null check (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  days smallint[] not null default '{}',
  label text not null default 'Alarme',
  enabled boolean not null default true,
  snoozed_until timestamptz,
  last_rang text,
  created_at timestamptz not null default now()
);
create index alarms_user on public.alarms (user_id);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  body text not null default '',
  pinned boolean not null default false,
  updated_at timestamptz not null default now()
);
create index notes_user on public.notes (user_id, updated_at desc);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (length(text) between 1 and 500),
  due timestamptz,
  done boolean not null default false,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);
create index reminders_user on public.reminders (user_id, done, due);

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  admin text,
  country text not null default '',
  lat double precision not null,
  lon double precision not null,
  created_at timestamptz not null default now()
);
create index cities_user on public.cities (user_id);

-- one policy set for all personal tables
do $$
declare t text;
begin
  foreach t in array array['events', 'alarms', 'notes', 'reminders', 'cities'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- friendships
-- requester asks addressee. addressee is null for an invitation sent to an
-- e-mail that has no account yet; it is filled in when that person signs up.
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid references auth.users (id) on delete cascade,
  invite_email text,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (addressee is not null or invite_email is not null),
  check (requester <> addressee)
);
create unique index friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee)) where addressee is not null;
create unique index friendships_invite on public.friendships (requester, lower(invite_email)) where addressee is null;

alter table public.friendships enable row level security;
create policy "see my friendships" on public.friendships for select to authenticated
  using (requester = auth.uid() or addressee = auth.uid());
-- inserts go through add_friend_by_email(); acceptance through respond_to_friend()
create policy "leave a friendship" on public.friendships for delete to authenticated
  using (requester = auth.uid() or addressee = auth.uid());

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted' and ((requester = a and addressee = b) or (requester = b and addressee = a))
  );
$$;

-- profiles: myself, and anyone I have a friendship row with (pending or accepted)
alter table public.profiles enable row level security;
create policy "read my profile and my friends" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.friendships f
      where (f.requester = auth.uid() and f.addressee = profiles.id) or (f.addressee = auth.uid() and f.requester = profiles.id)
    )
  );
create policy "edit my profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- the e-mail is what friends search by: only the sign-up trigger sets it
revoke update on public.profiles from authenticated;
grant update (name, unit, notifications) on public.profiles to authenticated;

-- ---------------------------------------------------------------- messages
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipient uuid not null references auth.users (id) on delete cascade,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_pair on public.messages (least(sender, recipient), greatest(sender, recipient), created_at);
create index messages_unread on public.messages (recipient) where read_at is null;

alter table public.messages enable row level security;
create policy "read my messages" on public.messages for select to authenticated
  using (sender = auth.uid() or recipient = auth.uid());
create policy "write to friends" on public.messages for insert to authenticated
  with check (sender = auth.uid() and public.are_friends(auth.uid(), recipient));
-- the recipient may only mark as read
create policy "mark as read" on public.messages for update to authenticated
  using (recipient = auth.uid()) with check (recipient = auth.uid());
revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

-- ---------------------------------------------------------------- functions
-- new account: create the profile and attach invitations sent to that e-mail
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    lower(new.email)
  )
  on conflict (id) do nothing;

  update public.friendships
     set addressee = new.id, invite_email = null
   where addressee is null and lower(invite_email) = lower(new.email) and requester <> new.id;

  insert into public.cities (user_id, name, admin, country, lat, lon)
  values (new.id, 'Paris', 'Île-de-France', 'France', 48.8534, 2.3488);

  insert into public.notes (user_id, title, body, pinned)
  values (new.id, 'Bienvenue sur Litrium 👋',
    E'Essayez l''assistant : « rappelle-moi de boire de l''eau dans 1 heure », « réveille-moi à 7h », ou posez-lui n''importe quelle question.\nAjoutez vos amis depuis Messages avec leur adresse e-mail.',
    true);
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- add a friend by e-mail: accepts their pending request, sends a request, or invites
create or replace function public.add_friend_by_email(p_email text) returns json
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  target public.profiles%rowtype;
  f public.friendships%rowtype;
  em text := lower(trim(p_email));
begin
  if me is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email' using errcode = '22023'; end if;
  select * into target from public.profiles where lower(email) = em;
  if found and target.id = me then raise exception 'self' using errcode = '22023'; end if;

  if not found then
    select * into f from public.friendships where requester = me and addressee is null and lower(invite_email) = em;
    if found then raise exception 'already_invited' using errcode = '23505'; end if;
    insert into public.friendships (requester, invite_email) values (me, em) returning * into f;
    return json_build_object('outcome', 'invited', 'id', 'inv_' || f.id, 'email', em);
  end if;

  select * into f from public.friendships
   where (requester = me and addressee = target.id) or (requester = target.id and addressee = me);
  if found then
    if f.status = 'accepted' then raise exception 'already_friends' using errcode = '23505'; end if;
    if f.requester = me then raise exception 'already_requested' using errcode = '23505'; end if;
    update public.friendships set status = 'accepted', accepted_at = now() where id = f.id;
    return json_build_object('outcome', 'accepted', 'id', target.id, 'name', target.name);
  end if;

  insert into public.friendships (requester, addressee) values (me, target.id);
  return json_build_object('outcome', 'requested', 'id', target.id, 'name', target.name);
end;
$$;

create or replace function public.respond_to_friend(p_other uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_accept then
    update public.friendships set status = 'accepted', accepted_at = now()
     where requester = p_other and addressee = auth.uid() and status = 'pending';
  else
    delete from public.friendships where requester = p_other and addressee = auth.uid() and status = 'pending';
  end if;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end;
$$;

-- AI usage cap per person per day (the API key belongs to the site owner)
create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
create policy "see my usage" on public.ai_usage for select to authenticated using (user_id = auth.uid());

create or replace function public.bump_ai_usage(p_limit int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  insert into public.ai_usage (user_id, day, count) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
  returning count into n;
  if n > p_limit then raise exception 'ai_limit' using errcode = 'P0001'; end if;
  return n;
end;
$$;

-- right to be forgotten: removes the account and, by cascade, all its data
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.add_friend_by_email(text) from public, anon;
revoke all on function public.respond_to_friend(uuid, boolean) from public, anon;
revoke all on function public.bump_ai_usage(int) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.are_friends(uuid, uuid) from public, anon;
grant execute on function public.add_friend_by_email(text) to authenticated;
grant execute on function public.respond_to_friend(uuid, boolean) to authenticated;
grant execute on function public.bump_ai_usage(int) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- live updates for chat and friend requests (RLS still applies)
alter publication supabase_realtime add table public.messages, public.friendships;
