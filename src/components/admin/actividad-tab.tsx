"use client";

import { Fragment, useEffect, useState } from "react";
import { Activity, ArrowRight, FileText, RotateCw, ShieldAlert } from "lucide-react";
import { cargarActividad } from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STATUS_LABEL, type AssetStatus } from "@/lib/brand";
import type { ActividadRow, ConteosActividad, LineaActividad, PanelActividad, PersonaActividad, ProyectoActividad } from "@/lib/admin-tipos";
import { RANGOS_ACTIVIDAD, dineroActividad, fraseActividad, type RangoActividad } from "@/lib/prisma/formatos/actividad";
import { chipTextColor } from "@/lib/vocab";

const label = (s: string | null) => (s ? STATUS_LABEL[s as AssetStatus] ?? s : "—");
const COLOR_NEUTRO = "#6b6885";

function hace(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "hace un momento";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es-MX");
}

// ── Columnas: una sola definición para las dos tablas, para que nunca discrepen ──
type ColumnaConteo = { clave: Exclude<keyof ConteosActividad, "iaUsd" | "iaLlamadas" | "iaSinCosto" | "ultima" | "errores">; titulo: string; ayuda: string };
const GRUPOS: { titulo: string; columnas: ColumnaConteo[] }[] = [
  {
    titulo: "Greenlight",
    columnas: [
      { clave: "movimientos", titulo: "Movim.", ayuda: "Tareas movidas de estado" },
      { clave: "cambios", titulo: "Cambios", ayuda: "Cambios pedidos" },
      { clave: "rondas", titulo: "Rondas", ayuda: "Rondas de cambios tocadas: pedir, resolver o responder" },
      { clave: "respuestas", titulo: "Resp.", ayuda: "Respuestas en los hilos de cambios" },
    ],
  },
  {
    titulo: "Prisma",
    columnas: [
      { clave: "prompts", titulo: "Prompts", ayuda: "Prompts creados" },
      { clave: "variantes", titulo: "Iterac.", ayuda: "Variantes y refinados de prompts" },
      { clave: "resultados", titulo: "Result.", ayuda: "Resultados subidos" },
      { clave: "lotes", titulo: "Planas", ayuda: "Imágenes planas subidas a Formatos" },
      { clave: "psdAbiertos", titulo: "PSD", ayuda: "PSD abiertos en Formatos" },
      { clave: "ediciones", titulo: "Edic.", ayuda: "Medidas editadas en Formatos" },
      { clave: "descargas", titulo: "Desc.", ayuda: "Descargas de ZIP, PNG o PSD" },
    ],
  },
];
const INICIO_GRUPO = "border-l border-border";
/** La primera columna se queda fija al correr la tabla: sin el nombre, una fila de números no dice de quién es. */
const FIJA = "sticky left-0 z-10 bg-card";

function Cuenta({ n, peligro }: { n: number; peligro?: boolean }) {
  if (n === 0) return <span className="text-muted-foreground/60" aria-label="cero">–</span>;
  return <span className={peligro ? "font-semibold text-destructive" : undefined}>{n}</span>;
}

function CeldasConteo({ c }: { c: ConteosActividad }) {
  return (
    <>
      <TableCell className={`text-right tabular-nums ${INICIO_GRUPO}`}><Cuenta n={c.iaLlamadas} /></TableCell>
      <TableCell className="text-right tabular-nums">
        {c.iaUsd === null ? <span className="text-muted-foreground/60" aria-label="sin costo conocido">–</span> : dineroActividad(c.iaUsd)}
      </TableCell>
      <TableCell className="text-right tabular-nums"><Cuenta n={c.iaSinCosto} /></TableCell>
      <TableCell className={`text-right tabular-nums ${INICIO_GRUPO}`}><Cuenta n={c.errores} peligro /></TableCell>
      {GRUPOS.map((g) =>
        g.columnas.map((col, i) => (
          <TableCell key={col.clave} className={`text-right tabular-nums ${i === 0 ? INICIO_GRUPO : ""}`}>
            <Cuenta n={c[col.clave]} />
          </TableCell>
        )),
      )}
      <TableCell className={`text-right text-muted-foreground ${INICIO_GRUPO}`} title={c.ultima ? new Date(c.ultima).toLocaleString("es-MX") : undefined}>
        {c.ultima ? hace(c.ultima) : "–"}
      </TableCell>
    </>
  );
}

