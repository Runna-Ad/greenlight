"use client";

import { useState } from "react";
import Link from "next/link";
import { Flame, ArrowRight, Eye, RefreshCw, CheckCircle2, CheckCheck, ChevronDown, Archive, MessageSquare, Package, CalendarDays } from "lucide-react";
import type { PortalBrief, PortalTarea, PortalMarca } from "@/app/(app)/[cliente]/portal/portal-data";
import type { AssetStatus } from "@/lib/brand";
import { estadoCliente, estadoBriefPanel } from "@/lib/portal-bucket";
import { ddmm, desgloseTracks } from "@/lib/paquetes";
import { cn } from "@/lib/utils";

/**
 * NIVEL 0 del portal — la VISTA GENERAL (home) del cliente. Un pantallazo de dónde va TODO su
 * trabajo antes de meterse a un brief o una tarea:
 *   · Zona A — Necesitan tu aprobación: la cola de piezas `published` (su turno) → abre la tarea.
 *   · Zona B — 4 contadores: En producción · Por revisar · En cambios · Aprobadas.
 *   · Zona C — Tus briefs: avance por brief (barra de estados) → entra al brief.
 *
 * "En producción" es CONTEO puro (pre-envío): un número de impulso, sin lista, sin fechas, sin
 * detalle — no se filtra WIP al cliente. Todo lo demás se DERIVA de la misma lista filtrada
 * (client-facing + producción) con el MISMO filtro de marca, así contador, cola y tarjetas nunca
 * driftан. Los colores/estados son los reales del portal (estadoCliente).
 */

// Los 4 estados en palabras del cliente, con su color. `c` = relleno de barras/puntos/franja;
// `ink` = texto sobre claro cuando hace falta. Valores = los tokens de estado del sistema.
const PAL = {
  prod: { label: "En producción", c: "#5a6478", ink: "#4b5468" },
  revisar: { label: "Por revisar", c: "#fbae42", ink: "#b97708" },
  cambios: { label: "En cambios", c: "#de5a5f", ink: "#c2494e" },
  aprobado: { label: "Aprobadas", c: "#0d9488", ink: "#0d9488" },
} as const;
type Bucket = keyof typeof PAL;

// Icono por estado como componente ESTÁTICO (no un componente ligado a un const en render:
// react-hooks/static-components) — devuelve el JSX del icono directo.
function EstadoIcon({ status, reReview, teRespondieron = false, className }: { status: AssetStatus; reReview: boolean; teRespondieron?: boolean; className?: string }) {
  if (status === "delivered") return <CheckCircle2 className={className} />;
  if (status === "in_corrections" && teRespondieron) return <MessageSquare className={className} />;
  if (status === "in_corrections") return <RefreshCw className={className} />;
  if (status === "published" && reReview) return <CheckCheck className={className} />;
  return <Eye className={className} />;
}
const nombreTarea = (t: PortalTarea) => t.naming ?? t.code ?? "Idea";

type QItem = PortalTarea & { briefId: string; briefLabel: string };
type Prod = { briefId: string; marcaId: string; paqueteId: string | null; track: string | null };

