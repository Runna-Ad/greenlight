"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, ExternalLink, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { activarFuenteVigia, aprobarPropuestaVigia, descartarPropuestaVigia, guardarFuenteVigia, hubVigia, revisarAhoraVigia, type FuenteUI, type PropuestaUI } from "@/app/(app)/admin/vigia-actions";
import type { ResumenVigia } from "@/lib/prisma/vigia-run";
import { TIPO_LABEL, describirContenido, type TipoPropuesta } from "@/lib/prisma/vigia";
import { TOOLS, type Tool } from "@/lib/prisma/spec";
import { TOOL_INFO } from "@/lib/prisma/tools";

export type DatosVigia = { fuentes: FuenteUI[]; pendientes: PropuestaUI[]; decididas: PropuestaUI[]; enEspera: number };

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const nombreTool = (t: string | null) => (t && (TOOLS as string[]).includes(t) ? TOOL_INFO[t as Tool].nombre : "General");
const selectCls = "mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Borrador = { url: string; nombre: string; tool: string; origen: "oficial" | "comunidad" };
const vacio: Borrador = { url: "", nombre: "", tool: "", origen: "oficial" };

/**
 * Hub › Prisma › Vigía (F6b): las fuentes que se leen, "Revisar ahora" y las PROPUESTAS con su cita. Aprobar
 * escribe con los validadores del Hub; descartar pide el porqué y no vuelve. `demo` (sólo desarrollo) enseña
 * la pantalla con datos de muestra, sin servidor.
 */
