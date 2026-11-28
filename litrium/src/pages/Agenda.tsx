import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { deleteEvent, listEvents, saveEvent } from "../data/api";
import type { CalEvent, EventColor } from "../data/types";
import { useAsync, useDataVersion } from "../lib/useAsync";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Overlay";
import { Button, EmptyState, ErrorState, IconButton, SectionHead, Skeleton, TextInput, Tile, Toggle } from "../ui/primitives";
import { useToast } from "../ui/Toast";
import { fmtTime } from "./Home";

const WEEK = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const COLORS: { value: EventColor; label: string }[] = [
  { value: "sky", label: "Bleu" },
  { value: "mint", label: "Menthe" },
  { value: "violet", label: "Violet" },
  { value: "peach", label: "Pêche" },
];

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export default function Agenda() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("jour") ?? ymd(new Date());
  const sel = parseYmd(selected);
  const [month, setMonth] = useState(() => new Date(sel.getFullYear(), sel.getMonth(), 1));
  const [editing, setEditing] = useState<CalEvent | "new" | null>(null);

  // 6-week grid starting on Monday
  const gridStart = useMemo(() => {
    const d = new Date(month);
    d.setDate(1 - ((d.getDay() + 6) % 7));
    return d;
  }, [month]);
  const gridDays = useMemo(() => Array.from({ length: 42 }, (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)), [gridStart]);
  const gridEnd = new Date(gridDays[41]);
  gridEnd.setHours(23, 59, 59, 999);

  const evs = useAsync(() => listEvents(gridStart.toISOString(), gridEnd.toISOString()), [gridStart.getTime()]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of evs.data ?? []) {
      const s = new Date(e.start);
      const end = new Date(e.end);
      for (let d = new Date(s.getFullYear(), s.getMonth(), s.getDate()); d <= end; d.setDate(d.getDate() + 1)) {
        const k = ymd(d);
        m.set(k, [...(m.get(k) ?? []), e]);
      }
    }
    return m;
  }, [evs.data]);

  const pick = (d: Date) => {
    setParams({ jour: ymd(d) }, { replace: true });
    if (d.getMonth() !== month.getMonth()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  };
  const moveMonth = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  const today = ymd(new Date());
  const dayEvents = byDay.get(selected) ?? [];

  const onGridKey = (e: React.KeyboardEvent) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const d = new Date(sel);
    d.setDate(d.getDate() + delta);
    pick(d);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-day="${ymd(d)}"]`)?.focus());
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ textTransform: "capitalize" }}>{month.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</h1>
          <p>Votre agenda, jour après jour.</p>
        </div>
        <div className="page-head__actions">
          <IconButton icon="chevronLeft" label="Mois précédent" onClick={() => moveMonth(-1)} />
          <Button
            onClick={() => {
              const t = new Date();
              setMonth(new Date(t.getFullYear(), t.getMonth(), 1));
              setParams({}, { replace: true });
            }}
          >
            Aujourd'hui
          </Button>
          <IconButton icon="chevronRight" label="Mois suivant" onClick={() => moveMonth(1)} />
          <Button variant="ink" icon="plus" onClick={() => setEditing("new")}>
            Événement
          </Button>
        </div>
      </div>

      <div className="grid-main-side">
        <Tile labelledBy="cal-title">
          <h2 id="cal-title" className="sr-only">
            Calendrier du mois
          </h2>
          {evs.status === "error" && !evs.data ? (
            <ErrorState error={evs.error} onRetry={evs.reload} />
          ) : (
            <div className="cal" role="group" aria-label="Jours du mois" onKeyDown={onGridKey}>
              <div className="cal__head" aria-hidden="true">
                {WEEK.map((w) => (
                  <span key={w}>
                    {w}
                  </span>
                ))}
              </div>
              <div className="cal__body">
                {gridDays.map((d) => {
                  const k = ymd(d);
                  const list = byDay.get(k) ?? [];
                  const out = d.getMonth() !== month.getMonth();
                  return (
                    <button
                      key={k}
                      data-day={k}
                      aria-pressed={k === selected}
                      aria-label={`${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}${list.length ? `, ${list.length} événement${list.length > 1 ? "s" : ""}` : ""}`}
                      tabIndex={k === selected ? 0 : -1}
                      className={`cal__day ${out ? "is-out" : ""} ${k === today ? "is-today" : ""} ${k === selected ? "is-selected" : ""}`}
                      onClick={() => pick(d)}
                    >
                      <span className="cal__num">{d.getDate()}</span>
                      <span className="cal__chips" aria-hidden="true">
                        {list.slice(0, 2).map((e) => (
                          <span key={e.id} className={`cal__chip ev--${e.color}`}>
                            {e.title}
                          </span>
                        ))}
                        {list.length > 2 && <span className="cal__more">+{list.length - 2}</span>}
                      </span>
                      <span className="cal__dots" aria-hidden="true">
                        {list.slice(0, 3).map((e) => (
                          <span key={e.id} className={`cal__dot ev--${e.color}`} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Tile>

        <Tile labelledBy="day-title">
          <SectionHead id="day-title" title={sel.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}>
            <IconButton icon="plus" label="Ajouter un événement ce jour" onClick={() => setEditing("new")} />
          </SectionHead>
          {!evs.data ? (
            <div className="stack-sm">
              <Skeleton h="3.5rem" />
              <Skeleton h="3.5rem" />
            </div>
          ) : dayEvents.length === 0 ? (
            <EmptyState icon="calendar" title="Rien de prévu" action={<Button size="sm" variant="soft" onClick={() => setEditing("new")}>Ajouter un événement</Button>} />
          ) : (
            <ul className="evlist">
              {dayEvents.map((e) => (
                <li key={e.id}>
                  <button className={`evitem evitem--${e.color} evitem--btn`} onClick={() => setEditing(e)}>
                    <span className="evitem__time num">{e.allDay ? "Journée" : `${fmtTime(e.start)}\n${fmtTime(e.end)}`}</span>
                    <span className="evitem__main">
                      <span className="evitem__title">{e.title}</span>
                      {e.location && (
                        <span className="muted evitem__sub">
                          <Icon name="location" /> {e.location}
                        </span>
                      )}
                      {e.note && <span className="muted evitem__sub">{e.note}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Tile>
      </div>

      {editing && <EventModal event={editing === "new" ? null : editing} day={selected} onClose={() => setEditing(null)} />}
    </>
  );
}

function EventModal({ event, day, onClose }: { event: CalEvent | null; day: string; onClose: () => void }) {
  const startD = event ? new Date(event.start) : null;
  const endD = event ? new Date(event.end) : null;
  const [title, setTitle] = useState(event?.title ?? "");
  const [date, setDate] = useState(startD ? ymd(startD) : day);
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [from, setFrom] = useState(startD ? fmtTime(event!.start) : "09:00");
  const [to, setTo] = useState(endD ? fmtTime(event!.end) : "10:00");
  const [location, setLocation] = useState(event?.location ?? "");
  const [note, setNote] = useState(event?.note ?? "");
  const [color, setColor] = useState<EventColor>(event?.color ?? "sky");
  const [errors, setErrors] = useState<{ title?: string; time?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const { bump } = useDataVersion();
  const toast = useToast();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!title.trim()) errs.title = "Donnez un titre à l'événement.";
    const s = parseYmd(date);
    const en = parseYmd(date);
    if (allDay) {
      en.setHours(23, 59, 59, 0);
    } else {
      const [h1, m1] = from.split(":").map(Number);
      const [h2, m2] = to.split(":").map(Number);
      s.setHours(h1, m1);
      en.setHours(h2, m2);
      if (en <= s) errs.time = "L'heure de fin doit être après le début.";
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await saveEvent({ id: event?.id, title, start: s.toISOString(), end: en.toISOString(), allDay, color, location: location.trim() || undefined, note: note.trim() || undefined });
      bump();
      toast(event ? "Événement modifié." : "Événement ajouté.");
      onClose();
    } catch (err) {
      setErrors({ form: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!event) return;
    await deleteEvent(event.id);
    bump();
    toast("Événement supprimé.");
    onClose();
  };

  return (
    <Modal
      title={event ? "Modifier l'événement" : "Nouvel événement"}
      onClose={onClose}
      footer={
        <>
          {event && (
            <Button variant="danger" icon="trash" onClick={remove} className="mr-auto">
              Supprimer
            </Button>
          )}
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="ink" type="submit" form="event-form" loading={busy}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form id="event-form" className="stack" onSubmit={submit} noValidate>
        {errors.form && <p className="form-error">{errors.form}</p>}
        <TextInput label="Titre" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} autoFocus />
        <TextInput label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Toggle checked={allDay} onChange={setAllDay} label="Toute la journée" />
        {!allDay && (
          <div className="grid-2">
            <TextInput label="Début" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
            <TextInput label="Fin" type="time" value={to} onChange={(e) => setTo(e.target.value)} error={errors.time} />
          </div>
        )}
        <TextInput label="Lieu (facultatif)" value={location} onChange={(e) => setLocation(e.target.value)} />
        <TextInput label="Note (facultatif)" value={note} onChange={(e) => setNote(e.target.value)} />
        <fieldset className="days">
          <legend className="field__label">Couleur</legend>
          <div className="days__row">
            {COLORS.map((c) => (
              <label key={c.value} className={`swatch ev--${c.value}`} title={c.label}>
                <input type="radio" name="color" value={c.value} checked={color === c.value} onChange={() => setColor(c.value)} />
                <span className="sr-only">{c.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
