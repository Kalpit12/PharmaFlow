"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "pharmaflow.preferences.v1";

export type TimeZonePreference = "utc" | "nairobi" | "local";

type Preferences = {
  timeZone: TimeZonePreference;
  reduceMotion: boolean;
  showNotificationBadge: boolean;
};

type PreferencesContextValue = Preferences & {
  setTimeZone: (value: TimeZonePreference) => void;
  setReduceMotion: (value: boolean) => void;
  setShowNotificationBadge: (value: boolean) => void;
  resetPreferences: () => void;
};

const DEFAULTS: Preferences = {
  timeZone: "utc",
  reduceMotion: false,
  showNotificationBadge: true,
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function loadPreferences(): Preferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Preferences>;
    return {
      timeZone: parsed.timeZone === "nairobi" || parsed.timeZone === "local" ? parsed.timeZone : "utc",
      reduceMotion: parsed.reduceMotion === true,
      showNotificationBadge: parsed.showNotificationBadge !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);

  useEffect(() => {
    setPreferences(loadPreferences());
  }, []);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = preferences.reduceMotion ? "true" : "false";
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Local preferences are optional; the app remains usable when storage is unavailable.
    }
  }, [preferences]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      ...preferences,
      setTimeZone: (timeZone) => setPreferences((current) => ({ ...current, timeZone })),
      setReduceMotion: (reduceMotion) => setPreferences((current) => ({ ...current, reduceMotion })),
      setShowNotificationBadge: (showNotificationBadge) =>
        setPreferences((current) => ({ ...current, showNotificationBadge })),
      resetPreferences: () => setPreferences(DEFAULTS),
    }),
    [preferences]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const value = useContext(PreferencesContext);
  if (!value) {
    return {
      ...DEFAULTS,
      setTimeZone: () => {},
      setReduceMotion: () => {},
      setShowNotificationBadge: () => {},
      resetPreferences: () => {},
    };
  }
  return value;
}
