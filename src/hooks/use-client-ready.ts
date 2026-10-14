"use client";

import { useEffect, useState } from "react";

/** True after mount — use to align SSR/first paint with client-only wrappers (e.g. Radix Tooltip). */
export function useClientReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}
