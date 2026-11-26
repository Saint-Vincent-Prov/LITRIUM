import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { handle } from "./api/ai.ts";

/** Serves api/ai.ts (the Vercel Function) from Vite's dev and preview servers. */
function aiEndpoint(env: Record<string, string>): Plugin {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url?.split("?")[0] !== "/api/ai") return next();
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const request = new Request(`http://localhost${req.url}`, {
      method: req.method,
      headers: Object.entries(req.headers).flatMap(([k, v]) => (typeof v === "string" ? [[k, v] as [string, string]] : [])),
      body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
    });
    const response = await handle(request, { ...process.env, ...env });
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
  return {
    name: "litrium-ai-endpoint",
    configureServer: (s) => void s.middlewares.use(middleware),
    configurePreviewServer: (s) => void s.middlewares.use(middleware),
  };
}

export default defineConfig(({ mode }) => {
  // "" prefix: also read server-only variables. Only VITE_* ones reach the browser.
  const env = loadEnv(mode, process.cwd(), "");
  return { plugins: [react(), aiEndpoint(env)] };
});
