import { useEffect, useState } from "react";

/** Current time, refreshed every second (or every `everyMs`). */
export function useNow(everyMs = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // align ticks on the second so all clocks change together
    let t: number;
    const tick = () => {
      setNow(new Date());
      t = window.setTimeout(tick, everyMs - (Date.now() % everyMs));
    };
    t = window.setTimeout(tick, everyMs - (Date.now() % everyMs));
    return () => window.clearTimeout(t);
  }, [everyMs]);
  return now;
}

export const LOCAL_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const partsCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    partsCache.set(tz, f);
  }
  return f;
}

/** Wall-clock fields of `date` in time zone `tz`. */
export function zoned(date: Date, tz: string) {
  const p = Object.fromEntries(fmt(tz).formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Offset of `tz` from UTC at `date`, in minutes. */
export function utcOffset(date: Date, tz: string) {
  const z = zoned(date, tz);
  return Math.round((Date.UTC(z.y, z.mo - 1, z.d, z.h, z.mi, z.s) - date.getTime()) / 60_000);
}

/** "+8 h", "−5 h 30", "même heure" relative to my time zone. */
export function diffLabel(date: Date, tz: string, from = LOCAL_TZ) {
  const m = utcOffset(date, tz) - utcOffset(date, from);
  if (m === 0) return "même heure";
  const sign = m > 0 ? "+" : "−";
  const a = Math.abs(m);
  const h = Math.floor(a / 60);
  const r = a % 60;
  return `${sign}${h} h${r ? ` ${String(r).padStart(2, "0")}` : ""}`;
}

/** "Aujourd'hui", "Demain", "Hier" compared with my calendar day. */
export function dayLabel(date: Date, tz: string, from = LOCAL_TZ) {
  const a = zoned(date, tz);
  const b = zoned(date, from);
  const da = Date.UTC(a.y, a.mo - 1, a.d);
  const db = Date.UTC(b.y, b.mo - 1, b.d);
  return da > db ? "Demain" : da < db ? "Hier" : "Aujourd'hui";
}

export function timeIn(date: Date, tz: string, seconds = false) {
  return date.toLocaleTimeString("fr-FR", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: seconds ? "2-digit" : undefined });
}

export function dateIn(date: Date, tz: string) {
  return date.toLocaleDateString("fr-FR", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
}

export function isNight(date: Date, tz: string) {
  const h = zoned(date, tz).h;
  return h < 7 || h >= 20;
}

/** "Europe/Paris" -> "Paris", "America/Argentina/Buenos_Aires" -> "Buenos Aires" */
export function tzCity(tz: string) {
  return (tz.split("/").pop() ?? tz).replace(/_/g, " ");
}

/** Readable zone name, e.g. "heure normale d'Europe centrale". */
export function tzLongName(date: Date, tz: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", { timeZone: tz, timeZoneName: "long" }).formatToParts(date).find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

export function isValidTz(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