export function PrismaVigia({ demo = null }: { demo?: DatosVigia | null }) {
  const [datos, setDatos] = useState<DatosVigia | null>(demo);
  const [error, setError] = useState<string | null>(null);
  const [revisando, setRevisando] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResumenVigia | null>(null);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [descartando, setDescartando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [editando, setEditando] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (demo) return;
    const r = await hubVigia();
    if (!r.ok) return setError(r.error);
    setError(null);
    setDatos({ fuentes: r.fuentes, pendientes: r.pendientes, decididas: r.decididas, enEspera: r.enEspera });
  }, [demo]);
  useEffect(() => {
    let vivo = true;
    if (!demo)
      void hubVigia().then((r) => {
        if (!vivo) return;
        if (!r.ok) return setError(r.error);
        setDatos({ fuentes: r.fuentes, pendientes: r.pendientes, decididas: r.decididas, enEspera: r.enEspera });
      });
    return () => {
      vivo = false;
    };
  }, [demo]);

  const revisar = async (soloId?: string) => {
    if (demo) return void toast.message("Demo: aquí se leerían las fuentes.");
    setRevisando(soloId ?? "todas");
    try {
      const r = await revisarAhoraVigia(soloId);
      if (!r.ok) return void toast.error(r.error);
      setResumen(r.resumen);
      toast.success(r.resumen.propuestas ? `${r.resumen.propuestas} propuesta(s) nueva(s).` : "Revisado: nada nuevo que proponer.");
      await recargar();
    } catch {
      toast.error("No se pudo revisar. Inténtalo de nuevo.");
    } finally {
      setRevisando(null);
    }
  };

  const decidir = async (p: PropuestaUI, aprobar: boolean) => {
    if (demo) return void toast.message("Demo: no se guarda.");
    setOcupada(p.id);
    try {
      const r = aprobar ? await aprobarPropuestaVigia(p.id) : await descartarPropuestaVigia(p.id, motivos[p.id] ?? "");
      if (!r.ok) return void toast.error(r.error);
      toast.success(aprobar ? "Aprobada: la siguiente generación ya la usa." : "Descartada: no se volverá a proponer.");
      setDescartando(null);
      await recargar();
    } catch {
      toast.error("No se pudo completar. Inténtalo de nuevo.");
    } finally {
      setOcupada(null);
    }
  };

  const guardar = async () => {
    if (!borrador) return;
    if (demo) return void toast.message("Demo: no se guarda.");
    setOcupada("fuente");
    try {
      const r = await guardarFuenteVigia({ ...borrador, tool: borrador.tool || null }, editando ?? undefined);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Fuente guardada.");
      setBorrador(null);
      setEditando(null);
      await recargar();
    } catch {
      toast.error("No se pudo guardar. Inténtalo de nuevo.");
    } finally {
      setOcupada(null);
    }
  };

  const alternar = async (f: FuenteUI) => {
    if (demo) return;
    try {
      const r = await activarFuenteVigia(f.id, !f.activa);
      if (!r.ok) return void toast.error(r.error);
      await recargar();
    } catch {
      toast.error("No se pudo cambiar. Inténtalo de nuevo.");
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h3 className="text-sm font-semibold text-foreground">Vigía</h3>
          <p className="text-xs text-muted-foreground">
            Lee las guías oficiales y las de Higgsfield. Cuando una página cambia, H.Ü.E propone qué actualizar con una cita textual. Nada se publica
            hasta que lo apruebas; lo que descartas no vuelve. Sin cambios en una página, no se gasta nada.
          </p>
        </div>
        <Button size="sm" onClick={() => revisar()} disabled={!!revisando} aria-busy={revisando === "todas"}>
          {revisando === "todas" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {revisando === "todas" ? "Revisando…" : "Revisar ahora"}
        </Button>
      </div>

      {demo && (
        <p className="flex items-center gap-1.5 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-foreground">
          <AlertTriangle className="size-3.5 shrink-0 text-status-warning" /> Demo (sólo desarrollo): datos de muestra, sin guardar.
        </p>
      )}
      {error && <p className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-foreground">{error}</p>}
      {resumen && (
        <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-foreground" aria-live="polite">
          Leídas {resumen.leidas} · sin cambios {resumen.sinCambio} · primera lectura {resumen.lineaBase} · con cambios {resumen.conCambios} · propuestas nuevas {resumen.propuestas}
          {resumen.repetidas ? ` · ya conocidas ${resumen.repetidas}` : ""}
          {resumen.pendientesDeLlamada ? ` · ${resumen.pendientesDeLlamada} quedan para la próxima` : ""}
          {resumen.errores.length ? ` · con error: ${resumen.errores.map((e) => e.nombre).join(", ")}` : ""}
        </p>
      )}

      {!datos ? (
        !error && <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Propuestas pendientes ({datos.pendientes.length}){datos.enEspera ? ` · ${datos.enEspera} de comunidad esperando una 2ª fuente` : ""}
            </p>
            {!datos.pendientes.length && <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Nada pendiente.</p>}
            {datos.pendientes.map((p) => (
              <article key={p.id} className="space-y-2 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-medium text-foreground">{TIPO_LABEL[p.tipo as TipoPropuesta]}</span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{nombreTool(p.tool)}</span>
                  {p.origen === "comunidad" && <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">Comunidad · {p.fuentes.length} fuentes</span>}
                  <span className="ml-auto text-muted-foreground">{fecha(p.created_at)}</span>
                </div>
                <p className="text-sm font-medium text-foreground">{p.resumen_es}</p>
                <p className="text-[11px] text-muted-foreground">Resumen escrito por H.Ü.E; lo que se escribe al aprobar es esto:</p>
                <p className="rounded-md bg-secondary/60 px-3 py-2 font-mono text-xs text-foreground">{describirContenido(p.tipo as TipoPropuesta, p.contenido)}</p>
                <blockquote className="border-l-2 border-primary/50 pl-3 text-xs italic text-muted-foreground">
                  «{p.cita}»{" "}
                  <a href={p.cita_url} target="_blank" rel="noopener noreferrer" className="not-italic inline-flex items-center gap-0.5 text-primary hover:underline">
                    fuente <ExternalLink className="size-3" aria-hidden="true" />
                  </a>
                </blockquote>
                {descartando === p.id ? (
                  <div className="space-y-2">
                    <label className="block text-xs text-muted-foreground">
                      ¿Por qué se descarta?
                      <Textarea value={motivos[p.id] ?? ""} onChange={(e) => setMotivos((m) => ({ ...m, [p.id]: e.target.value }))} rows={2} maxLength={300} className="mt-1 text-sm" autoFocus />
                    </label>
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" onClick={() => decidir(p, false)} disabled={ocupada === p.id || !(motivos[p.id] ?? "").trim()}>
                        {ocupada === p.id ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />} Descartar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDescartando(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => decidir(p, true)} disabled={ocupada === p.id} aria-busy={ocupada === p.id}>
                      {ocupada === p.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                      {p.tipo === "codigo" ? "Aprobar como pendiente de código" : "Aprobar"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDescartando(p.id)} disabled={ocupada === p.id}>
                      <X className="size-4" /> Descartar
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fuentes ({datos.fuentes.length})</p>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEditando(null); setBorrador({ ...vacio }); }}>
                <Plus className="size-3.5" /> Agregar fuente
              </Button>
            </div>
            {borrador && (
              <div className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-[2fr_1.5fr_1fr_1fr_auto]">
                <label className="block text-xs text-muted-foreground">
                  Liga (https)
                  <Input value={borrador.url} onChange={(e) => setBorrador({ ...borrador, url: e.target.value })} type="url" maxLength={300} className="mt-1 h-8 text-sm" placeholder="https://…" />
                </label>
                <label className="block text-xs text-muted-foreground">
                  Nombre
                  <Input value={borrador.nombre} onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })} maxLength={80} className="mt-1 h-8 text-sm" />
                </label>
                <label className="block text-xs text-muted-foreground">
                  Herramienta
                  <select value={borrador.tool} onChange={(e) => setBorrador({ ...borrador, tool: e.target.value })} className={selectCls}>
                    <option value="">General</option>
                    {TOOLS.map((t) => (
                      <option key={t} value={t}>
                        {TOOL_INFO[t].nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-muted-foreground">
                  Origen
                  <select value={borrador.origen} onChange={(e) => setBorrador({ ...borrador, origen: e.target.value as Borrador["origen"] })} className={selectCls}>
                    <option value="oficial">Oficial</option>
                    <option value="comunidad">Comunidad (pide 2 fuentes)</option>
                  </select>
                </label>
                <div className="flex items-end gap-1.5">
                  <Button size="sm" onClick={guardar} disabled={ocupada === "fuente" || !borrador.url.trim() || !borrador.nombre.trim()}>
                    {ocupada === "fuente" ? <Loader2 className="size-4 animate-spin" /> : "Guardar"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setBorrador(null); setEditando(null); }}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
            <ul className="divide-y divide-border rounded-xl border border-border bg-card">
              {datos.fuentes.map((f) => (
                <li key={f.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm", !f.activa && "opacity-60")}>
                  <div className="min-w-0 flex-1">
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:underline">
                      {f.nombre}
                    </a>
                    <p className="text-[11px] text-muted-foreground">
                      {nombreTool(f.tool)} · {f.origen === "oficial" ? "oficial" : "comunidad"} · {f.ultima_lectura ? `leída ${fecha(f.ultima_lectura)}` : "sin leer"}
                    </p>
                    {f.ultimo_error && <p className="text-[11px] text-destructive">Error: {f.ultimo_error}</p>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => revisar(f.id)} disabled={!!revisando || !f.activa} aria-busy={revisando === f.id} title="Revisar sólo esta fuente">
                    {revisando === f.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditando(f.id); setBorrador({ url: f.url, nombre: f.nombre, tool: f.tool ?? "", origen: f.origen }); }}>
                    Editar
                  </Button>
                  <Switch checked={f.activa} onCheckedChange={() => alternar(f)} aria-label={`${f.activa ? "Pausar" : "Activar"} ${f.nombre}`} />
                </li>
              ))}
            </ul>
          </div>

          {datos.decididas.length > 0 && (
            <details className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">Historial ({datos.decididas.length})</summary>
              <ul className="mt-2 space-y-1.5">
                {datos.decididas.map((p) => (
                  <li key={p.id} className="text-xs">
                    <span className={cn("font-medium", p.estado === "aprobada" ? "text-status-completed" : "text-muted-foreground")}>{p.estado === "aprobada" ? "Aprobada" : "Descartada"}</span>
                    {" · "}
                    <span className="text-foreground">{p.resumen_es}</span>
                    {p.motivo ? <span className="text-muted-foreground"> — {p.motivo}</span> : null}
                    <span className="text-muted-foreground"> · {fecha(p.decidido_at)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
