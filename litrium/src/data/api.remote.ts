/**
 * Online data layer: Supabase (Postgres + Auth + Realtime).
 * Same functions and shapes as api.local.ts; every screen works with either.
 * Security is enforced in the database (Row Level Security, see
 * supabase/migrations), not here.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ApiError } from "./errors";
import { ONLINE, sb } from "./supabase";
import type { Alarm, AuthProvider, CalEvent, City, DashboardLayout, EventColor, Friend, Grade, GradeImport, Message, Note, Reminder, Subject, TempUnit, User, WorldClock } from "./types";

export { ApiError };
export const MODE = "remote" as "local" | "remote";

export type Conversation = Friend & { last?: Message; unread: number };
export type AddFriendOutcome = "added" | "accepted" | "requested" | "invited";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const iso = (v: string | null | undefined) => (v ? new Date(v).toISOString() : undefined);

/* ---------- errors ---------- */

type PgError = { message?: string; code?: string; status?: number; name?: string };

function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const err = (e ?? {}) as PgError;
  const msg = err.message ?? "";
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg)) return new ApiError("network", "Pas de connexion au serveur. Vérifiez votre connexion internet.");
  if (err.code === "PGRST301" || /JWT|not_authenticated/i.test(msg)) return new ApiError("unauthenticated", "Votre session a expiré. Reconnectez-vous.");
  if (err.code === "42501") return new ApiError("forbidden", "Action non autorisée.");
  if (err.code === "23514") return new ApiError("validation", "Certaines valeurs ne sont pas valides.");
  return new ApiError(err.code ?? "unknown", "Une erreur est survenue. Réessayez dans un instant.");
}

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw toApiError(e);
  }
}

function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  if (res.data === null) throw new ApiError("not_found", "Élément introuvable.");
  return res.data;
}

/** For writes that return no rows. */
function ok(res: { error: unknown }) {
  if (res.error) throw res.error;
}

async function me(): Promise<string> {
  const { data } = await sb().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new ApiError("unauthenticated", "Votre session a expiré. Reconnectez-vous.");
  return id;
}

/* ---------- live updates ---------- */

const listeners = new Set<() => void>();
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((f) => f());
}

let channel: RealtimeChannel | null = null;
let refreshTimer: number | undefined;

