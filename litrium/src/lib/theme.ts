import { useEffect, useState } from "react";

export type ThemePref = "auto" | "light" | "dark";
const KEY = "litrium-theme";
const listeners = new Set<() => void>();

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

function systemDark() {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolvedTheme(pref = getThemePref()): "light" | "dark" {
  return pref === "dark" || (pref === "auto" && systemDark()) ? "dark" : "light";
}

function apply() {
  document.documentElement.dataset.theme = resolvedTheme();
  listeners.forEach((f) => f());
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    /* ignore */
  }
  apply();
}

if (typeof window !== "undefined") {
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (getThemePref() === "auto") apply();
  });
}

/** Current preference and the theme actually shown. */
export function useTheme() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return { pref: getThemePref(), theme: resolvedTheme() };
}