export function PortalHome({
  cliente,
  marcas,
  briefs,
  produccion,
  ahora,
  nArchivadas,
}: {
  cliente: { name: string; logoUrl: string | null; brandColor: string };
  marcas: PortalMarca[];
  /** Sólo briefs NO archivados (activos + completados ≤15d) — la carga es acotada. */
  briefs: PortalBrief[];
  produccion: Prod[];
  /** "Ahora" fijado en el servidor (hora de la request) — para el corte panel/archivo por edad. */
  ahora: number;
  /** Cuántos briefs archivados hay (>15d) — llega aparte porque no vienen en `briefs`; gobierna
   *  el link "Ver archivo". */
  nArchivadas: number;
}) {
  // Filtro de marca (client-side, efímero): "Todas" o una marca. Sólo si hay >1 marca.
  const [filtro, setFiltro] = useState<string | null>(null);
  // "Completados" (≤15 días) arranca COLAPSADO — el panel es sobre lo que sigue vivo.
  const [verCompletados, setVerCompletados] = useState(false);
  const multiMarca = marcas.length > 1;

  const flat: QItem[] = briefs.flatMap((b) => b.tasks.map((t) => ({ ...t, briefId: b.id, briefLabel: b.label })));
  const enMarca = <T extends { marcaId: string }>(xs: T[]) => (filtro ? xs.filter((x) => x.marcaId === filtro) : xs);

  const visibles = enMarca(flat);
  const prod = enMarca(produccion);
  const cuenta = {
    prod: prod.length,
    revisar: visibles.filter((t) => t.status === "published").length,
    cambios: visibles.filter((t) => t.status === "in_corrections").length,
    aprobado: visibles.filter((t) => t.status === "delivered").length,
  };

  // Zona A — la cola de SU TURNO: piezas `published` (aprobar o pedir cambios) y piezas en
  // cambios donde el equipo le contestó ("Te respondieron", Pedro 2026-10-27). Orden: lo nuevo
  // por revisar, luego las respuestas, luego las re-revisiones.
  const peso = (t: QItem) => (t.status === "in_corrections" ? 1 : t.reReview ? 2 : 0);
  const cola = visibles
    .filter((t) => t.status === "published" || (t.status === "in_corrections" && t.teRespondieron))
    .sort((a, b) => peso(a) - peso(b));
  const nRespuestas = cola.filter((t) => t.status === "in_corrections").length;

  // Zona C — avance por brief. Cada brief con ≥1 pieza tras el filtro; entra por la marca del
  // filtro, o (en "Todas") por la marca de su primera pieza.
  const tarjetas = briefs
    .map((b) => {
      const ts = filtro ? b.tasks.filter((t) => t.marcaId === filtro) : b.tasks;
      const prodB = produccion.filter((p) => p.briefId === b.id && (!filtro || p.marcaId === filtro));
      const seg = segmentos(ts, prodB);
      const total = seg.revisar + seg.cambios + seg.aprobado + seg.prod;
      const entryMarca = filtro ?? b.tasks[0]?.marcaId ?? "__none__";
      return { brief: b, seg, total, entryMarca, ts, prodB, arch: estadoBriefPanel(b.greenlitAt, ahora) };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);

  // Ciclo de vida del brief: activo → "Tus briefs"; completado ≤15d → "Completados" (colapsado).
  // `briefs` YA viene acotado a NO archivados, así que aquí sólo se separan activo/reciente; los
  // archivados (>15d) no están en `briefs` — su conteo (`nArchivadas`) gobierna el link al Archivo.
  const activas = tarjetas.filter((x) => x.arch === "activo");
  const recientes = tarjetas.filter((x) => x.arch === "reciente");

  return (
    <div className="mx-auto max-w-4xl px-1">
      {/* Header — identidad del cliente + filtro de marca */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 gl-rise-in">
        <div className="flex items-center gap-3">
          {cliente.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cliente.logoUrl} alt={cliente.name} className="h-10 w-auto max-w-[120px] object-contain" />
          ) : (
            <span className="grid size-10 place-items-center rounded-xl text-sm font-bold text-white shadow-sm" style={{ background: cliente.brandColor }}>
              {cliente.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <div>
            <p className="gl-eyebrow">Vista general</p>
            <h1 className="text-xl font-semibold text-foreground">{cliente.name}</h1>
          </div>
        </div>

        {multiMarca && (
          <nav className="flex flex-wrap gap-1.5" aria-label="Filtrar por marca">
            <Chip activo={filtro === null} onClick={() => setFiltro(null)}>Todas</Chip>
            {marcas.map((m) => (
              <Chip key={m.id} activo={filtro === m.id} onClick={() => setFiltro(m.id)}>{m.name}</Chip>
            ))}
          </nav>
        )}
      </header>

      {/* Zona A — Necesitan tu aprobación */}
      {cola.length > 0 && (
        <>
          <SecHead
            titulo={nRespuestas ? "Necesitan tu atención" : "Necesitan tu aprobación"}
            hint={`— tu turno en ${cola.length} ${cola.length === 1 ? "pieza" : "piezas"}`}
          />
          <section
            className="overflow-hidden rounded-xl border shadow-sm"
            style={{ borderColor: "var(--border-strong, #d9d2f0)", background: "linear-gradient(180deg, color-mix(in srgb, var(--primary) 7%, #fff) 0%, var(--card) 100%)" }}
            aria-label={nRespuestas ? "Piezas que necesitan tu atención" : "Piezas que necesitan tu aprobación"}
          >
            <div className="flex items-center gap-2 px-5 pt-3.5 pb-2.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-primary">
                <Flame className="size-3.5" /> Ahora
              </span>
              <span className="text-xs text-muted-foreground">
                {nRespuestas ? "Ábrelas para aprobar, pedir cambios o contestarle al equipo." : "Ábrelas para aprobar o pedir cambios."}
              </span>
            </div>
            <ul>
              {cola.map((t, i) => (
                <QueueRow key={t.id} idx={i + 1} t={t} />
              ))}
            </ul>
          </section>
        </>
      )}

      {/* Zona B — Dónde va todo */}
      <SecHead titulo="Dónde va todo" hint={`— ${visibles.length + cuenta.prod} piezas en tus briefs`} />
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Resumen por estado">
        <Tile k="prod" n={cuenta.prod} foot="El equipo las arma · aún no es tu turno" />
        <Tile k="revisar" n={cuenta.revisar} foot="Esperan tu aprobación" destacado />
        <Tile k="cambios" n={cuenta.cambios} foot={nRespuestas ? "Aplicando lo que pediste · en algunas te respondieron" : "Aplicando lo que pediste"} />
        <Tile k="aprobado" n={cuenta.aprobado} foot="Listas y cerradas" />
      </section>

      {/* Zona C — Tus briefs (ACTIVOS: con trabajo en curso) */}
      {activas.length > 0 && (
        <>
          <SecHead titulo="Tus briefs" hint="— avance de cada entrega" />
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Avance por brief">
            {activas.map(({ brief, seg, total, entryMarca, ts, prodB }) => (
              <BriefCard key={brief.id} brief={brief} seg={seg} total={total} entryMarca={entryMarca} ts={ts} prodB={prodB} />
            ))}
          </section>
        </>
      )}

      {/* Completados (≤15 días) — colapsado; los de >15 días viven en el Archivo. */}
      {(recientes.length > 0 || nArchivadas > 0) && (
        <div className="mt-8 rounded-xl border border-border bg-secondary/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {recientes.length > 0 ? (
              <button
                type="button"
                onClick={() => setVerCompletados((v) => !v)}
                aria-expanded={verCompletados}
                className="inline-flex items-center gap-2 text-[13px] font-semibold text-foreground"
              >
                <ChevronDown className={`size-4 text-muted-foreground transition-transform ${verCompletados ? "" : "-rotate-90"}`} />
                Completados
                <span className="rounded-full bg-card px-1.5 text-[11px] tabular-nums text-muted-foreground">{recientes.length}</span>
                <span className="font-normal text-muted-foreground">· últimos 15 días</span>
              </button>
            ) : (
              <span className="text-[13px] text-muted-foreground">Los briefs completados hace más de 15 días están en el archivo.</span>
            )}
            {nArchivadas > 0 && (
              <Link href="?vista=archivo" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
                <Archive className="size-3.5" /> Ver archivo
              </Link>
            )}
          </div>
          {recientes.length > 0 && verCompletados && (
            <section className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Briefs completados (últimos 15 días)">
              {recientes.map(({ brief, seg, total, entryMarca, ts, prodB }) => (
                <BriefCard key={brief.id} brief={brief} seg={seg} total={total} entryMarca={entryMarca} ts={ts} prodB={prodB} />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Piezas de módulo (no anidadas: react-hooks/static-components) ── */

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${
        activo
          ? "border-primary bg-secondary font-semibold text-secondary-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/50"
      }`}
    >
      {children}
    </button>
  );
}

function SecHead({ titulo, hint }: { titulo: string; hint: string }) {
  return (
    <div className="mb-3 mt-8 flex items-baseline gap-2.5 px-0.5">
      <span className="h-3.5 w-[3px] rounded-sm bg-primary" aria-hidden />
      <h2 className="text-[13px] font-bold uppercase tracking-[0.09em] text-foreground">{titulo}</h2>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}

function EstadoPill({ status, reReview, teRespondieron = false }: { status: AssetStatus; reReview: boolean; teRespondieron?: boolean }) {
  const est = estadoCliente(status, reReview, teRespondieron);
  // "Te respondieron" va SÓLIDA (Pedro 2026-10-27: el tinte suave se perdía); el resto, tinte.
  const solida = status === "in_corrections" && teRespondieron;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px]", solida ? "font-bold text-white shadow-sm" : "font-semibold")}
      style={
        solida
          ? { background: `color-mix(in srgb, ${est.tone} 88%, #000)` }
          : { background: `color-mix(in srgb, ${est.tone} 14%, #fff)`, color: `color-mix(in srgb, ${est.tone} 78%, #000)` }
      }
    >
      <EstadoIcon status={status} reReview={reReview} teRespondieron={teRespondieron} className="size-2.5" /> {est.label}
    </span>
  );
}

function QueueRow({ idx, t }: { idx: number; t: QItem }) {
  return (
    <li className="border-t border-border first:border-t-0">
      <Link
        href={`?marca=${t.marcaId}&brief=${t.briefId}&tarea=${t.id}`}
        className="group flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-card"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold tabular-nums text-primary-foreground">
          {idx}
        </span>
        <span className="min-w-0 flex-1">
          <span className="mb-0.5 flex flex-wrap items-center gap-2">
            {t.marcaName && (
              <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10.5px] font-semibold text-secondary-foreground">{t.marcaName}</span>
            )}
            <EstadoPill status={t.status} reReview={t.reReview} teRespondieron={t.teRespondieron} />
          </span>
          <span className="block truncate text-[14.5px] font-semibold text-foreground">{nombreTarea(t)}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {t.briefLabel}
            {t.reReview ? " · ya aplicamos los cambios que pediste" : ""}
            {t.status === "in_corrections" && t.teRespondieron ? " · el equipo contestó uno de tus cambios" : ""}
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </Link>
    </li>
  );
}

function Tile({ k, n, foot, destacado = false }: { k: Bucket; n: number; foot: string; destacado?: boolean }) {
  const p = PAL[k];
  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-card p-4 ${destacado ? "border-[var(--border-strong,#d9d2f0)] shadow-md" : "border-border shadow-sm"}`}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: p.c }} aria-hidden />
      <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{p.label}</p>
      <p className="mt-1.5 text-[32px] font-bold leading-none tabular-nums" style={{ color: destacado ? p.ink : "var(--foreground)" }}>{n}</p>
      <p className="mt-1 text-[11.5px] text-muted-foreground">{foot}</p>
    </div>
  );
}

type Seg = { revisar: number; cambios: number; aprobado: number; prod: number; respondidas: number };
const ORDEN: Bucket[] = ["revisar", "cambios", "prod", "aprobado"];

/** Cuántas piezas hay en cada estado (lo enviado + lo que el equipo aún arma). */
function segmentos(ts: PortalTarea[], prod: Prod[]): Seg {
  return {
    revisar: ts.filter((t) => t.status === "published").length,
    cambios: ts.filter((t) => t.status === "in_corrections").length,
    aprobado: ts.filter((t) => t.status === "delivered").length,
    prod: prod.length,
    // En cambios con respuesta del equipo: también es su turno (misma regla que la cola).
    respondidas: ts.filter((t) => t.status === "in_corrections" && t.teRespondieron).length,
  };
}

function Barra({ seg, total, alto = "h-2" }: { seg: Seg; total: number; alto?: string }) {
  return (
    <div className={`flex ${alto} overflow-hidden rounded-full`} style={{ background: "#f0eef6" }} role="img" aria-label={`${seg.revisar} por revisar, ${seg.cambios} en cambios, ${seg.prod} en producción, ${seg.aprobado} aprobadas`}>
      {ORDEN.map((k) => seg[k] > 0 && (
        <span key={k} style={{ width: `${(seg[k] / total) * 100}%`, background: PAL[k].c }} />
      ))}
    </div>
  );
}

/**
 * Brief › PAQUETE › Tarea (0097): cada paquete del brief con su barra, sus piezas por equipo
 * (Real/Normal, Pedro 2026-11-12) y su fecha. Si ya se entregó: "Entregado 18/11 · fecha 20/11
 * (2 días antes)". Si se entregó tarde el cliente sólo ve "Entregado 23/11" (opción A de Pedro).
 */
function PaquetesDelBrief({ brief, ts, prodB }: { brief: PortalBrief; ts: PortalTarea[]; prodB: Prod[] }) {
  if (!brief.paquetes.length) return null;
  const filas = [
    ...brief.paquetes.map((p) => ({ id: p.id, nombre: p.nombre, p })),
    { id: null, nombre: "Otras piezas", p: null },
  ]
    .map((f) => {
      const tsP = ts.filter((t) => t.paqueteId === f.id);
      const prodP = prodB.filter((x) => x.paqueteId === f.id);
      const seg = segmentos(tsP, prodP);
      const total = seg.revisar + seg.cambios + seg.aprobado + seg.prod;
      return { ...f, seg, total, desglose: desgloseTracks([...tsP, ...prodP]) };
    })
    .filter((f) => f.total > 0);

  return (
    <ul className="flex flex-col gap-2.5 border-t border-border pt-3" aria-label="Paquetes del brief">
      {filas.map((f) => {
        const nota = f.p?.nota ?? null; // ya viene armada para el cliente desde el servidor
        return (
          <li key={f.id ?? "otras"} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <Package className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate text-[13px] font-medium text-foreground" title={f.nombre}>{f.nombre}</span>
              </span>
              <span className="shrink-0 text-[11.5px] tabular-nums text-muted-foreground">
                {f.total} {f.total === 1 ? "pieza" : "piezas"}{f.desglose ? ` · ${f.desglose}` : ""}
              </span>
            </div>
            <Barra seg={f.seg} total={f.total} alto="h-1.5" />
            {nota && (
              <span
                className="inline-flex items-center gap-1 text-[11.5px] font-medium"
                style={{ color: nota.tono === "antes" ? PAL.aprobado.ink : nota.tono === "pendiente" ? "var(--muted-foreground)" : "var(--foreground)" }}
              >
                {f.p?.entregado ? <CheckCircle2 className="size-3" aria-hidden /> : <CalendarDays className="size-3" aria-hidden />}
                {nota.texto}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function BriefCard({
  brief,
  seg,
  total,
  entryMarca,
  ts,
  prodB,
}: {
  brief: PortalBrief;
  seg: Seg;
  total: number;
  entryMarca: string;
  ts: PortalTarea[];
  prodB: Prod[];
}) {
  const orden = ORDEN;
  const esperanTurno = seg.revisar + seg.respondidas;
  return (
    <Link
      href={`?marca=${entryMarca}&brief=${brief.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-semibold text-foreground">{brief.label}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {total} {total === 1 ? "pieza" : "piezas"}
          {brief.fechaEntrega ? ` · fecha ${ddmm(brief.fechaEntrega)}` : ""}
        </span>
      </div>

      <Barra seg={seg} total={total} />

      <div className="flex flex-wrap gap-x-3.5 gap-y-1">
        {orden.map((k) => seg[k] > 0 && (
          <span key={k} className="inline-flex items-center gap-1.5 text-[11.5px] text-secondary-foreground">
            <span className="size-2 rounded-[3px]" style={{ background: PAL[k].c }} />
            {PAL[k].label} <span className="font-bold tabular-nums">{seg[k]}</span>
          </span>
        ))}
      </div>

      <PaquetesDelBrief brief={brief} ts={ts} prodB={prodB} />

      <div className="mt-0.5 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {esperanTurno > 0 ? `${esperanTurno} ${esperanTurno === 1 ? "espera" : "esperan"} tu turno` : "Al día"}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
          Abrir <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