function startLive(userId: string) {
  stopLive();
  channel = sb()
    .channel(`live-${userId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `recipient=eq.${userId}` }, () => emit())
    .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => emit())
    .subscribe();
  // keep the alarm / reminder cache fresh for the ringer
  refreshAlarmCache();
  refreshTimer = window.setInterval(refreshAlarmCache, 60_000);
}
function stopLive() {
  if (channel) sb().removeChannel(channel);
  channel = null;
  window.clearInterval(refreshTimer);
  alarmsCache = [];
  remindersCache = [];
}

if (typeof window !== "undefined" && ONLINE) {
  sb().auth.onAuthStateChange((event, session) => {
    if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) startLive(session.user.id);
    if (event === "SIGNED_OUT") stopLive();
    if (event === "SIGNED_IN" || event === "SIGNED_OUT") emit();
  });
}

/* ---------- accounts & session ---------- */

export const getSession = () =>
  run(async () => {
    const { data } = await sb().auth.getSession();
    const u = data.session?.user;
    return { signedIn: !!u, userId: u?.id ?? null, provider: ((u?.app_metadata.provider as AuthProvider) ?? null) as AuthProvider | null };
  });

export const hasAnyAccount = async () => false;

export const signUp = (input: { name: string; email: string; password: string }) =>
  run(async () => {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (!name) throw new ApiError("validation_name", "Indiquez votre nom.");
    if (!EMAIL_RE.test(email)) throw new ApiError("validation_email", "Cette adresse e-mail n'est pas valide.");
    if (input.password.length < 8) throw new ApiError("validation_password", "Le mot de passe doit faire au moins 8 caractères.");
    const { data, error } = await sb().auth.signUp({
      email,
      password: input.password,
      options: { data: { full_name: name }, emailRedirectTo: `${location.origin}/` },
    });
    if (error) {
      if (/already registered|already exists/i.test(error.message)) throw new ApiError("exists", "Un compte existe déjà avec cette adresse. Connectez-vous.");
      if (/password/i.test(error.message)) throw new ApiError("validation_password", "Mot de passe trop faible : au moins 8 caractères, avec des lettres et des chiffres.");
      if (/rate limit/i.test(error.message)) throw new ApiError("rate_limited", "Trop de tentatives. Réessayez dans quelques minutes.");
      if (/invalid/i.test(error.message) && /email/i.test(error.message)) throw new ApiError("validation_email", "Cette adresse e-mail n'est pas valide.");
      throw error;
    }
    // Supabase hides existing accounts behind an empty identity list
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      throw new ApiError("exists", "Un compte existe déjà avec cette adresse. Connectez-vous.");
    }
    return { created: true, needsConfirmation: !data.session };
  });

export const signIn = (emailRaw: string, password: string) =>
  run(async () => {
    const email = emailRaw.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new ApiError("validation_email", "Cette adresse e-mail n'est pas valide.");
    const { error } = await sb().auth.signInWithPassword({ email, password });
    if (error) {
      if (/not confirmed/i.test(error.message)) throw new ApiError("email_not_confirmed", "Confirmez d'abord votre adresse : cliquez sur le lien reçu par e-mail.");
      if (/invalid login/i.test(error.message)) throw new ApiError("invalid_credentials", "E-mail ou mot de passe incorrect.");
      if (/rate limit/i.test(error.message)) throw new ApiError("rate_limited", "Trop de tentatives. Réessayez dans quelques minutes.");
      throw error;
    }
    return { signedIn: true };
  });

/** Not used online: Google goes through startOAuth (redirect). */
export const signInWithProvider = async (_input: { provider: Exclude<AuthProvider, "email">; sub: string; email: string; name: string }): Promise<{ created: boolean }> => {
  throw new ApiError("not_supported", "Utilisez le bouton « Continuer avec Google ».");
};

export const startOAuth = (provider: "google") =>
  run(async () => {
    const { error } = await sb().auth.signInWithOAuth({ provider, options: { redirectTo: `${location.origin}/` } });
    if (error) throw new ApiError("oauth", "La connexion Google n'est pas disponible pour le moment.");
  });

export const requestPasswordReset = (emailRaw: string) =>
  run(async () => {
    const email = emailRaw.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new ApiError("validation_email", "Cette adresse e-mail n'est pas valide.");
    const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/nouveau-mot-de-passe` });
    if (error && /rate limit/i.test(error.message)) throw new ApiError("rate_limited", "Trop de demandes. Réessayez dans quelques minutes.");
    if (error) throw error;
    return true;
  });

export const updatePassword = (password: string) =>
  run(async () => {
    if (password.length < 8) throw new ApiError("validation_password", "Le mot de passe doit faire au moins 8 caractères.");
    const { error } = await sb().auth.updateUser({ password });
    if (error) {
      if (/different from the old/i.test(error.message)) throw new ApiError("validation_password", "Choisissez un mot de passe différent de l'ancien.");
      if (/password/i.test(error.message)) throw new ApiError("validation_password", "Mot de passe trop faible.");
      throw error;
    }
    return true;
  });

export const signOut = () =>
  run(async () => {
    await sb().auth.signOut();
    return { signedIn: false };
  });

export const getAccount = () =>
  run(async () => {
    const { data } = await sb().auth.getUser();
    if (!data.user) throw new ApiError("unauthenticated", "Votre session a expiré. Reconnectez-vous.");
    return { provider: ((data.user.app_metadata.provider as AuthProvider) ?? "email") as AuthProvider, createdAt: data.user.created_at };
  });

export const deleteAccount = () =>
  run(async () => {
    ok(await sb().rpc("delete_my_account"));
    await sb().auth.signOut({ scope: "local" });
    return true;
  });

export const getAccessToken = async (): Promise<string | null> => (await sb().auth.getSession()).data.session?.access_token ?? null;

/* ---------- user ---------- */

type ProfileRow = { id: string; name: string; email: string; unit: TempUnit; notifications: boolean; dashboard: DashboardLayout | null };

export const getUser = () =>
  run(async () => {
    const id = await me();
    let res = await sb().from("profiles").select("id,name,email,unit,notifications,dashboard").eq("id", id).single<ProfileRow>();
    // database not updated yet (migration 0004): work without the saved layout
    if (res.error && /dashboard/.test(res.error.message)) res = await sb().from("profiles").select("id,name,email,unit,notifications").eq("id", id).single<ProfileRow>();
    const p = check(res);
    return { id: p.id, name: p.name, email: p.email, unit: p.unit, notifications: p.notifications, dashboard: p.dashboard ?? undefined } as User;
  });

