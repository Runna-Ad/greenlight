"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { activarReglaPrisma, borrarReglaPrisma, guardarReglaPrisma, hubPrismaReglas } from "@/app/(app)/admin/hue-actions";
import type { PrismaReglaRow } from "@/lib/database.types";
import { CAMPOS, FUENTE_TIPOS, KINDS, NIVELES } from "@/lib/prisma/reglas";
import { TOOLS } from "@/lib/prisma/spec";
import { TOOL_INFO } from "@/lib/prisma/tools";

/** Una nota con fuente de más de 90 días merece que alguien la vuelva a verificar. */
const DIAS_REVISAR = 90;
const fecha = (iso: string | null) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "sin fecha");
const vieja = (iso: string | null) => !!iso && Date.now() - new Date(iso + "T00:00:00").getTime() > DIAS_REVISAR * 86400e3;

type Filtro = "todas" | "nota" | "regla";

/**
 * Hub › Prisma: el conocimiento VIVO por herramienta. Las NOTAS entran al bloque cacheado
 * del writer en cada generación (sin deploy); las REGLAS son los avisos deterministas del
 * diagnóstico. Cada fila lleva fuente y fecha: "H.Ü.E dice" se vuelve "esto está documentado".
 */
export function PrismaReglas() {
  const [reglas, setReglas] = useState<PrismaReglaRow[] | null>(null);
  const [fuera, setFuera] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [tool, setTool] = useState<string>("");
  const [editando, setEditando] = useState<PrismaReglaRow | "nueva" | null>(null);

  const recargar = () => {
    hubPrismaReglas().then((r) => {
      if (!r.ok) return setError(r.error);
      setError(null);
      setReglas(r.reglas);
      setFuera(r.fuera);
    });
  };
  useEffect(recargar, []);

  const lista = (reglas ?? []).filter((r) => (filtro === "todas" || r.clase === filtro) && (!tool || r.tool === tool || (tool === "todas" && r.tool === null)));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Conocimiento por herramienta</h3>
          <p className="text-xs text-muted-foreground">
            Las notas entran al prompt de H.Ü.E en cada generación; las reglas son los avisos que ve el diseñador. Editar aquí no
            necesita deploy. Cada fila con su fuente y fecha. <strong>Las notas son globales</strong>: aplican a todas las marcas
            y a todos los clientes; nada confidencial de un cliente va aquí.
          </p>
        </div>
        <Button size="sm" onClick={() => setEditando("nueva")} className="gap-1.5">
          <Plus className="size-3.5" /> Nueva
        </Button>
      </div>

      {error && (
        <p className="rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-foreground">{error}</p>
      )}
      {fuera > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-xs text-foreground">
          <AlertTriangle className="size-3.5 shrink-0 text-status-warning" />
          {fuera === 1 ? "1 nota activa no entra al prompt" : `${fuera} notas activas no entran al prompt`}: pasan el tope (60 notas / 6,000 letras). Apaga o
          acorta las de orden más alto.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(["todas", "nota", "regla"] as Filtro[]).map((f) => (
          <button key={f} type="button" onClick={() => setFiltro(f)} aria-pressed={filtro === f} className={cn("rounded-full border px-2.5 py-1 transition-colors", filtro === f ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
            {f === "todas" ? "Todas" : f === "nota" ? "Notas" : "Reglas"}
          </button>
        ))}
        <select value={tool} onChange={(e) => setTool(e.target.value)} aria-label="Herramienta" className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="">Cualquier herramienta</option>
          <option value="todas">Sólo las generales</option>
          {TOOLS.map((t) => (
            <option key={t} value={t}>
              {TOOL_INFO[t].nombre}
            </option>
          ))}
        </select>
        {reglas && <span className="text-muted-foreground">{lista.length} de {reglas.length}</span>}
      </div>

      {editando && (
        <ReglaForm
          inicial={editando === "nueva" ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardada={() => {
            setEditando(null);
            recargar();
          }}
        />
      )}

      {reglas === null && !error ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-xl border border-border bg-card">
          {lista.map((r) => (
            <li key={r.id} className={cn("flex items-start gap-3 px-3 py-2.5", !r.activa && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <code className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-foreground">{r.codigo}</code>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", r.clase === "nota" ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>{r.clase}</span>
                  <span className="text-[11px] text-muted-foreground">{r.tool ? TOOL_INFO[r.tool as keyof typeof TOOL_INFO]?.nombre ?? r.tool : "todas"}</span>
                  {r.clase === "regla" && <span className="text-[11px] text-muted-foreground">· {r.nivel}</span>}
                  {r.fuente_tipo === "comunidad" && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground" title="Fuente de la comunidad, no del proveedor">
                      comunidad
                    </span>
                  )}
                  {vieja(r.fuente_fecha) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-status-warning/15 px-2 py-0.5 text-[10px] font-medium text-status-warning" title={`Fuente de hace más de ${DIAS_REVISAR} días: vale la pena volver a verificar`}>
                      <AlertTriangle className="size-3" /> revisar
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-foreground">{r.clase === "nota" ? r.nota_en : r.que_es}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {r.fuente_url ? (
                    <a href={r.fuente_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                      fuente <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    "sin fuente"
                  )}{" "}
                  · {fecha(r.fuente_fecha)}
                </p>
              </div>
              <Switch
                checked={r.activa}
                aria-label={r.activa ? "Apagar" : "Encender"}
                onCheckedChange={async (v) => {
                  const res = await activarReglaPrisma(r.id, v);
                  if (!res.ok) return toast.error(res.error);
                  recargar();
                }}
              />
              <button type="button" onClick={() => setEditando(r)} aria-label={`Editar ${r.codigo}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <Pencil className="size-4" />
              </button>
              <BorrarRegla
                codigo={r.codigo}
                onBorrar={async () => {
                  const res = await borrarReglaPrisma(r.id);
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("Borrada.");
                  recargar();
                }}
              />
            </li>
          ))}
          {lista.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted-foreground">Nada con ese filtro.</li>}
        </ul>
      )}
    </section>
  );
}

/** Borrar en dos pasos, en línea (el idioma del Hub): el ícono se vuelve "Borrar" + cancelar. */
function BorrarRegla({ codigo, onBorrar }: { codigo: string; onBorrar: () => Promise<void> }) {
  const [confirmar, setConfirmar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  if (!confirmar) {
    return (
      <button type="button" onClick={() => setConfirmar(true)} aria-label={`Borrar ${codigo}`} title="Borrar (apágala si sólo quieres que deje de aplicar)" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive">
        <Trash2 className="size-4" />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => setConfirmar(false)} disabled={borrando} aria-label="Cancelar" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
        <X className="size-4" />
      </button>
      <Button
        size="sm"
        variant="destructive"
        disabled={borrando}
        onClick={async () => {
          setBorrando(true);
          try {
            await onBorrar();
          } finally {
            setBorrando(false);
            setConfirmar(false);
          }
        }}
      >
        Borrar
      </Button>
    </div>
  );
}

type Campos = Record<string, string>;

const vacio = (): Campos => ({ codigo: "", clase: "nota", tool: "", kind: "", nivel: "advierte", campo: "idea", patron: "", umbral: "", que_es: "", que_en: "", porque_es: "", porque_en: "", arreglo_es: "", arreglo_en: "", accion: "", nota_en: "", fuente_url: "", fuente_fecha: "", fuente_tipo: "oficial", orden: "0" });

function deFila(r: PrismaReglaRow): Campos {
  return {
    codigo: r.codigo, clase: r.clase, tool: r.tool ?? "", kind: r.kind ?? "", nivel: r.nivel, campo: r.campo ?? "idea", patron: r.patron ?? "", umbral: r.umbral === null ? "" : String(r.umbral),
    que_es: r.que_es ?? "", que_en: r.que_en ?? "", porque_es: r.porque_es ?? "", porque_en: r.porque_en ?? "", arreglo_es: r.arreglo_es ?? "", arreglo_en: r.arreglo_en ?? "",
    accion: r.accion ? JSON.stringify(r.accion) : "", nota_en: r.nota_en ?? "", fuente_url: r.fuente_url ?? "", fuente_fecha: r.fuente_fecha ?? "", fuente_tipo: r.fuente_tipo ?? "oficial", orden: String(r.orden),
  };
}

function ReglaForm({ inicial, onCerrar, onGuardada }: { inicial: PrismaReglaRow | null; onCerrar: () => void; onGuardada: () => void }) {
  const [c, setC] = useState<Campos>(inicial ? deFila(inicial) : vacio());
  const [guardando, setGuardando] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setC((prev) => ({ ...prev, [k]: e.target.value }));
  const esNota = c.clase === "nota";

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await guardarReglaPrisma(
        {
        ...c,
        tool: c.tool || null,
        kind: c.kind || null,
        campo: esNota ? null : c.campo,
        patron: c.patron || null,
        umbral: c.umbral === "" ? null : Number(c.umbral),
        accion: c.accion || null,
        orden: Number(c.orden) || 0,
          activa: inicial ? inicial.activa : true,
        },
        inicial?.id,
      );
      if (!r.ok) return toast.error(r.error);
      toast.success(inicial ? "Guardada. La próxima generación ya la usa." : "Creada. La próxima generación ya la usa.");
      onGuardada();
    } finally {
      setGuardando(false);
    }
  };

  const campo = (k: string, label: string, props: Partial<React.ComponentProps<typeof Input>> = {}) => (
    <label className="block text-xs text-muted-foreground">
      {label}
      <Input value={c[k]} onChange={set(k)} className="mt-1 h-8 text-sm" {...props} />
    </label>
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{inicial ? `Editar ${inicial.codigo}` : "Nueva nota o regla"}</h4>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-md p-1 text-muted-foreground hover:bg-secondary">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {campo("codigo", "Código (único, estable)", { placeholder: "texto_largo", disabled: !!inicial })}
        <label className="block text-xs text-muted-foreground">
          Clase
          <select value={c.clase} onChange={set("clase")} disabled={!!inicial} className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="nota">Nota (entra al prompt de H.Ü.E)</option>
            <option value="regla">Regla (aviso al diseñador)</option>
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">
          Herramienta
          <select value={c.tool} onChange={set("tool")} className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="">Todas</option>
            {TOOLS.map((t) => (
              <option key={t} value={t}>
                {TOOL_INFO[t].nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">
          Tipo de trabajo
          <select value={c.kind} onChange={set("kind")} className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="">Cualquiera</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        {campo("fuente_url", "Fuente (liga)", { placeholder: "https://…", type: "url" })}
        {campo("fuente_fecha", "Fecha de la fuente", { type: "date" })}
        <label className="block text-xs text-muted-foreground">
          Tipo de fuente
          <select value={c.fuente_tipo} onChange={set("fuente_tipo")} className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {FUENTE_TIPOS.map((f) => (
              <option key={f} value={f}>
                {f === "oficial" ? "Oficial (doc del proveedor)" : "Comunidad (guía, foro, reseña)"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {esNota ? (
        <label className="mt-3 block text-xs text-muted-foreground">
          Nota en inglés (lo que H.Ü.E lee; máx. 700 letras)
          <Textarea value={c.nota_en} onChange={set("nota_en")} rows={4} maxLength={700} className="mt-1 text-sm" placeholder="Veo 3.1: 8 seconds is mandatory when reference images are used…" />
        </label>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="block text-xs text-muted-foreground">
            Nivel
            <select value={c.nivel} onChange={set("nivel")} className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {NIVELES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            Campo que mira
            <select value={c.campo} onChange={set("campo")} className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {CAMPOS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          {campo("umbral", "Umbral (número, opcional)", { placeholder: "8", inputMode: "decimal" })}
          <label className="block text-xs text-muted-foreground sm:col-span-3">
            Patrón (regex, opcional; sin lookbehind ni repeticiones enormes)
            <Input value={c.patron} onChange={set("patron")} className="mt-1 h-8 font-mono text-sm" placeholder="\b(espejo|mirror)\b" />
          </label>
          {campo("que_es", "Qué pasa (ES)")}
          {campo("que_en", "What happens (EN)")}
          {campo("accion", "Acción de un click (JSON, opcional)", { placeholder: '{"tipo":"tool","tool":"veo"}' })}
          {campo("porque_es", "Por qué (ES)")}
          {campo("porque_en", "Why (EN)")}
          {campo("orden", "Orden", { inputMode: "numeric" })}
          {campo("arreglo_es", "Arreglo sugerido (ES)")}
          {campo("arreglo_en", "Suggested fix (EN)")}
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </Button>
        <Button size="sm" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
