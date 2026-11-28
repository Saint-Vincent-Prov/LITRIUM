import type { Grade, Subject } from "../data/types";

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const fmtGrade = (n: number | null | undefined, digits = 2) =>
  n == null || Number.isNaN(n) ? "—" : n.toLocaleString("fr-FR", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** Parses "15,5" or "15.5"; returns null for anything else ("Abs", "Disp"…). */
export function parseNumber(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (!v) return null;
  const n = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(n) && String(v).trim() !== "" ? n : null;
}

const counts = (g: Grade, withVirtual: boolean) => !g.excluded && g.coef > 0 && g.outOf > 0 && (withVirtual || !g.virtual);
/** A grade brought back to /20. */
export const on20 = (g: Pick<Grade, "value" | "outOf">) => (g.value / g.outOf) * 20;

export interface SubjectAverage {
  name: string;
  coef: number;
  average: number | null;
  /** Average without virtual grades, to show the difference. */
  realAverage: number | null;
  classAverage: number | null;
  grades: Grade[];
  /** Σ grade/20 × coef and Σ coef of counted grades (for the "needed grade" maths). */
  sum: number;
  weight: number;
}

export function subjectAverage(grades: Grade[], withVirtual: boolean) {
  let sum = 0;
  let weight = 0;
  for (const g of grades) {
    if (!counts(g, withVirtual)) continue;
    sum += on20(g) * g.coef;
    weight += g.coef;
  }
  return { sum, weight, average: weight ? sum / weight : null };
}

export function periodsOf(grades: Grade[]) {
  const seen: string[] = [];
  for (const g of [...grades].sort((a, b) => a.date.localeCompare(b.date))) if (!seen.includes(g.period)) seen.push(g.period);
  return seen;
}

/** Averages by subject and overall, for one period ("" for all periods). */
export function computeAverages(grades: Grade[], subjects: Subject[], period: string | null, withVirtual: boolean) {
  const inPeriod = period == null ? grades : grades.filter((g) => g.period === period);
  const bySubject = new Map<string, Grade[]>();
  for (const g of inPeriod) bySubject.set(g.subject, [...(bySubject.get(g.subject) ?? []), g]);
  const coefOf = (name: string) => subjects.find((s) => s.name === name)?.coef ?? 1;

  const rows: SubjectAverage[] = [...bySubject.entries()]
    .map(([name, list]) => {
      const withV = subjectAverage(list, withVirtual);
      const real = subjectAverage(list, false);
      const cls = list.filter((g) => g.classAverage != null && counts(g, false));
      const clsW = cls.reduce((a, g) => a + g.coef, 0);
      return {
        name,
        coef: coefOf(name),
        average: withV.average,
        realAverage: real.average,
        classAverage: clsW ? cls.reduce((a, g) => a + ((g.classAverage as number) / g.outOf) * 20 * g.coef, 0) / clsW : null,
        grades: [...list].sort((a, b) => b.date.localeCompare(a.date)),
        sum: withV.sum,
        weight: withV.weight,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const general = (key: "average" | "realAverage") => {
    let s = 0;
    let w = 0;
    for (const r of rows) {
      const v = r[key];
      if (v == null || r.coef <= 0) continue;
      s += v * r.coef;
      w += r.coef;
    }
    return w ? s / w : null;
  };
  return { rows, general: general("average"), realGeneral: general("realAverage") };
}

/**
 * The grade (out of `outOf`) needed on one more test of coefficient `coef`
 * to bring a subject to `target`/20. Null when it can't be computed.
 */
export function neededGrade(sum: number, weight: number, target: number, coef: number, outOf = 20) {
  if (coef <= 0) return null;
  const x20 = (target * (weight + coef) - sum) / coef;
  return (x20 / 20) * outOf;
}

export function gradeTone(avg: number | null) {
  if (avg == null) return "";
  if (avg >= 14) return "is-good";
  if (avg >= 10) return "is-mid";
  return "is-low";
}