function Encabezado({ primera }: { primera: string }) {
  const sub = "h-8 text-right font-normal text-muted-foreground";
  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        <TableHead scope="col" rowSpan={2} className={`align-bottom ${FIJA}`}>{primera}</TableHead>
        <TableHead scope="colgroup" colSpan={3} className={`h-8 text-center ${INICIO_GRUPO}`}>IA</TableHead>
        <TableHead scope="col" rowSpan={2} className={`text-right align-bottom ${INICIO_GRUPO}`} title="Errores en el navegador y tamaños que fallaron">Errores</TableHead>
        {GRUPOS.map((g) => (
          <TableHead key={g.titulo} scope="colgroup" colSpan={g.columnas.length} className={`h-8 text-center ${INICIO_GRUPO}`}>{g.titulo}</TableHead>
        ))}
        <TableHead scope="col" rowSpan={2} className={`text-right align-bottom ${INICIO_GRUPO}`}>Última</TableHead>
      </TableRow>
      <TableRow className="hover:bg-transparent">
        <TableHead scope="col" title="Llamadas a la IA" aria-label="Llamadas a la IA" className={`${sub} ${INICIO_GRUPO}`}>Llam.</TableHead>
        <TableHead scope="col" title="Gasto con costo reportado" aria-label="Gasto en dólares con costo reportado" className={sub}>USD</TableHead>
        <TableHead scope="col" title="Llamadas sin costo reportado: no se cuentan como cero" aria-label="Llamadas sin costo reportado" className={sub}>Sin costo</TableHead>
        {GRUPOS.map((g) =>
          g.columnas.map((col, i) => (
            <TableHead key={col.clave} scope="col" title={col.ayuda} aria-label={col.ayuda} className={`${sub} ${i === 0 ? INICIO_GRUPO : ""}`}>{col.titulo}</TableHead>
          )),
        )}
      </TableRow>
    </TableHeader>
  );
}

function Total({ total }: { total: ConteosActividad | null }) {
  if (!total) return null;
  return (
    <TableFooter>
      <TableRow className="font-medium">
        <TableHead scope="row" className={FIJA}>Total</TableHead>
        <CeldasConteo c={total} />
      </TableRow>
    </TableFooter>
  );
}

function PorPersona({ filas, total }: { filas: PersonaActividad[]; total: ConteosActividad | null }) {
  if (filas.length === 0) return <EmptyState icon={Activity} titulo="Nadie registró actividad en estas fechas" descripcion="Prueba con un rango más amplio." />;
  return (
    <div className="gl-card overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <caption className="sr-only">Actividad por persona en el rango elegido</caption>
        <Encabezado primera="Persona" />
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.personaId ?? "sin-persona"}>
              <TableHead scope="row" className={`font-normal ${FIJA}`}>
                <span className="flex items-center gap-2">
                  <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.color ?? COLOR_NEUTRO }} />
                  <span className="max-w-52 truncate font-medium" title={f.persona}>{f.persona}</span>
                </span>
              </TableHead>
              <CeldasConteo c={f} />
            </TableRow>
          ))}
        </TableBody>
        <Total total={total} />
      </Table>
    </div>
  );
}

