/**
 * Litrium AI endpoint: /api/ai
 *   GET  -> { available, provider }
 *   POST -> { text }   body: { system, messages: [{ role: "user" | "assistant", content }] }
 *
 * Runs as a Vercel Function in production and inside Vite's server in
 * development (see vite.config.ts). Self-contained on purpose (no local
 * imports) so it deploys as a single file.
 *
 * Environment (server-side only, never sent to the browser):
 *   GEMINI_API_KEY      Google AI Studio key (preferred provider)
 *   GEMINI_MODEL        optional, default gemini-3.8-flash
 *   ANTHROPIC_API_KEY   optional alternative provider
 *   ANTHROPIC_MODEL     optional, default claude-sonnet-5-5
 *   AI_DAILY_LIMIT      optional, questions per person per day (default 60)
 *   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 *                       when set, only signed-in Litrium users may call the AI
 */

type Env = Record<string, string | undefined>;
type Turn = { role: "user" | "assistant"; content: string };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function provider(env: Env): "gemini" | "anthropic" | null {
  if (env.GEMINI_API_KEY) return "gemini";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

function cleanMessages(raw: unknown): Turn[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Turn[] = [];
  for (const m of raw.slice(-20)) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string" || !m.content.trim()) continue;
    const content = m.content.slice(0, 8000);
    if (out.length === 0 && m.role !== "user") continue; // must start with the user
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += `\n\n${content}`;
    else out.push({ role: m.role, content });
  }
  if (!out.length || out[out.length - 1].role !== "user") return null;
  return out;
}

// Public project values (same as .env.production). On Vercel the gate always
// applies, even if the variables were not copied into the project settings.
const PROD_SUPABASE_URL = "https://gawmvmwooryyulpiuvbe.supabase.co";
const PROD_SUPABASE_KEY = "sb_publishable_AJmlaTDpBqqkdMGeTfFtSA_7X8G_4WR";

/** Only signed-in users, and at most AI_DAILY_LIMIT questions per day each. */
async function gate(request: Request, env: Env): Promise<Response | null> {
  const onVercel = !!env.VERCEL;
  const url = env.VITE_SUPABASE_URL || (onVercel ? PROD_SUPABASE_URL : undefined);
  const anon = env.VITE_SUPABASE_ANON_KEY || (onVercel ? PROD_SUPABASE_KEY : undefined);
  if (!url || !anon) return null; // local development without accounts
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json(401, { error: "unauthenticated", message: "Connectez-vous pour utiliser l'assistant." });
  const headers = { apikey: anon, authorization: `Bearer ${token}`, "content-type": "application/json" };
  const who = await fetch(`${url}/auth/v1/user`, { headers });
  if (!who.ok) return json(401, { error: "unauthenticated", message: "Votre session a expiré. Reconnectez-vous." });
  const limit = Math.max(1, Number(env.AI_DAILY_LIMIT) || 60);
  const bump = await fetch(`${url}/rest/v1/rpc/bump_ai_usage`, { method: "POST", headers, body: JSON.stringify({ p_limit: limit }) });
  if (!bump.ok) {
    const txt = await bump.text();
    if (/ai_limit/.test(txt)) return json(429, { error: "daily_limit", message: `Vous avez atteint la limite de ${limit} questions pour aujourd'hui. Revenez demain !` });
    return json(502, { error: "usage", message: "Impossible de vérifier votre quota. Réessayez dans un instant." });
  }
  return null;
}

async function askGemini(env: Env, system: string | undefined, messages: Turn[]): Promise<Response> {
  const model = env.GEMINI_MODEL || "gemini-3.8-flash";
  const base = (env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const r = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 2048 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (r.status === 400 || r.status === 401 || r.status === 403) {
    const t = await r.text();
    if (r.status === 401 || /API_KEY|api key|permission|credential/i.test(t)) return json(502, { error: "bad_key", message: "La clé Gemini du serveur est refusée." });
    return json(502, { error: "upstream", message: "Gemini n'a pas accepté la demande." });
  }
  if (r.status === 429) return json(429, { error: "rate_limited", message: "L'IA est très sollicitée. Réessayez dans un instant." });
  if (!r.ok) return json(502, { error: "upstream", message: `Gemini n'a pas pu répondre (erreur ${r.status}).` });
  const data = (await r.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) return json(200, { text: "Je ne peux pas répondre à cette demande." });
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
  return json(200, { text: text || "Je n'ai pas de réponse pour le moment, pouvez-vous reformuler ?" });
}

async function askClaude(env: Env, system: string | undefined, messages: Turn[]): Promise<Response> {
  const base = (env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
  const r = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 1200, system, messages }),
    signal: AbortSignal.timeout(60_000),
  });
  if (r.status === 401 || r.status === 403) return json(502, { error: "bad_key", message: "La clé API du serveur est refusée." });
  if (r.status === 429) return json(429, { error: "rate_limited", message: "L'IA est très sollicitée. Réessayez dans un instant." });
  if (!r.ok) return json(502, { error: "upstream", message: `L'IA n'a pas pu répondre (erreur ${r.status}).` });
  const data = (await r.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim();
  return json(200, { text: text || "…" });
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const p = provider(env);
  if (request.method === "GET") return json(200, { available: !!p, provider: p });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!p) return json(503, { error: "not_configured", message: "L'IA n'est pas encore configurée sur ce site." });

  const blocked = await gate(request, env).catch(() => json(502, { error: "auth", message: "Vérification du compte impossible. Réessayez." }));
  if (blocked) return blocked;

  let body: { system?: unknown; messages?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > 200_000) return json(413, { error: "too_large", message: "Conversation trop longue." });
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "bad_request", message: "Requête illisible." });
  }
  const messages = cleanMessages(body.messages);
  if (!messages) return json(400, { error: "bad_request", message: "Conversation vide." });
  const system = typeof body.system === "string" ? body.system.slice(0, 12_000) : undefined;

  try {
    return p === "gemini" ? await askGemini(env, system, messages) : await askClaude(env, system, messages);
  } catch (e) {
    const timeout = (e as Error).name === "TimeoutError";
    return json(504, { error: "network", message: timeout ? "L'IA met trop de temps à répondre." : "Le serveur n'arrive pas à joindre l'IA." });
  }
}

// Vercel Functions entry points
export function GET(request: Request) {
  return handle(request, process.env);
}
export function POST(request: Request) {
  return handle(request, process.env);
}
