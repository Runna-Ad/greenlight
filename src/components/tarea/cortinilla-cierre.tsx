"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Plus, X, Scale } from "lucide-react";
import { toast } from "sonner";

import { alternarSnippet } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { CampoIntake } from "./campo-intake";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export type LegalSnippet = { id: string; title: string; body: string };

/**
 * La Cortinilla de Cierre: el bloque de legales al final del guión (después de
 * todos los planos). Dos caminos, como pidió Pedro:
 *   - Escribir/editar a mano (legales_libres).
 *   - Agregar desde la BIBLIOTECA (idea_snippets) — que mañana se llena desde
 *     Notion. Así la cifra del CAT sale siempre correcta y queda registrado
 *     cuál se usó, en vez de copiar-pegar.
 */
export function CortinillaCierre({
  ideaId,
  legalesLibres,
  seleccionados,
  biblioteca,
  soloLectura,
}: {
  ideaId: string;
  legalesLibres: string | null;
  seleccionados: LegalSnippet[];
  /** Legales de la biblioteca que aún NO están en esta tarea. */
  biblioteca: LegalSnippet[];
  soloLectura?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const alternar = (snippetId: string, activar: boolean) =>
    startTransition(async () => {
      const res = await alternarSnippet(ideaId, snippetId, activar);
      if (!res.ok) toast.error("error" in res ? res.error : "No se pudo actualizar el legal.");
      else router.refresh();
    });

  return (
    <section className="overflow-hidden rounded-xl border border-[#2d2b55]/20 bg-card shadow-sm">
      {/* Header tipo "documento legal" — oscuro, para que no se pierda con el
          fondo y se lea como el cierre de la pieza (como en el deck). */}
      <div className="flex items-center gap-2 bg-[#2d2b55] px-4 py-2.5 text-white">
        <Scale className="size-4" />
        <h3 className="text-[12px] font-bold uppercase tracking-widest">Cortinilla de Cierre</h3>
        <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-white/60">
          Legales
        </span>
      </div>

      <div className="p-4">
        {/* Legales seleccionados de la biblioteca */}
        {seleccionados.length > 0 && (
          <ul className="mb-3 space-y-2">
            {seleccionados.map((s) => (
              <li
                key={s.id}
                className="flex items-start gap-2.5 rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2.5"
              >
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <BookOpen className="size-3 text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-primary">
                    {s.title}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-foreground">{s.body}</p>
                </div>
                {!soloLectura && (
                  <button
                    onClick={() => alternar(s.id, false)}
                    disabled={pending}
                    aria-label={`Quitar ${s.title}`}
                    className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-status-corrections"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Agregar desde la biblioteca */}
        {!soloLectura && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="mb-3 border-primary/40 text-primary hover:bg-primary/5" disabled={pending}>
                <BookOpen className="size-3.5" /> Agregar desde biblioteca
              </Button>
            </PopoverTrigger>
          <PopoverContent className="w-96 p-2" align="start">
            <p className="mb-1.5 px-1 text-[10px] text-muted-foreground">
              Legales de la biblioteca (por marca). Se selecciona, no se pega.
            </p>
            {biblioteca.length === 0 ? (
              <p className="px-1 py-3 text-center text-[11px] text-muted-foreground/70">
                No hay más legales en la biblioteca para esta marca.
              </p>
            ) : (
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {biblioteca.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => alternar(s.id, true)}
                      disabled={pending}
                      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left hover:bg-secondary"
                    >
                      <Plus className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {s.title}
                        </span>
                        <span className="block text-[11px] leading-snug text-foreground">
                          {s.body}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
      )}

        {/* Texto libre — escribir/editar a mano */}
        <CampoIntake
          ideaId={ideaId}
          campo="legales_libres"
          label="Legales (texto libre)"
          valorInicial={legalesLibres}
          placeholder="Escribe aquí un legal a mano, o agrégalo de la biblioteca arriba…"
          rows={3}
          caja
          soloLectura={soloLectura}
        />
      </div>
    </section>
  );
}
