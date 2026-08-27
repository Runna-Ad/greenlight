import { Lock } from "lucide-react";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { ROLE_LABEL, canSee, tracksVisibles } from "@/lib/roles";
import { cargarWorkload, cargarEvaluacion, resolverMes } from "./data";
import { PerformanceTabs } from "@/components/performance/performance-tabs";

export const dynamic = "force-dynamic";

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; tab?: string }>;
}) {
  const [role, soy] = await Promise.all([getViewAs(), getSoy()]);
  if (!canSee(role, "performance")) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
        <Lock className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-3 text-sm text-foreground">Un {ROLE_LABEL[role]} no entra a Performance.</p>
      </div>
    );
  }

  const sp = await searchParams;
  const { periodo, etiqueta, mesActual, mesPrev, mesNext } = resolverMes(sp.mes ?? null);
  const hoyId = resolverMes(null).mesActual;
  const tracks = tracksVisibles(role, soy?.tracks ?? null);
  const [carga, evaluacion] = await Promise.all([
    cargarWorkload(),
    cargarEvaluacion(tracks, periodo),
  ]);

  return (
    <PerformanceTabs
      carga={carga}
      evaluacion={evaluacion}
      tabInicial={sp.tab === "workload" ? "workload" : "evaluacion"}
      mes={{ etiqueta, actual: mesActual, prev: mesPrev, next: mesNext, esHoy: mesActual === hoyId }}
      soloMiEquipo={tracks !== null}
    />
  );
}
