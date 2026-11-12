"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pill, type PillStatus } from "@/components/ui/pill";
import { ChevronDown, Files, Layers, Package, Sparkles, Trash2 } from "lucide-react";

import { contentType } from "@/lib/iconos";
import { desgloseDeBundle, gruposPorPaquete, type Bundle, type BundleTask, type PaqueteEquipo } from "@/lib/bundle";
import { STATUS_LABEL, STATUS_TOKEN } from "@/lib/brand";
import { notaEntrega, type TonoEntrega } from "@/lib/paquetes";
import { eliminarBrief, ponerFechaPaquete } from "@/app/(app)/[cliente]/briefs/actions";

/** Color del texto de la fecha según cómo va el paquete. Tarde = rojo, sólo lo ve el equipo. */
const TONO_COLOR: Record<TonoEntrega, string> = {
  antes: "color-mix(in srgb, #00e676 60%, var(--foreground))",
  a_tiempo: "var(--foreground)",
  tarde: "var(--status-corrections)",
  pendiente: "var(--muted-foreground)",
};

/**
 * Un paquete dentro del card de su brief: nombre, cuántas piezas (Real/Normal) y su fecha.
 * Admin/master pone o cambia la fecha aquí mismo; los demás la ven.
 */
// El padre le pone `key` con la fecha guardada: si cambia (otra persona, o tras guardar), el
// campo arranca de nuevo con el valor real en vez de quedarse con uno viejo.
function PaqueteFila({
  p,
  cliente,
  puedeFecha,
  tareas,
}: {
  p: PaqueteEquipo;
  cliente: string;
  puedeFecha: boolean;
  /** Las tareas de ESTE card que son de este paquete (el resto del paquete puede vivir en el card Real/Normal hermano). */
  tareas: TareaConLugar[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(p.fechaEntrega ?? "");
  const [guardando, startGuardar] = useTransition();
  const nota = notaEntrega({ entregadoEl: p.entregadoEl, diasAntes: p.diasAntes }, p.fechaEntrega, "equipo");

  // Se guarda al SALIR del campo (o con Enter), no en cada cambio: mientras se teclea el año,
  // el navegador va mandando 0002, 0020, 0202… y cada uno se guardaba.
  const guardar = (nueva: string) => {
    if (nueva === (p.fechaEntrega ?? "")) return;
    startGuardar(async () => {
      const r = await ponerFechaPaquete(cliente, p.id, nueva || null);
      if (!r.ok) {
        setFecha(p.fechaEntrega ?? "");
        toast.error(r.error);
        return;
      }
      toast.success(nueva ? "Fecha del paquete guardada." : "Fecha del paquete quitada.");
      router.refresh();
    });
  };

  return (
    <li className="py-1.5">
    <div className="flex items-start gap-2">
      <Package className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground" title={p.nombre}>{p.nombre}</p>
        <p className="text-[11px] text-muted-foreground">
          {p.total} {p.total === 1 ? "pieza" : "piezas"}{p.desglose ? ` · ${p.desglose}` : ""}
        </p>
        {nota && (p.entregadoEl || !puedeFecha) && (
          <p className="text-[11px] font-medium" style={{ color: TONO_COLOR[nota.tono] }}>{nota.texto}</p>
        )}
        <BotonTareas n={tareas.length} abierto={abierto} onClick={() => setAbierto((v) => !v)} />
      </div>
      {puedeFecha && (
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Fecha
            <input
              type="date"
              min="2020-01-01"
              max="2100-12-31"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              onBlur={() => guardar(fecha)}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              aria-label={`Fecha de entrega de ${p.nombre}`}
              className="h-7 rounded-md border border-border bg-background px-1.5 text-[11px] text-foreground"
            />
          </label>
          {guardando ? (
            <span className="text-[11px] text-muted-foreground">Guardando…</span>
          ) : (
            p.fechaEntrega && (
              <button
                type="button"
                onClick={() => { setFecha(""); guardar(""); }}
                className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Quitar fecha
              </button>
            )
          )}
        </div>
      )}
    </div>
    {abierto && <ListaTareas tareas={tareas} cliente={cliente} />}
    </li>
  );
}

/** Una tarea con su lugar n/N dentro del card (en el orden en que se ven, por paquete). */
type TareaConLugar = { t: BundleTask; n: number; total: number; pestana?: "Real" | "Normal" };

/** "Ver 3 tareas ▾": abre las tareas de un paquete (o de "Sin paquete") debajo de su fila. */
function BotonTareas({ n, abierto, onClick }: { n: number; abierto: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={abierto}
      className="mt-0.5 flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
    >
      {abierto ? "Ocultar tareas" : `Ver ${n} ${n === 1 ? "tarea" : "tareas"}`}
      <ChevronDown className={`size-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
    </button>
  );
}

function ListaTareas({ tareas, cliente, sangria = true }: { tareas: TareaConLugar[]; cliente: string; sangria?: boolean }) {
  return (
    <ul className={`mt-1 overflow-hidden rounded-md border border-border/60 ${sangria ? "ml-5" : ""}`}>
      {tareas.map(({ t, n, total, pestana }) => {
        // Imagen o video en vez del código A1 (Pedro 2026-11-12); el código queda en el tooltip.
        const tipo = contentType(t.tipo_asset);
        const IconoTipo = tipo.icon;
        return (
        <li key={t.id} className="border-t border-border/40 first:border-t-0">
          <Link
            href={`/${cliente}/tareas/${t.id}`}
            className="flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-secondary/40"
          >
            <span className="w-8 shrink-0 font-mono text-[11px] text-muted-foreground">
              {n}/{total}
            </span>
            <span
              className="grid size-6 shrink-0 place-items-center rounded bg-secondary text-secondary-foreground"
              title={t.code ? `${tipo.label} · ${t.code}` : tipo.label}
            >
              <IconoTipo className="size-3.5" aria-hidden />
              <span className="sr-only">{tipo.label}</span>
            </span>
            {/* En un card con Real y Normal, los códigos se repiten (A1 en cada pestaña). */}
            {pestana && (
              <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{pestana}</span>
            )}
            <span className="min-w-0 truncate font-mono font-medium text-foreground">
              {t.naming_base ?? "Sin naming"}
            </span>
            <Pill status={STATUS_TOKEN[t.status] as PillStatus} className="ml-auto shrink-0 text-[9px] uppercase">
              {STATUS_LABEL[t.status]}
            </Pill>
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
              <Files className="size-3" /> {t.file_count}
            </span>
          </Link>
        </li>
        );
      })}
    </ul>
  );
}

/** Las tareas sin paquete de un brief que sí tiene paquetes: su propia fila, al final. */
function SinPaqueteFila({ tareas, cliente }: { tareas: TareaConLugar[]; cliente: string }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <li className="py-1.5">
      <div className="flex items-start gap-2">
        <Package className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">Sin paquete</p>
          <BotonTareas n={tareas.length} abierto={abierto} onClick={() => setAbierto((v) => !v)} />
        </div>
      </div>
      {abierto && <ListaTareas tareas={tareas} cliente={cliente} />}
    </li>
  );
}

/**
 * El card de un bundle (wireframe "Brief View"): el brief con cuántas tareas
 * trae adentro. Clic en el card → directo al workspace de la PRIMERA tarea;
 * el chevron despliega la lista por si quieres entrar a una en específico.
 *
 * Para el especialista el conteo ya viene filtrado (sólo sus tareas) — el
 * filtro vive en lib/bundle.ts, no aquí.
 */
export function BundleCard({
  bundle,
  cliente,
  puedeBorrar = false,
  puedeFecha = false,
}: {
  bundle: Bundle;
  cliente: string;
  /** master/admin: puede borrar el brief entero (con todas sus tareas). */
  puedeBorrar?: boolean;
  /** master/admin: pone la fecha de entrega de cada paquete (Pedro 2026-11-12). */
  puedeFecha?: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [borrando, startBorrar] = useTransition();
  const primera = bundle.tasks[0];
  const conPaquetes = bundle.paquetes.length > 0;
  // n/N en el orden en que se ven (por paquete, y "Sin paquete" al final).
  const mixto = new Set(bundle.tasks.map((t) => t.track)).size > 1;
  let n = 0;
  const grupos = gruposPorPaquete(bundle.tasks, bundle.paquetes).map((g) => ({
    paqueteId: g.paqueteId,
    tareas: g.tasks.map((t) => ({
      t,
      n: ++n,
      total: bundle.tasks.length,
      pestana: mixto ? (t.track === "real" ? ("Real" as const) : ("Normal" as const)) : undefined,
    })),
  }));
  const tareasDe = (id: string | null) => grupos.find((g) => g.paqueteId === id)?.tareas ?? [];
  const sinPaquete = tareasDe(null);

  const borrar = () =>
    startBorrar(async () => {
      const r = await eliminarBrief(cliente, bundle.brief_ids);
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo borrar el brief.");
        return;
      }
      toast.success("Brief borrado — con todas sus tareas.");
      setConfirmando(false);
      router.refresh();
    });

  return (
    <div className="gl-card-interactive overflow-hidden">
      <button
        onClick={() => primera && router.push(`/${cliente}/tareas/${primera.id}`)}
        className="block w-full p-4 text-left"
        aria-label={`Abrir ${bundle.brief_title ?? "brief"} (${bundle.tasks.length} tareas)`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {bundle.brief_title ?? bundle.brief_tab ?? "Brief sin título"}
            </h3>
            {/* Real y Normal del mismo día van en un solo card: se dice cuántas de cada una. */}
            {bundle.brief_ids.length > 1 ? (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{desgloseDeBundle(bundle.tasks)}</p>
            ) : (
              bundle.brief_tab && bundle.brief_tab !== bundle.brief_title && (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{bundle.brief_tab}</p>
              )
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Brief GREENLIT: todas sus tareas entregadas. Se queda 7 días en la lista y
                luego vive sólo en Entregas — mismo verde neón que la columna Greenlit del
                tablero, para que se lea como lo mismo. (Pedro 2026-09-01) */}
            {bundle.greenlitAt && (
              <span
                className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold"
                style={{
                  background: "color-mix(in srgb, #00e676 18%, transparent)",
                  color: "color-mix(in srgb, #00e676 72%, #000)",
                }}
                title="Todas sus tareas están entregadas. Vive en Entregas."
              >
                <Sparkles className="size-3" /> Greenlit
              </span>
            )}
            <span className="flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-secondary-foreground">
              <Layers className="size-3" /> {bundle.tasks.length}
            </span>
          </div>
        </div>

        {/* mini-resumen por estado */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {resumenEstados(bundle).map(([status, n]) => (
            <Pill
              key={status}
              status={STATUS_TOKEN[status as keyof typeof STATUS_TOKEN] as PillStatus}
              className="text-[10px]"
            >
              {n} {STATUS_LABEL[status as keyof typeof STATUS_LABEL]}
            </Pill>
          ))}
        </div>
      </button>

      {/* Brief › PAQUETE › Tarea (0097): los paquetes del brief con su fecha. */}
      {conPaquetes && (
        <div className="border-t border-border/60 px-4 py-1.5">
          <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {bundle.paquetes.length === 1 ? "1 paquete" : `${bundle.paquetes.length} paquetes`}
          </p>
          <ul className="divide-y divide-border/40">
            {bundle.paquetes.map((p) => (
              <PaqueteFila key={`${p.id}|${p.fechaEntrega ?? ""}`} p={p} cliente={cliente} puedeFecha={puedeFecha} tareas={tareasDe(p.id)} />
            ))}
            {sinPaquete.length > 0 && <SinPaqueteFila tareas={sinPaquete} cliente={cliente} />}
          </ul>
        </div>
      )}

      {/* Con paquetes, las tareas se abren debajo de cada paquete (Pedro 2026-11-12): aquí sólo
          queda "Ver tareas" para un brief sin paquetes, y el bote de basura. */}
      {(!conPaquetes || puedeBorrar) && (
      <div className="flex items-stretch justify-end border-t border-border/60">
        {!conPaquetes && (
        <button
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="flex flex-1 items-center justify-center gap-1 py-1.5 text-[11px] text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
        >
          {abierto ? "Ocultar tareas" : "Ver tareas"}
          <ChevronDown className={`size-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
        </button>
        )}
        {puedeBorrar &&
          (confirmando ? (
            <span className="flex items-center gap-1 border-l border-border/60 px-2 text-[11px] text-muted-foreground">
              ¿Borrar todo?
              <button
                type="button"
                onClick={borrar}
                disabled={borrando}
                className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white disabled:opacity-60"
                style={{ background: "color-mix(in srgb, var(--status-corrections) 80%, #000)" }}
              >
                {borrando ? "…" : "Sí"}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmando(false)}
                className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:bg-background"
              >
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              aria-label={bundle.brief_ids.length > 1 ? "Borrar el brief (Real y Normal) y todas sus tareas" : "Borrar brief y todas sus tareas"}
              title={bundle.brief_ids.length > 1 ? "Borrar el brief (Real y Normal) y todas sus tareas" : "Borrar brief y todas sus tareas"}
              className="flex items-center border-l border-border/60 px-3 text-muted-foreground hover:bg-secondary/40 hover:text-status-corrections"
            >
              <Trash2 className="size-3.5" />
            </button>
          ))}
      </div>
      )}

      {abierto && !conPaquetes && (
        <div className="border-t border-border/60 px-4 py-2">
          <ListaTareas tareas={tareasDe(null)} cliente={cliente} sangria={false} />
        </div>
      )}
    </div>
  );
}

function resumenEstados(bundle: Bundle): [string, number][] {
  const conteo = new Map<string, number>();
  for (const t of bundle.tasks) conteo.set(t.status, (conteo.get(t.status) ?? 0) + 1);
  return [...conteo.entries()];
}
