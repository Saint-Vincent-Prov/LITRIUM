/**
 * Local data layer (this browser only): used when Supabase is not configured,
 * for development and automated tests. Every exported function is the
 * contract a real backend will implement; screens only talk to this file.
 */
import { ApiError } from "./errors";
import { buildSeed, buildStarter, DIRECTORY } from "./seed";
import type { Account, AuthProvider, Alarm, CalEvent, City, DB, Friend, Message, Note, Reminder, User } from "./types";

/*
 * Accounts live in this browser for now (demo). Each account has its own data
 * store. Passwords are salted and hashed (PBKDF2); a real backend replaces this.
 */
const ACCOUNTS = "litrium-accounts-v1";
const SESSION = "litrium-session-v1";
const LEGACY = "litrium-hub-v1";
const DEMO_ID = "usr_demo";
const dbKey = (id: string) => `litrium-hub-v1:${id}`;

// One-time move of data saved under the app's previous name.
(function migrateOldName() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("atrium-")) {
        const nk = "litrium-" + k.slice("atrium-".length);
        if (localStorage.getItem(nk) === null) localStorage.setItem(nk, localStorage.getItem(k)!);
      }
    }
  } catch {
    /* storage unavailable */
  }
})();

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

const getAccounts = () => readJson<Account[]>(ACCOUNTS, []);
const setAccounts = (a: Account[]) => writeJson(ACCOUNTS, a);

let current: string | null = readJson<{ userId: string } | null>(SESSION, null)?.userId ?? null;

function loadDb(id: string): DB {
  const existing = readJson<DB | null>(dbKey(id), null);
  if (existing) return existing;
  let fresh: DB;
  if (id === DEMO_ID) {
    fresh = readJson<DB | null>(LEGACY, null) ?? buildSeed();
  } else {
    const acc = getAccounts().find((a) => a.id === id);
    fresh = buildStarter({ id, name: acc?.name ?? "Moi", email: acc?.email ?? "", unit: "C", notifications: false });
  }
  writeJson(dbKey(id), fresh);
  return fresh;
}

function save(d: DB) {
  if (current) writeJson(dbKey(current), d);
}

let db: DB = current ? loadDb(current) : buildSeed();

async function hashPassword(password: string, salt?: string) {
  const saltBytes = salt ? Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: 120_000 }, key, 256);
  const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
  return { hash: b64(new Uint8Array(bits)), salt: b64(saltBytes) };
}

/** The demo account (camille@exemple.fr / demo1234) keeps the sample data. */
async function ensureDemoAccount() {
  const list = getAccounts();
  if (list.some((a) => a.id === DEMO_ID)) return;
  const { hash, salt } = await hashPassword("demo1234");
  setAccounts([...list, { id: DEMO_ID, name: "Camille Durand", email: "camille@exemple.fr", provider: "email", passHash: hash, salt, createdAt: new Date().toISOString() }]);
}

/* changes that happen without a user action (a friend replies, an alarm rang) */
const listeners = new Set<() => void>();
export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((f) => f());
}

// another tab changed the data: reload it
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === SESSION) {
      current = readJson<{ userId: string } | null>(SESSION, null)?.userId ?? null;
      if (current) db = loadDb(current);
      emit();
    } else if (current && e.key === dbKey(current)) {
      db = loadDb(current);
      emit();
    }
  });
}

export { ApiError };

function flags() {
  const p = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
  return { fail: p.has("fail"), slow: p.has("slow") };
}

async function call<T>(fn: () => T | Promise<T>, fast = false, needsAuth = true): Promise<T> {
  const f = flags();
  await new Promise((r) => setTimeout(r, f.slow ? 2500 : fast ? 0 : 120 + Math.random() * 120));
  if (f.fail) throw new ApiError("network", "Le service ne répond pas. Réessayez dans un instant.");
  if (needsAuth && !current) throw new ApiError("unauthenticated", "Votre session a expiré. Reconnectez-vous.");
  return structuredClone(await fn());
}

const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nowIso = () => new Date().toISOString();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- accounts & session ---------- */

const PROVIDER_LABEL: Record<AuthProvider, string> = { email: "e-mail", google: "Google", apple: "Apple" };

