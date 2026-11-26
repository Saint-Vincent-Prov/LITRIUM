-- Litrium: explicit table privileges.
-- Newer Supabase projects no longer grant access to new tables automatically,
-- which made every read fail with "permission denied" (42501).
-- Row Level Security (0001) still decides which ROWS each person sees;
-- these grants only open the tables to signed-in users.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on public.events, public.alarms, public.notes, public.reminders, public.cities to authenticated;

grant select on public.profiles to authenticated;
grant update (name, unit, notifications) on public.profiles to authenticated;

grant select, delete on public.friendships to authenticated;

grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

grant select on public.ai_usage to authenticated;

-- signed-out visitors get nothing
revoke all on public.events, public.alarms, public.notes, public.reminders, public.cities,
  public.profiles, public.friendships, public.messages, public.ai_usage from anon;
