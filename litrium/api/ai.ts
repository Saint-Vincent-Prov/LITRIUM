/**
 * Litrium AI endpoint: /api/ai
 *   GET  -> { available, provider }
 *   POST -> { text }   body: { system, messages: [{ role: "user" | "assistant", content }] }
 *   POST with { stream: true } -> text/plain, the answer arrives piece by piece
 *
 * Runs as a Vercel Function in production and inside Vite's server in
 * development (see vite.config.ts). Self-contained on purpose (no local
 * imports) so it deploys as a single file.
 *
 * Environment (server-side only, never sent to the browser):
 *   GEMINI_API_KEY      Google AI Studio key (preferred provider)
 *   GEMINI_MODEL        optional, default gemini-3.5-flash-lite (fastest); falls back to
 *                       GEMINI_FALLBACK_MODEL (default gemini-3.8-flash) if it errors or stalls
 *   GEMINI_THINKING     optional thinking level: minimal | low | medium | high (default minimal,
 *                       falls back to low, then to the model default, if the model refuses it)
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
  const limit = Math.max(1, Number(env.AI_DAILY_LIMIT) || 60);
  // one round trip: the database checks the token and counts today's questions
  const bump = await fetch(`${url}/rest/v1/rpc/bump_ai_usage`, {
    method: "POST",
    headers: { apikey: anon, authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ p_limit: limit }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!bump.ok) {
    const txt = await bump.text();
    if (/ai_limit/.test(txt)) return json(429, { error: "daily_limit", message: `Vous avez atteint la limite de ${limit} questions pour aujourd'hui. Revenez demain !` });
    if (bump.status === 401 || /JWT|jwt|not_authenticated/.test(txt)) return json(401, { error: "unauthenticated", message: "Votre session a expiré. Reconnectez-vous." });
    return json(502, { error: "usage", message: "Impossible de vérifier votre quota. Réessayez dans un instant." });
  }
  return null;
}

async function askGemini(env: Env, system: string | undefined, messages: Turn[]): Promise<Response> {
  const r = await geminiFetch(env, "generateContent", system, messages);
  if (!r.ok) return r.headers.get("x-litrium-final") ? r : geminiError(r);
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


/* ---------- streaming ---------- */

const enc = new TextEncoder();

/** Yields the `data:` payloads of a server-sent-events body. */
async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
  if (buf.startsWith("data:")) yield buf.slice(5).trim();
}

/** Turns a generator of text pieces into a streamed plain-text response. */
function textStream(pieces: AsyncGenerator<string>, empty: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let any = false;
      try {
        for await (const t of pieces) {
          if (!t) continue;
          any = true;
          controller.enqueue(enc.encode(t));
        }
        if (!any) controller.enqueue(enc.encode(empty));
      } catch {
        controller.enqueue(enc.encode(any ? "\n\n(La réponse a été interrompue.)" : "L'IA n'a pas pu terminer sa réponse. Réessayez."));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" },
  });
}

function geminiBody(system: string | undefined, messages: Turn[], thinkingLevel: string | null) {
  return JSON.stringify({
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    // Gemini 3 "thinks" before answering; a low level keeps replies fast and stops
    // the thinking from eating the whole output budget.
    generationConfig: { maxOutputTokens: 4096, ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}) },
  });
}

const FIRST_BYTE_MS = 20_000;

/** One Gemini call; gives up if no response headers arrive within FIRST_BYTE_MS. */
async function geminiOnce(env: Env, model: string, method: string, system: string | undefined, messages: Turn[], level: string | null): Promise<Response | "timeout"> {
  const base = (env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FIRST_BYTE_MS);
  try {
    const r = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY! },
      body: geminiBody(system, messages, level),
      signal: ctl.signal,
    });
    clearTimeout(timer);
    return r;
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === "AbortError") return "timeout";
    throw e;
  }
}

/**
 * Calls Gemini: fastest model first, then the fallback model; for each, retries
 * with a gentler thinking setting if the model rejects the requested one.
 */
