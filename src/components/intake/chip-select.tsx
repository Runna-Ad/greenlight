"use client";

import { useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { chipTextColor } from "@/lib/vocab";

type Option = { value: string; label?: string; color?: string };

// Multi- or single-select rendered as chips — mirrors the sheet's colored
// dropdown pills. `allowCustom` adds an "Otro…" escape hatch so the team can
// type a value the list doesn't cover (rare/weird cases).
export function ChipSelect({
  options,
  selected,
  onChange,
  multi = false,
  ariaLabel,
  allowCustom = true,
  customPlaceholder = "Escribe la opción…",
}: {
  options: (Option | string)[];
  selected: string[];
  // Functional updater (React setState signature) so two quick toggles in the
  // same render batch can't overwrite each other via a stale `selected`.
  onChange: (updater: (prev: string[]) => string[]) => void;
  multi?: boolean;
  ariaLabel: string;
  allowCustom?: boolean;
  customPlaceholder?: string;
}) {
  const opts: Option[] = options.map((o) =>
    typeof o === "string" ? { value: o } : o,
  );
  const known = new Set(opts.map((o) => o.value));
  const custom = selected.filter((v) => !known.has(v));

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = (value: string) => {
    onChange((prev) => {
      if (multi) {
        return prev.includes(value)
          ? prev.filter((v) => v !== value)
          : [...prev, value];
      }
      return prev[0] === value ? [] : [value];
    });
  };

  const commitCustom = () => {
    // Read the DOM value, not state — avoids losing the entry when the commit
    // lands in the same tick as the last keystroke (state not yet re-rendered).
    const v = (inputRef.current?.value ?? draft).trim();
    if (v) {
      onChange((prev) => {
        if (prev.includes(v)) return prev;
        return multi ? [...prev, v] : [v];
      });
    }
    setDraft("");
    setAdding(false);
  };

  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap items-center gap-1.5">
      {opts.map((o) => {
        const on = selected.includes(o.value);
        const tinted = o.color && on;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => toggle(o.value)}
            aria-pressed={on}
            style={
              tinted
                ? { backgroundColor: o.color, color: chipTextColor(o.color!), borderColor: o.color }
                : undefined
            }
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] transition-colors",
              on
                ? tinted
                  ? "font-medium"
                  : "border-primary bg-primary text-primary-foreground font-medium"
                : "border-input bg-background text-foreground hover:border-primary",
            )}
          >
            {on && <Check className="size-3" />}
            {o.label ?? o.value}
          </button>
        );
      })}

      {/* Values typed by the team — visually distinct from the sheet's options */}
      {custom.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary bg-primary/10 px-2.5 py-1 text-[13px] font-medium text-primary"
        >
          {v}
          <button
            type="button"
            aria-label={`Quitar ${v}`}
            onClick={() => onChange((prev) => prev.filter((x) => x !== v))}
            className="rounded-full hover:bg-primary/20"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}

      {allowCustom &&
        (adding ? (
          <span className="inline-flex items-center gap-1">
            <input
              ref={inputRef}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitCustom();
                }
                if (e.key === "Escape") {
                  setDraft("");
                  setAdding(false);
                }
              }}
              placeholder={customPlaceholder}
              aria-label={`Otra opción para ${ariaLabel}`}
              className="h-[30px] w-44 rounded-full border border-primary bg-background px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {/* Explicit commit — Enter also works, but a button is discoverable
                and unambiguous on mobile keyboards. */}
            <button
              type="button"
              onClick={commitCustom}
              className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[13px] font-medium text-primary-foreground"
            >
              Agregar
            </button>
            <button
              type="button"
              aria-label="Cancelar"
              onClick={() => {
                setDraft("");
                setAdding(false);
              }}
              className="rounded-full p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-input px-2.5 py-1 text-[13px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="size-3" />
            Otro
          </button>
        ))}
    </div>
  );
}
