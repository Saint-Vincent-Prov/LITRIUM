/**
 * Live weather from Open-Meteo (free, no key) and place names from
 * BigDataCloud's client-side reverse geocoding. Called from the user's browser.
 */
import type { TempUnit } from "./types";

export interface Forecast {
  current: { temp: number; feels: number; code: number; wind: number; humidity: number; isDay: boolean; time: string };
  hourly: { time: string; temp: number; code: number; rain: number }[];
  daily: { date: string; max: number; min: number; code: number; rain: number }[];
}

export interface Place {
  name: string;
  admin?: string;
  country: string;
  lat: number;
  lon: number;
}

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";
const REVERSE = "https://api.bigdatacloud.net/data/reverse-geocode-client";

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error("Pas de connexion au service météo.");
  }
  if (!res.ok) throw new Error(`Le service météo a répondu ${res.status}.`);
  return res.json() as Promise<T>;
}

const cache = new Map<string, { at: number; data: Forecast }>();

export async function getForecast(lat: number, lon: number, unit: TempUnit, signal?: AbortSignal): Promise<Forecast> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)},${unit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.data;
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day",
    hourly: "temperature_2m,weather_code,precipitation_probability",
    daily: "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "7",
    temperature_unit: unit === "F" ? "fahrenheit" : "celsius",
  });
  type Raw = {
    current: Record<string, number | string>;
    hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: number[] };
    daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[]; precipitation_probability_max: number[] };
  };
  const r = await getJson<Raw>(`${FORECAST}?${q}`, signal);
  const nowHour = String(r.current.time).slice(0, 13);
  const start = Math.max(0, r.hourly.time.findIndex((t) => t.slice(0, 13) === nowHour));
  const data: Forecast = {
    current: {
      temp: Number(r.current.temperature_2m),
      feels: Number(r.current.apparent_temperature),
      code: Number(r.current.weather_code),
      wind: Number(r.current.wind_speed_10m),
      humidity: Number(r.current.relative_humidity_2m),
      isDay: Number(r.current.is_day) === 1,
      time: String(r.current.time),
    },
    hourly: r.hourly.time.slice(start, start + 24).map((t, i) => ({
      time: t,
      temp: r.hourly.temperature_2m[start + i],
      code: r.hourly.weather_code[start + i],
      rain: r.hourly.precipitation_probability[start + i] ?? 0,
    })),
    daily: r.daily.time.map((d, i) => ({
      date: d,
      max: r.daily.temperature_2m_max[i],
      min: r.daily.temperature_2m_min[i],
      code: r.daily.weather_code[i],
      rain: r.daily.precipitation_probability_max[i] ?? 0,
    })),
  };
  cache.set(key, { at: Date.now(), data });
  return data;
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  if (query.trim().length < 2) return [];
  const q = new URLSearchParams({ name: query.trim(), count: "6", language: "fr", format: "json" });
  type Raw = { results?: { name: string; admin1?: string; country: string; latitude: number; longitude: number }[] };
  const r = await getJson<Raw>(`${GEOCODE}?${q}`, signal);
  return (r.results ?? []).map((p) => ({ name: p.name, admin: p.admin1, country: p.country, lat: p.latitude, lon: p.longitude }));
}

export async function placeName(lat: number, lon: number): Promise<string> {
  try {
    const q = new URLSearchParams({ latitude: String(lat), longitude: String(lon), localityLanguage: "fr" });
    const r = await getJson<{ city?: string; locality?: string }>(`${REVERSE}?${q}`);
    return r.city || r.locality || "Ma position";
  } catch {
    return "Ma position";
  }
}

export type GeoState =
  | { status: "idle" | "locating" }
  | { status: "ready"; lat: number; lon: number }
  | { status: "denied" | "unavailable"; message: string };

export function locate(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) return reject(new Error("unavailable"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED ? "denied" : "unavailable")),
      { timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  });
}

/* WMO weather codes → French label + icon */
export function describe(code: number): { label: string; icon: WeatherIcon } {
  if (code === 0) return { label: "Ciel dégagé", icon: "sun" };
  if (code <= 2) return { label: "Éclaircies", icon: "partly" };
  if (code === 3) return { label: "Couvert", icon: "cloud" };
  if (code === 45 || code === 48) return { label: "Brouillard", icon: "fog" };
  if (code >= 51 && code <= 57) return { label: "Bruine", icon: "rain" };
  if (code >= 61 && code <= 67) return { label: "Pluie", icon: "rain" };
  if (code >= 71 && code <= 77) return { label: "Neige", icon: "snow" };
  if (code >= 80 && code <= 82) return { label: "Averses", icon: "rain" };
  if (code === 85 || code === 86) return { label: "Averses de neige", icon: "snow" };
  if (code >= 95) return { label: "Orage", icon: "storm" };
  return { label: "Variable", icon: "partly" };
}

export type WeatherIcon = "sun" | "partly" | "cloud" | "fog" | "rain" | "snow" | "storm" | "moon";
