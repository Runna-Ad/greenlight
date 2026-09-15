"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { hubPrismaInforme } from "@/app/(app)/admin/hue-actions";
import type { Informe } from "@/lib/prisma/informe";
import { CAMPO_VEREDICTO_LABEL, TOOL_LABEL } from "@/lib/prisma/copy";
import { TOOLS, type Tool } from "@/lib/prisma/spec";

const DIAS = [7, 30, 90] as const;
const pct = (a: number, b: number): string => (b ? `${Math.round((100 * a) / b)} %` : "—");
const nombreTool = (t: string): string => ((TOOLS as string[]).includes(t) ? TOOL_LABEL[t as Tool].es : t);

/**
 * Hub › Prisma › Informe: lo que la ronda de prueba con diseñadores mide (plan §5), desde lo que
 * Prisma ya registra. Los criterios de salida a v2 (≥ 70 % copiados sin refinar, ≥ 60 % aceptados
 * a la 1ª o tras una corrección) se ven aquí en números, no por sensación.
 */
export function PrismaInforme() {
  const [dias, setDias] = useState<(typeof DIAS)[number]>(30);
  const [informe, setInforme] = useState<Informe | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Qué periodo está cargando: se fija en el click (o al montar, como valor inicial), nunca con un
  // setState síncrono dentro del efecto (regla del React Compiler); el efecto sólo dispara la carga.
  const [cargandoDe, setCargandoDe] = useState<number | null>(30);
  const cargando = cargandoDe !== null;

  useEffect(() => {
    let vivo = true;
    hubPrismaInforme(dias)
      .then((r) => {
        if (!vivo) return;
        if (!r.ok) return setError(r.error);
        setError(null);
        setInforme(r.informe);
      })
      .catch(() => vivo && setError("No se pudo cargar el informe."))
      .finally(() => vivo && setCargandoDe((c) => (c === dias ? null : c)));
    return () => {
      vivo = false;
    };
  }, [dias]);

  const r = informe?.resultados;
  const copiados = informe ? informe.porHerramienta.reduce((n, h) => n + h.copiados, 0) : 0;
  const sinRefinar = informe ? informe.porHerramienta.reduce((n, h) => n + h.copiadosSinRefinar, 0) : 0;

  return (
    <section className="space-y-4" aria-busy={cargando}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Informe de uso</h3>
          <p className="text-xs text-muted-foreground">Lo que mide la ronda de prueba, calculado desde lo que Prisma ya registra. Meta para v2: ≥ 70 % de prompts copiados sin refinar y ≥ 60 % de resultados aceptados a la primera o tras una corrección.</p>
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Periodo">
          {DIAS.map((d) => (
            <button key={d} type="button" onClick={() => { if (d === dias) return; setDias(d); setCargandoDe(d); }} aria-pressed={dias === d} className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", dias === d ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
              {d} días
            </button>
          ))}
          {cargando && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
        </div>
      </div>
      {error && <p className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-foreground">{error}</p>}
      {informe && (
        <>
          <dl className="grid gap-3 sm:grid-cols-4">
            {[
              ["Prompts", String(informe.prompts)],
              ["Ideas (specs)", String(informe.specs)],
              ["Personas", String(informe.personas)],
              ["Copiados sin refinar", `${pct(sinRefinar, copiados)} (${sinRefinar} de ${copiados})`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-border bg-card px-4 py-3">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{k}</dt>
                <dd className="mt-1 text-lg font-semibold text-foreground">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <caption className="sr-only">Por herramienta</caption>
              <thead className="bg-secondary/60 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Herramienta</th>
                  <th className="px-3 py-2 font-medium">Prompts</th>
                  <th className="px-3 py-2 font-medium">Copiados</th>
                  <th className="px-3 py-2 font-medium">Sin refinar</th>
                  <th className="px-3 py-2 font-medium">Refines / prompt</th>
                </tr>
              </thead>
              <tbody>
                {informe.porHerramienta.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-muted-foreground">Sin prompts en este periodo.</td>
                  </tr>
                )}
                {informe.porHerramienta.map((h) => (
                  <tr key={h.tool} className="border-t border-border">
                    <td className="px-3 py-2 text-foreground">{nombreTool(h.tool)}</td>
                    <td className="px-3 py-2">{h.prompts}</td>
                    <td className="px-3 py-2">{h.copiados}</td>
                    <td className="px-3 py-2">{pct(h.copiadosSinRefinar, h.copiados)}</td>
                    <td className="px-3 py-2">{h.refinesPorPrompt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Resultados subidos</p>
              {r && (
                <ul className="mt-2 space-y-1 text-sm text-foreground">
                  <li>Subidos: {r.subidos} · aceptados: {r.aceptados} ({pct(r.aceptados, r.subidos)})</li>
                  <li>Aceptados a la primera: {r.aceptadosPrimera} · tras una corrección: {r.aceptadosTrasCorreccion} · correcciones pedidas: {r.correcciones}</li>
                  <li>Puntaje medio del veredicto: {r.scoreMedio === null ? "—" : `${r.scoreMedio} %`}</li>
                  <li>Modelo recomendado seguido: {pct(r.recomendacionSeguida.seguida, r.recomendacionSeguida.total)} ({r.recomendacionSeguida.seguida} de {r.recomendacionSeguida.total})</li>
                  {r.fallosPorCampo.length > 0 && <li>Lo que más falla: {r.fallosPorCampo.map((f) => `${CAMPO_VEREDICTO_LABEL[f.campo].es} (${f.n})`).join(" · ")}</li>}
                </ul>
              )}
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Entrevista</p>
              <ul className="mt-2 space-y-1 text-sm text-foreground">
                <li>Ideas con respuestas: {informe.entrevista.conRespuestas} de {informe.entrevista.specs} ({pct(informe.entrevista.conRespuestas, informe.entrevista.specs)})</li>
                <li>Respuestas dadas: {informe.entrevista.respuestas}</li>
              </ul>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <caption className="sr-only">Avisos mostrados y aplicados</caption>
              <thead className="bg-secondary/60 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Aviso</th>
                  <th className="px-3 py-2 font-medium">Mostrado</th>
                  <th className="px-3 py-2 font-medium">Aplicado</th>
                  <th className="px-3 py-2 font-medium">Ayuda</th>
                </tr>
              </thead>
              <tbody>
                {informe.avisos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-muted-foreground">Sin avisos en este periodo.</td>
                  </tr>
                )}
                {informe.avisos.slice(0, 25).map((a) => (
                  <tr key={a.codigo} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-foreground">{a.codigo}</td>
                    <td className="px-3 py-2">{a.mostrados}</td>
                    <td className="px-3 py-2">{a.aplicados}</td>
                    <td className="px-3 py-2">{pct(a.aplicados, a.mostrados)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
