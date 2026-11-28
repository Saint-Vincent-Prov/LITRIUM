export type TempUnit = "C" | "F";

export type WidgetId = "assistant" | "weather" | "today" | "alarm" | "reminders" | "messages" | "notes" | "clock" | "grades";
export type WidgetSize = "s" | "m" | "l";
export type DashboardLayout = { id: WidgetId; size: WidgetSize }[];

export interface User {
  id: string;
  name: string;
  email: string;
  unit: TempUnit;
  aiKey?: string;
  notifications: boolean;
  dashboard?: DashboardLayout;
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

export interface Grade {
  id: string;
  subject: string;
  period: string;
  title: string;
  value: number;
  outOf: number;
  coef: number;
  date: string; // YYYY-MM-DD
  /** A "what if" grade: counted only when virtual grades are shown. */
  virtual: boolean;
  /** Not counted in averages (École Directe "non significatif"). */
  excluded?: boolean;
  source: "manual" | "ecoledirecte";
  externalId?: string;
  classAverage?: number;
}

export interface Subject {
  id: string;
  name: string;
  coef: number;
}

/** What an import brings: grades keyed by externalId, plus subject coefficients. */
export interface GradeImport {
  grades: Omit<Grade, "id" | "virtual" | "source">[];
  subjects: { name: string; coef: number }[];
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
  grades?: Grade[];
  subjects?: Subject[];
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
