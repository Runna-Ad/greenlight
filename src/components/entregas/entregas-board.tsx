import { ExternalLink } from "lucide-react";
import { Pill, type PillStatus } from "@/components/ui/pill";
import { chipTextColor } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/empty-state";
import { PackageCheck } from "lucide-react";

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
  entregado: { label: "Entregado", token: "delivered", orden: 2 },
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
                {conteo("entregado")} entregadas
              </span>
            </div>
            <div className="space-y-2">
              {orden.map((e) => (
                <FilaEntrega key={e.id} e={e} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function FilaEntrega({ e }: { e: Entrega }) {
  const meta = META[e.estado];
  return (
    <div className="gl-card flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
      <Pill status={meta.token}>{meta.label}</Pill>

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
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-secondary"
        >
          <ExternalLink className="size-3" /> Abrir entregable
        </a>
      ) : (
        <span className="text-[11px] text-muted-foreground/70">Sin link</span>
      )}
    </div>
  );
}
