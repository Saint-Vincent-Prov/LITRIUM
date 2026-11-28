/**
 * Personal assistant: understands French requests and acts on the hub's
 * modules. Anything it can't handle goes to Claude when the user saved an
 * API key in Settings.
 */
import {
  addReminder,
  getAccessToken,
  getUser,
  MODE,
  listAlarms,
  listCities,
  listEvents,
  listFriends,
  listNotes,
  listReminders,
  saveAlarm,
  saveEvent,
  saveNote,
  sendMessage,
} from "../data/api";
import type { Conversation } from "../data/api";
import type { Alarm, CalEvent, Note, Reminder, User } from "../data/types";
import { describe, getForecast, locate, placeName, searchPlaces } from "../data/weather";
import { dateIn, dayLabel, diffLabel, isValidTz, LOCAL_TZ, timeIn } from "./time";
import { fmtWhen, parseWhen } from "./when";

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  links?: { label: string; to: string }[];
}

export const SUGGESTIONS = [
  "Rappelle-moi d'appeler Léa demain à 9h",
  "Réveille-moi à 7h15 en semaine",
  "Ajoute un rendez-vous dentiste vendredi à 10h",
  "Quel temps fait-il à Lyon ?",
  "Quelle heure est-il à Tokyo ?",
  "Qu'est-ce que j'ai demain ?",
  "Note : acheter du pain et du café",
  "Envoie à Hugo : j'arrive dans 10 minutes",
];