function startSession(id: string) {
  current = id;
  writeJson(SESSION, { userId: id });
  db = loadDb(id);
}

export const getSession = () =>
  call(
    () => {
      const acc = current ? getAccounts().find((a) => a.id === current) : undefined;
      if (current && !acc) current = null; // account removed in another tab
      return { signedIn: !!acc, userId: acc?.id ?? null, provider: acc?.provider ?? null };
    },
    true,
    false,
  );

export const hasAnyAccount = () => call(() => getAccounts().some((a) => a.id !== DEMO_ID), true, false);

export const signUp = (input: { name: string; email: string; password: string }) =>
  call(
    async () => {
      await ensureDemoAccount();
      const name = input.name.trim();
      const email = input.email.trim().toLowerCase();
      if (!name) throw new ApiError("validation_name", "Indiquez votre nom.");
      if (!EMAIL_RE.test(email)) throw new ApiError("validation_email", "Cette adresse e-mail n'est pas valide.");
      if (input.password.length < 8) throw new ApiError("validation_password", "Le mot de passe doit faire au moins 8 caractères.");
      const accounts = getAccounts();
      if (accounts.some((a) => a.email.toLowerCase() === email)) {
        throw new ApiError("exists", "Un compte existe déjà avec cette adresse. Connectez-vous.");
      }
      const { hash, salt } = await hashPassword(input.password);
      const acc: Account = { id: uid("usr"), name, email, provider: "email", passHash: hash, salt, createdAt: nowIso() };
      setAccounts([...accounts, acc]);
      startSession(acc.id);
      return { created: true, needsConfirmation: false };
    },
    false,
    false,
  );

export const signIn = (emailRaw: string, password: string) =>
  call(
    async () => {
      await ensureDemoAccount();
      const email = emailRaw.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) throw new ApiError("validation_email", "Cette adresse e-mail n'est pas valide.");
      const acc = getAccounts().find((a) => a.email.toLowerCase() === email);
      if (!acc) throw new ApiError("not_found", "Aucun compte avec cette adresse. Créez-en un.");
      if (!acc.passHash || !acc.salt) {
        throw new ApiError("wrong_provider", `Ce compte a été créé avec ${PROVIDER_LABEL[acc.provider]}. Utilisez le bouton « Continuer avec ${PROVIDER_LABEL[acc.provider]} ».`);
      }
      const { hash } = await hashPassword(password, acc.salt);
      if (hash !== acc.passHash) throw new ApiError("invalid_credentials", "Mot de passe incorrect.");
      startSession(acc.id);
      return { signedIn: true };
    },
    false,
    false,
  );

/** Google / Apple: the provider already verified the person; we find or create the account. */
export const signInWithProvider = (input: { provider: Exclude<AuthProvider, "email">; sub: string; email: string; name: string }) =>
  call(
    async () => {
      await ensureDemoAccount();
      const email = input.email.trim().toLowerCase();
      const accounts = getAccounts();
      let acc = accounts.find((a) => a.provider === input.provider && a.providerSub === input.sub) ?? accounts.find((a) => email && a.email.toLowerCase() === email);
      let created = false;
      if (acc) {
        if (!acc.providerSub) {
          acc.providerSub = input.sub; // link the provider to an existing e-mail account
          setAccounts(accounts);
        }
      } else {
        acc = { id: uid("usr"), name: input.name.trim() || email.split("@")[0] || "Moi", email, provider: input.provider, providerSub: input.sub, createdAt: nowIso() };
        setAccounts([...accounts, acc]);
        created = true;
      }
      startSession(acc.id);
      return { created };
    },
    false,
    false,
  );

export const signOut = () =>
  call(
    () => {
      current = null;
      writeJson(SESSION, null);
      return { signedIn: false };
    },
    false,
    false,
  );

export const getAccount = () =>
  call(() => {
    const acc = getAccounts().find((a) => a.id === current)!;
    return { provider: acc.provider, createdAt: acc.createdAt };
  }, true);

/* ---------- user ---------- */

export const getUser = () => call(() => db.user, true);