export const updateUser = (patch: Partial<Omit<User, "id">>) =>
  run(async () => {
    const id = await me();
    if (patch.name !== undefined && !patch.name.trim()) throw new ApiError("validation", "Le nom est obligatoire.");
    const row: Partial<ProfileRow> = {};
    if (patch.name !== undefined) row.name = patch.name.trim();
    if (patch.unit !== undefined) row.unit = patch.unit;
    if (patch.notifications !== undefined) row.notifications = patch.notifications;
    if (patch.dashboard !== undefined) row.dashboard = patch.dashboard;
    if (Object.keys(row).length) ok(await sb().from("profiles").update(row).eq("id", id));
    return getUser();
  });

/* ---------- events ---------- */

type EventRow = { id: string; title: string; start_at: string; end_at: string; all_day: boolean; color: EventColor; location: string | null; note: string | null };
const toEvent = (r: EventRow): CalEvent => ({
  id: r.id,
  title: r.title,
  start: iso(r.start_at)!,
  end: iso(r.end_at)!,
  allDay: r.all_day,
  color: r.color,
  location: r.location ?? undefined,
  note: r.note ?? undefined,
});

export const listEvents = (from?: string, to?: string) =>
  run(async () => {
    await me();
    let q = sb().from("events").select("*").order("start_at");
    if (from) q = q.gte("end_at", from);
    if (to) q = q.lte("start_at", to);
    return check(await q.returns<EventRow[]>()).map(toEvent);
  });

export const saveEvent = (input: Omit<CalEvent, "id"> & { id?: string }) =>
  run(async () => {
    await me();
    if (!input.title.trim()) throw new ApiError("validation", "Donnez un titre à l'événement.");
    if (input.end < input.start) throw new ApiError("validation", "La fin doit être après le début.");
    const row = { title: input.title.trim(), start_at: input.start, end_at: input.end, all_day: input.allDay, color: input.color, location: input.location ?? null, note: input.note ?? null };
    const res = input.id
      ? await sb().from("events").update(row).eq("id", input.id).select().single<EventRow>()
      : await sb().from("events").insert(row).select().single<EventRow>();
    return toEvent(check(res));
  });

export const deleteEvent = (id: string) =>
  run(async () => {
    ok(await sb().from("events").delete().eq("id", id));
    return true;
  });

/* ---------- alarms (+ cache for the ringer) ---------- */

type AlarmRow = { id: string; time: string; days: number[]; label: string; enabled: boolean; snoozed_until: string | null; last_rang: string | null };
const toAlarm = (r: AlarmRow): Alarm => ({ id: r.id, time: r.time, days: r.days ?? [], label: r.label, enabled: r.enabled, snoozedUntil: iso(r.snoozed_until), lastRang: r.last_rang ?? undefined });

let alarmsCache: Alarm[] = [];
let remindersCache: Reminder[] = [];

async function refreshAlarmCache() {
  try {
    alarmsCache = await listAlarms();
    remindersCache = await listReminders();
  } catch {
    /* offline: keep the last known lists */
  }
}

export const listAlarms = () =>
  run(async () => {
    await me();
    const list = check(await sb().from("alarms").select("*").order("time").returns<AlarmRow[]>()).map(toAlarm);
    alarmsCache = list;
    return list;
  });

export const saveAlarm = (input: Omit<Alarm, "id"> & { id?: string }) =>
  run(async () => {
    await me();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new ApiError("validation", "Heure invalide.");
    const row = { time: input.time, days: input.days, label: input.label.trim() || "Alarme", enabled: input.enabled, snoozed_until: null, last_rang: null };
    const res = input.id
      ? await sb().from("alarms").update(row).eq("id", input.id).select().single<AlarmRow>()
      : await sb().from("alarms").insert(row).select().single<AlarmRow>();
    const a = toAlarm(check(res));
    alarmsCache = [...alarmsCache.filter((x) => x.id !== a.id), a];
    return a;
  });

