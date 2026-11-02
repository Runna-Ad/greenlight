"use client";

import { useState, useTransition } from "react";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { guardarPrismaPreset } from "@/app/(app)/admin/actions";
import { ASPECTS, type Aspect } from "@/lib/prisma/spec";
import { PRESET_LIMITES, esHex, normalizarColor, presetVacio, type PresetGuardado } from "@/lib/prisma/preset";

/** Resumen de una línea para la fila de la marca (colapsado). */
export function resumenPreset(p: PresetGuardado): string {
  if (presetVacio(p)) return "Prisma: sin preset (usa el color de marca)";
  const partes: string[] = [];
  if (p.paleta.length) partes.push(`${p.paleta.length} ${p.paleta.length === 1 ? "color" : "colores"}`);
  if (p.tono) partes.push(`tono "${p.tono}"`);
  if (p.evitar.length) partes.push(`evita ${p.evitar.length}`);
  if (p.aspect_default) partes.push(`formato ${p.aspect_default}`);
  return `Prisma: ${partes.join(" · ")}`;
}

/**
 * Editor del preset de HÜE Prisma de UNA marca: lo que la marca aporta a TODO prompt
 * (paleta, tono, qué evitar, formato por default). H.Ü.E lo trata como la instrucción
 * más fuerte que recibe: manda sobre su propio gusto. Guardado explícito (botón), no
 * al vuelo: son cuatro campos que se editan juntos.
 */
export function PresetPrismaEditor({ marcaId, marcaNombre, inicial, onGuardado, onCerrar }: { marcaId: string; marcaNombre: string; inicial: PresetGuardado; onGuardado: (p: PresetGuardado) => void; onCerrar: () => void }) {
  const [paleta, setPaleta] = useState<string[]>(inicial.paleta);
  const [color, setColor] = useState("#");
  const [tono, setTono] = useState(inicial.tono);
  const [evitar, setEvitar] = useState<string[]>(inicial.evitar);
  const [evitarNuevo, setEvitarNuevo] = useState("");
  const [aspect, setAspect] = useState<Aspect | "">(inicial.aspect_default ?? "");
  const [pending, start] = useTransition();

  const agregarColor = () => {
    const c = normalizarColor(color);
    if (!esHex(c)) return toast.error("Escribe un color hex, p. ej. #ff6b1a.");
    if (paleta.includes(c)) return setColor("#");
    if (paleta.length >= PRESET_LIMITES.paleta) return toast.error(`Máximo ${PRESET_LIMITES.paleta} colores.`);
    setPaleta([...paleta, c]);
    setColor("#");
  };

  const agregarEvitar = () => {
    const e = evitarNuevo.trim().slice(0, PRESET_LIMITES.item);
    if (!e) return;
    if (evitar.includes(e)) return setEvitarNuevo("");
    if (evitar.length >= PRESET_LIMITES.evitar) return toast.error(`Máximo ${PRESET_LIMITES.evitar} cosas a evitar.`);
    setEvitar([...evitar, e]);
    setEvitarNuevo("");
  };

  const guardar = () =>
    start(async () => {
      const r = await guardarPrismaPreset(marcaId, { paleta, tono, evitar, aspect_default: aspect || null });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Preset de Prisma de ${marcaNombre} guardado.`);
      onGuardado(r.preset);
    });

  const colorPicker = esHex(normalizarColor(color)) ? normalizarColor(color) : "#000000";

  return (
    <div className="border-t border-border/60 bg-secondary/30 px-4 py-3">
      <p className="text-xs text-muted-foreground">
        Lo que {marcaNombre} le dice a HÜE Prisma en <em>cada</em> prompt. Manda sobre el gusto de H.Ü.E.
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {/* Paleta */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Paleta</p>
          {paleta.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Colores de la paleta">
              {paleta.map((c) => (
                <li key={c} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-0.5 pl-1 pr-1.5 text-xs font-mono text-foreground">
                  <span className="size-4 rounded-full border border-border/60" style={{ backgroundColor: c }} aria-hidden="true" />
                  {c}
                  <button type="button" onClick={() => setPaleta(paleta.filter((x) => x !== c))} aria-label={`Quitar ${c}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-1.5">
            <input type="color" value={colorPicker} onChange={(e) => setColor(e.target.value)} aria-label="Elegir color" className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-background p-0.5" />
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregarColor();
                }
              }}
              placeholder="#ff6b1a"
              aria-label="Color hex"
              maxLength={7}
              className="h-9 w-28 rounded-md border border-input bg-background px-3 font-mono text-sm"
            />
            <Button size="sm" variant="outline" onClick={agregarColor} className="gap-1">
              <Plus className="size-3.5" /> Agregar
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Sin paleta, HÜE usa el color de marca del cliente.</p>
        </div>

        {/* Tono + formato */}
        <div className="space-y-3">
          <div>
            <label htmlFor={`preset-tono-${marcaId}`} className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Tono
            </label>
            <input id={`preset-tono-${marcaId}`} value={tono} onChange={(e) => setTono(e.target.value)} maxLength={PRESET_LIMITES.tono} placeholder="premium, cálido, directo" className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
          </div>
          <div>
            <label htmlFor={`preset-aspect-${marcaId}`} className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Formato por default
            </label>
            <select id={`preset-aspect-${marcaId}`} value={aspect} onChange={(e) => setAspect(e.target.value as Aspect | "")} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">Según el destino (story, feed…)</option>
              {ASPECTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Evitar */}
        <div className="sm:col-span-2">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Evitar</p>
          {evitar.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Cosas a evitar">
              {evitar.map((e) => (
                <li key={e} className="inline-flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-2.5 pr-1 text-xs text-foreground">
                  {e}
                  <button type="button" onClick={() => setEvitar(evitar.filter((x) => x !== e))} aria-label={`Quitar ${e}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-1.5">
            <input
              value={evitarNuevo}
              onChange={(e) => setEvitarNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregarEvitar();
                }
              }}
              placeholder="p. ej. texto en pantalla, fondos morados"
              aria-label="Algo a evitar"
              maxLength={PRESET_LIMITES.item}
              className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            />
            <Button size="sm" variant="outline" onClick={agregarEvitar} className="gap-1">
              <Plus className="size-3.5" /> Agregar
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCerrar} disabled={pending}>
          Cancelar
        </Button>
        <Button size="sm" onClick={guardar} disabled={pending} className="gap-1.5">
          <Check className="size-3.5" /> {pending ? "Guardando…" : "Guardar preset"}
        </Button>
      </div>
    </div>
  );
}
