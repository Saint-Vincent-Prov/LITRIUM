import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { getUser, listClocks, listGrades, listSubjects, updateUser } from "../data/api";
import type { DashboardLayout, WidgetId, WidgetSize } from "../data/types";
import { computeAverages, fmtGrade, gradeTone, periodsOf } from "../lib/grades";
import { dateIn, LOCAL_TZ, timeIn, tzCity, useNow } from "../lib/time";
import { useAsync } from "../lib/useAsync";
import { Icon, type IconName } from "../ui/Icon";
import { Modal } from "../ui/Overlay";
import { Button, EmptyState, IconButton, SectionHead, Skeleton, Tile } from "../ui/primitives";
import { useToast } from "../ui/Toast";
import { AlarmTile, AskTile, MessagesTile, NotesTile, RemindersTile, TodayTile, WeatherTile } from "./Home";

interface WidgetDef {
  title: string;
  description: string;
  icon: IconName;
  sizes: WidgetSize[];
  render: () => ReactNode;
}

export const WIDGETS: Record<WidgetId, WidgetDef> = {
  assistant: { title: "Assistant", description: "Poser une question à l'IA", icon: "sparkle", sizes: ["m", "l"], render: () => <AskTile /> },
  weather: { title: "Météo", description: "Le temps qu'il fait là où vous êtes", icon: "sun", sizes: ["s", "m", "l"], render: () => <WeatherTile /> },
  today: { title: "Aujourd'hui", description: "Les événements du jour", icon: "calendar", sizes: ["s", "m", "l"], render: () => <TodayTile /> },
  alarm: { title: "Prochaine alarme", description: "La prochaine alarme qui sonnera", icon: "alarm", sizes: ["s", "m"], render: () => <AlarmTile /> },
  reminders: { title: "Rappels", description: "Vos rappels à faire", icon: "check", sizes: ["s", "m", "l"], render: () => <RemindersTile /> },
  messages: { title: "Messages", description: "Vos dernières conversations", icon: "chat", sizes: ["s", "m", "l"], render: () => <MessagesTile /> },
  notes: { title: "Notes", description: "Vos notes récentes", icon: "note", sizes: ["s", "m", "l"], render: () => <NotesTile /> },
  clock: { title: "Horloges", description: "L'heure ici et dans vos villes", icon: "clock", sizes: ["s", "m"], render: () => <ClockTile /> },
  grades: { title: "Moyennes", description: "Votre moyenne générale et par matière", icon: "grad", sizes: ["s", "m", "l"], render: () => <GradesTile /> },
};

export const DEFAULT_LAYOUT: DashboardLayout = [
  { id: "assistant", size: "l" },
  { id: "weather", size: "m" },
  { id: "today", size: "m" },
  { id: "alarm", size: "s" },
  { id: "reminders", size: "s" },
  { id: "clock", size: "s" },
  { id: "messages", size: "m" },
  { id: "notes", size: "m" },
];

const SIZE_LABEL: Record<WidgetSize, string> = { s: "Petit", m: "Moyen", l: "Large" };

/** Keeps only known widgets, once each, with a size they support. */
export function cleanLayout(raw: unknown): DashboardLayout {
  if (!Array.isArray(raw)) return DEFAULT_LAYOUT;
  const out: DashboardLayout = [];
  for (const w of raw) {
    const def = w && WIDGETS[(w as { id: WidgetId }).id];
    if (!def || out.some((o) => o.id === w.id)) continue;
    const size = def.sizes.includes(w.size) ? (w.size as WidgetSize) : def.sizes[Math.min(1, def.sizes.length - 1)];
    out.push({ id: w.id, size });
  }
  return out;
}

