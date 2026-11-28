import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { handle } from "./api/ai.ts";
import { handle as handleEcoleDirecte } from "./api/ecoledirecte.ts";

/** Serves api/ai.ts (the Vercel Function) from Vite's dev and preview servers. */
function aiEndpoint(env: Record<string, string>): Plugin {
  const middleware = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const path = req.url?.split("?")[0];
    const handler = path === "/api/ai" ? handle : path === "/api/ecoledirecte" ? handleEcoleDirecte : null;
    if (!handler) return next();
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const request = new Request(`http://localhost${req.url}`, {
      method: req.method,
      headers: Object.entries(req.headers).flatMap(([k, v]) => (typeof v === "string" ? [[k, v] as [string, string]] : [])),
      body: req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.concat(chunks),
    });
    const response = await handler(request, { ...process.env, ...env });
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    if (!response.body) return res.end();
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value)); // forward each piece as soon as it arrives
    }
    res.end();
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