const HELP = `Voici ce que je sais faire :
• Rappels : « rappelle-moi de … demain à 9h »
• Alarmes : « réveille-moi à 7h en semaine »
• Agenda : « ajoute un rendez-vous … jeudi à 14h », « qu'est-ce que j'ai demain ? »
• Notes : « note : … »
• Messages : « envoie à Léa : … »
• Météo : « quel temps fait-il à Lyon ? »\n• Heure : « quelle heure est-il à Tokyo ? »
Et pour tout le reste, posez simplement votre question.`;

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function clean(s: string) {
  return s
    .replace(/^[\s,:;-]+|[\s,.;!?-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function weatherReply(text: string): Promise<ChatTurn> {
  const user = await getUser();
  const unit = user.unit === "F" ? "°F" : "°C";
  const cityMatch = text
    .replace(/\s*(demain|aujourd'hui|ce soir|cette semaine|ce week-end)\s*/gi, " ")
    .trim()
    .match(/(?:^|\s)(?:à|a|sur|pour)\s+([\p{L}][\p{L}' -]*?)\s*\??$/iu);
  let lat: number;
  let lon: number;
  let name: string;
  if (cityMatch) {
    const places = await searchPlaces(cityMatch[1]);
    if (!places.length) return { role: "assistant", text: `Je ne trouve pas « ${cityMatch[1]} ». Essayez un autre nom de ville.` };
    ({ lat, lon, name } = places[0]);
  } else {
    try {
      ({ lat, lon } = await locate());
      name = await placeName(lat, lon);
    } catch {
      const cities = await listCities();
      if (!cities.length) return { role: "assistant", text: "Je n'ai pas accès à votre position. Dites-moi une ville, par exemple « météo à Paris »." };
      ({ lat, lon, name } = cities[0]);
    }
  }
  const f = await getForecast(lat, lon, user.unit);
  const tomorrow = /demain/i.test(text);
  if (tomorrow) {
    const d = f.daily[1];
    return {
      role: "assistant",
      text: `Demain à ${name} : ${describe(d.code).label.toLowerCase()}, entre ${Math.round(d.min)}${unit} et ${Math.round(d.max)}${unit}, ${d.rain} % de risque de pluie.`,
      links: [{ label: "Voir la météo", to: "/meteo" }],
    };
  }
  const c = f.current;
  const rainSoon = f.hourly.slice(0, 6).find((h) => h.rain >= 50);
  return {
    role: "assistant",
    text: `À ${name}, il fait ${Math.round(c.temp)}${unit} (ressenti ${Math.round(c.feels)}${unit}), ${describe(c.code).label.toLowerCase()}.${
      rainSoon ? ` Pluie probable vers ${rainSoon.time.slice(11, 16)}.` : " Pas de pluie prévue dans les prochaines heures."
    }`,
    links: [{ label: "Voir la météo", to: "/meteo" }],
  };
}

async function timeReply(text: string): Promise<ChatTurn> {
  const now = new Date();
  const cleaned = text.replace(/\s*(en ce moment|maintenant|actuellement|exactement|là-bas)\s*/gi, " ").trim();
  const m = cleaned.match(/(?:^|\s)(?:à|a|en|au|aux|sur|pour)\s+([\p{L}][\p{L}' -]*?)\s*\??$/iu);
  if (!m) {
    return {
      role: "assistant",
      text: `Il est ${timeIn(now, LOCAL_TZ)}, ${dateIn(now, LOCAL_TZ)}.`,
      links: [{ label: "Horloge", to: "/horloge" }],
    };
  }
  const places = (await searchPlaces(m[1])).filter((p) => p.timezone && isValidTz(p.timezone));
  if (!places.length) return { role: "assistant", text: `Je ne trouve pas « ${m[1]} ». Essayez un autre nom de ville.` };
  const p = places[0];
  const tz = p.timezone!;
  const day = dayLabel(now, tz);
  const diff = diffLabel(now, tz);
  return {
    role: "assistant",
    text: `À ${p.name}, il est ${timeIn(now, tz)}${day === "Aujourd'hui" ? "" : ` (${day.toLowerCase()})`} — ${diff === "même heure" ? "la même heure que chez vous" : `${diff} par rapport à chez vous`}.`,
    links: [{ label: "Horloge", to: "/horloge" }],
  };
}

/* ---------- AI (Gemini or Claude, through the app's own /api/ai endpoint) ---------- */

let statusCache: { at: number; available: boolean } | null = null;

/** Is the AI configured on the server? */
export async function aiServerAvailable(): Promise<boolean> {
  if (statusCache && Date.now() - statusCache.at < 30_000) return statusCache.available;
  try {
    const r = await fetch("/api/ai");
    const ok = r.ok && ((await r.json()) as { available?: boolean }).available === true;
    statusCache = { at: Date.now(), available: ok };
  } catch {
    statusCache = { at: Date.now(), available: false };
  }
  return statusCache.available;
}

export const aiAvailable = aiServerAvailable;

let contextCache: { at: number; data: Promise<[CalEvent[], Reminder[], User, Alarm[], Note[], Conversation[]]> } | null = null;

/** The person's data the AI may use; reused for 20 s so follow-up questions start faster. */
function loadContext() {
  if (!contextCache || Date.now() - contextCache.at > 20_000) {
    const now = new Date();
    const data = Promise.all([
      listEvents(now.toISOString(), new Date(now.getTime() + 7 * 864e5).toISOString()),
      listReminders(),
      getUser(),
      listAlarms(),
      listNotes(),
      listFriends(),
    ]);
    data.catch(() => (contextCache = null));
    contextCache = { at: Date.now(), data };
  }
  return contextCache.data;
}

/** Start loading the context early (when the assistant opens), so the first question is faster. */
export function prefetchContext() {
  loadContext().catch(() => {});
  aiServerAvailable().catch(() => {});
}

/** Call after the assistant changed something, so the next AI answer sees it. */
export function forgetContext() {
  contextCache = null;
}

async function buildSystemPrompt() {
  const now = new Date();
  const [events, reminders, user, alarms, notes, friends] = await loadContext();
  return [
    "Tu es l'assistant personnel de l'application Litrium (météo, agenda, alarmes, rappels, notes, messages entre amis).",
    "Réponds en français, de façon claire, utile et chaleureuse. Tu peux répondre à n'importe quelle question (culture générale, conseils, explications, rédaction, calcul…).",
    "Sois concis par défaut ; développe si on te le demande. N'invente pas de faits personnels sur l'utilisateur.",
    "L'application sait déjà exécuter ces demandes si l'utilisateur les formule ainsi : « rappelle-moi de … demain à 9h », « réveille-moi à 7h », « ajoute un rendez-vous … jeudi à 14h », « note : … », « envoie à Léa : … », « météo à Lyon ». Si on te demande une de ces actions, propose la formulation exacte.",
    "",
    `Date et heure actuelles : ${now.toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" })}.`,
    `Utilisateur : ${user.name}.`,
    `Prochains événements (7 jours) : ${events.map((e) => `${e.title} (${fmtWhen(e.start, !e.allDay)})`).join(" ; ") || "aucun"}.`,
    `Rappels en cours : ${reminders.filter((r) => !r.done).map((r) => `${r.text}${r.due ? ` (${fmtWhen(r.due)})` : ""}`).join(" ; ") || "aucun"}.`,
    `Alarmes actives : ${alarms.filter((x) => x.enabled).map((x) => `${x.time} ${x.label}`).join(" ; ") || "aucune"}.`,
    `Titres des notes : ${notes.map((n) => n.title).filter(Boolean).slice(0, 15).join(" ; ") || "aucune"}.`,
    `Amis : ${friends.filter((f) => f.status === "friend").map((f) => f.name).join(", ") || "aucun"}.`,
  ].join("\n");
}

async function askAI(history: ChatTurn[], onDelta?: (textSoFar: string) => void): Promise<ChatTurn> {
  const [system, token] = await Promise.all([buildSystemPrompt(), getAccessToken()]);
  const messages = history.slice(-16).map((t) => ({ role: t.role, content: t.text }));
  try {
    const r = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ system, messages, stream: true }),
    });
    // streamed answer: show it piece by piece
    if (r.ok && r.body && (r.headers.get("content-type") ?? "").startsWith("text/plain")) {
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        onDelta?.(text);
      }
      text += dec.decode();
      return { role: "assistant", text: text.trim() || "…" };
    }
    const data = (await r.json().catch(() => ({}))) as { text?: string; message?: string };
    if (r.ok && data.text) return { role: "assistant", text: data.text };
    return { role: "assistant", text: data.message ?? "L'IA n'a pas pu répondre. Réessayez dans un instant." };
  } catch {
    return { role: "assistant", text: "Impossible de joindre l'IA. Vérifiez votre connexion internet." };
  }
}

function notConfigured(): ChatTurn {
  return {
    role: "assistant",
    text:
      MODE === "remote"
        ? "L'IA n'est pas encore activée sur ce site. En attendant, je gère vos rappels, alarmes, agenda, notes, messages et la météo."
        : "Pour répondre à n'importe quelle question, ajoutez une clé Gemini (GEMINI_API_KEY) dans le fichier .env puis relancez. En attendant, je gère vos rappels, alarmes, agenda, notes, messages et la météo.",
  };
}

export async function respond(history: ChatTurn[], onDelta?: (textSoFar: string) => void): Promise<ChatTurn> {
  const input = history[history.length - 1].text.trim();
  const low = norm(input);
  const ai = await aiAvailable();
  // a general question that only mentions a keyword ("c'est quoi un bon réveil ?") goes to Claude
  const isQuestion = /\?\s*$/.test(input) || /^(pourquoi|comment|qu'?est-ce|c'?est quoi|quel|quelle|quels|quelles|est-ce|explique|peux-tu|dis-moi|combien|qui|ou |quand)/.test(low);
  const giveUp = (ask: string): ChatTurn | null => (ai && isQuestion ? null : { role: "assistant", text: ask });

  if (/^(aide|help|\?|que sais[- ]tu faire|qu'?est[- ]ce que tu (sais|peux) faire)/.test(low)) {
    return { role: "assistant", text: HELP };
  }

  // alarm
  if (/(reveille[- ]moi|(mets|programme|regle|cree|ajoute|nouvelle)\s+(une\s+|un\s+|mon\s+)?(alarme|reveil)|^alarme|^reveil)/.test(low) && !/(mes alarmes|quelles alarmes)/.test(low)) {
    const w = parseWhen(input);
    if (!w.hasTime) {
      const r = giveUp("À quelle heure ? Par exemple : « réveille-moi à 7h15 ».");
      if (r) return r;
    } else {
    const d = w.date!;
    const days = /tous les jours/.test(low) ? [0, 1, 2, 3, 4, 5, 6] : /en semaine/.test(low) ? [1, 2, 3, 4, 5] : /week-?end/.test(low) ? [0, 6] : [];
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const label = clean(w.rest.replace(/r[ée]veille[- ]moi|(mets|programme|cr[ée]e|ajoute)\s+(une\s+)?alarme|alarme|r[ée]veil|tous les jours|en semaine|le week-?end|pour/gi, "")) || "Alarme";
    await saveAlarm({ time, days, label: cap(label), enabled: true });
    const repeat = days.length === 7 ? "tous les jours" : days.length === 5 ? "en semaine" : days.length === 2 ? "le week-end" : "une seule fois";
    return { role: "assistant", text: `C'est réglé : alarme à ${time.replace(":", "h")}, ${repeat}.`, links: [{ label: "Mes alarmes", to: "/alarmes" }] };
    }
  }

  // list reminders
  if (/(mes rappels|quels rappels)/.test(low)) {
    const rs = (await listReminders()).filter((r) => !r.done);
    if (!rs.length) return { role: "assistant", text: "Aucun rappel en cours. 🎉" };
    return {
      role: "assistant",
      text: `Vous avez ${rs.length} rappel${rs.length > 1 ? "s" : ""} :\n${rs.map((r) => `• ${r.text}${r.due ? ` (${fmtWhen(r.due)})` : ""}`).join("\n")}`,
      links: [{ label: "Notes et rappels", to: "/notes" }],
    };
  }

  // reminder
  if (/(rappelle[- ]moi|n'?oublie pas|fais[- ]moi penser|cree un rappel|ajoute un rappel)/.test(low)) {
    const w = parseWhen(input);
    const what = clean(
      w.rest.replace(/^(rappelle[- ]moi|n'?oublie pas|fais[- ]moi penser|cr[ée]e un rappel|ajoute un rappel)\s*(de |d'|d’|que |à |a |pour )?/i, ""),
    );
    if (!what) return { role: "assistant", text: "De quoi dois-je vous rappeler ?" };
    let due = w.date;
    if (due && !w.hasTime) due.setHours(9, 0);
    await addReminder(cap(what), due?.toISOString());
    return {
      role: "assistant",
      text: due ? `Je vous le rappellerai ${fmtWhen(due.toISOString())} : « ${cap(what)} ».` : `Rappel ajouté : « ${cap(what)} ».`,
      links: [{ label: "Notes et rappels", to: "/notes" }],
    };
  }

  // agenda question
  if (/(qu'?est[- ]ce que j'?ai|qu'?ai[- ]je|mon agenda|mon planning|mes rendez-vous|mon programme|suis[- ]je libre)/.test(low)) {
    const w = parseWhen(input);
    const day = w.date ?? new Date();
    const from = new Date(day);
    from.setHours(0, 0, 0, 0);
    const to = new Date(day);
    to.setHours(23, 59, 59, 999);
    const evs = await listEvents(from.toISOString(), to.toISOString());
    const label = fmtWhen(from.toISOString(), false);
    if (!evs.length) return { role: "assistant", text: `Rien de prévu ${label}. Journée libre !`, links: [{ label: "Ouvrir l'agenda", to: "/agenda" }] };
    return {
      role: "assistant",
      text: `${cap(label)}, vous avez :\n${evs
        .map((e) => `• ${e.allDay ? "Toute la journée" : new Date(e.start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} — ${e.title}${e.location ? ` (${e.location})` : ""}`)
        .join("\n")}`,
      links: [{ label: "Ouvrir l'agenda", to: "/agenda" }],
    };
  }

  // event
  const evVerb = /^(ajoute|cree|mets|planifie|programme|note|prevois|bloque)\b/.test(low) && /(rendez[- ]vous|rdv|reunion|evenement|agenda|calendrier|diner|dejeuner|rencontre)/.test(low);
  const evNoun = /(rendez[- ]vous|rdv|reunion)\b/.test(low) && !isQuestion;
  if (evVerb || evNoun) {
    const w = parseWhen(input);
    const missing = !w.date ? giveUp("Pour quand ? Par exemple : « ajoute un rendez-vous dentiste vendredi à 10h ».") : null;
    if (missing) return missing;
  }
  if ((evVerb || evNoun) && parseWhen(input).date) {
    const w = parseWhen(input);
    if (!w.date) return { role: "assistant", text: "Pour quand ?" };
    let title = clean(
      w.rest
        .replace(/\b(ajoute|cr[ée]e|mets|planifie|programme)(-moi)?\b/gi, "")
        .replace(/(dans|à|a)\s+(mon\s+)?(agenda|calendrier)/gi, "")
        .replace(/^\s*(un|une)\s+/i, ""),
    );
    const kw = title.match(/^(rendez[- ]vous|rdv|r[ée]union|[ée]v[ée]nement)\s*(.*)$/i);
    if (kw) {
      // "rendez-vous dentiste" -> "Dentiste" ; "réunion avec Paul" -> "Réunion avec Paul"
      title = /^(avec|chez)\b/i.test(kw[2]) || !kw[2] ? `${kw[1].toLowerCase().startsWith("r") && /union/i.test(kw[1]) ? "Réunion" : "Rendez-vous"} ${kw[2]}`.trim() : kw[2].replace(/^(de|du|pour)\s+/i, "");
    }
    const start = w.date;
    const allDay = !w.hasTime;
    if (allDay) start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + (allDay ? 86_399_000 : 3_600_000));
    const ev = await saveEvent({ title: cap(title || "Rendez-vous"), start: start.toISOString(), end: end.toISOString(), allDay, color: "sky" });
    return {
      role: "assistant",
      text: `Ajouté à votre agenda : « ${ev.title} », ${fmtWhen(ev.start, !allDay)}.`,
      links: [{ label: "Ouvrir l'agenda", to: `/agenda?jour=${ev.start.slice(0, 10)}` }],
    };
  }

  // note
  const note = input.match(/^(?:prends?\s+(?:une\s+)?note|note|nouvelle note|[ée]cris une note)\s*(?:que|:)?\s*(.+)$/is);
  if (note) {
    const body = clean(note[1]);
    const title = cap(body.split(/[.\n]/)[0].slice(0, 50));
    await saveNote({ title, body: cap(body) });
    return { role: "assistant", text: `Note enregistrée : « ${title} ».`, links: [{ label: "Mes notes", to: "/notes" }] };
  }

  // message to a friend
  const msg = input.match(/^(?:envoie|[ée]cris|dis)(?:\s+un\s+message)?\s+(?:à|a)\s+([\p{L}-]+)\s*(?::|que|de)?\s*(.+)$/iu);
  if (msg) {
    const friends = (await listFriends()).filter((f) => f.status === "friend");
    const who = friends.find((f) => norm(f.name).split(" ")[0] === norm(msg[1]) || norm(f.name) === norm(msg[1]));
    if (!who) {
      return {
        role: "assistant",
        text: `Je ne trouve pas « ${msg[1]} » dans vos amis.${friends.length ? ` Vos amis : ${friends.map((f) => f.name.split(" ")[0]).join(", ")}.` : ""}`,
        links: [{ label: "Ajouter un ami", to: "/messages" }],
      };
    }
    await sendMessage(who.id, cap(clean(msg[2])));
    return { role: "assistant", text: `Message envoyé à ${who.name.split(" ")[0]}.`, links: [{ label: "Ouvrir la conversation", to: `/messages/${who.id}` }] };
  }

  // time here or in a city
  if (/(quelle heure|l'?heure (qu'?il est|actuelle|locale)|heure est[- ]il|heure il est|decalage horaire)/.test(low)) {
    try {
      return await timeReply(input);
    } catch (e) {
      return { role: "assistant", text: `Impossible de trouver l'heure : ${(e as Error).message}` };
    }
  }

  // weather
  if (/(meteo|quel temps|temps fait|temps va[- ]t[- ]il|il pleut|va[- ]t[- ]il pleuvoir|pleuvra|fait[- ]il chaud|fait[- ]il froid|besoin d'?un parapluie|prendre un parapluie)/.test(low)) {
    try {
      return await weatherReply(input);
    } catch (e) {
      return { role: "assistant", text: `Impossible d'obtenir la météo : ${(e as Error).message}` };
    }
  }

  // alarms question
  if (/(mes alarmes|quelles alarmes|prochaine alarme)/.test(low)) {
    const al = (await listAlarms()).filter((a) => a.enabled);
    return {
      role: "assistant",
      text: al.length ? `Alarmes actives : ${al.map((a) => `${a.time.replace(":", "h")} (${a.label})`).join(", ")}.` : "Aucune alarme active.",
      links: [{ label: "Mes alarmes", to: "/alarmes" }],
    };
  }

  // greetings
  if (!ai && /^(bonjour|salut|coucou|hello|bonsoir|hey)\b/.test(low)) {
    const u = await getUser();
    return { role: "assistant", text: `Bonjour ${u.name.split(" ")[0]} ! Que puis-je faire pour vous ? Tapez « aide » pour voir des exemples.` };
  }
  if (!ai && /^merci/.test(low)) return { role: "assistant", text: "Avec plaisir ! 😊" };

  if (ai) return askAI(history, onDelta);
  return notConfigured();
}