async function geminiFetch(env: Env, method: string, system: string | undefined, messages: Turn[]): Promise<Response> {
  const models = [...new Set([env.GEMINI_MODEL || "gemini-3.5-flash-lite", env.GEMINI_FALLBACK_MODEL || "gemini-3.8-flash"])];
  const wanted = (env.GEMINI_THINKING || "minimal").toLowerCase();
  const levels = [...new Set([wanted, "low", null])] as (string | null)[];
  let last: Response | "timeout" = "timeout";
  for (const model of models) {
    for (const level of levels) {
      const r = await geminiOnce(env, model, method, system, messages, level);
      last = r;
      if (r === "timeout") {
        console.error(`[ai] ${model} gave no answer within ${FIRST_BYTE_MS} ms`);
        break; // try the next model
      }
      if (r.ok) return r;
      const t = await r.clone().text();
      console.error(`[ai] ${model} (thinking ${level}) -> ${r.status}: ${t.slice(0, 300)}`);
      if (r.status === 400 && /thinking/i.test(t)) continue; // try a gentler thinking level
      if (r.status === 401 || (r.status === 400 && /API_KEY|api key/i.test(t))) return r; // the key itself is wrong: no point trying another model
      break; // 404 model not available, 403, 429 quota, 5xx: try the next model
    }
  }
  if (last === "timeout") {
    const r = json(504, { error: "timeout", message: "Gemini ne répond pas en ce moment. Réessayez dans un instant." });
    r.headers.set("x-litrium-final", "1");
    return r;
  }
  return last;
}

async function geminiError(r: Response): Promise<Response> {
  if (r.status === 400 || r.status === 401 || r.status === 403) {
    const t = await r.text();
    if (r.status === 401 || /API_KEY|api key|permission|credential/i.test(t)) return json(502, { error: "bad_key", message: "La clé Gemini du serveur est refusée." });
    return json(502, { error: "upstream", message: "Gemini n'a pas accepté la demande." });
  }
  if (r.status === 429) {
    const t = await r.text();
    if (/quota|limit: 0|free_tier/i.test(t)) return json(429, { error: "quota", message: "Le quota de la clé Gemini est épuisé (erreur 429). Réessayez plus tard ou activez la facturation dans Google AI Studio." });
    return json(429, { error: "rate_limited", message: "L'IA est très sollicitée. Réessayez dans un instant." });
  }
  if (r.status === 404) return json(502, { error: "model", message: "Le modèle Gemini demandé n'est pas disponible pour cette clé (erreur 404)." });
  const detail = (await r.text().catch(() => "")).match(/"message":\s*"([^"]{0,120})/)?.[1];
  return json(502, { error: "upstream", message: `Gemini n'a pas pu répondre (erreur ${r.status}${detail ? ` : ${detail}` : ""}).` });
}

async function streamGemini(env: Env, system: string | undefined, messages: Turn[]): Promise<Response> {
  const r = await geminiFetch(env, "streamGenerateContent?alt=sse", system, messages);
  if (!r.ok || !r.body) return r.headers.get("x-litrium-final") ? r : geminiError(r);
  async function* pieces() {
    for await (const data of sseData(r.body!)) {
      let chunk: { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]; promptFeedback?: { blockReason?: string } };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      if (chunk.promptFeedback?.blockReason) {
        yield "Je ne peux pas répondre à cette demande.";
        return;
      }
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) if (!part.thought && part.text) yield part.text;
    }
  }
  return textStream(pieces(), "Je n'ai pas de réponse pour le moment, pouvez-vous reformuler ?");
}

async function streamClaude(env: Env, system: string | undefined, messages: Turn[]): Promise<Response> {
  const base = (env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");
  const r = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 1200, system, messages, stream: true }),
    signal: AbortSignal.timeout(90_000),
  });
  if (r.status === 401 || r.status === 403) return json(502, { error: "bad_key", message: "La clé API du serveur est refusée." });
  if (r.status === 429) return json(429, { error: "rate_limited", message: "L'IA est très sollicitée. Réessayez dans un instant." });
  if (!r.ok || !r.body) return json(502, { error: "upstream", message: `L'IA n'a pas pu répondre (erreur ${r.status}).` });
  async function* pieces() {
    for await (const data of sseData(r.body!)) {
      try {
        const e = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } };
        if (e.type === "content_block_delta" && e.delta?.type === "text_delta" && e.delta.text) yield e.delta.text;
      } catch {
        /* keep-alive or partial line */
      }
    }
  }
  return textStream(pieces(), "…");
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const p = provider(env);
  if (request.method === "GET") return json(200, { available: !!p, provider: p });
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!p) return json(503, { error: "not_configured", message: "L'IA n'est pas encore configurée sur ce site." });

  const t0 = Date.now();
  const blocked = await gate(request, env).catch(() => json(502, { error: "auth", message: "Vérification du compte impossible. Réessayez." }));
  if (blocked) return blocked;
  const gateMs = Date.now() - t0;

  let body: { system?: unknown; messages?: unknown; stream?: unknown };
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
    const t1 = Date.now();
    const res =
      body.stream === true
        ? p === "gemini"
          ? await streamGemini(env, system, messages)
          : await streamClaude(env, system, messages)
        : p === "gemini"
          ? await askGemini(env, system, messages)
          : await askClaude(env, system, messages);
    // timings visible in the browser's network panel (no personal data)
    res.headers.set("server-timing", `account;dur=${gateMs}, model;dur=${Date.now() - t1}`);
    return res;
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