export function Dashboard() {
  const user = useAsync(getUser);
  const toast = useToast();
  const [layout, setLayout] = useState<DashboardLayout | null>(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<WidgetId | null>(null);
  const saveTimer = useRef<number>(undefined);

  useEffect(() => {
    if (user.data && layout === null) setLayout(user.data.dashboard ? cleanLayout(user.data.dashboard) : DEFAULT_LAYOUT);
  }, [user.data, layout]);

  const change = (next: DashboardLayout) => {
    setLayout(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      updateUser({ dashboard: next }).catch(() => toast("Impossible d'enregistrer la disposition. Réessayez."));
    }, 400);
  };

  if (!layout) {
    return (
      <div className="dash">
        {DEFAULT_LAYOUT.slice(0, 5).map((w) => (
          <div key={w.id} className={`widget widget--${w.size}`}>
            <Tile as="div">
              <Skeleton h="8rem" />
            </Tile>
          </div>
        ))}
      </div>
    );
  }

  const move = (id: WidgetId, by: number) => {
    const i = layout.findIndex((w) => w.id === id);
    const j = i + by;
    if (j < 0 || j >= layout.length) return;
    const next = [...layout];
    [next[i], next[j]] = [next[j], next[i]];
    change(next);
  };
  const moveTo = (id: WidgetId, target: WidgetId) => {
    if (id === target) return;
    const next = layout.filter((w) => w.id !== id);
    const at = next.findIndex((w) => w.id === target);
    const from = layout.findIndex((w) => w.id === id);
    const to = layout.findIndex((w) => w.id === target);
    next.splice(from < to ? at + 1 : at, 0, layout[from]);
    change(next);
  };
  const resize = (id: WidgetId, size: WidgetSize) => change(layout.map((w) => (w.id === id ? { ...w, size } : w)));
  const remove = (id: WidgetId) => change(layout.filter((w) => w.id !== id));
  const add = (id: WidgetId) => {
    const def = WIDGETS[id];
    change([...layout, { id, size: def.sizes.includes("m") ? "m" : def.sizes[0] }]);
    toast(`Widget « ${def.title} » ajouté.`);
  };
  const missing = (Object.keys(WIDGETS) as WidgetId[]).filter((id) => !layout.some((w) => w.id === id));

  return (
    <>
      <div className="dash-bar">
        {editing ? (
          <>
            <p className="muted dash-bar__hint">Glissez les widgets pour les déplacer, ou utilisez les flèches.</p>
            <Button variant="soft" icon="plus" onClick={() => setAdding(true)} disabled={!missing.length}>
              Ajouter un widget
            </Button>
            <Button variant="ghost" onClick={() => change(DEFAULT_LAYOUT)}>
              Réinitialiser
            </Button>
            <Button onClick={() => setEditing(false)}>Terminé</Button>
          </>
        ) : (
          <Button variant="ghost" icon="layout" onClick={() => setEditing(true)}>
            Modifier l'accueil
          </Button>
        )}
      </div>

      {layout.length === 0 ? (
        <Tile as="div">
          <EmptyState
            icon="layout"
            title="Votre accueil est vide"
            action={
              <Button icon="plus" onClick={() => setAdding(true)}>
                Ajouter un widget
              </Button>
            }
          >
            Ajoutez les widgets que vous voulez voir ici.
          </EmptyState>
        </Tile>
      ) : (
        <div className={`dash ${editing ? "is-editing" : ""}`}>
          {layout.map((w, i) => {
            const def = WIDGETS[w.id];
            return (
              <div
                key={w.id}
                className={`widget widget--${w.size} ${dragId === w.id ? "is-dragging" : ""}`}
                data-widget={w.id}
                draggable={editing}
                onDragStart={(e) => {
                  setDragId(w.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", w.id);
                }}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => {
                  if (editing && dragId) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId) moveTo(dragId, w.id);
                  setDragId(null);
                }}
              >
                {editing && (
                  <div className="widget__edit" role="group" aria-label={`Widget ${def.title}`}>
                    <span className="widget__name">
                      <Icon name="grip" /> {def.title}
                    </span>
                    <span className="widget__tools">
                      {def.sizes.length > 1 && (
                        <span className="widget__sizes" role="radiogroup" aria-label="Taille">
                          {def.sizes.map((s) => (
                            <button key={s} role="radio" aria-checked={w.size === s} title={SIZE_LABEL[s]} aria-label={SIZE_LABEL[s]} onClick={() => resize(w.id, s)}>
                              {s.toUpperCase()}
                            </button>
                          ))}
                        </span>
                      )}
                      <IconButton icon="arrowUp" label={`Monter ${def.title}`} className="icon-btn--sm" onClick={() => move(w.id, -1)} disabled={i === 0} />
                      <IconButton icon="arrowDown" label={`Descendre ${def.title}`} className="icon-btn--sm" onClick={() => move(w.id, 1)} disabled={i === layout.length - 1} />
                      <IconButton icon="close" label={`Retirer ${def.title}`} className="icon-btn--sm" onClick={() => remove(w.id)} />
                    </span>
                  </div>
                )}
                <div className="widget__body" inert={editing || undefined}>
                  {def.render()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
      <Modal onClose={() => setAdding(false)} title="Ajouter un widget">
        {missing.length === 0 ? (
          <p className="muted">Tous les widgets sont déjà sur votre accueil.</p>
        ) : (
          <ul className="widget-picker">
            {missing.map((id) => (
              <li key={id}>
                <button
                  onClick={() => {
                    add(id);
                    setAdding(false);
                  }}
                >
                  <span className="widget-picker__icon" aria-hidden="true">
                    <Icon name={WIDGETS[id].icon} />
                  </span>
                  <span>
                    <strong>{WIDGETS[id].title}</strong>
                    <span className="muted">{WIDGETS[id].description}</span>
                  </span>
                  <Icon name="plus" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
      )}
    </>
  );
}

/* ---------- widgets that live only on the dashboard ---------- */

function ClockTile() {
  const now = useNow();
  const clocks = useAsync(listClocks);
  return (
    <Tile labelledBy="t-clk">
      <SectionHead id="t-clk" title="Horloges">
        <Link to="/horloge" className="btn btn--ghost btn--sm">
          Tout voir
        </Link>
      </SectionHead>
      <p className="clock-mini__time num">{timeIn(now, LOCAL_TZ)}</p>
      <p className="muted clock-mini__place">{tzCity(LOCAL_TZ)}</p>
      <ul className="clock-mini__list">
        {(clocks.data ?? []).slice(0, 3).map((c) => (
          <li key={c.id}>
            <span>{c.name}</span>
            <span className="num">
              {timeIn(now, c.timezone)}
              {dateIn(now, c.timezone) !== dateIn(now, LOCAL_TZ) && <small className="muted"> {dateIn(now, c.timezone)}</small>}
            </span>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

function GradesTile() {
  const grades = useAsync(listGrades);
  const subjects = useAsync(listSubjects);
  const list = grades.data ?? [];
  const periods = periodsOf(list);
  const period = periods[periods.length - 1] ?? null;
  const avg = computeAverages(list, subjects.data ?? [], period, false);
  return (
    <Tile labelledBy="t-grd">
      <SectionHead id="t-grd" title="Moyennes">
        <Link to="/moyennes" className="btn btn--ghost btn--sm">
          Tout voir
        </Link>
      </SectionHead>
      {grades.status === "loading" ? (
        <Skeleton h="4rem" />
      ) : !list.length ? (
        <p className="muted">
          Aucune note pour l'instant. <Link to="/moyennes">Ajoutez-en ou importez-les depuis École Directe.</Link>
        </p>
      ) : (
        <>
          <p className={`grades-mini__avg num ${gradeTone(avg.general)}`}>
            {fmtGrade(avg.general)}
            <small>/20</small>
          </p>
          <p className="muted grades-mini__period">{period || "Moyenne générale"}</p>
          <ul className="grades-mini__list">
            {avg.rows
              .filter((r) => r.average != null)
              .slice(0, 4)
              .map((r) => (
                <li key={r.name}>
                  <span>{r.name}</span>
                  <span className={`num ${gradeTone(r.average)}`}>{fmtGrade(r.average)}</span>
                </li>
              ))}
          </ul>
        </>
      )}
    </Tile>
  );
}
