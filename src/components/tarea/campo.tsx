"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { guardarCampo, type Tabla } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import { cn } from "@/lib/utils";

export type EstadoGuardado = "limpio" | "pendiente" | "guardando" | "guardado" | "error";

/**
 * Un campo de la plantilla, con autoguardado por CAMPO.
 *
 * No hay botón de guardar: el indicador ES la afordancia. Debounce de 800 ms y
 * flush al salir del campo, para que salir de la pantalla no pierda lo último.
 *
 * Si otra persona cambió el mismo campo mientras escribías, no se descarta nada
 * en silencio: se enseñan los dos valores y decides.
 */
export function Campo({
  tabla,
  filaId,
  campo,
  label,
  valorInicial,
  placeholder,
  rows = 3,
  mono,
  soloLectura,
  onCambio,
}: {
  tabla: Tabla;
  filaId: string;
  campo: string;
  label: string;
  valorInicial: string | null;
  placeholder?: string;
  rows?: number;
  mono?: boolean;
  soloLectura?: boolean;
  /** Para que el preview se actualice en la misma tecla, sin ir al servidor. */
  onCambio?: (valor: string) => void;
}) {
  const [valor, setValor] = useState(valorInicial ?? "");
  const [estado, setEstado] = useState<EstadoGuardado>("limpio");
  const [conflicto, setConflicto] = useState<string | null>(null);
  const guardado = useRef<string | null>(valorInicial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistir = async (v: string) => {
    if ((guardado.current ?? "") === v) return;
    setEstado("guardando");
    const res = await guardarCampo(tabla, filaId, campo, guardado.current, v || null);
    if (res.ok) {
      guardado.current = v || null;
      setEstado("guardado");
      return;
    }
    if ("conflicto" in res && res.conflicto) {
      setConflicto(res.valorActual ?? "");
      setEstado("error");
      return;
    }
    setEstado("error");
  };

  const alEscribir = (v: string) => {
    setValor(v);
    onCambio?.(v);
    setEstado("pendiente");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void persistir(v), 800);
  };

  // Flush al desmontar: navegar no debe tragarse lo último escrito.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Indicador estado={estado} />
      </div>

      <textarea
        value={valor}
        rows={rows}
        readOnly={soloLectura}
        onChange={(e) => alEscribir(e.target.value)}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          void persistir(valor);
        }}
        placeholder={placeholder}
        aria-label={label}
        className={cn(
          "w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-[13px] leading-relaxed outline-none transition-colors",
          "placeholder:text-muted-foreground/55 focus-visible:ring-2 focus-visible:ring-ring",
          mono && "font-mono",
          conflicto !== null ? "border-status-corrections" : "border-input",
          soloLectura && "cursor-default bg-secondary/40",
        )}
      />

      {conflicto !== null && (
        <div className="mt-1.5 rounded-md border border-status-corrections bg-[color-mix(in_srgb,var(--status-corrections)_8%,transparent)] p-2 text-[11px]">
          <p className="flex items-center gap-1.5 font-medium text-status-corrections">
            <AlertTriangle className="size-3.5 shrink-0" />
            Alguien más cambió este campo mientras escribías
          </p>
          <p className="mt-1.5 text-muted-foreground">
            Ahora dice: <span className="text-foreground">{conflicto || "(vacío)"}</span>
          </p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                guardado.current = conflicto || null;
                setConflicto(null);
                void persistir(valor);
              }}
              className="rounded bg-status-corrections px-2 py-1 font-medium text-white"
            >
              Quedarme con lo mío
            </button>
            <button
              onClick={() => {
                setValor(conflicto);
                onCambio?.(conflicto);
                guardado.current = conflicto || null;
                setConflicto(null);
                setEstado("limpio");
              }}
              className="rounded border border-border px-2 py-1 font-medium text-foreground hover:bg-secondary"
            >
              Tomar lo suyo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Indicador({ estado }: { estado: EstadoGuardado }) {
  if (estado === "limpio") return null;
  const texto = {
    pendiente: "sin guardar",
    guardando: "guardando…",
    guardado: "guardado",
    error: "no se pudo guardar",
  }[estado];
  const color =
    estado === "guardado"
      ? "text-status-completed"
      : estado === "error"
        ? "text-status-corrections"
        : "text-muted-foreground";
  return <span className={cn("text-[10px]", color)}>{texto}</span>;
}
