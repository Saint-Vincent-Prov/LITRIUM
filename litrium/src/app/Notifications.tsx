import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getUser, listEvents, listFriends, subscribe } from "../data/api";
import { clearNotifications, markAllRead, markRead, notify, setNotificationOwner, timeAgo, useNotifications, type NotifKind } from "../lib/notifications";
import { Icon, type IconName } from "../ui/Icon";

const KIND_ICON: Record<NotifKind, IconName> = {
  message: "chat",
  friend: "userPlus",
  reminder: "check",
  alarm: "alarm",
  event: "calendar",
  grades: "grad",
  system: "sparkle",
};

/** Bell in the top bar with the list of notifications. */
export function NotificationBell() {
  const { items, unread } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        className="icon-btn bell"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} non lue${unread > 1 ? "s" : ""}` : "Notifications"}
        title="Notifications"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" />
        {unread > 0 && (
          <span className="navicon__dot bell__dot" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="menu__panel notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel__head">
            <p className="section-head__title">Notifications</p>
            {items.length > 0 && (
              <span className="notif-panel__actions">
                {unread > 0 && (
                  <button className="linkish" onClick={markAllRead}>
                    Tout lire
                  </button>
                )}
                <button className="linkish" onClick={clearNotifications}>
                  Effacer
                </button>
              </span>
            )}
          </div>
          {items.length === 0 ? (
            <p className="muted notif-panel__empty">Rien de nouveau pour le moment.</p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    className={`notif ${n.read ? "" : "is-unread"}`}
                    onClick={() => {
                      markRead(n.id);
                      setOpen(false);
                      if (n.link) navigate(n.link);
                    }}
                  >
                    <span className={`notif__icon notif__icon--${n.kind}`} aria-hidden="true">
                      <Icon name={KIND_ICON[n.kind]} />
                    </span>
                    <span className="notif__main">
                      <span className="notif__title">{n.title}</span>
                      {n.body && <span className="notif__body">{n.body}</span>}
                      <span className="notif__time">{timeAgo(n.at)}</span>
                    </span>
                    {!n.read && <span className="notif__dot" aria-label="non lue" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Watches the account for things worth a notification: new messages, friend
 * requests and events about to start. Alarms, reminders and grades notify
 * from where they happen.
 */
export function NotificationWatcher() {
  const busy = useRef(false);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const user = await getUser();
        if (!alive) return;
        setNotificationOwner(user.id);
        const friends = await listFriends();
        for (const f of friends) {
          if (f.status === "pending_in") {
            notify({ kind: "friend", title: `${f.name} veut être votre ami·e`, body: f.email, link: "/messages" }, `friend:${f.id}`);
          }
          const viewing = window.location.pathname === `/messages/${f.id}`;
          if (f.last && f.last.from === "them" && !f.last.read && !viewing) {
            notify({ kind: "message", title: `Nouveau message de ${f.name.split(" ")[0]}`, body: f.last.text.slice(0, 120), link: `/messages/${f.id}` }, `msg:${f.last.id}`);
          }
        }
        const now = Date.now();
        const soon = await listEvents(new Date(now).toISOString(), new Date(now + 20 * 60_000).toISOString());
        for (const e of soon) {
          const starts = new Date(e.start).getTime();
          if (!e.allDay && starts > now && starts - now <= 15 * 60_000) {
            const mins = Math.max(1, Math.round((starts - now) / 60_000));
            notify(
              { kind: "event", title: `${e.title} dans ${mins} min`, body: e.location, link: `/agenda?jour=${e.start.slice(0, 10)}` },
              `event:${e.id}:${e.start}`,
            );
          }
        }
      } catch {
        /* signed out or offline: try again later */
      } finally {
        busy.current = false;
      }
    };
    check();
    const t = window.setInterval(check, 30_000);
    const off = subscribe(() => {
      check();
    });
    return () => {
      alive = false;
      window.clearInterval(t);
      off();
    };
  }, []);
  return null;
}
