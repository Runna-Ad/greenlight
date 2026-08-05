import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import type { BundleTask } from "@/lib/bundle";

/**
 * Las flechas ← 2/10 → del wireframe: recorrer las tareas del bundle sin
 * volver a la lista. Server component — la posición ya viene calculada por
 * lib/bundle.ts (la misma fuente que los cards de briefs).
 *
 * indice -1 = la tarea abierta no está en el bundle filtrado (un especialista
 * abrió por URL una tarea ajena): "— / n" y flechas apagadas.
 */
export function NavBundle({
  cliente,
  indice,
  total,
  anterior,
  siguiente,
}: {
  cliente: string;
  indice: number;
  total: number;
  anterior: BundleTask | null;
  siguiente: BundleTask | null;
}) {
  if (total === 0) return null;

  return (
    <nav aria-label="Navegar el bundle" className="flex items-center gap-1.5">
      <Flecha
        href={anterior ? `/${cliente}/tareas/${anterior.id}` : null}
        label={anterior ? `Anterior: ${anterior.naming_base ?? anterior.code ?? ""}` : "No hay anterior"}
      >
        <ArrowLeft className="size-4" />
      </Flecha>

      <span className="min-w-12 text-center font-mono text-xs text-muted-foreground">
        {indice >= 0 ? indice + 1 : "—"} / {total}
      </span>

      <Flecha
        href={siguiente ? `/${cliente}/tareas/${siguiente.id}` : null}
        label={siguiente ? `Siguiente: ${siguiente.naming_base ?? siguiente.code ?? ""}` : "No hay siguiente"}
      >
        <ArrowRight className="size-4" />
      </Flecha>
    </nav>
  );
}

function Flecha({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const clase =
    "flex size-8 items-center justify-center rounded-md border border-border transition-colors";
  if (!href) {
    return (
      <span aria-disabled className={`${clase} cursor-default text-muted-foreground/30`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} title={label} className={`${clase} text-foreground hover:bg-secondary`}>
      {children}
    </Link>
  );
}
