/**
 * In-app notification centre. Notifications are kept on this device, per
 * account; they can also appear as system notifications when allowed.
 */
import { useEffect, useState } from "react";

export type NotifKind = "message" | "friend" | "reminder" | "alarm" | "event" | "grades" | "system";

export interface AppNotification {
  id: string;
  kind: NotifKind;
  title: string;
  body?: string;
  link?: string;
  at: string;
  read: boolean;
}

export const KIND_LABEL: Record<NotifKind, string> = {
  message: "Messages",
  friend: "Demandes d'amis",
  reminder: "Rappels",
  alarm: "Alarmes",
  event: "Événements à venir",
  grades: "Nouvelles notes",
  system: "Litrium",
};

const MAX = 60;
let owner = "anon";
const listeners = new Set<() => void>();
const key = () => `litrium-notifs:${owner}`;
const prefsKey = () => `litrium-notif-prefs:${owner}`;
const seenKey = () => `litrium-notif-seen:${owner}`;

function read<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}
const emit = () => listeners.forEach((f) => f());

/** Call once the signed-in account is known. */
export function setNotificationOwner(userId: string) {
  if (owner === userId) return;
  owner = userId;
  emit();
}

export function listNotifications(): AppNotification[] {
  return read<AppNotification[]>(key(), []);
}

export type NotifPrefs = Record<NotifKind, boolean> & { system: boolean };
const DEFAULT_PREFS: NotifPrefs = { message: true, friend: true, reminder: true, alarm: true, event: true, grades: true, system: true };

export function getNotifPrefs(): NotifPrefs {
  return { ...DEFAULT_PREFS, ...read<Partial<NotifPrefs>>(prefsKey(), {}) };
}
export function setNotifPref(kind: NotifKind, on: boolean) {
  write(prefsKey(), { ...getNotifPrefs(), [kind]: on });
  emit();
}

/** Remembers that an event (a message id, a reminder…) was already announced. */
export function alreadyAnnounced(eventKey: string) {
  return read<string[]>(seenKey(), []).includes(eventKey);
}
function markAnnounced(eventKey: string) {
  const list = read<string[]>(seenKey(), []);
  list.push(eventKey);
  write(seenKey(), list.slice(-400));
}

/**
 * Adds a notification unless that kind is switched off or `eventKey` was
 * already announced. Returns true when something was added.
 */
export function notify(n: Omit<AppNotification, "id" | "at" | "read">, eventKey?: string, opts: { browser?: boolean } = {}) {
  if (eventKey && alreadyAnnounced(eventKey)) return false;
  if (eventKey) markAnnounced(eventKey);
  if (!getNotifPrefs()[n.kind]) return false;
  const item: AppNotification = { ...n, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), read: false };
  write(key(), [item, ...listNotifications()].slice(0, MAX));
  emit();
  if (opts.browser !== false && typeof document !== "undefined" && document.hidden && "Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(n.title, { body: n.body, tag: eventKey });
    } catch {
      /* some browsers need a service worker */
    }
  }
  return true;
}

export function markAllRead() {
  write(key(), listNotifications().map((n) => ({ ...n, read: true })));
  emit();
}
export function markRead(id: string) {
  write(key(), listNotifications().map((n) => (n.id === id ? { ...n, read: true } : n)));
  emit();
}
export function clearNotifications() {
  write(key(), []);
  emit();
}

export function useNotifications() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    const onStorage = (e: StorageEvent) => e.key?.startsWith("litrium-notif") && f();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(f);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const items = listNotifications();
  return { items, unread: items.filter((n) => !n.read).length, prefs: getNotifPrefs() };
}

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
