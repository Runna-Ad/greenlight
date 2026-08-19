"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { WorkloadBoard, type WorkloadMember } from "@/components/workload/workload-board";
import { EvaluacionBoard } from "./evaluacion-board";
import type { EvalMiembro } from "@/lib/evaluacion";
import { cn } from "@/lib/utils";

type Mes = { etiqueta: string; actual: string; prev: string; next: string; esHoy: boolean };

export function PerformanceTabs({
  carga,
  evaluacion,
  tabInicial,
  mes,
  soloMiEquipo,
}: {
  carga: WorkloadMember[];
  evaluacion: EvalMiembro[];
  tabInicial: "evaluacion" | "workload";
  mes: Mes;
  soloMiEquipo: boolean;
}) {
  const [tab, setTab] = useState<"evaluacion" | "workload">(tabInicial);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <header className="mb-4">
        <p className="gl-eyebrow">Equipo</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Performance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tab === "evaluacion"
            ? "Cómo rinde cada especialista — puntaje por criterio, rondas de cambios y tiempo."
            : "Lo que cada persona tiene en curso, para balancear asignaciones."}
        </p>
      </header>

      <div className="mb-4 flex items-center gap-1 border-b border-border">
        <TabBtn active={tab === "evaluacion"} onClick={() => setTab("evaluacion")}>
          Evaluación
        </TabBtn>
        <TabBtn active={tab === "workload"} onClick={() => setTab("workload")}>
          Workload
        </TabBtn>
      </div>

      {tab === "evaluacion" ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
              <Link
                href={`/performance?mes=${mes.prev}`}
                scroll={false}
                aria-label="Mes anterior"
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <ChevronLeft className="size-4" />
              </Link>
              <span className="min-w-[8.5rem] text-center text-sm font-semibold lowercase first-letter:uppercase text-foreground">
                {mes.etiqueta}
              </span>
              <Link
                href={`/performance?mes=${mes.next}`}
                scroll={false}
                aria-label="Mes siguiente"
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <ChevronRight className="size-4" />
              </Link>
            </div>
            {!mes.esHoy && (
              <Link
                href="/performance"
                scroll={false}
                className="rounded-md px-2 py-1 text-[12px] font-medium text-primary hover:bg-secondary"
              >
                Hoy
              </Link>
            )}
            {soloMiEquipo && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Users className="size-3" /> Sólo tu equipo
              </span>
            )}
          </div>
          <EvaluacionBoard miembros={evaluacion} />
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            El puntaje es por tarea: un cambio de un tipo pone 0 en ese criterio para esa tarea; sin
            cambios, 10. El puntaje del especialista es el promedio de sus tareas. Los datos se
            acumulan desde que se activó la Evaluación, así que al principio habrá pocas tareas.
          </p>
        </>
      ) : (
        <WorkloadBoard miembros={carga} />
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