export const updateUser = (patch: Partial<Omit<User, "id">>) =>
  call(() => {
    if (patch.name !== undefined && !patch.name.trim()) throw new ApiError("validation", "Le nom est obligatoire.");
    if (patch.email !== undefined && !EMAIL_RE.test(patch.email)) throw new ApiError("validation", "Adresse e-mail invalide.");
    if (patch.email !== undefined) {
      const email = patch.email.trim().toLowerCase();
      if (getAccounts().some((a) => a.id !== current && a.email.toLowerCase() === email)) {
        throw new ApiError("exists", "Cette adresse est déjà utilisée par un autre compte.");
      }
      patch.email = email;
    }
    db.user = { ...db.user, ...patch };
    save(db);
    setAccounts(getAccounts().map((a) => (a.id === current ? { ...a, name: db.user.name, email: db.user.email } : a)));
    return db.user;
  });

/* ---------- events ---------- */

export const listEvents = (from?: string, to?: string) =>
  call(() =>
    db.events
      .filter((e) => (!from || e.end >= from) && (!to || e.start <= to))
      .sort((a, b) => a.start.localeCompare(b.start)),
  );

export const saveEvent = (input: Omit<CalEvent, "id"> & { id?: string }) =>
  call(() => {
    if (!input.title.trim()) throw new ApiError("validation", "Donnez un titre à l'événement.");
    if (input.end < input.start) throw new ApiError("validation", "La fin doit être après le début.");
    if (input.id) {
      const i = db.events.findIndex((e) => e.id === input.id);
      if (i < 0) throw new ApiError("not_found", "Événement introuvable.");
      db.events[i] = { ...(input as CalEvent), title: input.title.trim() };
      save(db);
      return db.events[i];
    }
    const ev: CalEvent = { ...input, id: uid("ev"), title: input.title.trim() };
    db.events.push(ev);
    save(db);
    return ev;
  });

export const deleteEvent = (id: string) =>
  call(() => {
    db.events = db.events.filter((e) => e.id !== id);
    save(db);
    return true;
  });

/* ---------- alarms ---------- */

export const listAlarms = () => call(() => [...db.alarms].sort((a, b) => a.time.localeCompare(b.time)), true);

export const saveAlarm = (input: Omit<Alarm, "id"> & { id?: string }) =>
  call(() => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new ApiError("validation", "Heure invalide.");
    const clean = { ...input, label: input.label.trim() || "Alarme", snoozedUntil: undefined, lastRang: undefined };
    if (input.id) {
      const i = db.alarms.findIndex((a) => a.id === input.id);
      if (i < 0) throw new ApiError("not_found", "Alarme introuvable.");
      db.alarms[i] = { ...db.alarms[i], ...clean, id: input.id };
      save(db);
      return db.alarms[i];
    }
    const a: Alarm = { ...clean, id: uid("al") };
    db.alarms.push(a);
    save(db);
    return a;
  });

export const setAlarmEnabled = (id: string, enabled: boolean) =>
  call(() => {
    const a = db.alarms.find((x) => x.id === id);
    if (!a) throw new ApiError("not_found", "Alarme introuvable.");
    a.enabled = enabled;
    a.snoozedUntil = undefined;
    save(db);
    return a;
  }, true);

export const deleteAlarm = (id: string) =>
  call(() => {
    db.alarms = db.alarms.filter((a) => a.id !== id);
    save(db);
    return true;
  });

/** Called by the ringer: synchronous, no latency. */
export function markAlarmRang(id: string, minuteKey: string, opts: { snoozeMinutes?: number; stop?: boolean } = {}) {
  const a = db.alarms.find((x) => x.id === id);
  if (!a) return;
  a.lastRang = minuteKey;
  if (opts.snoozeMinutes) a.snoozedUntil = new Date(Date.now() + opts.snoozeMinutes * 60_000).toISOString();
  else a.snoozedUntil = undefined;
  if (opts.stop && a.days.length === 0) a.enabled = false; // one-off alarm switches itself off
  save(db);
  emit();
}

export function peekAlarms() {
  return db.alarms;
}

/* ---------- notes ---------- */

export const listNotes = () =>
  call(() => [...db.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt)));

