"use client";

import { useEffect, useState } from "react";

/** True below the `md` breakpoint (768px) — phone layout, drawer nav, bottom sheets. */
export function useCompactLayout(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const apply = () => setCompact(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return compact;
}
