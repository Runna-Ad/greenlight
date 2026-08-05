"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";

import { actionsFor, waitingLabel, type TaskAction, type TaskContext } from "@/lib/task-actions";
import type { AssetStatus } from "@/lib/brand";
import { EJECUTA_VERBO, TOAST_VERBO } from "@/components/board/verbos";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/**
 * Los botones de flujo, en el workspace (wireframe: "Enviar a revisión" arriba
 * a la derecha). Renderiza la MISMA decisión que el tablero y /mi-trabajo
 * (actionsFor + EJECUTA_VERBO) — si cada pantalla decidiera por su cuenta,
 * ofrecerían acciones distintas para la misma tarea.
 */
export function AccionesTarea({
  ideaId,
  status,
  ctx,
}: {
  ideaId: string;
  status: AssetStatus;
  ctx: TaskContext;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // La acción que está esperando su texto obligatorio (Mandar cambios).
  const [pidiendoTexto, setPidiendoTexto] = useState<TaskAction | null>(null);
  const [texto, setTexto] = useState("");

  const acciones = actionsFor(status, ctx);
  const espera = waitingLabel(status, ctx);

  const ejecutar = (action: TaskAction, body?: string) =>
    startTransition(async () => {
      const res = await EJECUTA_VERBO[action.verb](ideaId, body);
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo completar la acción.");
        return;
      }
      const msg = TOAST_VERBO[action.verb];
      if (msg) toast.success(msg);
      setPidiendoTexto(null);
      setTexto("");
      // El estado vive en el servidor; el chip y los botones se re-derivan.
      router.refresh();
    });

  if (!acciones.length && !espera) return null;

  return (
    <div className="flex items-center gap-2">
      {espera && (
        <span className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
          {espera}
        </span>
      )}
      {acciones.map((a) => (
        <Button
          key={a.verb}
          size="sm"
          disabled={pending}
          variant={a.tone === "danger" ? "destructive" : "default"}
          onClick={() => (a.needsBody ? setPidiendoTexto(a) : ejecutar(a))}
        >
          <Send className="size-3.5" /> {a.label}
        </Button>
      ))}

      {/* Pedir cambios sin decir cuáles no sirve de nada — el texto es obligatorio. */}
      <Dialog open={pidiendoTexto !== null} onOpenChange={(o) => !o && setPidiendoTexto(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pidiendoTexto?.label}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={4}
            placeholder="¿Qué hay que corregir? Quien la trabaja recibirá este texto."
            aria-label="Qué hay que corregir"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPidiendoTexto(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={pending || !texto.trim()}
              onClick={() => pidiendoTexto && ejecutar(pidiendoTexto, texto.trim())}
            >
              Mandar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
