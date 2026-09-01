import { Crown } from "lucide-react";
import { Pill, type PillStatus } from "@/components/ui/pill";
import { chipTextColor } from "@/lib/vocab";
import { EmptyState } from "@/components/ui/empty-state";
import { GaugeCircle } from "lucide-react";

// Una persona con su carga de trabajo VIVA (tareas asignadas no publicadas/entregadas),
// desglosada por estado y por cliente. La calcula la página (server); esto sólo pinta.
export type WorkloadMember = {
  id: string;
  name: string;
  /** Track HOME (agrupa y ordena). Para lo que la persona ABARCA, usa `tracks`. */
  track: "real" | "normal";
  /** Tracks a los que pertenece (0059). Una persona puede ser de uno o de ambos. */
  tracks: ("real" | "normal")[];
  /** Rol real (lead / creative) — se muestra como pastilla junto a los tracks. */
  role: string;
  color: string;
  es_lead: boolean;
  total: number;
  porEstado: { token: PillStatus; label: string; count: number }[];
  porCliente: { name: string; slug: string; color: string; count: number }[];
};

// Por encima de esto, la persona se marca "Cargado" (umbral simple; ajustable).
const UMBRAL = 6;

export function WorkloadBoard({ miembros }: { miembros: WorkloadMember[] }) {
  const conCarga = miembros.filter((m) => m.total > 0);
  if (!conCarga.length) {
    return (
      <EmptyState
        icon={GaugeCircle}
        titulo="Nadie tiene tareas activas"
        descripcion="Cuando se asignen tareas, aquí verás la carga de cada persona."
      />
    );
  }

  // La barra se escala contra la persona MÁS cargada, para comparar de un vistazo.
  const maxTotal = Math.max(1, ...miembros.map((m) => m.total));
  const totalActivo = miembros.reduce((n, m) => n + m.total, 0);

  // UNA fila por persona, con sus tracks como pastillas — ya NO secciones por equipo
  // (Pedro 2026-09-01). Desde que alguien puede ser de VARIOS tracks, agrupar obliga a
  // elegir entre duplicar a la persona (y que su carga se lea dos veces) o esconder la
  // mitad de su realidad. La pertenencia es un ATRIBUTO suyo, no el eje de la lista.
  const gente = [...miembros].sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {totalActivo} tarea{totalActivo === 1 ? "" : "s"} activa{totalActivo === 1 ? "" : "s"} repartida
        {totalActivo === 1 ? "" : "s"} entre {conCarga.length} persona{conCarga.length === 1 ? "" : "s"}.
      </p>

      <div className="space-y-2">
        {gente.map((m) => (
          <MemberRow key={m.id} m={m} maxTotal={maxTotal} />
        ))}
      </div>
    </div>
  );
}

const TRACK_LABEL: Record<string, string> = { real: "Real", normal: "Normal" };
const ROL_LABEL: Record<string, string> = { lead: "Lead", creative: "Especialista" };

function MemberRow({ m, maxTotal }: { m: WorkloadMember; maxTotal: number }) {
  const cargado = m.total >= UMBRAL;
  const pct = Math.round((m.total / maxTotal) * 100);

  return (
    <div className="gl-card p-3">
      <div className="flex items-center gap-3">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
          style={{ backgroundColor: m.color, color: chipTextColor(m.color) }}
        >
          {m.name.slice(0, 2).toUpperCase()}
        </span>

        <div className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
            {m.es_lead && <Crown className="size-3 shrink-0 text-muted-foreground" />}
            {m.name}
            {/* Rol + tracks como pastillas: la persona se lee entera en su fila, sin
                depender de bajo qué encabezado esté. */}
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {ROL_LABEL[m.role] ?? m.role}
            </span>
            {m.tracks.map((t) => (
              <span
                key={t}
                className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                title={`Trabaja en el equipo ${TRACK_LABEL[t] ?? t}`}
              >
                {TRACK_LABEL[t] ?? t}
              </span>
            ))}
          </span>
          {/* Barra de carga: primaria normal, ámbar oscuro si va cargado. */}
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: cargado
                  ? "color-mix(in srgb, var(--status-warning) 80%, #000)"
                  : "var(--primary)",
              }}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {cargado && <Pill status="warning">Cargado</Pill>}
          <span className="text-lg font-semibold tabular-nums text-foreground">{m.total}</span>
        </div>
      </div>

      {/* Desglose: por ESTADO (pastilla de estado) y por CLIENTE (color de marca). */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
        {m.porEstado.map((e) => (
          <Pill key={e.token} status={e.token}>
            {e.label}: {e.count}
          </Pill>
        ))}
        {m.porCliente.length > 1 && (
          <>
            <span className="mx-0.5 h-3.5 w-px bg-border" aria-hidden />
            {m.porCliente.map((c) => (
              <Pill key={c.slug} color={c.color} dot>
                {c.name}: {c.count}
              </Pill>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
