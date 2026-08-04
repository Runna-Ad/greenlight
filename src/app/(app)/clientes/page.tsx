import Link from "next/link";
import { ArrowRight, Plus, FileText, Layers, AlertTriangle } from "lucide-react";
import { MOCK_CLIENTS } from "@/lib/mock";

export default function ClientesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
          La entrada
        </p>
        <h2 className="mt-1 text-2xl font-semibold text-foreground">
          Elige un cliente
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Cada cliente tiene su propio espacio: sus briefs, su tablero, su equipo
          asignado, sus instrucciones y legales. Nada se mezcla entre clientes.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MOCK_CLIENTS.map((client) => (
          <Link
            key={client.slug}
            href={`/${client.slug}/tablero`}
            className="group flex flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-center gap-3">
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white font-[family-name:var(--font-poppins)]"
                style={{ backgroundColor: client.brandColor }}
              >
                {client.initial}
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-base font-semibold text-foreground">
                  {client.name}
                </h3>
                <p className="truncate text-xs text-muted-foreground">
                  {client.tagline}
                </p>
              </div>
              <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4">
              <Stat icon={FileText} value={client.activeBriefs} label="briefs" />
              <Stat icon={Layers} value={client.openAssets} label="abiertos" />
              <Stat
                icon={AlertTriangle}
                value={client.overdue}
                label="atrasados"
                alert={client.overdue > 0}
              />
            </div>
          </Link>
        ))}

        <button
          type="button"
          className="flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-transparent p-5 text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-6" />
          <span className="text-sm font-medium">Nuevo cliente</span>
          <span className="text-xs text-muted-foreground">Se agrega desde Admin</span>
        </button>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  value,
  label,
  alert = false,
}: {
  icon: typeof FileText;
  value: number;
  label: string;
  alert?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon
        className={`size-3.5 ${alert ? "text-status-corrections" : "text-muted-foreground"}`}
      />
      <span
        className={`text-lg font-semibold tabular-nums font-[family-name:var(--font-poppins)] ${
          alert ? "text-status-corrections" : "text-foreground"
        }`}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