export const setAlarmEnabled = (id: string, enabled: boolean) =>
  run(async () => {
    const a = toAlarm(check(await sb().from("alarms").update({ enabled, snoozed_until: null }).eq("id", id).select().single<AlarmRow>()));
    alarmsCache = alarmsCache.map((x) => (x.id === id ? a : x));
    return a;
  });

export const deleteAlarm = (id: string) =>
  run(async () => {
    ok(await sb().from("alarms").delete().eq("id", id));
    alarmsCache = alarmsCache.filter((x) => x.id !== id);
    return true;
  });

export function markAlarmRang(id: string, minuteKey: string, opts: { snoozeMinutes?: number; stop?: boolean } = {}) {
  const a = alarmsCache.find((x) => x.id === id);
  if (!a) return;
  a.lastRang = minuteKey;
  a.snoozedUntil = opts.snoozeMinutes ? new Date(Date.now() + opts.snoozeMinutes * 60_000).toISOString() : undefined;
  if (opts.stop && a.days.length === 0) a.enabled = false;
  sb()
    .from("alarms")
    .update({ last_rang: a.lastRang, snoozed_until: a.snoozedUntil ?? null, enabled: a.enabled })
    .eq("id", id)
    .then(() => emit());
}

export function peekAlarms() {
  return alarmsCache;
}

/* ---------- notes ---------- */

type NoteRow = { id: string; title: string; body: string; pinned: boolean; updated_at: string };
const toNote = (r: NoteRow): Note => ({ id: r.id, title: r.title, body: r.body, pinned: r.pinned, updatedAt: iso(r.updated_at)! });

export const listNotes = () =>
  run(async () => {
    await me();
    return check(await sb().from("notes").select("*").order("pinned", { ascending: false }).order("updated_at", { ascending: false }).returns<NoteRow[]>()).map(toNote);
  });

export const saveNote = (input: { id?: string; title: string; body: string; pinned?: boolean }) =>
  run(async () => {
    await me();
    if (!input.title.trim() && !input.body.trim()) throw new ApiError("validation", "La note est vide.");
    const row: Partial<NoteRow> = { title: input.title, body: input.body, updated_at: new Date().toISOString() };
    if (input.pinned !== undefined) row.pinned = input.pinned;
    const res = input.id
      ? await sb().from("notes").update(row).eq("id", input.id).select().single<NoteRow>()
      : await sb().from("notes").insert(row).select().single<NoteRow>();
    return toNote(check(res));
  });

export const deleteNote = (id: string) =>
  run(async () => {
    ok(await sb().from("notes").delete().eq("id", id));
    return true;
  });

/* ---------- reminders ---------- */

type ReminderRow = { id: string; text: string; due: string | null; done: boolean; notified: boolean };
const toReminder = (r: ReminderRow): Reminder => ({ id: r.id, text: r.text, due: iso(r.due), done: r.done, notified: r.notified });

export const listReminders = () =>
  run(async () => {
    await me();
    const list = check(await sb().from("reminders").select("*").order("done").order("due", { nullsFirst: false }).returns<ReminderRow[]>()).map(toReminder);
    remindersCache = list;
    return list;
  });

export const addReminder = (text: string, due?: string) =>
  run(async () => {
    await me();
    if (!text.trim()) throw new ApiError("validation", "Écrivez le rappel.");
    const r = toReminder(check(await sb().from("reminders").insert({ text: text.trim(), due: due ?? null }).select().single<ReminderRow>()));
    remindersCache = [...remindersCache, r];
    return r;
  });

export const setReminderDone = (id: string, done: boolean) =>
  run(async () => {
    const r = toReminder(check(await sb().from("reminders").update({ done }).eq("id", id).select().single<ReminderRow>()));
    remindersCache = remindersCache.map((x) => (x.id === id ? r : x));
    return r;
  });

export const deleteReminder = (id: string) =>
  run(async () => {
    ok(await sb().from("reminders").delete().eq("id", id));
    remindersCache = remindersCache.filter((x) => x.id !== id);
    return true;
  });

export function peekReminders() {
  return remindersCache;
}
export function markReminderNotified(id: string) {
  const r = remindersCache.find((x) => x.id === id);
  if (r) r.notified = true;
  sb()
    .from("reminders")
    .update({ notified: true })
    .eq("id", id)
    .then(() => emit());
}

/* ---------- friends & messages ---------- */

