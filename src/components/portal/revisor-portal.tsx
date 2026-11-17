"use client";

// Revisor del cliente en el PORTAL (0099). La página arma una sola vez quién revisa cada
// pieza y las opciones; cada fila la pinta con <RevisorPortal>. El interruptor «Mis tareas»
// sólo guarda una cookie: el filtro lo hace el servidor (page.tsx).

import { createContext, useContext, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AssetStatus } from "@/lib/brand";
import { COOKIE_MIS_TAREAS, equipoPuedeCambiar, type PersonaCliente } from "@/lib/revisor-cliente";
import { RevisorClientePill } from "@/components/revisor-cliente-pill";

export type RevisorPortalValor = {
  revisores: Record<string, PersonaCliente | null>;
  opciones: PersonaCliente[];
  /** Perfil de quien mira si es usuario de la empresa (para «Asignarme»). */
  soyId: string | null;
  /** cliente = lo cambia siempre; equipo = regla del tablero (equipoPuedeCambiar); lectura = no. */
  modo: "cliente" | "equipo" | "lectura";
  /** Rol de quien mira (para la regla del equipo: master siempre, admin en «Con Cliente» / «En cambios»). */
  rol?: string;
};

const Ctx = createContext<RevisorPortalValor | null>(null);

export function RevisorPortalProvider({ valor, children }: { valor: RevisorPortalValor; children: React.ReactNode }) {
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** Pastilla de una pieza. `status` undefined = pieza «En producción» (sin estado visible). */
export function RevisorPortal({
  ideaId,
  status,
  className,
  soloVer = false,
}: {
  ideaId: string;
  status?: AssetStatus;
  className?: string;
  /** Dentro de un link (tarjeta entera clicable): sólo se pinta, no abre el selector. */
  soloVer?: boolean;
}) {
  const v = useContext(Ctx);
  if (!v) return null;
  // Equipo: la misma regla que el tablero y la tarea (master siempre: cuenta de respaldo).
  const editable = !soloVer && (v.modo === "cliente" || (v.modo === "equipo" && equipoPuedeCambiar(v.rol, status)));
  return (
    <RevisorClientePill
      ideaId={ideaId}
      revisor={v.revisores[ideaId] ?? null}
      opciones={v.opciones}
      editable={editable}
      soyId={v.soyId}
      className={className}
    />
  );
}

/** Interruptor «Mis tareas»: encendido deja sólo las piezas que revisa quien mira. Se guarda en
 *  una cookie (un año) para que siga puesto al navegar y al volver otro día. */
export function MisTareasToggle({ activo, soyId }: { activo: boolean; soyId: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const cambiar = () => {
    // El valor es el id de quien lo prendió: otro usuario en el mismo navegador no lo hereda.
    const seguro = location.protocol === "https:" ? "; secure" : "";
    document.cookie = activo
      ? `${COOKIE_MIS_TAREAS}=; path=/; max-age=0; samesite=lax${seguro}`
      : `${COOKIE_MIS_TAREAS}=${soyId}; path=/; max-age=31536000; samesite=lax${seguro}`;
    startTransition(() => router.refresh());
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      onClick={cambiar}
      disabled={pendiente}
      className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground shadow-sm hover:bg-secondary disabled:opacity-60"
    >
      <span
        aria-hidden
        className={`relative h-4 w-7 rounded-full transition-colors ${activo ? "bg-primary" : "bg-muted-foreground/30"}`}
      >
        <span className={`absolute top-0.5 size-3 rounded-full bg-white shadow transition-all ${activo ? "left-3.5" : "left-0.5"}`} />
      </span>
      Mis tareas
    </button>
  );
}
