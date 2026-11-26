/**
 * The app's data layer. Online (Supabase) when VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY are set, otherwise local to this browser.
 * Both implementations expose exactly the same functions.
 */
import * as local from "./api.local";
import * as remote from "./api.remote";
import { ONLINE } from "./supabase";

const impl: typeof local = ONLINE ? remote : local;

export { ApiError } from "./errors";
export type { AddFriendOutcome, Conversation } from "./api.local";

export const {
  MODE,
  subscribe,
  getSession,
  hasAnyAccount,
  signUp,
  signIn,
  signInWithProvider,
  startOAuth,
  requestPasswordReset,
  updatePassword,
  signOut,
  getAccount,
  deleteAccount,
  getAccessToken,
  getUser,
  updateUser,
  listEvents,
  saveEvent,
  deleteEvent,
  listAlarms,
  saveAlarm,
  setAlarmEnabled,
  deleteAlarm,
  markAlarmRang,
  peekAlarms,
  listNotes,
  saveNote,
  deleteNote,
  listReminders,
  addReminder,
  setReminderDone,
  deleteReminder,
  peekReminders,
  markReminderNotified,
  listFriends,
  addFriendByEmail,
  respondToRequest,
  removeFriend,
  getThread,
  sendMessage,
  unreadTotal,
  listCities,
  addCity,
  removeCity,
  resetDemo,
} = impl;