type FriendshipRow = { id: string; requester: string; addressee: string | null; invite_email: string | null; status: "pending" | "accepted"; created_at: string; accepted_at: string | null };
type MessageRow = { id: string; sender: string; recipient: string; body: string; created_at: string; read_at: string | null };

async function loadConversations(myId: string): Promise<Conversation[]> {
  const rows = check(await sb().from("friendships").select("*").returns<FriendshipRow[]>());
  const otherIds = rows.map((f) => (f.requester === myId ? f.addressee : f.requester)).filter((x): x is string => !!x);
  const profiles = otherIds.length
    ? check(await sb().from("profiles").select("id,name,email").in("id", otherIds).returns<{ id: string; name: string; email: string }[]>())
    : [];
  const msgs = check(
    await sb().from("messages").select("*").or(`sender.eq.${myId},recipient.eq.${myId}`).order("created_at", { ascending: false }).limit(1000).returns<MessageRow[]>(),
  );
  return rows
    .map((f): Conversation => {
      const other = f.requester === myId ? f.addressee : f.requester;
      const p = profiles.find((x) => x.id === other);
      const status = f.status === "accepted" ? "friend" : f.requester === myId ? "pending_out" : "pending_in";
      const id = other ?? `inv_${f.id}`;
      const email = p?.email ?? f.invite_email ?? "";
      const mine = other ? msgs.filter((m) => m.sender === other || m.recipient === other) : [];
      const lastRow = mine[0];
      return {
        id,
        name: p?.name || email.split("@")[0] || "Invité",
        email,
        status,
        since: iso(f.accepted_at ?? f.created_at)!,
        last: lastRow ? toMessage(lastRow, myId, id) : undefined,
        unread: mine.filter((m) => m.recipient === myId && !m.read_at).length,
      };
    })
    .sort((a, b) => (b.last?.at ?? b.since).localeCompare(a.last?.at ?? a.since));
}

const toMessage = (m: MessageRow, myId: string, friendId: string): Message => ({
  id: m.id,
  friendId,
  from: m.sender === myId ? "me" : "them",
  text: m.body,
  at: iso(m.created_at)!,
  read: m.sender === myId || !!m.read_at,
});

export const listFriends = () => run(async () => loadConversations(await me()));

export const addFriendByEmail = (emailRaw: string) =>
  run(async () => {
    await me();
    const email = emailRaw.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new ApiError("validation", "Cette adresse e-mail n'est pas valide.");
    const { data, error } = await sb().rpc("add_friend_by_email", { p_email: email });
    if (error) {
      const m = error.message;
      if (/self/.test(m)) throw new ApiError("validation", "C'est votre propre adresse 🙂");
      if (/already_friends/.test(m)) throw new ApiError("exists", "Cette personne fait déjà partie de vos amis.");
      if (/already_requested/.test(m)) throw new ApiError("exists", "Demande déjà envoyée : elle doit l'accepter.");
      if (/already_invited/.test(m)) throw new ApiError("exists", "Invitation déjà envoyée à cette adresse.");
      if (/invalid_email/.test(m)) throw new ApiError("validation", "Cette adresse e-mail n'est pas valide.");
      throw error;
    }
    const r = data as { outcome: AddFriendOutcome; id: string; name?: string; email?: string };
    return { id: r.id, name: r.name ?? email.split("@")[0], email: r.email ?? email, outcome: r.outcome };
  });

export const respondToRequest = (id: string, accept: boolean) =>
  run(async () => {
    ok(await sb().rpc("respond_to_friend", { p_other: id, p_accept: accept }));
    return true;
  });

export const removeFriend = (id: string) =>
  run(async () => {
    const myId = await me();
    if (id.startsWith("inv_")) ok(await sb().from("friendships").delete().eq("id", id.slice(4)));
    else ok(await sb().from("friendships").delete().or(`and(requester.eq.${myId},addressee.eq.${id}),and(requester.eq.${id},addressee.eq.${myId})`));
    return true;
  });