export const saveNote = (input: { id?: string; title: string; body: string; pinned?: boolean }) =>
  call(() => {
    if (!input.title.trim() && !input.body.trim()) throw new ApiError("validation", "La note est vide.");
    if (input.id) {
      const n = db.notes.find((x) => x.id === input.id);
      if (!n) throw new ApiError("not_found", "Note introuvable.");
      Object.assign(n, { title: input.title, body: input.body, pinned: input.pinned ?? n.pinned, updatedAt: nowIso() });
      save(db);
      return n;
    }
    const n: Note = { id: uid("n"), title: input.title, body: input.body, pinned: !!input.pinned, updatedAt: nowIso() };
    db.notes.unshift(n);
    save(db);
    return n;
  });

export const deleteNote = (id: string) =>
  call(() => {
    db.notes = db.notes.filter((n) => n.id !== id);
    save(db);
    return true;
  });

/* ---------- reminders ---------- */

export const listReminders = () =>
  call(() =>
    [...db.reminders].sort(
      (a, b) => Number(a.done) - Number(b.done) || (a.due ?? "9999").localeCompare(b.due ?? "9999"),
    ),
  );

export const addReminder = (text: string, due?: string) =>
  call(() => {
    if (!text.trim()) throw new ApiError("validation", "Écrivez le rappel.");
    const r: Reminder = { id: uid("r"), text: text.trim(), due, done: false, notified: false };
    db.reminders.push(r);
    save(db);
    return r;
  });

export const setReminderDone = (id: string, done: boolean) =>
  call(() => {
    const r = db.reminders.find((x) => x.id === id);
    if (!r) throw new ApiError("not_found", "Rappel introuvable.");
    r.done = done;
    save(db);
    return r;
  }, true);

export const deleteReminder = (id: string) =>
  call(() => {
    db.reminders = db.reminders.filter((r) => r.id !== id);
    save(db);
    return true;
  });

export function peekReminders() {
  return db.reminders;
}
export function markReminderNotified(id: string) {
  const r = db.reminders.find((x) => x.id === id);
  if (r) {
    r.notified = true;
    save(db);
    emit();
  }
}

/* ---------- friends & messages ---------- */

export type Conversation = Friend & { last?: Message; unread: number };
export type AddFriendOutcome = "added" | "accepted" | "requested" | "invited";

export const listFriends = () =>
  call<Conversation[]>(() =>
    db.friends
      .map((f) => {
        const msgs = db.messages.filter((m) => m.friendId === f.id);
        return { ...f, last: msgs[msgs.length - 1], unread: msgs.filter((m) => m.from === "them" && !m.read).length };
      })
      .sort((a, b) => (b.last?.at ?? b.since).localeCompare(a.last?.at ?? a.since)),
  );

export const addFriendByEmail = (emailRaw: string) =>
  call(() => {
    const email = emailRaw.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new ApiError("validation", "Cette adresse e-mail n'est pas valide.");
    if (email === db.user.email.toLowerCase()) throw new ApiError("validation", "C'est votre propre adresse 🙂");
    const existing = db.friends.find((f) => f.email.toLowerCase() === email);
    if (existing?.status === "friend") throw new ApiError("exists", `${existing.name} fait déjà partie de vos amis.`);
    if (existing?.status === "pending_out") throw new ApiError("exists", "Invitation déjà envoyée à cette adresse.");
    if (existing?.status === "pending_in") {
      existing.status = "friend";
      existing.since = nowIso();
      save(db);
      return { id: existing.id, name: existing.name, email: existing.email, outcome: "accepted" as AddFriendOutcome };
    }
    const known = DIRECTORY.find((d) => d.email === email);
    const friend: Friend = {
      id: uid("fr"),
      name: known?.name ?? email.split("@")[0],
      email,
      status: known ? "friend" : "pending_out",
      since: nowIso(),
    };
    db.friends.push(friend);
    save(db);
    return { id: friend.id, name: friend.name, email: friend.email, outcome: (known ? "added" : "invited") as AddFriendOutcome };
  });

export const respondToRequest = (id: string, accept: boolean) =>
  call(() => {
    const f = db.friends.find((x) => x.id === id);
    if (!f) throw new ApiError("not_found", "Demande introuvable.");
    if (accept) {
      f.status = "friend";
      f.since = nowIso();
    } else db.friends = db.friends.filter((x) => x.id !== id);
    save(db);
    return true;
  });

