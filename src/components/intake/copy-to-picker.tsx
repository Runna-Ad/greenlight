"use client";

import { useState } from "react";
import { Copy, Check, CopyPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TaskDraft } from "@/lib/intake-crear";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type PickCard = { id: string; label: string; marca: string; tipo: string };

// ── Selector de tarjetas destino (compartido por copiar-uno y copiar-varios) ──
// Casilla puramente VISUAL: un <button> de checkbox anidado en un <button> de
// fila es HTML inválido (error de hidratación). La fila ES el botón.
function CasillaVisual({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-sm border",
        on ? "border-primary bg-primary text-primary-foreground" : "border-input",
      )}
    >
      {on && <Check className="size-3" />}
    </span>
  );
}

function TargetPicker({
  others,
  srcMarca,
  srcTipo,
  sel,
  setSel,
}: {
  others: PickCard[];
  srcMarca: string;
  srcTipo: string;
  sel: string[];
  setSel: (ids: string[]) => void;
}) {
  const toggle = (id: string) =>
    setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);

  const atajos = [
    { k: "todas", label: "Todas", ids: others.map((o) => o.id) },
    { k: "marca", label: "Misma Marca", ids: others.filter((o) => o.marca && o.marca === srcMarca).map((o) => o.id) },
    { k: "tipo", label: "Mismo Tipo", ids: others.filter((o) => o.tipo && o.tipo === srcTipo).map((o) => o.id) },
    { k: "ninguna", label: "Ninguna", ids: [] as string[] },
  ];

  return (
    <>
      <div className="flex flex-wrap gap-1 px-3 py-2">
        {atajos.map((qs) => (
          <button
            key={qs.k}
            type="button"
            onClick={() => setSel(qs.ids)}
            className="rounded-full border border-input px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {qs.label}
          </button>
        ))}
      </div>
      <ul className="max-h-56 overflow-y-auto px-1.5 pb-1.5">
        {others.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              aria-pressed={sel.includes(o.id)}
              onClick={() => toggle(o.id)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-secondary/60"
            >
              <CasillaVisual on={sel.includes(o.id)} />
              <span className="truncate text-foreground">{o.label}</span>
              {o.marca && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{o.marca}</span>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * Botón "copiar este campo a…" al lado de UN campo de la tarjeta.
 * El gesto principal: mata el "copiar la celda hacia abajo" del Google Sheet.
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

  if (others.length === 0) return null;

  const toggleOpen = (v: boolean) => {
    if (v) setSel(lastTargets.filter((id) => others.some((o) => o.id === id)));
    setOpen(v);
  };
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
        </div>
        <TargetPicker others={others} srcMarca={srcMarca} srcTipo={srcTipo} sel={sel} setSel={setSel} />
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

/**
 * Botón a nivel de tarjeta: copiar VARIOS campos a la vez a las tarjetas
 * elegidas. La 3ª opción — entre copiar un campo y duplicar la tarjeta entera.
 * Sólo ofrece los campos que YA tienen valor en esta tarjeta.
 */
export function MultiCopyButton({
  sourceId,
  cards,
  srcMarca,
  srcTipo,
  campos,
  lastTargets,
  onCopy,
}: {
  sourceId: string;
  cards: PickCard[];
  srcMarca: string;
  srcTipo: string;
  campos: { key: keyof TaskDraft; label: string }[];
  lastTargets: string[];
  onCopy: (keys: (keyof TaskDraft)[], targetIds: string[]) => void;
}) {
  const others = cards.filter((c) => c.id !== sourceId);
  const [open, setOpen] = useState(false);
  const [selKeys, setSelKeys] = useState<string[]>([]);
  const [selCards, setSelCards] = useState<string[]>([]);

  if (others.length === 0 || campos.length === 0) return null;

  const toggleOpen = (v: boolean) => {
    if (v) {
      setSelKeys(campos.map((c) => c.key as string)); // por defecto, todos los llenos
      setSelCards(lastTargets.filter((id) => others.some((o) => o.id === id)));
    }
    setOpen(v);
  };
  const toggleKey = (k: string) =>
    setSelKeys((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  const confirmar = () => {
    if (selKeys.length && selCards.length) {
      onCopy(selKeys as (keyof TaskDraft)[], selCards);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={toggleOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Copiar varios campos a otras tarjetas" title="Copiar varios campos a otras tarjetas">
          <CopyPlus />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-xs font-semibold text-foreground">Copiar varios campos a…</p>
        </div>

        {/* 1) qué campos (sólo los que ya tienen valor) */}
        <div className="border-b border-border px-3 py-2">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Campos</p>
          <div className="flex flex-wrap gap-1.5">
            {campos.map((c) => {
              const on = selKeys.includes(c.key as string);
              return (
                <button
                  key={c.key as string}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleKey(c.key as string)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                    on ? "border-primary bg-primary text-primary-foreground font-medium" : "border-input bg-background text-foreground hover:border-primary",
                  )}
                >
                  {on && <Check className="size-3" />}
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2) a qué tarjetas */}
        <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tarjetas</div>
        <TargetPicker others={others} srcMarca={srcMarca} srcTipo={srcTipo} sel={selCards} setSel={setSelCards} />

        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
          <span className="text-[11px] text-muted-foreground">{selKeys.length} campo{selKeys.length === 1 ? "" : "s"} · {selCards.length} tarjeta{selCards.length === 1 ? "" : "s"}</span>
          <Button type="button" size="xs" disabled={selKeys.length === 0 || selCards.length === 0} onClick={confirmar}>
            <Check /> Copiar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