export const getThread = (friendId: string) =>
  run(async () => {
    const myId = await me();
    const friend = (await loadConversations(myId)).find((c) => c.id === friendId);
    if (!friend) throw new ApiError("not_found", "Cette conversation n'existe pas.");
    if (friendId.startsWith("inv_")) return { friend, messages: [] as Message[] };
    const rows = check(
      await sb()
        .from("messages")
        .select("*")
        .or(`and(sender.eq.${myId},recipient.eq.${friendId}),and(sender.eq.${friendId},recipient.eq.${myId})`)
        .order("created_at")
        .limit(500)
        .returns<MessageRow[]>(),
    );
    if (rows.some((m) => m.recipient === myId && !m.read_at)) {
      await sb().from("messages").update({ read_at: new Date().toISOString() }).eq("recipient", myId).eq("sender", friendId).is("read_at", null);
    }
    return { friend, messages: rows.map((m) => toMessage({ ...m, read_at: m.read_at ?? "now" }, myId, friendId)) };
  });

export const sendMessage = (friendId: string, text: string) =>
  run(async () => {
    const myId = await me();
    if (!text.trim()) throw new ApiError("validation", "Le message est vide.");
    if (text.length > 2000) throw new ApiError("validation", "Message trop long (2000 caractères max).");
    if (friendId.startsWith("inv_")) throw new ApiError("forbidden", "Vous pourrez écrire à cette personne quand elle aura créé son compte et accepté.");
    const { data, error } = await sb().from("messages").insert({ recipient: friendId, body: text.trim() }).select().single<MessageRow>();
    if (error) {
      if (error.code === "42501") throw new ApiError("forbidden", "Vous pourrez écrire à cette personne quand elle aura accepté votre demande.");
      throw error;
    }
    return toMessage(data, myId, friendId);
  });

export const unreadTotal = () =>
  run(async () => {
    const myId = await me();
    const { count, error } = await sb().from("messages").select("id", { count: "exact", head: true }).eq("recipient", myId).is("read_at", null);
    if (error) throw error;
    return count ?? 0;
  });

/* ---------- cities ---------- */

type CityRow = { id: string; name: string; admin: string | null; country: string; lat: number; lon: number };
const toCity = (r: CityRow): City => ({ id: r.id, name: r.name, admin: r.admin ?? undefined, country: r.country, lat: r.lat, lon: r.lon });

export const listCities = () =>
  run(async () => {
    await me();
    return check(await sb().from("cities").select("*").order("created_at").returns<CityRow[]>()).map(toCity);
  });

export const addCity = (c: Omit<City, "id">) =>
  run(async () => {
    const existing = await listCities();
    if (existing.some((x) => Math.abs(x.lat - c.lat) < 0.01 && Math.abs(x.lon - c.lon) < 0.01)) throw new ApiError("exists", `${c.name} est déjà dans votre liste.`);
    return toCity(check(await sb().from("cities").insert({ name: c.name, admin: c.admin ?? null, country: c.country, lat: c.lat, lon: c.lon }).select().single<CityRow>()));
  });

export const removeCity = (id: string) =>
  run(async () => {
    ok(await sb().from("cities").delete().eq("id", id));
    return true;
  });

/* ---------- world clocks ---------- */

type ClockRow = { id: string; name: string; admin: string | null; country: string; timezone: string };
const toClock = (r: ClockRow): WorldClock => ({ id: r.id, name: r.name, admin: r.admin ?? undefined, country: r.country, timezone: r.timezone });

export const listClocks = () =>
  run(async () => {
    await me();
    return check(await sb().from("clocks").select("*").order("created_at").returns<ClockRow[]>()).map(toClock);
  });

export const addClock = (c: Omit<WorldClock, "id">) =>
  run(async () => {
    const existing = await listClocks();
    if (existing.some((x) => x.timezone === c.timezone && x.name === c.name)) throw new ApiError("exists", `${c.name} est déjà dans vos horloges.`);
    return toClock(check(await sb().from("clocks").insert({ name: c.name, admin: c.admin ?? null, country: c.country, timezone: c.timezone }).select().single<ClockRow>()));
  });

export const removeClock = (id: string) =>
  run(async () => {
    ok(await sb().from("clocks").delete().eq("id", id));
    return true;
  });

/* ---------- school grades ---------- */

