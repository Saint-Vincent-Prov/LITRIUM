/** Small French date/time parser for the assistant. */

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export interface When {
  date: Date | null;
  hasTime: boolean;
  hasDay: boolean;
  rest: string;
}

function strip(s: string, piece: string) {
  return s.replace(piece, " ").replace(/\s{2,}/g, " ").trim();
}

export function parseWhen(input: string, now = new Date()): When {
  let s = ` ${input} `;
  const d = new Date(now);
  d.setSeconds(0, 0);
  let hasDay = false;
  let hasTime = false;

  // relative: "dans 10 minutes", "dans 2 heures", "dans 3 jours"
  const rel = s.match(/\sdans\s+(\d+|une|un)\s*(minutes?|min|heures?|h|jours?|semaines?)\b/i);
  if (rel) {
    const n = /^\d+$/.test(rel[1]) ? Number(rel[1]) : 1;
    const u = rel[2].toLowerCase();
    if (u.startsWith("min")) d.setMinutes(d.getMinutes() + n);
    else if (u.startsWith("h")) d.setHours(d.getHours() + n);
    else if (u.startsWith("j")) d.setDate(d.getDate() + n);
    else d.setDate(d.getDate() + 7 * n);
    hasDay = true;
    hasTime = !u.startsWith("j") && !u.startsWith("s");
    s = strip(s, rel[0]);
    return { date: d, hasTime, hasDay, rest: s };
  }

  // day words
  const dayWord = s.match(/\s(aujourd'hui|aujourd’hui|ce soir|ce matin|cet après-midi|cette nuit|après-demain|demain)\b/i);
  if (dayWord) {
    const w = dayWord[1].toLowerCase();
    if (w === "demain") d.setDate(d.getDate() + 1);
    if (w === "après-demain") d.setDate(d.getDate() + 2);
    if (w === "ce soir") {
      d.setHours(20, 0);
      hasTime = true;
    }
    if (w === "ce matin") {
      d.setHours(9, 0);
      hasTime = true;
    }
    if (w === "cet après-midi") {
      d.setHours(15, 0);
      hasTime = true;
    }
    hasDay = true;
    s = strip(s, dayWord[0]);
  }

  // weekday: "lundi", "lundi prochain"
  const wd = s.match(new RegExp(`\\s(${WEEKDAYS.join("|")})(\\s+prochain)?\\b`, "i"));
  if (wd && !hasDay) {
    const target = WEEKDAYS.indexOf(wd[1].toLowerCase());
    let diff = (target - d.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    d.setDate(d.getDate() + diff);
    hasDay = true;
    s = strip(s, wd[0]);
  }

  // "le 3 décembre", "le 3"
  const dm = s.match(new RegExp(`\\sle\\s+(\\d{1,2})(?:er)?(?:\\s+(${MONTHS.join("|")}))?\\b`, "i"));
  if (dm && !hasDay) {
    const day = Number(dm[1]);
    const month = dm[2] ? MONTHS.indexOf(dm[2].toLowerCase()) : d.getMonth();
    const cand = new Date(d.getFullYear(), month, day, d.getHours(), d.getMinutes());
    if (cand < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      if (dm[2]) cand.setFullYear(cand.getFullYear() + 1);
      else cand.setMonth(cand.getMonth() + 1);
    }
    d.setTime(cand.getTime());
    hasDay = true;
    s = strip(s, dm[0]);
  }

  // time: "à 14h", "à 14h30", "14:30", "à midi", "à minuit", "7h du matin", "8h du soir"
  const noon = s.match(/\s(?:à\s+)?(midi|minuit)\b/i);
  const tm = s.match(/\s(?:à|a|vers|pour)?\s*(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*(du matin|du soir|de l'après-midi)?/i);
  if (noon) {
    d.setHours(noon[1].toLowerCase() === "midi" ? 12 : 0, 0);
    hasTime = true;
    s = strip(s, noon[0]);
  } else if (tm) {
    let h = Number(tm[1]);
    const m = tm[2] ? Number(tm[2]) : 0;
    if (tm[3] && /soir|après/i.test(tm[3]) && h < 12) h += 12;
    if (h <= 23 && m <= 59) {
      d.setHours(h, m);
      hasTime = true;
      s = strip(s, tm[0]);
    }
  }

  // a bare time that already passed today means tomorrow
  if (hasTime && !hasDay && d < now) d.setDate(d.getDate() + 1);

  return { date: hasDay || hasTime ? d : null, hasTime, hasDay, rest: s.trim() };
}

export function fmtWhen(iso: string, withTime = true) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const day = same(d, today)
    ? "aujourd'hui"
    : same(d, tomorrow)
      ? "demain"
      : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return withTime ? `${day} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : day;
}
