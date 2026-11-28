/**
 * École Directe grade import.
 *
 * Stateless: the browser sends the identifiers for one import, this function
 * signs in to École Directe, answers the security question when asked, reads
 * the grades and returns them. Identifiers are never stored or logged.
 *
 * Steps (POST JSON):
 *   { step: "login",  identifiant, motdepasse }
 *   { step: "answer", identifiant, motdepasse, session, choice }
 * Replies:
 *   { status: "ok", students: [{ id, name, grades, subjects }] }
 *   { status: "question", question, choices: [{ label, value }], session }
 *   { error, message } with a 4xx/5xx status
 *
 * École Directe has no public API; this follows the calls its own website
 * makes and may need an update if they change it.
 */

type Env = Record<string, string | undefined>;

const PROD_SUPABASE_URL = "https://gawmvmwooryyulpiuvbe.supabase.co";
const PROD_SUPABASE_KEY = "sb_publishable_AJmlaTDpBqqkdMGeTfFtSA_7X8G_4WR";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

class EdError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/* ---------- one École Directe session (cookies + tokens) ---------- */

interface SessionState {
  cookies: Record<string, string>;
  gtk?: string;
  token?: string;
  faToken?: string;
}

class Ed {
  s: SessionState;
  private base: string;
  private version: string;
  constructor(base: string, version: string, state?: SessionState) {
    this.base = base;
    this.version = version;
    this.s = state ?? { cookies: {} };
  }