type GradeRow = {
  id: string;
  subject: string;
  period: string;
  title: string;
  value: number;
  out_of: number;
  coef: number;
  date: string;
  virtual: boolean;
  excluded: boolean;
  source: "manual" | "ecoledirecte";
  external_id: string | null;
  class_average: number | null;
};
const toGrade = (r: GradeRow): Grade => ({
  id: r.id,
  subject: r.subject,
  period: r.period,
  title: r.title,
  value: Number(r.value),
  outOf: Number(r.out_of),
  coef: Number(r.coef),
  date: r.date,
  virtual: r.virtual,
  excluded: r.excluded || undefined,
  source: r.source,
  externalId: r.external_id ?? undefined,
  classAverage: r.class_average == null ? undefined : Number(r.class_average),
});
const gradeRow = (g: Partial<Omit<Grade, "id">>) => {
  const r: Record<string, unknown> = {};
  if (g.subject !== undefined) r.subject = g.subject;
  if (g.period !== undefined) r.period = g.period;
  if (g.title !== undefined) r.title = g.title;
  if (g.value !== undefined) r.value = g.value;
  if (g.outOf !== undefined) r.out_of = g.outOf;
  if (g.coef !== undefined) r.coef = g.coef;
  if (g.date !== undefined) r.date = g.date;
  if (g.virtual !== undefined) r.virtual = g.virtual;
  if ("excluded" in g) r.excluded = !!g.excluded;
  if (g.source !== undefined) r.source = g.source;
  if ("externalId" in g) r.external_id = g.externalId ?? null;
  if ("classAverage" in g) r.class_average = g.classAverage ?? null;
  return r;
};

export const listGrades = () =>
  run(async () => {
    await me();
    return check(await sb().from("grades").select("*").order("date").returns<GradeRow[]>()).map(toGrade);
  });

export const listSubjects = () =>
  run(async () => {
    await me();
    return check(await sb().from("subjects").select("id,name,coef").order("name").returns<Subject[]>()).map((s) => ({ ...s, coef: Number(s.coef) }));
  });

export const addGrade = (g: Omit<Grade, "id">) =>
  run(async () => {
    await me();
    return toGrade(check(await sb().from("grades").insert(gradeRow(g)).select().single<GradeRow>()));
  });

export const updateGrade = (id: string, patch: Partial<Omit<Grade, "id">>) =>
  run(async () => toGrade(check(await sb().from("grades").update(gradeRow(patch)).eq("id", id).select().single<GradeRow>())));

export const removeGrade = (id: string) =>
  run(async () => {
    ok(await sb().from("grades").delete().eq("id", id));
    return true;
  });

export const clearGrades = (which: "virtual" | "ecoledirecte" | "all") =>
  run(async () => {
    const id = await me();
    let q = sb().from("grades").delete().eq("user_id", id);
    if (which === "virtual") q = q.eq("virtual", true);
    if (which === "ecoledirecte") q = q.eq("source", "ecoledirecte");
    ok(await q);
    return true;
  });

export const setSubjectCoef = (name: string, coef: number) =>
  run(async () => {
    const id = await me();
    ok(await sb().from("subjects").upsert({ user_id: id, name, coef }, { onConflict: "user_id,name" }));
    return true;
  });

export const importGrades = (data: GradeImport) =>
  run(async () => {
    const id = await me();
    const existing = check(
      await sb().from("grades").select("external_id").eq("source", "ecoledirecte").returns<{ external_id: string | null }[]>(),
    );
    const known = new Set(existing.map((r) => r.external_id));
    const rows = data.grades.map((g) => ({ ...gradeRow({ ...g, virtual: false, source: "ecoledirecte" }), user_id: id }));
    for (let i = 0; i < rows.length; i += 500) {
      ok(await sb().from("grades").upsert(rows.slice(i, i + 500), { onConflict: "user_id,source,external_id" }));
    }
    if (data.subjects.length) {
      ok(await sb().from("subjects").upsert(data.subjects.map((s) => ({ user_id: id, name: s.name, coef: s.coef })), { onConflict: "user_id,name" }));
    }
    const added = data.grades.filter((g) => !known.has(g.externalId ?? null)).length;
    return { added, updated: data.grades.length - added };
  });

/** Online: erase this account's personal data (agenda, alarms, notes, reminders, cities). */
export const resetDemo = () =>
  run(async () => {
    const id = await me();
    for (const t of ["events", "alarms", "notes", "reminders", "cities", "clocks", "grades", "subjects"]) ok(await sb().from(t).delete().eq("user_id", id));
    ok(await sb().from("cities").insert({ name: "Paris", admin: "Île-de-France", country: "France", lat: 48.8534, lon: 2.3488 }));
    alarmsCache = [];
    remindersCache = [];
    return true;
  });