export const removeFriend = (id: string) =>
  call(() => {
    db.friends = db.friends.filter((x) => x.id !== id);
    db.messages = db.messages.filter((m) => m.friendId !== id);
    save(db);
    return true;
  });

export const getThread = (friendId: string) =>
  call(() => {
    const friend = db.friends.find((f) => f.id === friendId);
    if (!friend) throw new ApiError("not_found", "Cette conversation n'existe pas.");
    let changed = false;
    for (const m of db.messages) {
      if (m.friendId === friendId && m.from === "them" && !m.read) {
        m.read = true;
        changed = true;
      }
    }
    if (changed) save(db);
    return { friend, messages: db.messages.filter((m) => m.friendId === friendId) };
  });

const REPLIES = [
  "Ça marche !",
  "Super, merci 🙌",
  "Je regarde ça et je te redis.",
  "Haha oui 😄",
  "Ok, à tout à l'heure.",
  "Bonne idée !",
];

export const sendMessage = (friendId: string, text: string) =>
  call(() => {
    const friend = db.friends.find((f) => f.id === friendId);
    if (!friend) throw new ApiError("not_found", "Cette conversation n'existe pas.");
    if (friend.status !== "friend") throw new ApiError("forbidden", "Vous pourrez écrire à cette personne quand elle aura accepté votre invitation.");
    if (!text.trim()) throw new ApiError("validation", "Le message est vide.");
    if (text.length > 2000) throw new ApiError("validation", "Message trop long (2000 caractères max).");
    const m: Message = { id: uid("m"), friendId, from: "me", text: text.trim(), at: nowIso(), read: true };
    db.messages.push(m);
    save(db);
    // demo: the friend answers a moment later
    const reply = text.trim().endsWith("?") ? "Bonne question… je te réponds vite !" : REPLIES[Math.floor(Math.random() * REPLIES.length)];
    setTimeout(() => {
      if (!db.friends.some((f) => f.id === friendId)) return;
      db.messages.push({ id: uid("m"), friendId, from: "them", text: reply, at: nowIso(), read: false });
      save(db);
      emit();
    }, 2500 + Math.random() * 2000);
    return m;
  });

export const unreadTotal = () => call(() => db.messages.filter((m) => m.from === "them" && !m.read).length, true);

/* ---------- cities ---------- */

export const listCities = () => call(() => db.cities, true);

export const addCity = (c: Omit<City, "id">) =>
  call(() => {
    if (db.cities.some((x) => Math.abs(x.lat - c.lat) < 0.01 && Math.abs(x.lon - c.lon) < 0.01)) {
      throw new ApiError("exists", `${c.name} est déjà dans votre liste.`);
    }
    const city: City = { ...c, id: uid("c") };
    db.cities.push(city);
    save(db);
    return city;
  });

export const removeCity = (id: string) =>
  call(() => {
    db.cities = db.cities.filter((c) => c.id !== id);
    save(db);
    return true;
  });

/* ---------- demo ---------- */

export const resetDemo = () =>
  call(() => {
    db = current === DEMO_ID ? buildSeed() : buildStarter(db.user);
    save(db);
    return true;
  });

/* ---------- extras the online version also provides ---------- */

export const MODE = "local" as "local" | "remote";

export const startOAuth = (_provider: "google") =>
  call<void>(() => {
    throw new ApiError("not_configured", "La connexion Google n'est pas configurée.");
  }, true, false);

export const requestPasswordReset = (_email: string) =>
  call<boolean>(() => {
    throw new ApiError("not_supported", "La réinitialisation par e-mail n'est disponible que sur la version en ligne.");
  }, false, false);

export const updatePassword = (password: string) =>
  call(async () => {
    if (password.length < 8) throw new ApiError("validation_password", "Le mot de passe doit faire au moins 8 caractères.");
    const { hash, salt } = await hashPassword(password);
    setAccounts(getAccounts().map((a) => (a.id === current ? { ...a, passHash: hash, salt } : a)));
    return true;
  });

export const deleteAccount = () =>
  call(() => {
    const id = current!;
    setAccounts(getAccounts().filter((a) => a.id !== id));
    writeJson(dbKey(id), null);
    current = null;
    writeJson(SESSION, null);
    return true;
  });

export const getAccessToken = async (): Promise<string | null> => null;
