"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Check, RotateCcw, PlayCircle } from "lucide-react";
import { toast } from "sonner";

import { actionsFor, waitingLabel, type TaskAction, type TaskContext, type TaskVerb } from "@/lib/task-actions";
import type { AssetStatus } from "@/lib/brand";
import { EJECUTA_VERBO, TOAST_VERBO } from "@/components/board/verbos";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** Cada verbo con su ícono, para que el botón se lea de un vistazo. */
const ICONO_VERBO: Record<TaskVerb, typeof Send> = {
  start: PlayCircle,
  submit_review: Send,
  request_changes: RotateCcw,
  approve: Check,
  send_client: Send,
};

/**
 * Los botones de flujo del workspace. Renderizan la MISMA decisión que el
 * tablero y /mi-trabajo (actionsFor + EJECUTA_VERBO) — si cada pantalla
 * decidiera por su cuenta, ofrecerían acciones distintas para la misma tarea.
 *
 * Dos presentaciones:
 *   - "compacta"    → arriba a la derecha (junto al encabezado).
 *   - "prominente"  → barra al final del workspace, botón grande, para no tener
 *                     que subir a mandar a revisión. (Pedro)
 */
export function AccionesTarea({
  ideaId,
  status,
  ctx,
  variante = "compacta",
}: {
  ideaId: string;
  status: AssetStatus;
  ctx: TaskContext;
  variante?: "compacta" | "prominente";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
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
      router.refresh();
    });

  if (!acciones.length && !espera) return null;

  const prominente = variante === "prominente";

  const botones = acciones.map((a) => {
    const Icono = ICONO_VERBO[a.verb];
    return (
      <Button
        key={a.verb}
        size={prominente ? "lg" : "default"}
        disabled={pending}
        variant={a.tone === "danger" ? "destructive" : "default"}
        onClick={() => (a.needsBody ? setPidiendoTexto(a) : ejecutar(a))}
        className={cn(
          "gap-2 font-semibold shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md",
          a.tone === "primary" &&
            "bg-gradient-to-r from-primary to-[color-mix(in_srgb,var(--primary)_70%,#7c3aed)] text-primary-foreground",
          prominente && "px-6",
        )}
      >
        <Icono className={prominente ? "size-5" : "size-4"} />
        {a.label}
      </Button>
    );
  });

  const dialogo = (
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
  );

  if (prominente) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-secondary/30 px-4 py-5 sm:flex-row sm:justify-between">
        <div className="text-center sm:text-left">
          <p className="text-sm font-semibold text-foreground">
            {espera ? espera : "¿Lista esta tarea?"}
          </p>
          {!espera && (
            <p className="text-xs text-muted-foreground">
              Cuando termines, mándala al siguiente paso desde aquí.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">{botones}</div>
        {dialogo}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {espera && (
        <span className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
          {espera}
        </span>
      )}
      {botones}
      {dialogo}
    </div>
  );
}
