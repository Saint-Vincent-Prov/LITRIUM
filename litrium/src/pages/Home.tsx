import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getUser, listAlarms, listCities, listEvents, listFriends, listNotes, listReminders, setReminderDone, addReminder } from "../data/api";
import type { Alarm } from "../data/types";
import { describe } from "../data/weather";
import { useAsync, useDataVersion } from "../lib/useAsync";
import { useForecast, useMyPosition } from "../lib/useWeather";
import { fmtWhen } from "../lib/when";
import { initials } from "../app/Layout";
import type { WidgetSize } from "../data/types";
import { Dashboard } from "./Dashboard";
import { Icon } from "../ui/Icon";
import { Badge, Button, EmptyState, ErrorState, SectionHead, Skeleton, Tile } from "../ui/primitives";
import { useToast } from "../ui/Toast";
import { WeatherGlyph } from "../ui/WeatherGlyph";

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function nextOccurrence(a: Alarm, from = new Date()): Date | null {
  if (!a.enabled) return null;
  if (a.snoozedUntil && new Date(a.snoozedUntil) > from) return new Date(a.snoozedUntil);
  const [h, m] = a.time.split(":").map(Number);
  for (let i = 0; i < 8; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    d.setHours(h, m, 0, 0);
    if (d <= from) continue;
    if (!a.days.length || a.days.includes(d.getDay())) return d;
  }
  return null;
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function Home() {
  const now = useClock();
  const user = useAsync(getUser);
  const firstName = user.data?.name.split(" ")[0];
  const hour = now.getHours();
  const hello = hour < 5 ? "Bonne nuit" : hour < 18 ? "Bonjour" : "Bonsoir";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{firstName ? `${hello}, ${firstName}` : <Skeleton w="14rem" h="2rem" />}</h1>
          <p style={{ textTransform: "capitalize" }}>
            {now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} ·{" "}
            <span className="num">{now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
          </p>
        </div>
      </div>

      <Dashboard />
    </>
  );
}

export function AskTile({ size = "m" }: { size?: WidgetSize }) {
  const navigate = useNavigate();
  const [ask, setAsk] = useState("");
  const submitAsk = (e: FormEvent) => {
    e.preventDefault();
    if (ask.trim()) navigate(`/assistant?q=${encodeURIComponent(ask.trim())}`);
  };
  return (
    <Tile className="h-ask" as="div">
          <h2 id="t-ask" className="sr-only">
            Assistant
          </h2>
          <form className="ask" onSubmit={submitAsk}>
            <span className="ask__orb" aria-hidden="true">
              <Icon name="sparkle" />
            </span>
            <label htmlFor="home-ask" className="sr-only">
              Demandez quelque chose à l'assistant
            </label>
            <input id="home-ask" className="input" placeholder={size === "s" ? "Demandez…" : "Demandez : « rappelle-moi d'appeler maman ce soir »"} value={ask} onChange={(e) => setAsk(e.target.value)} />
            <Button variant="ink" type="submit" icon="paperPlane" aria-label="Envoyer la demande" />
          </form>
          {size !== "s" && (
          <div className="chips">
            {(size === "l" ? ["Qu'est-ce que j'ai demain ?", "Météo demain", "Réveille-moi à 7h", "Quelle heure est-il à Tokyo ?"] : ["Qu'est-ce que j'ai demain ?", "Météo demain"]).map((s) => (
              <button key={s} className="chip" onClick={() => navigate(`/assistant?q=${encodeURIComponent(s)}`)}>
                {s}
              </button>
            ))}
          </div>
          )}
        </Tile>
  );
}

export function WeatherTile({ size = "m" }: { size?: WidgetSize }) {
  const user = useAsync(getUser);
  const cities = useAsync(listCities);
  const { position, request } = useMyPosition();
  const place =
    position.status === "ready"
      ? { lat: position.lat, lon: position.lon, name: position.name, mine: true }
      : cities.data?.[0]
        ? { ...cities.data[0], mine: false }
        : null;
  const fc = useForecast(place, user.data?.unit ?? "C");
  const unit = user.data?.unit === "F" ? "°F" : "°C";
  const c = fc.data?.current;

  return (
    <Tile className="h-wea weather-hero" labelledBy="t-wea">
      <SectionHead id="t-wea" title="Météo">
        <Link to="/meteo" className="btn btn--ghost btn--sm">
          Détails
        </Link>
      </SectionHead>
      {!place && position.status !== "locating" ? (
        <EmptyState icon="location" title="Où êtes-vous ?" action={<Button size="sm" variant="ink" icon="location" onClick={request}>Utiliser ma position</Button>}>
          Autorisez la localisation ou ajoutez une ville.
        </EmptyState>
      ) : fc.status === "error" ? (
        <ErrorState error={new Error(fc.error)} onRetry={fc.reload} />
      ) : !c ? (
        <div className="stack-sm">
          <Skeleton w="50%" h="3.5rem" />
          <Skeleton w="70%" />
          <Skeleton h="4rem" />
        </div>
      ) : (
        <>
          <div className="weather-now">
            <WeatherGlyph code={c.code} isDay={c.isDay} size={size === "s" ? "2.5rem" : "3.5rem"} />
            <div>
              <p className="weather-now__temp num">
                {Math.round(c.temp)}
                <span>{unit}</span>
              </p>
              <p className="weather-now__label">{describe(c.code).label}</p>
            </div>
          </div>
          <p className="muted row-gap">
            <Icon name="location" /> {place?.name}
            {place && !place.mine && position.status !== "denied" && (
              <button className="linkish" onClick={request}>
                Ma position
              </button>
            )}
          </p>
          {size !== "s" && (
          <ul className="hours" aria-label="Prochaines heures">
            {fc.data!.hourly.slice(1, size === "l" ? 11 : 7).map((h) => (
              <li key={h.time}>
                <span className="muted">{h.time.slice(11, 13)}h</span>
                <WeatherGlyph code={h.code} />
                <span className="num">{Math.round(h.temp)}°</span>
              </li>
            ))}
          </ul>
          )}
          {size === "l" && (
            <ul className="days-mini" aria-label="Prochains jours">
              {fc.data!.daily.slice(1, 6).map((d) => (
                <li key={d.date}>
                  <span className="days-mini__day">{new Date(d.date + "T12:00").toLocaleDateString("fr-FR", { weekday: "short" })}</span>
                  <WeatherGlyph code={d.code} />
                  <span className="num">
                    {Math.round(d.max)}° <span className="muted">{Math.round(d.min)}°</span>
                  </span>
                  {d.rain >= 30 && <span className="days-mini__rain num">{d.rain} %</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Tile>
  );
}

export function TodayTile({ size = "m" }: { size?: WidgetSize }) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  to.setHours(23, 59, 59, 999);
  const all = useAsync(() => listEvents(from.toISOString(), to.toISOString()));
  const now = new Date().toISOString();
  const tomorrowKey = new Date(to).toLocaleDateString("sv-SE");
  const isTomorrow = (iso: string) => new Date(iso).toLocaleDateString("sv-SE") === tomorrowKey;
  const todayList = all.data?.filter((e) => !isTomorrow(e.start));
  const tomorrowList = all.data?.filter((e) => isTomorrow(e.start)) ?? [];
  const evs = { ...all, data: size === "s" ? todayList?.filter((e) => e.end >= now).slice(0, 2) : todayList };
  const renderList = (list: typeof tomorrowList) => (
    <ul className={`evlist ${size === "s" ? "evlist--compact" : ""}`}>
      {list.map((e) => (
        <li key={e.id} className={`evitem evitem--${e.color} ${e.end < now ? "is-past" : ""}`}>
          <span className="evitem__time num">{e.allDay ? "Journée" : fmtTime(e.start)}</span>
          <span className="evitem__main">
            <span className="evitem__title">{e.title}</span>
            {e.location && size !== "s" && <span className="muted evitem__sub">{e.location}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <Tile className="h-agd" labelledBy="t-agd">
      <SectionHead id="t-agd" title={size === "l" ? "Aujourd'hui et demain" : size === "s" ? "À venir" : "Aujourd'hui"}>
        <Link to="/agenda" className="btn btn--ghost btn--sm">
          Agenda
        </Link>
      </SectionHead>
      {all.status === "error" && !all.data ? (
        <ErrorState error={all.error!} onRetry={all.reload} />
      ) : !evs.data ? (
        <div className="stack-sm">
          <Skeleton h="3rem" />
          <Skeleton h="3rem" />
        </div>
      ) : size === "l" ? (
        <div className="split-days">
          <div>
            <p className="split-days__title">Aujourd'hui</p>
            {evs.data.length ? renderList(evs.data) : <p className="muted">Journée libre.</p>}
          </div>
          <div>
            <p className="split-days__title">Demain</p>
            {tomorrowList.length ? renderList(tomorrowList) : <p className="muted">Rien de prévu.</p>}
          </div>
        </div>
      ) : evs.data.length === 0 ? (
        <EmptyState icon="calendar" title={size === "s" ? "Rien à venir" : "Journée libre"}>{size === "s" ? null : "Rien de prévu aujourd'hui."}</EmptyState>
      ) : (
        renderList(evs.data)
      )}
    </Tile>
  );
}

export function AlarmTile({ size = "m" }: { size?: WidgetSize }) {
  const alarms = useAsync(listAlarms);
  const upcoming = (alarms.data ?? [])
    .map((a) => ({ a, at: nextOccurrence(a) }))
    .filter((x) => x.at)
    .sort((x, y) => x.at!.getTime() - y.at!.getTime());
  const next = upcoming[0];
  const others = upcoming.slice(1, size === "l" ? 7 : 3);
  return (
    <Tile className="h-alm" labelledBy="t-alm">
      <SectionHead id="t-alm" title="Prochaine alarme">
        <Link to="/alarmes" className="btn btn--ghost btn--sm">
          Gérer
        </Link>
      </SectionHead>
      {!alarms.data ? (
        <Skeleton h="3rem" w="60%" />
      ) : !next ? (
        <p className="muted">Aucune alarme active.</p>
      ) : (
        <div className={size === "l" ? "alarm-wide" : ""}>
          <div>
            <p className={`big-time num ${size === "s" ? "big-time--sm" : ""}`}>{next.a.time.replace(":", " h ")}</p>
            <p className="muted">{size === "s" ? fmtWhen(next.at!.toISOString(), false) : `${next.a.label} · ${fmtWhen(next.at!.toISOString(), false)}`}</p>
          </div>
          {size !== "s" && others.length > 0 && (
            <ul className="alarm-others">
              {others.map(({ a, at }) => (
                <li key={a.id}>
                  <span className="num">{a.time.replace(":", " h ")}</span>
                  <span className="muted truncate">
                    {a.label} · {fmtWhen(at!.toISOString(), false)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Tile>
  );
}

export function RemindersTile({ size = "m" }: { size?: WidgetSize }) {
  const rs = useAsync(listReminders);
  const { bump } = useDataVersion();
  const toast = useToast();
  const now = new Date().toISOString();
  const allOpen = (rs.data ?? []).filter((r) => !r.done);
  const [draft, setDraft] = useState("");
  const quickAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    try {
      await addReminder(draft.trim());
      setDraft("");
      bump();
    } catch (err) {
      toast((err as Error).message, "negative");
    }
  };
  const open = allOpen.slice(0, size === "s" ? 2 : size === "l" ? 10 : 5);

  const tick = async (id: string) => {
    try {
      await setReminderDone(id, true);
      bump();
    } catch (e) {
      toast((e as Error).message, "negative");
    }
  };

  return (
    <Tile className="h-rem" labelledBy="t-rem">
      <SectionHead id="t-rem" title="Rappels">
        <Link to="/notes?vue=rappels" className="btn btn--ghost btn--sm">
          Tout voir
        </Link>
      </SectionHead>
      {rs.status === "error" && !rs.data ? (
        <ErrorState error={rs.error} onRetry={rs.reload} />
      ) : !rs.data ? (
        <Skeleton h="5rem" />
      ) : open.length === 0 ? (
        <EmptyState icon="check" title="Tout est fait 🎉" />
      ) : (
        <ul className={`checklist ${size === "l" ? "checklist--cols" : ""}`}>
          {open.map((r) => (
            <li key={r.id}>
              <input type="checkbox" id={`h-${r.id}`} onChange={() => tick(r.id)} />
              <label htmlFor={`h-${r.id}`}>
                <span>{r.text}</span>
                {r.due && size !== "s" && (
                  <span className={`checklist__due ${r.due < now ? "is-late" : ""}`}>
                    {r.due < now ? "En retard · " : ""}
                    {fmtWhen(r.due)}
                  </span>
                )}
              </label>
            </li>
          ))}
          {allOpen.length > open.length && <li className="muted more-line">+ {allOpen.length - open.length} autre{allOpen.length - open.length > 1 ? "s" : ""}</li>}
        </ul>
      )}
      {size === "l" && (
        <form className="quick-add" onSubmit={quickAdd}>
          <label htmlFor="h-quick-rem" className="sr-only">
            Nouveau rappel
          </label>
          <input id="h-quick-rem" className="input" placeholder="Nouveau rappel…" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Button variant="ink" type="submit" icon="plus" aria-label="Ajouter le rappel" />
        </form>
      )}
    </Tile>
  );
}

export function MessagesTile({ size = "m" }: { size?: WidgetSize }) {
  const friends = useAsync(listFriends);
  const convs = (friends.data ?? []).filter((f) => f.status === "friend" && f.last).slice(0, size === "s" ? 2 : size === "l" ? 6 : 3);
  const requests = (friends.data ?? []).filter((f) => f.status === "pending_in").length;
  const pals = (friends.data ?? []).filter((f) => f.status === "friend").slice(0, 8);
  return (
    <Tile className="h-msg" labelledBy="t-msg">
      <SectionHead id="t-msg" title="Messages">
        <Link to="/messages" className="btn btn--ghost btn--sm">
          Ouvrir
        </Link>
      </SectionHead>
      {!friends.data ? (
        <Skeleton h="6rem" />
      ) : (
        <>
          {requests > 0 && (
            <Link to="/messages" className="notice">
              <Icon name="userPlus" /> {requests} demande{requests > 1 ? "s" : ""}{size === "s" ? "" : " d'ami en attente"}
            </Link>
          )}
          {convs.length === 0 ? (
            <EmptyState icon="chat" title="Aucune conversation" action={<Link className="btn btn--soft btn--sm" to="/messages">Ajouter un ami</Link>} />
          ) : (
            <ul className={`convlist ${size === "l" ? "convlist--cols" : ""} ${size === "s" ? "convlist--compact" : ""}`}>
              {convs.map((f) => (
                <li key={f.id}>
                  <Link to={`/messages/${f.id}`} className="conv">
                    <span className="avatar avatar--sm" aria-hidden="true">
                      {initials(f.name)}
                    </span>
                    <span className="conv__main">
                      <span className="conv__name">{f.name}</span>
                      {size !== "s" && (
                        <span className="conv__last truncate">
                          {f.last!.from === "me" ? "Vous : " : ""}
                          {f.last!.text}
                        </span>
                      )}
                    </span>
                    {f.unread > 0 && <Badge tone="positive">{f.unread}</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {size === "l" && pals.length > 0 && (
            <div className="pals">
              <p className="split-days__title">Écrire à</p>
              <ul>
                {pals.map((f) => (
                  <li key={f.id}>
                    <Link to={`/messages/${f.id}`} className="pal">
                      <span className="avatar" aria-hidden="true">
                        {initials(f.name)}
                      </span>
                      <span className="truncate">{f.name.split(" ")[0]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Tile>
  );
}

export function NotesTile({ size = "m" }: { size?: WidgetSize }) {
  const notes = useAsync(listNotes);
  const list = (notes.data ?? []).slice(0, size === "l" ? 6 : 3);
  return (
    <Tile className="h-not" labelledBy="t-not">
      <SectionHead id="t-not" title="Notes">
        <Link to="/notes" className="btn btn--ghost btn--sm">
          Toutes
        </Link>
      </SectionHead>
      {!notes.data ? (
        <Skeleton h="6rem" />
      ) : list.length === 0 ? (
        <EmptyState icon="note" title="Aucune note" />
      ) : (
        <ul className={`notes-mini ${size === "l" ? "notes-mini--cards" : ""}`}>
          {list.map((n) => (
            <li key={n.id}>
              <Link to={`/notes?note=${n.id}`}>
                <span className="notes-mini__title">
                  {n.pinned && <Icon name="pin" />}
                  {n.title || "Sans titre"}
                </span>
                {size === "m" && <span className="muted truncate">{n.body.split("\n")[0]}</span>}
                {size === "l" && <span className="muted notes-mini__body">{n.body.slice(0, 160)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