  private headers(includeGtk: boolean) {
    const h: Record<string, string> = {
      "user-agent": UA,
      accept: "application/json, text/plain, */*",
      "accept-language": "fr-FR,fr;q=0.9",
      origin: "https://www.ecoledirecte.com",
      referer: "https://www.ecoledirecte.com/",
    };
    const cookie = Object.entries(this.s.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    if (cookie) h.cookie = cookie;
    const gtk = this.s.gtk ?? this.s.cookies.GTK;
    if (includeGtk && gtk) h["x-gtk"] = gtk;
    if (this.s.token) h["x-token"] = this.s.token;
    if (this.s.faToken) h["2fa-token"] = this.s.faToken;
    return h;
  }

  private capture(r: Response) {
    const setCookies = (r.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    for (const c of setCookies) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      if (i > 0) this.s.cookies[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
    }
    const gtk = r.headers.get("x-gtk");
    if (gtk) this.s.gtk = gtk;
    const token = r.headers.get("x-token");
    if (token) this.s.token = token;
    const fa = r.headers.get("2fa-token");
    if (fa) this.s.faToken = fa;
  }

  private url(path: string) {
    return `${this.base}/${path}${path.includes("?") ? "&" : "?"}v=${this.version}`;
  }

  async refreshGtk() {
    delete this.s.gtk;
    delete this.s.cookies.GTK;
    const r = await fetch(this.url("login.awp?gtk=1"), { headers: this.headers(false), signal: AbortSignal.timeout(12_000) });
    this.capture(r);
    await r.arrayBuffer().catch(() => undefined);
  }

  async post(path: string, data: unknown, includeGtk = true) {
    const r = await fetch(this.url(path), {
      method: "POST",
      headers: { ...this.headers(includeGtk), "content-type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(JSON.stringify(data))}`,
      signal: AbortSignal.timeout(15_000),
    });
    this.capture(r);
    const text = await r.text();
    let body: { code?: number; message?: string; token?: string; data?: any } = {};
    try {
      body = JSON.parse(text);
    } catch {
      throw new EdError(502, "ed_unreachable", "École Directe a répondu de façon inattendue. Réessayez dans un instant.");
    }
    if (body.token) this.s.token = body.token;
    return body;
  }
}

/* ---------- helpers ---------- */

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const b64 = (s: string) => {
  try {
    return Buffer.from(s, "base64").toString("utf8");
  } catch {
    return s;
  }
};
const packSession = (s: SessionState) => Buffer.from(JSON.stringify(s)).toString("base64url");
const unpackSession = (v: unknown): SessionState => {
  try {
    const s = JSON.parse(Buffer.from(String(v), "base64url").toString("utf8"));
    if (s && typeof s === "object" && s.cookies) return s;
  } catch {
    /* fall through */
  }
  throw new EdError(400, "bad_session", "La vérification a expiré. Recommencez la connexion.");
};

function loginError(code: number | undefined, message?: string): EdError {
  if (code === 505) return new EdError(401, "bad_credentials", "Identifiant ou mot de passe École Directe incorrect.");
  if (code === 516 || code === 535) return new EdError(423, "locked", "École Directe a bloqué la connexion (trop d'essais ou compte à activer). Connectez-vous une fois sur le site d'École Directe, puis réessayez.");
  if (code === 517) return new EdError(502, "outdated", "École Directe a changé son site : l'import doit être mis à jour.");
  if (code === 520 || code === 521 || code === 525) return new EdError(401, "expired", "La session École Directe a expiré. Recommencez.");
  return new EdError(502, "ed_error", message ? `École Directe : ${message}` : "École Directe a refusé la connexion. Réessayez plus tard.");
}

interface EdStudent {
  id: number;
  name: string;
}

function studentsOf(data: any): EdStudent[] {
  const accounts: any[] = Array.isArray(data?.accounts) ? data.accounts : [];
  const out: EdStudent[] = [];
  for (const a of accounts) {
    if (a.typeCompte === "E") out.push({ id: a.id, name: `${a.prenom ?? ""} ${a.nom ?? ""}`.trim() || "Élève" });
    for (const e of a.profile?.eleves ?? []) out.push({ id: e.id, name: `${e.prenom ?? ""} ${e.nom ?? ""}`.trim() || "Élève" });
  }
  return out.filter((s, i) => typeof s.id === "number" && out.findIndex((o) => o.id === s.id) === i);
}

/** Turns École Directe's grade payload into Litrium's import format. */
export function mapGrades(data: any) {
  const periods: any[] = Array.isArray(data?.periodes) ? data.periodes : [];
  const periodName = new Map<string, string>();
  for (const p of periods) if (p?.codePeriode) periodName.set(p.codePeriode, String(p.periode ?? p.codePeriode));
  const subjectName = new Map<string, string>();
  const subjects: { name: string; coef: number }[] = [];
  const firstTerm = periods.find((p) => !p?.annuel && p?.ensembleMatieres?.disciplines?.length) ?? periods.find((p) => p?.ensembleMatieres?.disciplines?.length);
  for (const d of firstTerm?.ensembleMatieres?.disciplines ?? []) {
    if (d?.groupeMatiere || !d?.discipline) continue;
    const name = String(d.discipline).trim();
    if (d.codeMatiere) subjectName.set(d.codeMatiere, name);
    if (!subjects.some((s) => s.name === name)) subjects.push({ name, coef: num(d.coef) ?? 1 });
  }
  if (subjects.length && subjects.every((s) => s.coef === 0)) subjects.forEach((s) => (s.coef = 1));

  const grades = [];
  for (const n of Array.isArray(data?.notes) ? data.notes : []) {
    const value = num(n?.valeur);
    const outOf = num(n?.noteSur) ?? 20;
    if (value == null || outOf <= 0 || value < 0 || value > outOf) continue; // "Abs", "Disp", "NE"…
    const subject = (n.codeMatiere && subjectName.get(n.codeMatiere)) || String(n.libelleMatiere ?? "Autre").trim();
    const coef = num(n.coef);
    const cls = num(n.moyenneClasse);
    grades.push({
      externalId: String(n.id),
      subject,
      period: periodName.get(n.codePeriode) ?? String(n.codePeriode ?? ""),
      title: String(n.devoir ?? "").trim().slice(0, 300),
      value,
      outOf,
      coef: coef == null ? 1 : coef,
      date: /^\d{4}-\d{2}-\d{2}/.test(n.date ?? "") ? String(n.date).slice(0, 10) : new Date().toISOString().slice(0, 10),
      excluded: n.nonSignificatif === true || undefined,
      classAverage: cls != null && cls <= outOf ? cls : undefined,
    });
    if (!subjects.some((s) => s.name === subject)) subjects.push({ name: subject, coef: 1 });
  }
  return { grades, subjects };
}

async function readAll(ed: Ed, students: EdStudent[]) {
  if (!students.length) throw new EdError(422, "no_student", "Ce compte École Directe n'a aucun élève associé.");
  const out = [];
  for (const st of students.slice(0, 6)) {
    const r = await ed.post(`eleves/${st.id}/notes.awp?verbe=get`, { anneeScolaire: "" });
    if (r.code !== 200) throw loginError(r.code, r.message);
    out.push({ id: st.id, name: st.name, ...mapGrades(r.data) });
  }
  return { status: "ok", students: out };
}

async function askQuestion(ed: Ed) {
  const q = await ed.post("connexion/doubleauth.awp?verbe=get", {}, false);
  if (q.code !== 200 || !q.data?.question) throw loginError(q.code, q.message);
  const choices = (q.data.propositions ?? []).map((p: string) => ({ label: b64(p), value: p }));
  return { status: "question", question: b64(q.data.question), choices, session: packSession(ed.s) };
}

async function login(ed: Ed, identifiant: string, motdepasse: string, fa?: { cn: string; cv: string }) {
  await ed.refreshGtk();
  const payload: Record<string, unknown> = { identifiant, motdepasse, isReLogin: false, uuid: "", fa: [] };
  if (fa) Object.assign(payload, { cn: fa.cn, cv: fa.cv, fa: [{ cn: fa.cn, cv: fa.cv, uniq: false }] });
  const r = await ed.post("login.awp", payload);
  if (r.code === 200) return readAll(ed, studentsOf(r.data));
  if (r.code === 250) return askQuestion(ed);
  throw loginError(r.code, r.message);
}

/* ---------- account check (same as the assistant) ---------- */

async function gate(request: Request, env: Env): Promise<Response | null> {
  const onVercel = !!env.VERCEL;
  const url = env.VITE_SUPABASE_URL || (onVercel ? PROD_SUPABASE_URL : undefined);
  const anon = env.VITE_SUPABASE_ANON_KEY || (onVercel ? PROD_SUPABASE_KEY : undefined);
  if (!url || !anon) return null; // local development without accounts
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "unauthenticated", message: "Connectez-vous à Litrium pour importer vos notes." });
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) }).catch(() => null);
  if (!r) return json(502, { error: "account", message: "Impossible de vérifier votre compte. Réessayez." });
  if (!r.ok) return json(401, { error: "unauthenticated", message: "Votre session a expiré. Reconnectez-vous." });
  return null;
}

