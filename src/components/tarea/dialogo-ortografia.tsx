"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check, SpellCheck, Send } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  aplicarOrtografia,
  type ErrorOrtografia,
} from "@/app/(app)/[cliente]/tareas/[id]/ortografia-actions";

/**
 * El resultado del chequeo de ortografía de H.Ü.E al mandar a revisión: lista los
 * errores con su fix propuesto. "Aplicar" cambia el campo (find-replace anclado);
 * el especialista SIEMPRE puede "Enviar de todos modos" (nunca bloquea — decisión
 * de Pedro). Los números y legales no se tocan (guardarraíl `fixSeguro`).
 */
export function DialogoOrtografia({
  errores,
  enviando,
  onAplicado,
  onEnviar,
  onCerrar,
}: {
  errores: ErrorOrtografia[];
  enviando: boolean;
  onAplicado: (id: string) => void;
  onEnviar: () => void;
  onCerrar: () => void;
}) {
  const [aplicando, startApply] = useTransition();

  const aplicar = (e: ErrorOrtografia) =>
    startApply(async () => {
      const res = await aplicarOrtografia(e.tabla, e.filaId, e.campo, e.original, e.sugerencia);
      if (!res.ok) {
        toast.error("error" in res ? res.error : "No se pudo aplicar.");
        return;
      }
      toast.success("Corrección aplicada");
      onAplicado(e.id);
    });

  // Agrupar por campo para que se lea "Plano 2 · Acción" una vez.
  const grupos = new Map<string, ErrorOrtografia[]>();
  for (const e of errores) (grupos.get(e.campoLabel) ?? grupos.set(e.campoLabel, []).get(e.campoLabel)!).push(e);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <DialogContent className="grid max-h-[85svh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SpellCheck className="size-4 text-primary" /> Revisión de ortografía
          </DialogTitle>
          <DialogDescription>
            {errores.length > 0
              ? `H.Ü.E encontró ${errores.length} posible${errores.length === 1 ? "" : "s"} ${errores.length === 1 ? "error" : "errores"} en es-MX. Aplica los que veas bien; los números y legales no se tocan.`
              : "No quedan sugerencias. Puedes mandarla a revisión."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-3 overflow-y-auto py-2 pr-1">
          {errores.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              ¡Listo! No quedan sugerencias por revisar.
            </p>
          ) : (
            [...grupos.entries()].map(([label, items]) => (
              <div key={label}>
                <p className="mb-1 gl-eyebrow">{label}</p>
                <div className="space-y-1.5">
                  {items.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-start justify-between gap-2 rounded-lg border border-border bg-card p-2"
                    >
                      <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
                        <span className="mr-1.5 inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {e.tipo}
                        </span>
                        <span className="text-status-corrections line-through decoration-status-corrections/50">
                          {e.original}
                        </span>
                        <span className="mx-1.5 text-muted-foreground">→</span>
                        <span className="font-semibold text-[color-mix(in_srgb,var(--status-completed)_82%,#000)]">
                          {e.sugerencia}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={aplicando || enviando}
                        onClick={() => aplicar(e)}
                        className="shrink-0 gap-1"
                      >
                        <Check className="size-3.5" /> Aplicar
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter className="gap-2 pt-3 sm:justify-between">
          <Button variant="ghost" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            onClick={onEnviar}
            disabled={enviando || aplicando}
            className={cn(
              "gap-2 font-semibold",
              "bg-gradient-to-r from-primary to-[color-mix(in_srgb,var(--primary)_70%,#7c3aed)] text-primary-foreground",
            )}
          >
            <Send className="size-4" />
            {errores.length > 0 ? "Enviar de todos modos" : "Enviar a revisión"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
