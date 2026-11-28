import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { addClock, listClocks, removeClock } from "../data/api";
import { searchPlaces, type Place } from "../data/weather";
import { useAsync, useDataVersion } from "../lib/useAsync";
import { useMyPosition } from "../lib/useWeather";
import { dateIn, dayLabel, diffLabel, isNight, isValidTz, LOCAL_TZ, timeIn, tzCity, tzLongName, useNow, zoned } from "../lib/time";
import { AnalogClock } from "../ui/AnalogClock";
import { Icon } from "../ui/Icon";
import { EmptyState, ErrorState, IconButton, Skeleton, TextInput, Tile } from "../ui/primitives";
import { useToast } from "../ui/Toast";

/** Switch between the two halves of the Horloge tab. */
export function ClockTabs() {
  return (
    <nav className="segmented" aria-label="Horloge">
      <NavLink to="/horloge" className="segmented__opt">
        Horloges
      </NavLink>
      <NavLink to="/alarmes" className="segmented__opt">
        Alarmes
      </NavLink>
    </nav>
  );
}

export default function Clock() {
  const now = useNow();
  const clocks = useAsync(listClocks);
  const { position } = useMyPosition();
  const { bump } = useDataVersion();
  const toast = useToast();
  const placeName = position.status === "ready" && position.name !== "Ma position" ? position.name : tzCity(LOCAL_TZ);
  const z = zoned(now, LOCAL_TZ);

  const remove = async (id: string, name: string) => {
    try {
      await removeClock(id);
      bump();
      toast(`${name} retirée de vos horloges.`);
    } catch (e) {
      toast((e as Error).message, "negative");
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Horloge</h1>
          <p>L'heure ici, et partout dans le monde.</p>
        </div>
        <div className="page-head__actions">
          <ClockTabs />
        </div>
      </div>

      <div className="clock-layout">
        <Tile className="clock-hero" labelledBy="here-title">
          <div className="clock-hero__face">
            <AnalogClock date={now} tz={LOCAL_TZ} size="lg" label={`Il est ${timeIn(now, LOCAL_TZ)}`} />
          </div>
          <div className="clock-hero__text">
            <h2 id="here-title" className="clock-hero__place">
              <Icon name="location" /> {placeName}
            </h2>
            <p className="clock-hero__time num" aria-live="off">
              {String(z.h).padStart(2, "0")}
              <span className="clock-hero__sep">:</span>
              {String(z.mi).padStart(2, "0")}
              <span className="clock-hero__sec">{String(z.s).padStart(2, "0")}</span>
            </p>
            <p className="clock-hero__date">{dateIn(now, LOCAL_TZ)}</p>
            <p className="muted clock-hero__zone">{tzLongName(now, LOCAL_TZ)}</p>
          </div>
        </Tile>

        <div className="stack">
          <ClockSearch existing={clocks.data?.map((c) => c.name + c.timezone) ?? []} />
          <Tile labelledBy="world-title">
            <h2 id="world-title" className="section-head__title">
              Dans le monde
            </h2>
            {clocks.status === "error" && !clocks.data ? (
              <ErrorState error={clocks.error} onRetry={clocks.reload} />
            ) : !clocks.data ? (
              <div className="stack-sm">
                <Skeleton h="4rem" />
                <Skeleton h="4rem" />
              </div>
            ) : clocks.data.length === 0 ? (
              <EmptyState icon="clock" title="Aucune ville">
                Cherchez une ville ci-dessus pour suivre son heure.
              </EmptyState>
            ) : (
              <ul className="worldclocks">
                {clocks.data.map((c) => {
                  const night = isNight(now, c.timezone);
                  const day = dayLabel(now, c.timezone);
                  return (
                    <li key={c.id} className={`worldclock ${night ? "is-night" : ""}`}>
                      <AnalogClock date={now} tz={c.timezone} size="sm" label={`${c.name} : ${timeIn(now, c.timezone)}`} />
                      <div className="worldclock__main">
                        <span className="worldclock__name truncate">{c.name}</span>
                        <span className="muted worldclock__sub truncate">
                          {day} · {diffLabel(now, c.timezone)}
                          {c.country ? ` · ${c.country}` : ""}
                        </span>
                      </div>
                      <span className="worldclock__time num">
                        <Icon name={night ? "moon" : "sun"} />
                        <span className="sr-only">{night ? "nuit" : "jour"}, </span>
                        {timeIn(now, c.timezone)}
                      </span>
                      <IconButton icon="trash" label={`Retirer ${c.name}`} onClick={() => remove(c.id, c.name)} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Tile>
        </div>
      </div>
    </>
  );
}

function ClockSearch({ existing }: { existing: string[] }) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ status: "idle" | "loading" | "ready" | "error"; results: Place[]; error?: string }>({ status: "idle", results: [] });
  const { bump } = useDataVersion();
  const toast = useToast();
  const now = useNow(60_000);

  useEffect(() => {
    if (q.trim().length < 2) {
      setState({ status: "idle", results: [] });
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setState((s) => ({ ...s, status: "loading" }));
      searchPlaces(q, ctl.signal).then(
        (results) => setState({ status: "ready", results: results.filter((r) => r.timezone && isValidTz(r.timezone)) }),
        (e: Error) => e.name !== "AbortError" && setState({ status: "error", results: [], error: e.message }),
      );
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const add = async (p: Place) => {
    try {
      await addClock({ name: p.name, admin: p.admin, country: p.country, timezone: p.timezone! });
      bump();
      setQ("");
      toast(`${p.name} ajoutée à vos horloges.`);
    } catch (e) {
      toast((e as Error).message, "negative");
    }
  };

  return (
    <Tile>
      <TextInput label="Ajouter une ville" type="search" placeholder="Ex. Tokyo, New York, Sydney…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      <div aria-live="polite">
        {state.status === "loading" && <p className="muted">Recherche…</p>}
        {state.status === "error" && <p className="field__error">{state.error}</p>}
        {state.status === "ready" && state.results.length === 0 && <p className="muted">Aucune ville trouvée pour « {q} ».</p>}
        {state.results.length > 0 && (
          <ul className="results">
            {state.results.map((p) => {
              const already = existing.includes(p.name + p.timezone);
              return (
                <li key={`${p.lat},${p.lon}`}>
                  <button className="result" onClick={() => add(p)} disabled={already}>
                    <span className="place__main">
                      <span className="place__name">{p.name}</span>
                      <span className="muted place__sub">
                        {[p.admin, p.country].filter(Boolean).join(", ")} · {timeIn(now, p.timezone!)} ({diffLabel(now, p.timezone!)})
                      </span>
                    </span>
                    {already ? <span className="muted place__sub">Déjà ajoutée</span> : <Icon name="plus" />}
                    <span className="sr-only">{already ? "" : "Ajouter"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Tile>
  );
}
