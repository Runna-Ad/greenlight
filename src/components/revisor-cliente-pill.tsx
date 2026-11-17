"use client";

// Pastilla del revisor del cliente (0099): nombre o «Sin asignar», y — si quien mira puede —
// un selector para ponerlo, cambiarlo o quitarlo. UNA sola pieza para el tablero, la tarea y
// el portal; el servidor (asignarRevisorCliente) vuelve a validar todo.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Eye, UserRound, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { asignarRevisorCliente } from "@/app/(app)/revisor-cliente-actions";
import type { PersonaCliente } from "@/lib/revisor-cliente";

export function RevisorClientePill({
  ideaId,
  revisor,
  opciones,
  editable,
  soyId = null,
  etiqueta = "Revisor",
  vacio = "Sin asignar",
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
  etiqueta?: string;
  vacio?: string;
  /** Sin revisor en «Con Cliente»: la pastilla se pinta en color de aviso. */
  alerta?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  // Optimista: se ve el cambio al instante y se regresa si el servidor lo rechaza.
  const [local, setLocal] = useState<{ base: PersonaCliente | null; valor: PersonaCliente | null }>({ base: revisor, valor: revisor });
  const actual = local.base === revisor ? local.valor : revisor;
  if (local.base !== revisor && !pendiente) setLocal({ base: revisor, valor: revisor });

  const elegir = (p: PersonaCliente | null) => {
    setAbierto(false);
    if ((p?.id ?? null) === (actual?.id ?? null)) return;
    const antes = actual;
    setLocal({ base: revisor, valor: p });
    startTransition(async () => {
      const res = await asignarRevisorCliente(ideaId, p?.id ?? null);
      if (!res.ok) {
        setLocal({ base: revisor, valor: antes });
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  };

  const tono = actual
    ? "border-border bg-secondary text-secondary-foreground"
    : alerta
      ? "border-status-warning/50 bg-status-warning/10 text-status-warning"
      : "border-dashed border-border text-muted-foreground";
  const contenido = (
    <>
      <Eye className="size-2.5 shrink-0" aria-hidden />
      <span className="truncate">
        {actual ? actual.name : vacio}
      </span>
    </>
  );
  const base = `inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${tono} ${className}`;
  const titulo = `${etiqueta}: ${actual ? actual.name : vacio}`;

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
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${base} cursor-pointer hover:brightness-95 disabled:opacity-60`}
          title={`${titulo} · cambiar`}
          aria-label={`${titulo}. Cambiar revisor`}
          disabled={pendiente}
          onClick={(e) => e.stopPropagation()}
        >
          {contenido}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1.5" onClick={(e) => e.stopPropagation()}>
        <p className="px-1 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {etiqueta}
        </p>
        <ul className="max-h-64 space-y-0.5 overflow-y-auto">
          {yo && (
            <li>
              <Opcion activa={actual?.id === yo.id} onClick={() => elegir(yo)}>
                <UserRound className="size-3.5" /> Asignarme
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
                <X className="size-3.5" /> Quitar revisor
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
      className="flex w-full min-h-8 items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-secondary"
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">{children}</span>
      {activa && <Check className="size-3.5 shrink-0 text-primary" aria-label="actual" />}
    </button>
  );
}