function PorProyecto({ filas, total }: { filas: (ProyectoActividad & { elementos: ProyectoActividad[] })[]; total: ConteosActividad | null }) {
  if (filas.length === 0) return <EmptyState icon={Activity} titulo="Ningún proyecto tuvo actividad en estas fechas" descripcion="Prueba con un rango más amplio." />;
  return (
    <div className="gl-card overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <caption className="sr-only">Actividad por cliente y, dentro de cada uno, por archivo PSD o tarea</caption>
        <Encabezado primera="Cliente / archivo o tarea" />
        <TableBody>
          {filas.map((c) => (
            <Fragment key={c.clienteId ?? "sin-cliente"}>
              <TableRow className="bg-muted/40">
                <TableHead scope="row" className={`font-semibold ${FIJA}`}>{c.cliente}</TableHead>
                <CeldasConteo c={c} />
              </TableRow>
              {c.elementos.map((e) => (
                <TableRow key={`${e.tipoElemento ?? "general"}:${e.elemento ?? ""}`}>
                  <TableHead scope="row" className={`max-w-72 truncate pl-6 font-normal ${FIJA}`} title={e.elemento ?? undefined}>
                    {e.elemento ? (
                      <span className="inline-flex items-center gap-1.5">
                        {e.tipoElemento === "archivo" && <FileText className="size-3 shrink-0 text-muted-foreground" aria-label="Archivo" />}
                        <span className={e.tipoElemento === "tarea" ? "font-mono text-[11px]" : undefined}>{e.elemento}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Sin archivo ni tarea</span>
                    )}
                  </TableHead>
                  <CeldasConteo c={e} />
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
        <Total total={total} />
      </Table>
    </div>
  );
}

function LineaTiempo({ filas }: { filas: LineaActividad[] }) {
  if (filas.length === 0) return <EmptyState icon={Activity} titulo="Sin actividad en estas fechas" descripcion="Aquí aparece lo último que hizo el equipo." />;
  return (
    <div className="gl-card overflow-hidden rounded-xl border border-border bg-card">
      <ul className="divide-y divide-border">
        {filas.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
              style={{ backgroundColor: r.color ?? COLOR_NEUTRO, color: chipTextColor(r.color ?? COLOR_NEUTRO) }}
              title={r.persona}
              aria-hidden
            >
              {r.persona.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate">
                <span className="font-medium text-foreground">{r.persona}</span>{" "}
                <span className="text-muted-foreground">{fraseActividad(r.tipo, r.ruta)}</span>{" "}
                {r.elemento && <span className={r.tipoElemento === "tarea" ? "font-mono text-xs font-semibold text-foreground" : "text-foreground"}>{r.elemento}</span>}
              </p>
              <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                {r.tipo === "movimiento" && (
                  <>
                    {label(r.de)} <ArrowRight className="size-3" aria-label="a" /> {label(r.a)}
                  </>
                )}
                {r.cliente && <span>{r.tipo === "movimiento" ? "· " : ""}{r.cliente}</span>}
                {r.tipo === "ia" && <span>· {r.usd === null ? "sin costo reportado" : dineroActividad(r.usd)}</span>}
                {r.detalle && <span className="truncate">· {r.detalle}</span>}
                {r.override && (
                  <span className="ml-1 inline-flex items-center gap-0.5 rounded-full bg-status-corrections/10 px-1.5 py-px text-[10px] font-medium text-status-corrections">
                    <ShieldAlert className="size-2.5" aria-hidden /> override
                  </span>
                )}
              </p>
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground" title={new Date(r.createdAt).toLocaleString("es-MX")}>{hace(r.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Sin la 0091 aplicada sigue a la vista lo de antes: quién movió qué. */
const lineaDeMovimientos = (rows: ActividadRow[]): LineaActividad[] =>
  rows.map((r) => ({
    id: r.id, tipo: "movimiento", persona: r.actor ?? "Alguien", color: r.actorColor, cliente: "", tipoElemento: "tarea", elemento: r.ideaCode ?? r.ideaNaming ?? "una tarea",
    usd: null, ruta: null, de: r.from, a: r.to, override: r.override, detalle: null, createdAt: r.createdAt,
  }));

export function ActividadTab({ rows }: { rows: ActividadRow[] }) {
  const [rango, setRango] = useState<RangoActividad>("7d");
  const [intento, setIntento] = useState(0);
  const [panel, setPanel] = useState<PanelActividad | null>(null);

  useEffect(() => {
    let vigente = true;
    cargarActividad(rango)
      .then((r) => {
        if (vigente) setPanel(r);
      })
      .catch(() => {
        if (vigente) setPanel({ ok: false, error: "No se pudo leer la actividad. Reintenta." });
      });
    // Si cambian las fechas antes de que responda, lo viejo ya no se pinta encima.
    return () => {
      vigente = false;
    };
  }, [rango, intento]);

  const elegir = (r: RangoActividad) => {
    if (r === rango) return;
    setPanel(null);
    setRango(r);
  };
  const reintentar = () => {
    setPanel(null);
    setIntento((n) => n + 1);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Actividad del equipo</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">El tiempo trabajado no se mide. El gasto sin costo reportado se cuenta aparte, nunca como cero.</p>
        </div>
        <div role="group" aria-label="Rango de fechas" className="inline-flex shrink-0 rounded-md bg-muted p-[3px]">
          {RANGOS_ACTIVIDAD.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={rango === r.id}
              onClick={() => elegir(r.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${rango === r.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {r.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {panel === null && (
        <div role="status" aria-label="Cargando actividad" className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {panel && !panel.ok && panel.sinMigracion && (
        <>
          <p role="status" className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">{panel.error} Mientras tanto, estos son los últimos movimientos de tareas.</p>
          <LineaTiempo filas={lineaDeMovimientos(rows)} />
        </>
      )}

      {panel && !panel.ok && !panel.sinMigracion && (
        <EmptyState icon={Activity} titulo="No se pudo cargar la actividad" descripcion={panel.error}>
          <Button type="button" variant="outline" size="sm" onClick={reintentar}><RotateCw className="size-3.5" aria-hidden /> Reintentar</Button>
        </EmptyState>
      )}

      {panel?.ok && (
        <Tabs defaultValue="persona" className="min-w-0">
          <TabsList>
            <TabsTrigger value="persona">Por persona</TabsTrigger>
            <TabsTrigger value="proyecto">Por proyecto</TabsTrigger>
            <TabsTrigger value="linea">Línea de tiempo</TabsTrigger>
          </TabsList>
          <TabsContent value="persona" className="min-w-0"><PorPersona filas={panel.personas} total={panel.totalPersonas} /></TabsContent>
          <TabsContent value="proyecto" className="min-w-0"><PorProyecto filas={panel.proyectos} total={panel.totalProyectos} /></TabsContent>
          <TabsContent value="linea" className="min-w-0"><LineaTiempo filas={panel.linea} /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}
