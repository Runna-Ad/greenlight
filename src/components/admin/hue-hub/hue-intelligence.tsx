"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles, SpellCheck, Gauge, RefreshCcw, Timer, Tag, ScrollText, Clock } from "lucide-react";
import { toast } from "sonner";
import { hubIntelligence } from "@/app/(app)/admin/hue-actions";
import type { HubIntel, AdopcionKind } from "@/lib/hue-data";
import { cn } from "@/lib/utils";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const num1 = (n: number | null) => (n === null ? "—" : n.toFixed(1));

export function HueIntelligence() {
  const [mes, setMes] = useState<string | null>(null);
  const [intel, setIntel] = useState<HubIntel | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    hubIntelligence(mes).then((res) => {
      if (!vivo) return;
      if (res.ok) setIntel(res.intel);
      else toast.error(res.error);
      setCargando(false);
    });
    // Nota: si falla, intel conserva el mes cargado y las flechas navegan desde ÉL
    // (intel.mesPrev/mesNext), no desde el `mes` fallido → la navegación queda consistente.
    return () => {
      vivo = false;
    };
  }, [mes]);

  // El loading en el cambio de mes se enciende en el handler (no en el effect — lint).
  const irMes = (m: string) => {
    setCargando(true);
    setMes(m);
  };

  if (cargando && !intel) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>;
  }
  if (!intel) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No se pudo cargar la analítica.</p>;
  }

  const sinDatos = intel.tareas === 0;

  return (
    <div className={cn("space-y-4", cargando && "opacity-60")}>
      {/* Navegación de mes */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => irMes(intel.mesPrev)}
          className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
          aria-label="Mes anterior"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-medium capitalize text-foreground">{intel.etiqueta}</span>
        <button
          type="button"
          onClick={() => irMes(intel.mesNext)}
          className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
          aria-label="Mes siguiente"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {sinDatos && (
        <div className="rounded-lg border border-dashed border-border bg-secondary/20 p-4 text-center text-sm text-muted-foreground">
          No hay tareas aprobadas este mes todavía — las tarjetas se llenan conforme el equipo trabaje.
          La adopción de H.Ü.E abajo se registra en cuanto se use el validador o la ortografía.
        </div>
      )}

      {/* Adopción de H.Ü.E — se llena en cuanto se usa, no depende de tareas cerradas */}
      <div>
        <p className="gl-eyebrow mb-2">Adopción de sugerencias de H.Ü.E</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Adopcion titulo="Validador de cambios" icon={Sparkles} a={intel.adopcionValidador} />
          <Adopcion titulo="Ortografía" icon={SpellCheck} a={intel.adopcionOrtografia} />
        </div>
      </div>

      {/* Calidad / eficiencia — acotadas a tareas del mes */}
      <div>
        <p className="gl-eyebrow mb-2">Calidad y eficiencia · {intel.tareas} tarea{intel.tareas === 1 ? "" : "s"} este mes</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={Gauge} label="Tareas sin correcciones" valor={`${intel.tareasLimpias}/${intel.tareas}`} hint="entregadas limpias" />
          <Stat icon={RefreshCcw} label="Correcciones / tarea" valor={num1(intel.correccionesPorTarea)} hint={`${intel.correccionesTotal} en total`} />
          <Stat icon={RefreshCcw} label="Rebote a cambios" valor={pct(intel.bounceRate)} hint={`${intel.bounceTareas} tarea(s)`} />
          <Stat icon={Timer} label="Ciclo (mediana)" valor={intel.cicloMedianoDias === null ? "—" : `${num1(intel.cicloMedianoDias)} d`} hint="asignación → aprobada" />
        </div>
      </div>

      {/* Snippets más usados — histórico de la biblioteca */}
      <div className="grid gap-3 sm:grid-cols-2">
        <TopSnippets titulo="Selling points más usados" icon={Tag} filas={intel.topSellingPoints} />
        <TopSnippets titulo="Legales más usados" icon={ScrollText} filas={intel.topLegales} />
      </div>

      {/* Honestidad: lo que necesita NLP no se finge */}
      <div className="flex items-start gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
        <Clock className="mt-0.5 size-3.5 shrink-0" />
        <span>
          <span className="font-medium text-foreground">Próximamente:</span> métricas sobre texto libre (hooks/CTAs
          más usados en el copy) necesitan análisis de lenguaje — no se muestran cuentas inventadas.
        </span>
      </div>
    </div>
  );
}

function Adopcion({ titulo, icon: Icon, a }: { titulo: string; icon: typeof Sparkles; a: AdopcionKind }) {
  const rechazadas = a.ignoradas + a.descartadas;
  const decididas = a.aplicadas + rechazadas;
  const tasa = decididas ? a.aplicadas / decididas : null;
  return (
    <div className="gl-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <span className="text-sm font-medium text-foreground">{titulo}</span>
      </div>
      {a.ofrecidas === 0 ? (
        <p className="text-xs text-muted-foreground">Sin sugerencias registradas este mes.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold text-foreground">{pct(tasa)}</span>
            <span className="text-xs text-muted-foreground">adopción</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {a.aplicadas} aplicadas · {rechazadas} rechazadas · {a.sinDecidir} sin decidir · {a.ofrecidas} ofrecidas
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, valor, hint }: { icon: typeof Gauge; label: string; valor: string; hint: string }) {
  return (
    <div className="gl-card p-3">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-foreground">{valor}</div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function TopSnippets({ titulo, icon: Icon, filas }: { titulo: string; icon: typeof Tag; filas: { title: string; usos: number }[] }) {
  return (
    <div className="gl-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-primary" />
        <span className="text-sm font-medium text-foreground">{titulo}</span>
      </div>
      {filas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin uso registrado en la biblioteca todavía.</p>
      ) : (
        <ul className="space-y-1.5">
          {filas.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-foreground">{f.title}</span>
              <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                {f.usos}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
