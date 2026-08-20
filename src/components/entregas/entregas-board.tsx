import Link from "next/link";
import { ExternalLink, Sparkles } from "lucide-react";
import { Pill, type PillStatus } from "@/components/ui/pill";
import { chipTextColor } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/empty-state";
import { PackageCheck } from "lucide-react";
import { cn } from "@/lib/utils";

// Verde neón del logo (= --greenlight). Se pasa como HEX para que <Pill> pueda medir
// el contraste (var(--…) no es medible en JS) y devuelva tinta oscura sobre el neón.
const GREENLIT = "#00e676";

// Estado de una ENTREGA (una tarea que ya se envió al cliente = published_at set).
// Hoy son 3 buckets; cuando exista el portal del cliente, "con_cliente" se
// subdividirá (cliente revisando / aceptó) sin cambiar el resto.
export type EstadoEntrega = "con_cliente" | "en_cambios" | "entregado";

export type Entrega = {
  id: string;
  code: string | null;
  namingBase: string | null;
  entregaNum: string | null;
  entregaUrl: string | null;
  estado: EstadoEntrega;
  enviadaEl: string | null; // ya formateada por el server
  asignados: { name: string; color: string }[];
};

export type ClienteEntregas = {
  slug: string;
  name: string;
  color: string;
  entregas: Entrega[];
};

const META: Record<EstadoEntrega, { label: string; token: PillStatus; orden: number }> = {
  con_cliente: { label: "Con el cliente", token: "published", orden: 0 },
  en_cambios: { label: "En cambios", token: "corrections", orden: 1 },
  // "Greenlit" = el cliente lo aprobó (delivered). El momento de marca: verde neón + ✨.
  entregado: { label: "Greenlit", token: "delivered", orden: 2 },
};

export function EntregasBoard({ clientes }: { clientes: ClienteEntregas[] }) {
  const total = clientes.reduce((n, c) => n + c.entregas.length, 0);
  if (!total) {
    return (
      <EmptyState
        icon={PackageCheck}
        titulo="Todavía no hay entregas"
        descripcion="Cuando una tarea se envíe al cliente (Enviar a cliente), aparecerá aquí para seguir su estado."
      />
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {total} entrega{total === 1 ? "" : "s"} enviada{total === 1 ? "" : "s"} al cliente.
      </p>

      {clientes.map((c) => {
        // Con el cliente primero (necesita atención), luego cambios, luego entregado.
        const orden = [...c.entregas].sort((a, b) => META[a.estado].orden - META[b.estado].orden);
        const conteo = (e: EstadoEntrega) => c.entregas.filter((x) => x.estado === e).length;
        return (
          <section key={c.slug}>
            <div className="mb-2 flex items-center gap-2">
              <Pill color={c.color} dot>
                {c.name}
              </Pill>
              <span className="text-[11px] text-muted-foreground">
                {conteo("con_cliente")} con el cliente · {conteo("en_cambios")} en cambios ·{" "}
                {conteo("entregado")} Greenlit
              </span>
            </div>
            <div className="space-y-2">
              {orden.map((e) => (
                <FilaEntrega key={e.id} e={e} slug={c.slug} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function FilaEntrega({ e, slug }: { e: Entrega; slug: string }) {
  const meta = META[e.estado];
  // Greenlit (aprobado por el cliente) resalta: pleca verde neón + tinte sutil, para
  // que el estado feliz salte a la vista entre "con el cliente" y "en cambios".
  const esGreenlit = e.estado === "entregado";
  return (
    <div
      className={cn(
        "gl-card relative flex flex-wrap items-center gap-x-3 gap-y-2 p-3",
        esGreenlit && "border-[color-mix(in_srgb,var(--greenlight-ink)_38%,var(--border))]",
      )}
      style={
        esGreenlit
          ? {
              boxShadow: "inset 3px 0 0 var(--greenlight-ink)",
              background: "color-mix(in srgb, var(--greenlight) 7%, var(--card))",
            }
          : undefined
      }
    >
      {/* Toda la fila abre la tarea (link estirado); "Abrir entregable" va con
          z-10 encima para no chocar con la navegación. */}
      <Link
        href={`/${slug}/tareas/${e.id}`}
        aria-label={`Abrir ${e.namingBase ?? "tarea"}`}
        className="absolute inset-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {esGreenlit ? (
        <Pill color={GREENLIT} fill="solid" className="font-bold">
          <Sparkles className="size-3" /> {meta.label}
        </Pill>
      ) : (
        <Pill status={meta.token}>{meta.label}</Pill>
      )}

      {e.code && (
        <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-secondary-foreground">
          {e.code}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-foreground">
        {e.namingBase ?? "—"}
      </span>

      {e.entregaNum && <span className="text-[11px] text-muted-foreground">{e.entregaNum}</span>}
      {e.enviadaEl && (
        <span className="text-[11px] text-muted-foreground" title="Enviada al cliente">
          {e.enviadaEl}
        </span>
      )}

      {/* Asignados: avatares pequeños con contraste AA. */}
      {e.asignados.length > 0 && (
        <div className="flex -space-x-1.5">
          {e.asignados.slice(0, 4).map((a, i) => (
            <span
              key={i}
              title={a.name}
              className="grid size-6 place-items-center rounded-full border-2 border-background text-[9px] font-semibold"
              style={{ backgroundColor: a.color, color: chipTextColor(a.color) }}
            >
              {a.name.slice(0, 2).toUpperCase()}
            </span>
          ))}
        </div>
      )}

      {e.entregaUrl ? (
        <a
          href={e.entregaUrl}
          target="_blank"
          rel="noreferrer"
          className="relative z-10 inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-secondary"
        >
          <ExternalLink className="size-3" /> Abrir entregable
        </a>
      ) : (
        <span className="text-[11px] text-muted-foreground/70">Sin link</span>
      )}
    </div>
  );
}
