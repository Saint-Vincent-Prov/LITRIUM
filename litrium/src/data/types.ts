export type TempUnit = "C" | "F";

export interface User {
  id: string;
  name: string;
  email: string;
  unit: TempUnit;
  aiKey?: string;
  notifications: boolean;
}

export type FriendStatus = "friend" | "pending_out" | "pending_in";

export interface Friend {
  id: string;
  name: string;
  email: string;
  status: FriendStatus;
  since: string;
}

export interface Message {
  id: string;
  friendId: string;
  from: "me" | "them";
  text: string;
  at: string;
  read: boolean;
}

export type EventColor = "mint" | "violet" | "peach" | "sky";

export interface CalEvent {
  id: string;
  title: string;
  start: string; // ISO
  end: string; // ISO
  allDay: boolean;
  color: EventColor;
  location?: string;
  note?: string;
}

export interface Alarm {
  id: string;
  time: string; // HH:MM
  days: number[]; // 0 = dimanche … 6 = samedi ; empty = une seule fois
  label: string;
  enabled: boolean;
  snoozedUntil?: string;
  lastRang?: string; // ISO minute key, avoids ringing twice
}

export interface Note {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  updatedAt: string;
}

export interface Reminder {
  id: string;
  text: string;
  due?: string; // ISO
  done: boolean;
  notified: boolean;
}

export interface City {
  id: string;
  name: string;
  admin?: string;
  country: string;
  lat: number;
  lon: number;
}

export interface WorldClock {
  id: string;
  name: string;
  admin?: string;
  country: string;
  timezone: string; // IANA, e.g. "Asia/Tokyo"
}

export interface DB {
  user: User;
  session: boolean;
  friends: Friend[];
  messages: Message[];
  events: CalEvent[];
  alarms: Alarm[];
  notes: Note[];
  reminders: Reminder[];
  cities: City[];
  clocks?: WorldClock[];
}

export type AuthProvider = "email" | "google" | "apple";

export interface Account {
  id: string;
  name: string;
  email: string;
  provider: AuthProvider;
  providerSub?: string;
  passHash?: string;
  salt?: string;
  createdAt: string;
}
