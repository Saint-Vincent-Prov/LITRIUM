import { useEffect, useRef, useState, type FormEvent } from "react";
import { deleteAlarm, listAlarms, saveAlarm, setAlarmEnabled } from "../data/api";
import type { Alarm } from "../data/types";
import { useAsync, useDataVersion } from "../lib/useAsync";
import { fmtWhen } from "../lib/when";
import { startChime } from "../app/Ringer";
import { Icon } from "../ui/Icon";
import { Modal } from "../ui/Overlay";
import { Button, EmptyState, ErrorState, IconButton, Skeleton, TextInput, Tile, Toggle } from "../ui/primitives";
import { useToast } from "../ui/Toast";
import { nextOccurrence } from "./Home";

const DAYS = [
  { d: 1, short: "L", long: "lundi" },
  { d: 2, short: "M", long: "mardi" },
  { d: 3, short: "M", long: "mercredi" },
  { d: 4, short: "J", long: "jeudi" },
  { d: 5, short: "V", long: "vendredi" },
  { d: 6, short: "S", long: "samedi" },
  { d: 0, short: "D", long: "dimanche" },
];

export function repeatLabel(days: number[]) {
  if (!days.length) return "Une seule fois";
  if (days.length === 7) return "Tous les jours";
  const s = [...days].sort().join();
  if (s === "1,2,3,4,5") return "En semaine";
  if (s === "0,6") return "Le week-end";
  return DAYS.filter((x) => days.includes(x.d))
    .map((x) => x.long.slice(0, 3) + ".")
    .join(" ");
}

export default function Alarms() {
  const alarms = useAsync(listAlarms);
  const [editing, setEditing] = useState<Alarm | "new" | null>(null);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Alarmes</h1>
          <p>Elles sonnent tant qu'Litrium est ouvert dans un onglet.</p>
        </div>
        <div className="page-head__actions">
          <Button variant="ink" icon="plus" onClick={() => setEditing("new")}>
            Nouvelle alarme
          </Button>
        </div>
      </div>

      {alarms.status === "error" && !alarms.data ? (
        <Tile>
          <ErrorState error={alarms.error} onRetry={alarms.reload} />
        </Tile>
      ) : !alarms.data ? (
        <div className="grid-3">
          <Skeleton h="9rem" r="var(--r-xl)" />
          <Skeleton h="9rem" r="var(--r-xl)" />
        </div>
      ) : alarms.data.length === 0 ? (
        <Tile>
          <EmptyState icon="alarm" title="Aucune alarme" action={<Button variant="ink" onClick={() => setEditing("new")}>Créer une alarme</Button>}>
            Programmez votre réveil ou un minuteur pour plus tard.
          </EmptyState>
        </Tile>
      ) : (
        <div className="grid-3">
          {alarms.data.map((a) => (
            <AlarmCard key={a.id} alarm={a} onEdit={() => setEditing(a)} />
          ))}
        </div>
      )}

      {editing && <AlarmModal alarm={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function AlarmCard({ alarm, onEdit }: { alarm: Alarm; onEdit: () => void }) {
  const { bump } = useDataVersion();
  const toast = useToast();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const on = optimistic ?? alarm.enabled;
  useEffect(() => setOptimistic(null), [alarm.enabled]);
  const next = nextOccurrence({ ...alarm, enabled: on });

  const toggle = async (v: boolean) => {
    setOptimistic(v);
    try {
      await setAlarmEnabled(alarm.id, v);
      bump();
      if (v) {
        const n = nextOccurrence({ ...alarm, enabled: true });
        if (n) toast(`Alarme réglée pour ${fmtWhen(n.toISOString())}.`);
      }
    } catch (e) {
      setOptimistic(null);
      toast((e as Error).message, "negative");
    }
  };

  return (
    <Tile className={`alarm ${on ? "" : "alarm--off"}`} labelledBy={`al-${alarm.id}`}>
      <div className="row-between">
        <p className="big-time num" id={`al-${alarm.id}`}>
          <span className="sr-only">Alarme de </span>
          {alarm.time.replace(":", " h ")}
        </p>
        <IconButton icon="edit" label={`Modifier l'alarme ${alarm.label}`} onClick={onEdit} />
      </div>
      <div>
        <p className="alarm__label" style={{ overflowWrap: "anywhere" }}>
          {alarm.label}
        </p>
        <p className="muted" style={{ fontSize: "var(--fs-sm)" }}>
          {repeatLabel(alarm.days)}
          {on && next ? ` · ${fmtWhen(next.toISOString(), false)}` : ""}
          {alarm.snoozedUntil && on ? " · répétition en cours" : ""}
        </p>
      </div>
      <Toggle checked={on} onChange={toggle} label={on ? "Activée" : "Désactivée"} />
    </Tile>
  );
}

function AlarmModal({ alarm, onClose }: { alarm: Alarm | null; onClose: () => void }) {
  const [time, setTime] = useState(alarm?.time ?? "07:00");
  const [label, setLabel] = useState(alarm?.label ?? "");
  const [days, setDays] = useState<number[]>(alarm?.days ?? [1, 2, 3, 4, 5]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const stop = useRef<(() => void) | null>(null);
  const { bump } = useDataVersion();
  const toast = useToast();

  useEffect(() => () => stop.current?.(), []);

  const toggleDay = (d: number) => setDays((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await saveAlarm({ id: alarm?.id, time, label, days, enabled: true });
      bump();
      const n = nextOccurrence(saved);
      toast(n ? `Alarme réglée pour ${fmtWhen(n.toISOString())}.` : "Alarme enregistrée.");
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!alarm) return;
    await deleteAlarm(alarm.id);
    bump();
    toast("Alarme supprimée.");
    onClose();
  };

  const test = () => {
    if (testing) {
      stop.current?.();
      stop.current = null;
      setTesting(false);
    } else {
      stop.current = startChime();
      setTesting(true);
      setTimeout(() => {
        stop.current?.();
        stop.current = null;
        setTesting(false);
      }, 4000);
    }
  };

  return (
    <Modal
      title={alarm ? "Modifier l'alarme" : "Nouvelle alarme"}
      onClose={onClose}
      footer={
        <>
          {alarm && (
            <Button variant="danger" icon="trash" onClick={remove} className="mr-auto">
              Supprimer
            </Button>
          )}
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="ink" type="submit" form="alarm-form" loading={busy}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form id="alarm-form" className="stack" onSubmit={submit} noValidate>
        <TextInput label="Heure" type="time" value={time} onChange={(e) => setTime(e.target.value)} error={error} required autoFocus />
        <TextInput label="Nom" placeholder="Réveil" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} />
        <fieldset className="days">
          <legend className="field__label">Répéter</legend>
          <div className="days__row">
            {DAYS.map((x) => (
              <label key={x.d} className="day" title={x.long}>
                <input type="checkbox" checked={days.includes(x.d)} onChange={() => toggleDay(x.d)} />
                <span aria-hidden="true">{x.short}</span>
                <span className="sr-only">{x.long}</span>
              </label>
            ))}
          </div>
          <p className="field__hint">{repeatLabel(days)}</p>
        </fieldset>
        <div>
          <Button type="button" variant="soft" size="sm" onClick={test}>
            <Icon name={testing ? "bellOff" : "bell"} /> {testing ? "Arrêter le son" : "Tester le son"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
