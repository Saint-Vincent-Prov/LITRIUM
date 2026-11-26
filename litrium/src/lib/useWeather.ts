import { useCallback, useEffect, useState } from "react";
import type { TempUnit } from "../data/types";
import { getForecast, locate, placeName, type Forecast } from "../data/weather";

export type PositionState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "ready"; lat: number; lon: number; name: string }
  | { status: "denied" | "unavailable" };

/** Locates automatically if permission was already given; otherwise waits for `request()`. */
export function useMyPosition() {
  const [state, setState] = useState<PositionState>({ status: "idle" });

  const request = useCallback(async () => {
    setState({ status: "locating" });
    try {
      const { lat, lon } = await locate();
      setState({ status: "ready", lat, lon, name: "Ma position" });
      const name = await placeName(lat, lon);
      setState({ status: "ready", lat, lon, name });
    } catch (e) {
      setState({ status: (e as Error).message === "denied" ? "denied" : "unavailable" });
    }
  }, []);

  useEffect(() => {
    let alive = true;
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((p) => {
        if (!alive) return;
        if (p.state === "granted") request();
        else if (p.state === "denied") setState({ status: "denied" });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [request]);

  return { position: state, request };
}

export function useForecast(coords: { lat: number; lon: number } | null, unit: TempUnit) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "ready" | "error"; data?: Forecast; error?: string }>({ status: "idle" });
  const [retry, setRetry] = useState(0);
  const lat = coords?.lat;
  const lon = coords?.lon;

  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    const ctl = new AbortController();
    setState((s) => ({ status: "loading", data: s.data }));
    getForecast(lat, lon, unit, ctl.signal).then(
      (data) => setState({ status: "ready", data }),
      (e: Error) => e.name !== "AbortError" && setState({ status: "error", error: e.message }),
    );
    return () => ctl.abort();
  }, [lat, lon, unit, retry]);

  return { ...state, reload: () => setRetry((r) => r + 1) };
}