export async function handle(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET") return json(200, { ok: true });
  if (request.method !== "POST") return json(405, { error: "method" });
  const denied = await gate(request, env);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "bad_request", message: "Requête invalide." });
  }
  const identifiant = typeof body.identifiant === "string" ? body.identifiant.trim() : "";
  const motdepasse = typeof body.motdepasse === "string" ? body.motdepasse : "";
  if (!identifiant || !motdepasse || identifiant.length > 200 || motdepasse.length > 200) {
    return json(400, { error: "missing", message: "Entrez votre identifiant et votre mot de passe École Directe." });
  }
  const base = (env.ECOLEDIRECTE_BASE_URL || "https://api.ecoledirecte.com/v3").replace(/\/$/, "");
  const version = env.ECOLEDIRECTE_VERSION || "4.101.4";

  try {
    if (body.step === "answer") {
      if (typeof body.choice !== "string" || !body.choice) return json(400, { error: "missing", message: "Choisissez une réponse." });
      const ed = new Ed(base, version, unpackSession(body.session));
      const a = await ed.post("connexion/doubleauth.awp?verbe=post", { choix: body.choice }, false);
      if (a.code !== 200 || !a.data?.cn || !a.data?.cv) {
        return json(401, { error: "wrong_answer", message: "Mauvaise réponse à la question de sécurité. Recommencez la connexion." });
      }
      return json(200, await login(ed, identifiant, motdepasse, { cn: a.data.cn, cv: a.data.cv }));
    }
    return json(200, await login(new Ed(base, version), identifiant, motdepasse));
  } catch (e) {
    if (e instanceof EdError) return json(e.status, { error: e.code, message: e.message });
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return json(504, {
      error: timeout ? "timeout" : "ed_unreachable",
      message: timeout ? "École Directe met trop de temps à répondre. Réessayez." : "Impossible de joindre École Directe. Réessayez plus tard.",
    });
  }
}

export function GET(request: Request) {
  return handle(request, process.env);
}
export function POST(request: Request) {
  return handle(request, process.env);
}
