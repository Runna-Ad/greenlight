"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type PickCard = { id: string; label: string; marca: string; tipo: string };

/**
 * Botón "copiar este campo a…" al lado de un campo de la tarjeta.
 *
 * Al picarlo se abre un selector de las OTRAS tarjetas, con atajos (Todas ·
 * misma Marca · mismo Tipo · Ninguna) y memoria de la última selección — así
 * copiar 6 campos a las mismas 5 tarjetas es un toque por campo. Es el gesto
 * principal que mata el "copiar la celda hacia abajo" del Google Sheet.
 */
export function CopyFieldButton({
  sourceId,
  cards,
  srcMarca,
  srcTipo,
  lastTargets,
  onCopy,
  fieldLabel,
}: {
  sourceId: string;
  cards: PickCard[];
  srcMarca: string;
  srcTipo: string;
  lastTargets: string[];
  onCopy: (targetIds: string[]) => void;
  fieldLabel: string;
}) {
  const others = cards.filter((c) => c.id !== sourceId);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>([]);

  if (others.length === 0) return null; // nada a qué copiar todavía

  const seed = () => setSel(lastTargets.filter((id) => others.some((o) => o.id === id)));
  const toggleOpen = (v: boolean) => {
    if (v) seed();
    setOpen(v);
  };

  const set = (ids: string[]) => setSel(ids);
  const toggle = (id: string) =>
    setSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const confirmar = () => {
    if (sel.length) onCopy(sel);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={toggleOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Copiar ${fieldLabel} a otras tarjetas`}
          title={`Copiar ${fieldLabel} a otras tarjetas`}
          className="text-muted-foreground hover:text-primary"
        >
          <Copy />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-xs font-semibold text-foreground">Copiar “{fieldLabel}” a…</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {[
              { k: "todas", label: "Todas", ids: others.map((o) => o.id) },
              { k: "marca", label: "Misma Marca", ids: others.filter((o) => o.marca && o.marca === srcMarca).map((o) => o.id) },
              { k: "tipo", label: "Mismo Tipo", ids: others.filter((o) => o.tipo && o.tipo === srcTipo).map((o) => o.id) },
              { k: "ninguna", label: "Ninguna", ids: [] as string[] },
            ].map((qs) => (
              <button
                key={qs.k}
                type="button"
                onClick={() => set(qs.ids)}
                className="rounded-full border border-input px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {qs.label}
              </button>
            ))}
          </div>
        </div>

        <ul className="max-h-64 overflow-y-auto p-1.5">
          {others.map((o) => {
            const on = sel.includes(o.id);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(o.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-secondary/60"
                >
                  {/* Casilla puramente VISUAL: un <button> de checkbox anidado en
                      este <button> de fila es HTML inválido (error de hidratación). */}
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-input",
                    )}
                  >
                    {on && <Check className="size-3" />}
                  </span>
                  <span className="truncate text-foreground">{o.label}</span>
                  {o.marca && (
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{o.marca}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <span className="text-[11px] text-muted-foreground">{sel.length} seleccionada{sel.length === 1 ? "" : "s"}</span>
          <Button type="button" size="xs" disabled={sel.length === 0} onClick={confirmar}>
            <Check /> Copiar a {sel.length}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
