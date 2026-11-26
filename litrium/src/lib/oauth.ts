/**
 * Local mode only: Google sign-in in the browser. Online, Google goes through
 * Supabase Auth instead (startOAuth in api.remote.ts).
 *
 * - Google: Google Identity Services. Needs VITE_GOOGLE_CLIENT_ID (free, from
 *   console.cloud.google.com) with your site's address as an authorised origin.
 * Without those values the buttons run in a labelled demo mode.
 *
 * Security: the ID token is only decoded here, not verified. A real backend
 * must verify the token's signature before trusting it (see /replica-backend).
 */

export interface ProviderProfile {
  sub: string;
  email: string;
  name: string;
}

const env = import.meta.env;
export const GOOGLE_CLIENT_ID: string | undefined = env.VITE_GOOGLE_CLIENT_ID || undefined;

export const googleReady = !!GOOGLE_CLIENT_ID;

const loaded = new Map<string, Promise<void>>();
function loadScript(src: string) {
  if (!loaded.has(src)) {
    loaded.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
          loaded.delete(src);
          reject(new Error("Impossible de charger le service de connexion. Vérifiez votre connexion internet."));
        };
        document.head.appendChild(s);
      }),
    );
  }
  return loaded.get(src)!;
}

function decodeJwt(token: string): Record<string, unknown> {
  const part = token.split(".")[1] ?? "";
  const json = decodeURIComponent(
    atob(part.replace(/-/g, "+").replace(/_/g, "/"))
      .split("")
      .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join(""),
  );
  return JSON.parse(json);
}

/* ---------- Google ---------- */

type GoogleId = {
  accounts: {
    id: {
      initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }) => void;
      renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
    };
  };
};

/** Renders Google's own button into `el`. Calls `onProfile` after the person picks an account. */
export async function mountGoogleButton(el: HTMLElement, onProfile: (p: ProviderProfile) => void, width: number) {
  await loadScript("https://accounts.google.com/gsi/client");
  const google = (window as unknown as { google: GoogleId }).google;
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID!,
    callback: (r) => {
      const p = decodeJwt(r.credential);
      onProfile({ sub: String(p.sub), email: String(p.email ?? ""), name: String(p.name ?? "") });
    },
  });
  google.accounts.id.renderButton(el, { theme: "outline", size: "large", shape: "pill", text: "continue_with", locale: "fr", width });
}
