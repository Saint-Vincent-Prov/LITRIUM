import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
  { to: "/alarmes", label: "Alarmes", icon: "alarm" },
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
      <nav className="bottomnav" aria-label="Navigation principale">
        {NAV.map((n) => {
          const badge = n.to === "/messages" && unreadCount > 0;
          return (
            <NavLink key={n.to} to={n.to} end={n.end} aria-label={badge ? `${n.label}, ${unreadCount} non lu${unreadCount > 1 ? "s" : ""}` : n.label} title={n.label}>
              <span className="navicon">
                <Icon name={n.icon} />
                {badge && <span className="navicon__dot" aria-hidden="true">{unreadCount > 9 ? "9+" : unreadCount}</span>}
              </span>
              <span className="navlabel">{n.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <Ringer />
    </>
  );
}
