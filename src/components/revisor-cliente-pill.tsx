"use client";

// Pastilla del revisor del cliente (0099): nombre o «Sin revisor», y — si quien mira puede —
// un selector para ponerlo, cambiarlo o quitarlo. UNA sola pieza para el tablero, la tarea y
// el portal; el servidor (asignarRevisorCliente) vuelve a validar todo.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Check, Eye, Loader2, UserRound, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { asignarRevisorCliente } from "@/app/(app)/revisor-cliente-actions";
import { REVISOR_ETIQUETA, REVISOR_VACIO, type PersonaCliente } from "@/lib/revisor-cliente";

export function RevisorClientePill({
  ideaId,
  revisor,
  opciones,
  editable,
  soyId = null,
  alerta = false,
  className = "",
}: {
  ideaId: string;
  revisor: PersonaCliente | null;
  /** Usuarios activos de la empresa (las opciones). */
  opciones: PersonaCliente[];
  editable: boolean;
  /** Perfil de quien mira, si es usuario de la empresa: pone «Asignarme» arriba. */
  soyId?: string | null;
  /** Sin revisor en «Con Cliente»: la pastilla se pinta en color de aviso. */
  alerta?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  // Optimista: se ve el cambio al instante y se regresa si el servidor lo rechaza o falla.
  // `base` = el revisor que traía el servidor; cuando llega otro, se adopta (comparado por id).
  const idServidor = revisor?.id ?? null;
  const [local, setLocal] = useState<{ base: string | null; valor: PersonaCliente | null }>({ base: idServidor, valor: revisor });
  if (local.base !== idServidor && !pendiente) setLocal({ base: idServidor, valor: revisor });
  const actual = local.base === idServidor ? local.valor : revisor;

  const elegir = (p: PersonaCliente | null) => {
    setAbierto(false);
    if (pendiente || (p?.id ?? null) === (actual?.id ?? null)) return;
    const antes = actual;
    setLocal({ base: idServidor, valor: p });
    startTransition(async () => {
      const volver = (msg: string) => {
        setLocal({ base: idServidor, valor: antes });
        toast.error(msg);
      };
      try {
        const res = await asignarRevisorCliente(ideaId, p?.id ?? null);
        if (!res.ok) return volver(res.error);
        router.refresh();
      } catch {
        volver("No se pudo guardar el revisor. Revisa tu conexión e intenta de nuevo.");
      }
    });
  };

  const tono = actual
    ? "border-border bg-secondary text-secondary-foreground"
    : alerta
      ? "border-status-warning/60 bg-status-warning/10 text-[color-mix(in_srgb,var(--status-warning)_70%,#000)]"
      : "border-dashed border-border text-muted-foreground";
  const Icono = pendiente ? Loader2 : !actual && alerta ? AlertTriangle : Eye;
  const contenido = (
    <>
      <Icono className={`size-3 shrink-0 ${pendiente ? "animate-spin" : ""}`} aria-hidden />
      <span className="truncate">{actual ? actual.name : REVISOR_VACIO}</span>
    </>
  );
  const base = `inline-flex min-h-6 max-w-full min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tono} ${className}`;
  const titulo = `${REVISOR_ETIQUETA}: ${actual ? actual.name : REVISOR_VACIO}`;

  if (!editable) {
    return (
      <span className={base} title={titulo}>
        {contenido}
      </span>
    );
  }

  const yo = soyId ? opciones.find((o) => o.id === soyId) : undefined;
  const otros = opciones.filter((o) => o.id !== soyId);

  return (
    <Popover open={abierto} onOpenChange={(v) => !pendiente && setAbierto(v)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${base} cursor-pointer hover:brightness-95 aria-busy:cursor-progress`}
          title={`${titulo} · cambiar`}
          aria-label={`${titulo}. Cambiar revisor`}
          aria-busy={pendiente}
          onClick={(e) => e.stopPropagation()}
        >
          {contenido}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1.5" onClick={(e) => e.stopPropagation()}>
        <p id={`revisor-${ideaId}`} className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {REVISOR_ETIQUETA}
        </p>
        <ul aria-labelledby={`revisor-${ideaId}`} className="max-h-64 space-y-0.5 overflow-y-auto">
          {yo && (
            <li>
              <Opcion activa={actual?.id === yo.id} onClick={() => elegir(yo)}>
                <UserRound className="size-3.5" aria-hidden /> Asignarme
              </Opcion>
            </li>
          )}
          {otros.map((o) => (
            <li key={o.id}>
              <Opcion activa={actual?.id === o.id} onClick={() => elegir(o)}>
                {o.name}
              </Opcion>
            </li>
          ))}
          {opciones.length === 0 && (
            <li className="px-2 py-1.5 text-[11px] text-muted-foreground">Esta empresa no tiene usuarios activos.</li>
          )}
          {actual && (
            <li className="mt-1 border-t border-border pt-1">
              <Opcion activa={false} onClick={() => elegir(null)}>
                <X className="size-3.5" aria-hidden /> Quitar revisor
              </Opcion>
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function Opcion({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className="flex min-h-8 w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-secondary"
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">{children}</span>
      {activa && <Check className="size-3.5 shrink-0 text-primary" aria-hidden />}
    </button>
  );
}
