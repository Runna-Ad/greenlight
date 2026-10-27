"use client";

import { cn } from "@/lib/utils";

// Fondos sólidos de botón (texto blanco) — un pelín más oscuros para AA.
export const BG_CORAL = "color-mix(in srgb, var(--status-corrections) 78%, #000)";
export const BG_GREEN = "color-mix(in srgb, var(--status-completed) 92%, #000)";

/** El botón pequeño de las tarjetas de cambios (panel interno e hilo de respuestas). */
export function BtnAccion({
  children,
  onClick,
  disabled,
  tone,
  autoFocus,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "go" | "danger";
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      autoFocus={autoFocus}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50",
        tone ? "border-transparent text-white" : "border-border bg-card text-foreground hover:bg-secondary",
      )}
      style={
        tone === "primary" || tone === "danger"
          ? { background: BG_CORAL }
          : tone === "go"
            ? { background: BG_GREEN }
            : undefined
      }
    >
      {children}
    </button>
  );
}
