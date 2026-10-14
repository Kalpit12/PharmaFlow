"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "pharmaflow.preferences.v1";

export type TimeZonePreference = "utc" | "nairobi" | "local";
export type LayoutMode = "simple" | "advanced";

type Preferences = {
  timeZone: TimeZonePreference;
  reduceMotion: boolean;
  showNotificationBadge: boolean;
  layoutMode: LayoutMode;
};

type PreferencesContextValue = Preferences & {
  /** False until browser preferences are read — keeps SSR and first client paint aligned. */
  ready: boolean;
  setTimeZone: (value: TimeZonePreference) => void;
  setReduceMotion: (value: boolean) => void;
  setShowNotificationBadge: (value: boolean) => void;
  setLayoutMode: (value: LayoutMode) => void;
  resetPreferences: () => void;
};

const DEFAULTS: Preferences = {
  timeZone: "utc",
  reduceMotion: false,
  showNotificationBadge: true,
  layoutMode: "simple",
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function loadPreferences(): Preferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Preferences>;
    return {
      timeZone: parsed.timeZone === "nairobi" || parsed.timeZone === "local" ? parsed.timeZone : "utc",
      reduceMotion: parsed.reduceMotion === true,
      showNotificationBadge: parsed.showNotificationBadge !== false,
      layoutMode: parsed.layoutMode === "advanced" ? "advanced" : "simple",
    };
  } catch {
    return DEFAULTS;
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPreferences(loadPreferences());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.reduceMotion = preferences.reduceMotion ? "true" : "false";
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Local preferences are optional; the app remains usable when storage is unavailable.
    }
  }, [preferences, ready]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      ...preferences,
      ready,
      setTimeZone: (timeZone) => setPreferences((current) => ({ ...current, timeZone })),
      setReduceMotion: (reduceMotion) => setPreferences((current) => ({ ...current, reduceMotion })),
      setShowNotificationBadge: (showNotificationBadge) =>
        setPreferences((current) => ({ ...current, showNotificationBadge })),
      setLayoutMode: (layoutMode) => setPreferences((current) => ({ ...current, layoutMode })),
      resetPreferences: () => setPreferences(DEFAULTS),
    }),
    [preferences, ready]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) {
    return {
      ...DEFAULTS,
      ready: false,
      setTimeZone: () => {},
      setReduceMotion: () => {},
      setShowNotificationBadge: () => {},
      setLayoutMode: () => {},
      resetPreferences: () => {},
    };
  }
  return value;
}

/** Layout mode safe for SSR — uses defaults until preferences are loaded on the client. */
export function useLayoutMode(): { layoutMode: LayoutMode; simple: boolean; ready: boolean } {
  const { layoutMode, ready } = usePreferences();
  const effective = ready ? layoutMode : DEFAULTS.layoutMode;
  return { layoutMode: effective, simple: effective === "simple", ready };
}
