import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { addCity, getUser, listCities, removeCity } from "../data/api";
import type { TempUnit } from "../data/types";
import { describe, searchPlaces, type Place } from "../data/weather";
import { useAsync, useDataVersion } from "../lib/useAsync";
import { useForecast, useMyPosition } from "../lib/useWeather";
import { Icon } from "../ui/Icon";
import { Button, EmptyState, ErrorState, IconButton, Skeleton, TextInput, Tile } from "../ui/primitives";
import { useToast } from "../ui/Toast";
import { WeatherGlyph } from "../ui/WeatherGlyph";

type Loc = { key: string; name: string; sub?: string; lat: number; lon: number; mine?: boolean };

export default function Weather() {
  const user = useAsync(getUser);
  const unit: TempUnit = user.data?.unit ?? "C";
  const cities = useAsync(listCities);
  const { position, request } = useMyPosition();
  const [params, setParams] = useSearchParams();
  const { bump } = useDataVersion();
  const toast = useToast();

  const places: Loc[] = [
    ...(position.status === "ready" ? [{ key: "me", name: position.name, sub: "Ma position", lat: position.lat, lon: position.lon, mine: true }] : []),
    ...(cities.data ?? []).map((c) => ({ key: c.id, name: c.name, sub: [c.admin, c.country].filter(Boolean).join(", "), lat: c.lat, lon: c.lon })),
  ];
  const selectedKey = params.get("lieu") ?? places[0]?.key;
  const selected = places.find((p) => p.key === selectedKey) ?? places[0];

  const remove = async (id: string, name: string) => {
    try {
      await removeCity(id);
      bump();
      if (selectedKey === id) setParams({}, { replace: true });
      toast(`${name} retirée.`);
    } catch (e) {
      toast((e as Error).message, "negative");
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Météo</h1>
          <p>Là où vous êtes, et partout où vous voulez.</p>
        </div>
      </div>

      <div className="weather-layout">
        <div className="stack">
          <CitySearch />
          <Tile labelledBy="places-title">
            <h2 id="places-title" className="section-head__title">
              Mes lieux
            </h2>
            {position.status !== "ready" && (
              <div className="place place--prompt">
                <Icon name="location" />
                <span className="place__main">
                  <span className="place__name">Ma position</span>
                  <span className="muted place__sub">
                    {position.status === "locating"
                      ? "Localisation…"
                      : position.status === "denied"
                        ? "Accès refusé : autorisez la localisation dans le navigateur."
                        : position.status === "unavailable"
                          ? "Position indisponible."
                          : "Non activée"}
                  </span>
                </span>
                {(position.status === "idle" || position.status === "unavailable") && (
                  <Button size="sm" variant="ink" onClick={request}>
                    Activer
                  </Button>
                )}
              </div>
            )}
            {!cities.data ? (
              <Skeleton h="4rem" />
            ) : places.length === 0 ? (
              <EmptyState icon="location" title="Aucun lieu">Cherchez une ville ci-dessus pour l'ajouter.</EmptyState>
            ) : (
              <ul className="places">
                {places.map((p) => (
                  <li key={p.key}>
                    <PlaceRow loc={p} unit={unit} active={p.key === selected?.key} onSelect={() => setParams({ lieu: p.key }, { replace: true })} />
                    {!p.mine && <IconButton icon="trash" label={`Retirer ${p.name}`} onClick={() => remove(p.key, p.name)} />}
                  </li>
                ))}
              </ul>
            )}
          </Tile>
        </div>
        {selected ? <Detail loc={selected} unit={unit} /> : <Tile><EmptyState icon="sun" title="Choisissez un lieu" /></Tile>}
      </div>
    </>
  );
}

function PlaceRow({ loc, unit, active, onSelect }: { loc: Loc; unit: TempUnit; active: boolean; onSelect: () => void }) {
  const fc = useForecast(loc, unit);
  const c = fc.data?.current;
  return (
    <button className={`place ${active ? "is-active" : ""}`} aria-pressed={active} onClick={onSelect}>
      {loc.mine ? <Icon name="location" /> : c ? <WeatherGlyph code={c.code} isDay={c.isDay} /> : <Icon name="cloud" />}
      <span className="place__main">
        <span className="place__name truncate">{loc.name}</span>
        <span className="muted place__sub truncate">{c ? describe(c.code).label : loc.sub}</span>
      </span>
      <span className="place__temp num">{c ? `${Math.round(c.temp)}°` : fc.status === "error" ? "—" : <Skeleton w="2rem" h="1.25rem" />}</span>
    </button>
  );
}

function Detail({ loc, unit }: { loc: Loc; unit: TempUnit }) {
  const fc = useForecast(loc, unit);
  const u = unit === "F" ? "°F" : "°C";
  if (fc.status === "error") {
    return (
      <Tile>
        <ErrorState error={new Error(fc.error)} onRetry={fc.reload} />
      </Tile>
    );
  }
  if (!fc.data) {
    return (
      <Tile>
        <Skeleton w="40%" h="4rem" />
        <Skeleton h="6rem" />
        <Skeleton h="14rem" />
      </Tile>
    );
  }
  const { current: c, hourly, daily } = fc.data;
  const lo = Math.min(...daily.map((d) => d.min));
  const hi = Math.max(...daily.map((d) => d.max));
  return (
    <div className="stack">
      <Tile className="weather-hero" labelledBy="wx-title">
        <div className="row-between">
          <div>
            <h2 id="wx-title" className="weather-place">
              {loc.name}
            </h2>
            <p className="muted">{loc.sub}</p>
          </div>
          <WeatherGlyph code={c.code} isDay={c.isDay} size="4rem" />
        </div>
        <p className="weather-now__temp weather-now__temp--xl num">
          {Math.round(c.temp)}
          <span>{u}</span>
        </p>
        <p className="weather-now__label">
          {describe(c.code).label} · max {Math.round(daily[0].max)}° min {Math.round(daily[0].min)}°
        </p>
        <ul className="wx-facts">
          <li>
            <Icon name="sun" /> Ressenti <strong className="num">{Math.round(c.feels)}°</strong>
          </li>
          <li>
            <Icon name="wind" /> Vent <strong className="num">{Math.round(c.wind)} km/h</strong>
          </li>
          <li>
            <Icon name="drop" /> Humidité <strong className="num">{c.humidity} %</strong>
          </li>
        </ul>
      </Tile>
      <Tile labelledBy="wx-hours">
        <h2 id="wx-hours" className="section-head__title">
          Prochaines 24 heures
        </h2>
        <ul className="hours hours--scroll" tabIndex={0} aria-label="Prévisions heure par heure">
          {hourly.map((h, i) => (
            <li key={h.time}>
              <span className="muted">{i === 0 ? "Maint." : `${h.time.slice(11, 13)}h`}</span>
              <WeatherGlyph code={h.code} />
              <span className="num">{Math.round(h.temp)}°</span>
              {h.rain >= 20 && <span className="hours__rain num">{h.rain} %</span>}
            </li>
          ))}
        </ul>
      </Tile>
      <Tile labelledBy="wx-days">
        <h2 id="wx-days" className="section-head__title">
          7 jours
        </h2>
        <ul className="days-fc">
          {daily.map((d, i) => {
            const left = ((d.min - lo) / Math.max(1, hi - lo)) * 100;
            const width = ((d.max - d.min) / Math.max(1, hi - lo)) * 100;
            return (
              <li key={d.date}>
                <span className="days-fc__day">{i === 0 ? "Aujourd'hui" : new Date(`${d.date}T12:00`).toLocaleDateString("fr-FR", { weekday: "long" })}</span>
                <WeatherGlyph code={d.code} />
                <span className="days-fc__rain num">{d.rain >= 20 ? `${d.rain} %` : ""}</span>
                <span className="num muted">{Math.round(d.min)}°</span>
                <span className="range" aria-hidden="true">
                  <span style={{ left: `${left}%`, width: `${Math.max(width, 6)}%` }} />
                </span>
                <span className="num">{Math.round(d.max)}°</span>
              </li>
            );
          })}
        </ul>
      </Tile>
    </div>
  );
}

function CitySearch() {
  const [q, setQ] = useState("");
  const [state, setState] = useState<{ status: "idle" | "loading" | "ready" | "error"; results: Place[]; error?: string }>({ status: "idle", results: [] });
  const { bump } = useDataVersion();
  const toast = useToast();
  const [, setParams] = useSearchParams();

  useEffect(() => {
    if (q.trim().length < 2) {
      setState({ status: "idle", results: [] });
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setState((s) => ({ ...s, status: "loading" }));
      searchPlaces(q, ctl.signal).then(
        (results) => setState({ status: "ready", results }),
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
      const city = await addCity(p);
      bump();
      setQ("");
      setParams({ lieu: city.id }, { replace: true });
      toast(`${p.name} ajoutée.`);
    } catch (e) {
      toast((e as Error).message, "negative");
    }
  };

  return (
    <Tile>
      <TextInput label="Ajouter une ville" type="search" placeholder="Ex. Lyon, Tokyo, Montréal…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      <div aria-live="polite">
        {state.status === "loading" && <p className="muted">Recherche…</p>}
        {state.status === "error" && <p className="field__error">{state.error}</p>}
        {state.status === "ready" && state.results.length === 0 && <p className="muted">Aucune ville trouvée pour « {q} ».</p>}
        {state.results.length > 0 && (
          <ul className="results">
            {state.results.map((p) => (
              <li key={`${p.lat},${p.lon}`}>
                <button className="result" onClick={() => add(p)}>
                  <span className="place__main">
                    <span className="place__name">{p.name}</span>
                    <span className="muted place__sub">{[p.admin, p.country].filter(Boolean).join(", ")}</span>
                  </span>
                  <Icon name="plus" />
                  <span className="sr-only">Ajouter</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Tile>
  );
}
