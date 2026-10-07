import type { ComponentProps } from "react";

/**
 * Landing forms only. Password managers and form extensions often inject attributes
 * (e.g. fdprocessedid) before React hydrates — suppressHydrationWarning avoids noise.
 */
export function LandingInput(props: ComponentProps<"input">) {
  return <input {...props} suppressHydrationWarning />;
}

export function LandingButton(props: ComponentProps<"button">) {
  return <button {...props} suppressHydrationWarning />;
}

export function LandingSelect(props: ComponentProps<"select">) {
  return <select {...props} suppressHydrationWarning />;
}

export function LandingTextarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} suppressHydrationWarning />;
}
