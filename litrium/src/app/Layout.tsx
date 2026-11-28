import { Suspense, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getUser, signOut, unreadTotal } from "../data/api";
import { useAsync } from "../lib/useAsync";
import { Icon, type IconName } from "../ui/Icon";
import { IconButton } from "../ui/primitives";
import { useToast } from "../ui/Toast";
import { Ringer } from "./Ringer";

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/", label: "Accueil", icon: "home", end: true },
  { to: "/meteo", label: "Météo", icon: "sun" },
  { to: "/agenda", label: "Agenda", icon: "calendar" },
  { to: "/horloge", label: "Horloge", icon: "clock" },
  { to: "/assistant", label: "Assistant", icon: "sparkle" },
  { to: "/messages", label: "Messages", icon: "chat" },
  { to: "/notes", label: "Notes", icon: "note" },
];

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function Layout() {
  const user = useAsync(getUser);
  const unread = useAsync(unreadTotal);
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  useEffect(() => setMenu(false), [location.pathname]);

  const ask = (e: FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return navigate("/assistant");
    navigate(`/assistant?q=${encodeURIComponent(q.trim())}`);
    setQ("");
  };

  const doSignOut = async () => {
    try {
      await signOut();
      // no data refresh here: it would let the sign-in guard redirect before this navigation lands
      navigate("/connexion", { replace: true });
    } catch (err) {
      toast((err as Error).message, "negative");
    }
  };

  const unreadCount = unread.data ?? 0;

  // the dark "lens" behind the active tab glides to whichever tab is current
  const navRef = useRef<HTMLElement>(null);
  const [lens, setLens] = useState<{ x: number; w: number } | null>(null);
  const [lensReady, setLensReady] = useState(false);
  const [moving, setMoving] = useState(false);
  const lastX = useRef<number | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const a = nav.querySelector<HTMLElement>('a[aria-current="page"]');
      setLens(a ? { x: a.offsetLeft, w: a.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    nav.querySelectorAll("a").forEach((a) => ro.observe(a));
    return () => ro.disconnect();
  }, [location.pathname]);

  useEffect(() => {
    if (!lens) return;
    if (lastX.current !== null && lastX.current !== lens.x) {
      setMoving(true);
      const t = window.setTimeout(() => setMoving(false), 420);
      lastX.current = lens.x;
      return () => window.clearTimeout(t);
    }
    lastX.current = lens.x;
    // first placement: no slide-in from the left edge
    const r = requestAnimationFrame(() => setLensReady(true));
    return () => cancelAnimationFrame(r);
  }, [lens]);

  return (
    <>
      <a href="#main" className="skip-link">
        Aller au contenu
      </a>
      <div className="app">
        <header className="topbar">
          <Link to="/" className="brand" aria-label="Litrium, accueil">
            <span className="brand__mark" aria-hidden="true" />
            litrium
          </Link>
          {location.pathname !== "/assistant" ? (
            <form className="topbar__search" role="search" onSubmit={ask}>
              <Icon name="sparkle" />
              <label htmlFor="global-ask" className="sr-only">
                Demander à l'assistant
              </label>
              <input id="global-ask" type="text" autoComplete="off" placeholder="Demander à l'assistant…" value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
          ) : (
            <span className="topbar__spacer" />
          )}
          <div className="topbar__right">
            <IconButton icon="settings" label="Réglages" onClick={() => navigate("/parametres")} />
            <div className="menu" ref={menuRef}>
              <button className="avatar" aria-haspopup="menu" aria-expanded={menu} aria-label="Mon compte" onClick={() => setMenu((m) => !m)}>
                {user.data ? initials(user.data.name) : ""}
              </button>
              {menu && (
                <div className="menu__panel" role="menu">
                  <div className="menu__who">
                    <p className="truncate" style={{ fontWeight: "var(--fw-semibold)" }}>
                      {user.data?.name}
                    </p>
                    <p className="muted truncate" style={{ fontSize: "var(--fs-sm)" }}>
                      {user.data?.email}
                    </p>
                  </div>
                  <Link className="menu__item" role="menuitem" to="/parametres">
                    <Icon name="settings" /> Réglages
                  </Link>
                  <button className="menu__item" role="menuitem" onClick={doSignOut}>
                    <Icon name="logout" /> Se déconnecter
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <Suspense fallback={<div className="page-loading" aria-busy="true" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <nav className={`bottomnav ${lensReady ? "has-lens" : ""}`} aria-label="Navigation principale" ref={navRef}>
        <span
          className={`bottomnav__lens ${lens ? "" : "is-hidden"} ${moving ? "is-moving" : ""}`}
          style={lens ? { transform: `translateX(${lens.x}px)`, width: lens.w } : undefined}
          aria-hidden="true"
        >
          <span className="bottomnav__lens-body" />
        </span>
        {NAV.map((n) => {
          const badge = n.to === "/messages" && unreadCount > 0;
          const path = location.pathname;
          // the Horloge tab also covers the alarms page
          const active = n.end ? path === n.to : path === n.to || path.startsWith(n.to + "/") || (n.to === "/horloge" && path.startsWith("/alarmes"));
          return (
            <Link
              key={n.to}
              to={n.to}
              aria-current={active ? "page" : undefined}
              aria-label={badge ? `${n.label}, ${unreadCount} non lu${unreadCount > 1 ? "s" : ""}` : n.label}
              title={n.label}
            >
              <span className="navicon">
                <Icon name={n.icon} />
                {badge && (
                  <span className="navicon__dot" aria-hidden="true">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
              <span className="navlabel">{n.label}</span>
            </Link>
          );
        })}
      </nav>
      <Ringer />
    </>
  );
}
