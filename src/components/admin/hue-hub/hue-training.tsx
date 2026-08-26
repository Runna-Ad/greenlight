"use client";

import { useEffect, useRef, useState } from "react";
import {
  Brain,
  Trophy,
  FileText,
  History,
  Plus,
  Pencil,
  Trash2,
  Upload,
  ChevronDown,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  hubTraining,
  hubWinners,
  crearInstruccion,
  editarInstruccion,
  toggleInstruccion,
  borrarInstruccion,
  subirKb,
  borrarKb,
  kbTexto,
  setAutoLearn,
  correrSintesisAhora,
  hubEdiciones,
  setAutoLearnEdits,
  correrSintesisEdicionesAhora,
  type ClienteScope,
} from "@/app/(app)/admin/hue-actions";
import type { HueInstruction, HueKbDocument, HueScope } from "@/lib/database.types";
import type { Winner, AdaptacionRow, EdicionesResumen, EdicionTarea } from "@/lib/hue-data";

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
const kb = (bytes: number | null) => (bytes === null ? "" : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** El scope elegido en el picker. `id` = client_id o marca_id según `scope`; null en global. */
type ScopeVal = { scope: HueScope; id: string | null };
const GLOBAL_SCOPE: ScopeVal = { scope: "global", id: null };

/**
 * Selector de scope compartido (KB + Cerebro): Global · un cliente entero · una marca.
 * Native `<select>` con `<optgroup>` por cliente (mismo idiom que biblioteca-tab). El valor
 * codifica `global` | `client:<id>` | `marca:<id>`.
 */
function ScopeSelect({ clientes, value, onChange, disabled }: {
  clientes: ClienteScope[];
  value: ScopeVal;
  onChange: (v: ScopeVal) => void;
  disabled?: boolean;
}) {
  const raw = value.scope === "global" || !value.id ? "global" : `${value.scope}:${value.id}`;
  return (
    <select
      value={raw}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "global") return onChange(GLOBAL_SCOPE);
        const [kind, id] = v.split(":");
        onChange({ scope: kind as HueScope, id });
      }}
      className="h-8 max-w-[220px] rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title="A qué cliente/marca aplica"
    >
      <option value="global">Global · todos los clientes</option>
      {clientes.map((c) => (
        <optgroup key={c.id} label={c.name}>
          <option value={`client:${c.id}`}>{c.name} · todo el cliente</option>
          {c.marcas.map((m) => (
            <option key={m.id} value={`marca:${m.id}`}>
              {c.name} › {m.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Etiqueta legible del scope de un doc/lección (para el badge de la lista). */
function scopeLabel(scope: HueScope, clientId: string | null, marcaId: string | null, clientes: ClienteScope[]): string | null {
  if (scope === "global") return null;
  if (scope === "marca" && marcaId) {
    for (const c of clientes) {
      const m = c.marcas.find((x) => x.id === marcaId);
      if (m) return `${c.name} › ${m.name}`;
    }
    return "marca";
  }
  if (scope === "client" && clientId) return clientes.find((c) => c.id === clientId)?.name ?? "cliente";
  return null;
}

type TrainingData = {
  instrucciones: HueInstruction[];
  kb: HueKbDocument[];
  adaptaciones: AdaptacionRow[];
  autoLearn: boolean;
  autoLearnEdits: boolean;
  clientes: ClienteScope[];
};

export function HueTraining() {
  const [data, setData] = useState<TrainingData | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [cargando, setCargando] = useState(true);

  const recargar = () => {
    hubTraining().then((res) => {
      if (res.ok) setData({ instrucciones: res.instrucciones, kb: res.kb, adaptaciones: res.adaptaciones, autoLearn: res.autoLearn, autoLearnEdits: res.autoLearnEdits, clientes: res.clientes });
      else toast.error(res.error);
    });
  };

  useEffect(() => {
    let vivo = true;
    Promise.all([hubTraining(), hubWinners()]).then(([t, w]) => {
      if (!vivo) return;
      if (t.ok) setData({ instrucciones: t.instrucciones, kb: t.kb, adaptaciones: t.adaptaciones, autoLearn: t.autoLearn, autoLearnEdits: t.autoLearnEdits, clientes: t.clientes });
      else toast.error(t.error);
      if (w.ok) setWinners(w.winners);
      setCargando(false);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (cargando || !data) return <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>;

  return (
    <div className="space-y-6">
      <AutoLearn autoLearn={data.autoLearn} onReload={recargar} />
      <AprendizajeEdiciones autoLearnEdits={data.autoLearnEdits} onReload={recargar} />
      <Cerebro instrucciones={data.instrucciones} clientes={data.clientes} onReload={recargar} />
      <Ganadores winners={winners} />
      <KBDocs docs={data.kb} clientes={data.clientes} onReload={recargar} />
      <Auditoria filas={data.adaptaciones} />
    </div>
  );
}

// ── Aprender de ediciones (borrador de H.Ü.E → guión publicado) ──────────────
function AprendizajeEdiciones({ autoLearnEdits, onReload }: { autoLearnEdits: boolean; onReload: () => void }) {
  const [on, setOn] = useState(autoLearnEdits);
  const [pend, setPend] = useState(false);
  const [res, setRes] = useState<EdicionesResumen | null>(null);

  const cargar = () => hubEdiciones().then((r) => setRes(r.ok ? r.ediciones : null));
  useEffect(() => {
    cargar();
  }, []);

  const toggle = async (v: boolean) => {
    setOn(v);
    const r = await setAutoLearnEdits(v);
    if (!r.ok) {
      toast.error(r.error);
      setOn(!v);
    } else toast.success(v ? "Aprendizaje de ediciones encendido" : "Aprendizaje de ediciones apagado");
  };

  const sintetizar = async () => {
    setPend(true);
    const r = await correrSintesisEdicionesAhora();
    setPend(false);
    if (!r.ok) toast.error(r.error);
    else {
      toast.success(r.mensaje);
      onReload();
      cargar();
    }
  };

  // "% conservado" = 1 − mediana del editRate; el resto lo editó el equipo.
  const conservado = res && res.editRateMediano !== null ? Math.round((1 - res.editRateMediano) * 100) : null;
  const editadas = (res?.tareas ?? []).filter((t) => t.diff.cambios.length > 0).slice(0, 12);

  return (
    <section className="gl-card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Wand2 className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Aprender de tus ediciones</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        H.Ü.E compara el <span className="font-medium text-foreground">borrador</span> que generó contra el guión{" "}
        <span className="font-medium text-foreground">publicado</span> y propone lecciones{" "}
        <span className="font-medium text-foreground">inactivas</span> a partir de cómo el equipo lo corrige. Sólo mira{" "}
        estilo/redacción — <span className="font-medium text-foreground">enmascara las cifras</span> para no aprender montos
        de una tarea específica. Tú decides cuáles activar.
      </p>

      {res && res.total > 0 && (
        <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm">
          {conservado !== null && (
            <span className="text-foreground">
              <b className="font-semibold">{conservado}%</b> del borrador se conserva
            </span>
          )}
          <span className="text-muted-foreground">{res.total} guiones publicados con borrador</span>
          <span className="text-muted-foreground">{res.utiles} útiles para aprender</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Switch checked={on} onCheckedChange={toggle} />
          Aprender automáticamente de mis ediciones
        </label>
        <Button variant="outline" size="sm" onClick={sintetizar} disabled={pend}>
          {pend ? "Analizando…" : "Correr síntesis de ediciones"}
        </Button>
      </div>

      {editadas.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cambios recientes (borrador → publicado)</p>
          <ul className="space-y-2">
            {editadas.map((t) => (
              <DiffTarea key={t.ideaId} t={t} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Una tarjeta expandible: la tarea + su tasa de edición + el diff campo a campo. */
function DiffTarea({ t }: { t: EdicionTarea }) {
  const [abierto, setAbierto] = useState(false);
  const pct = Math.round(t.diff.editRate * 100);
  return (
    <li className="gl-card p-3">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} className="flex w-full items-center gap-2 text-left">
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-foreground">{t.namingBase ?? t.code ?? "s/n"}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{t.clienteName}</span>
        <Badge tone={t.esUtil ? "auto" : "neutral"}>{pct}% editado</Badge>
      </button>
      {abierto && (
        <ul className="mt-2 space-y-2 border-t border-border pt-2">
          {t.diff.cambios.map((c, idx) => (
            <li key={idx} className="text-xs">
              <p className="mb-1 font-semibold text-muted-foreground">Plano {c.plano} · {c.campo}</p>
              <p className="rounded bg-[color-mix(in_srgb,var(--status-corrections)_10%,transparent)] px-2 py-1 text-foreground">
                <span className="mr-1 font-semibold text-status-corrections">H.Ü.E:</span>
                {c.antes || "(vacío)"}
              </p>
              <p className="mt-1 rounded bg-[color-mix(in_srgb,var(--status-completed)_12%,transparent)] px-2 py-1 text-foreground">
                <span className="mr-1 font-semibold text-status-completed">Publicado:</span>
                {c.despues || "(vacío)"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ── Auto-aprendizaje (switch + síntesis manual) ──────────────
function AutoLearn({ autoLearn, onReload }: { autoLearn: boolean; onReload: () => void }) {
  const [on, setOn] = useState(autoLearn);
  const [pend, setPend] = useState(false);

  const toggle = async (v: boolean) => {
    setOn(v);
    const r = await setAutoLearn(v);
    if (!r.ok) {
      toast.error(r.error);
      setOn(!v);
    } else toast.success(v ? "Auto-aprendizaje encendido" : "Auto-aprendizaje apagado");
  };

  const sintetizar = async () => {
    setPend(true);
    const r = await correrSintesisAhora();
    setPend(false);
    if (!r.ok) toast.error(r.error);
    else {
      toast.success(r.mensaje);
      onReload();
    }
  };

  return (
    <section className="gl-card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Loop de auto-aprendizaje</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Al estrellar un guión ganador, H.Ü.E lee la Biblioteca de Ganadores y propone lecciones nuevas
        (<span className="font-medium text-foreground">inactivas</span>) al Cerebro. Son{" "}
        <span className="font-medium text-foreground">patrones observados</span> en tus ganadores, no causas
        probadas — tú decides cuáles activar y puedes revertir cualquiera.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Switch checked={on} onCheckedChange={toggle} />
          Aprender automáticamente al estrellar un ganador
        </label>
        <Button variant="outline" size="sm" onClick={sintetizar} disabled={pend}>
          {pend ? "Analizando…" : "Correr síntesis ahora"}
        </Button>
      </div>
    </section>
  );
}

// ── El Cerebro (hue_instructions) ────────────────────────────
function Cerebro({ instrucciones, clientes, onReload }: { instrucciones: HueInstruction[]; clientes: ClienteScope[]; onReload: () => void }) {
  const [creando, setCreando] = useState(false);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Brain className="size-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">El Cerebro · Playbook</h3>
          <span className="text-xs text-muted-foreground">{instrucciones.filter((i) => i.active).length} activas</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setCreando((v) => !v)}>
          <Plus className="size-3.5" /> Añadir lección
        </Button>
      </div>

      {creando && (
        <LessonForm
          clientes={clientes}
          onCancel={() => setCreando(false)}
          onSave={async (title, body, scope) => {
            const r = await crearInstruccion(title, body, scope?.scope ?? "global", scope?.id ?? null);
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            toast.success("Lección añadida");
            setCreando(false);
            onReload();
          }}
        />
      )}

      {instrucciones.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          El Cerebro está vacío. Añade lecciones a mano, o estrella ganadores para que H.Ü.E proponga las suyas.
        </p>
      ) : (
        <ul className="space-y-2">
          {instrucciones.map((i) => (
            <LessonCard key={i.id} i={i} clientes={clientes} onReload={onReload} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LessonForm({
  inicial,
  clientes,
  onSave,
  onCancel,
}: {
  inicial?: { title: string; body: string };
  /** Presente sólo al CREAR → muestra el selector de scope (marca/cliente/global). */
  clientes?: ClienteScope[];
  onSave: (title: string, body: string, scope?: ScopeVal) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(inicial?.title ?? "");
  const [body, setBody] = useState(inicial?.body ?? "");
  const [scope, setScope] = useState<ScopeVal>(GLOBAL_SCOPE);
  const [pend, setPend] = useState(false);
  const guardar = async () => {
    if (!title.trim() || !body.trim()) return toast.error("Título y cuerpo son obligatorios.");
    setPend(true);
    await onSave(title, body, clientes ? scope : undefined);
    setPend(false);
  };
  return (
    <div className="gl-card space-y-2 p-3">
      <Input placeholder="Título de la lección" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea placeholder="La guía accionable…" value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {clientes && clientes.length > 0 && (
          <div className="mr-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Aplica a</span>
            <ScopeSelect clientes={clientes} value={scope} onChange={setScope} disabled={pend} />
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={guardar} disabled={pend}>Guardar</Button>
      </div>
    </div>
  );
}

function LessonCard({ i, clientes, onReload }: { i: HueInstruction; clientes: ClienteScope[]; onReload: () => void }) {
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const scopeTxt = scopeLabel(i.scope, i.client_id, i.marca_id, clientes);

  if (editando) {
    return (
      <li>
        <LessonForm
          inicial={{ title: i.title, body: i.body }}
          onCancel={() => setEditando(false)}
          onSave={async (title, body) => {
            const r = await editarInstruccion(i.id, title, body);
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            toast.success("Lección actualizada");
            setEditando(false);
            onReload();
          }}
        />
      </li>
    );
  }

  return (
    <li className={cn("gl-card p-3", !i.active && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-foreground">{i.title}</span>
            <Badge tone={i.source === "human" ? "human" : "auto"}>
              {i.source === "auto_edit" ? "ediciones" : i.source === "auto" ? "auto" : "manual"}
            </Badge>
            <Badge tone="neutral">v{i.version}</Badge>
            {scopeTxt && <Badge tone="neutral">{scopeTxt}</Badge>}
            {!i.active && <Badge tone="off">inactiva</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{i.body}</p>
          {i.source !== "human" && i.reason && (
            <p className="mt-1 text-xs italic text-muted-foreground">Patrón observado: {i.reason}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Switch
            checked={i.active}
            onCheckedChange={async (v) => {
              const r = await toggleInstruccion(i.id, v);
              if (!r.ok) toast.error(r.error);
              else onReload();
            }}
            aria-label={i.active ? "Desactivar" : "Activar"}
          />
          <Button variant="ghost" size="icon-xs" onClick={() => setEditando(true)} aria-label="Editar">
            <Pencil />
          </Button>
          {confirmar ? (
            <Button variant="destructive" size="xs" onClick={async () => {
              const r = await borrarInstruccion(i.id);
              if (!r.ok) toast.error(r.error);
              else { toast.success("Lección revertida"); onReload(); }
            }}>
              Confirmar
            </Button>
          ) : (
            <Button variant="ghost" size="icon-xs" onClick={() => setConfirmar(true)} aria-label="Revertir / borrar">
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

// ── Biblioteca de Ganadores ──────────────────────────────────
function Ganadores({ winners }: { winners: Winner[] }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Trophy className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Biblioteca de Ganadores</h3>
        <span className="text-xs text-muted-foreground">{winners.length}</span>
      </div>
      {winners.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Aún no hay ganadores. Marca la estrella en Entregas para sumarlos aquí (la estrella la pones tú).
        </p>
      ) : (
        <ul className="space-y-2">
          {winners.map((w) => (
            <WinnerCard key={w.ideaId} w={w} />
          ))}
        </ul>
      )}
    </section>
  );
}

function WinnerCard({ w }: { w: Winner }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <li className="gl-card p-0">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 p-3 text-left hover:bg-secondary/40"
      >
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")} />
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">{w.namingBase ?? w.code ?? "—"}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{w.clienteName} · {w.briefLabel}</span>
      </button>
      {abierto && (
        <div className="space-y-2 border-t border-border p-3 text-sm">
          {w.reason && <p className="text-xs italic text-muted-foreground">Nota: {w.reason}</p>}
          {w.planos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sin contenido de guión.</p>
          ) : (
            w.planos.map((p, i) => (
              <div key={i} className="rounded-md bg-secondary/40 p-2 text-[13px]">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Plano {p.orden}</div>
                {p.accion && <p><span className="text-muted-foreground">Acción:</span> {p.accion}</p>}
                {p.copy_in && <p><span className="text-muted-foreground">Copy:</span> {p.copy_in}</p>}
                {p.dialogo && <p><span className="text-muted-foreground">Diálogo:</span> {p.dialogo}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </li>
  );
}

// ── KB (hue_kb_documents) ────────────────────────────────────
function KBDocs({ docs, clientes, onReload }: { docs: HueKbDocument[]; clientes: ClienteScope[]; onReload: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<ScopeVal>(GLOBAL_SCOPE);
  const [subiendo, setSubiendo] = useState(false);
  const [preview, setPreview] = useState<{ id: string; texto: string } | null>(null);

  const subir = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Elige un archivo.");
    const form = new FormData();
    form.set("file", file);
    form.set("title", title);
    form.set("scope", scope.scope);
    form.set("scope_id", scope.id ?? "");
    setSubiendo(true);
    const r = await subirKb(form);
    setSubiendo(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Documento subido");
    setTitle("");
    // El scope NO se resetea: subir varios docs de la MISMA marca es lo común.
    if (fileRef.current) fileRef.current.value = "";
    onReload();
  };

  const verTexto = async (id: string) => {
    const r = await kbTexto(id);
    if (!r.ok) return toast.error(r.error);
    setPreview({ id, texto: r.texto || "(sin texto extraído)" });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Base de conocimiento</h3>
        <span className="text-xs text-muted-foreground">{docs.length}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Sube docs (pdf, docx, txt, md). H.Ü.E extrae el texto para leerlo entero al escribir guiones (Fase 2).
        Elige a qué <span className="font-medium text-foreground">marca</span> aplica: H.Ü.E sólo lee los docs de
        esa marca (o del cliente / globales) al escribir — así los facts de una marca no se cruzan con otra.
      </p>

      <div className="gl-card flex flex-wrap items-center gap-2 p-3">
        <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" aria-label="Subir documento al Base de conocimiento" className="max-w-[220px] text-xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs file:text-secondary-foreground" />
        <Input placeholder="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 max-w-[200px]" />
        <ScopeSelect clientes={clientes} value={scope} onChange={setScope} disabled={subiendo} />
        <Button size="sm" onClick={subir} disabled={subiendo}>
          <Upload className="size-3.5" /> {subiendo ? "Subiendo…" : "Subir"}
        </Button>
      </div>

      {docs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Aún no hay documentos. Sube un pdf, docx, txt o md para que H.Ü.E lo lea al escribir guiones.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map((d) => (
            <KbDocRow key={d.id} d={d} clientes={clientes} onReload={onReload} onVerTexto={verTexto} />
          ))}
        </ul>
      )}

      {preview && (
        <div className="gl-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Texto extraído</span>
            <Button variant="ghost" size="icon-xs" aria-label="Cerrar" onClick={() => setPreview(null)}>
              <X />
            </Button>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-foreground">{preview.texto}</pre>
        </div>
      )}
    </section>
  );
}

/** Una fila de doc del KB con borrado en dos pasos (mismo patrón que LessonCard). */
function KbDocRow({ d, clientes, onReload, onVerTexto }: { d: HueKbDocument; clientes: ClienteScope[]; onReload: () => void; onVerTexto: (id: string) => void }) {
  const [confirmar, setConfirmar] = useState(false);
  const scopeTxt = scopeLabel(d.scope, d.client_id, d.marca_id, clientes);
  return (
    <li className="gl-card flex items-center gap-2 p-2.5 text-sm">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-foreground">{d.title}</span>
      <Badge tone={scopeTxt ? "neutral" : "off"}>{scopeTxt ?? "Global"}</Badge>
      <span className="shrink-0 text-xs text-muted-foreground">{kb(d.size_bytes)}</span>
      <Button variant="ghost" size="xs" onClick={() => onVerTexto(d.id)}>Ver texto</Button>
      {confirmar ? (
        <Button variant="destructive" size="xs" onClick={async () => {
          const r = await borrarKb(d.id);
          if (!r.ok) toast.error(r.error);
          else { toast.success("Documento borrado"); onReload(); }
        }}>
          Confirmar
        </Button>
      ) : (
        <Button variant="ghost" size="icon-xs" aria-label="Borrar" onClick={() => setConfirmar(true)}>
          <Trash2 />
        </Button>
      )}
    </li>
  );
}

// ── Auditoría (hue_adaptations) ──────────────────────────────
function Auditoria({ filas }: { filas: AdaptacionRow[] }) {
  if (!filas.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <History className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Qué aprendió y cambió H.Ü.E</h3>
      </div>
      <ul className="space-y-1.5">
        {filas.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-sm">
            <span className={cn("size-1.5 shrink-0 rounded-full", a.reverted_at ? "bg-muted-foreground" : "bg-primary")} />
            <span className="min-w-0 flex-1 truncate text-foreground">{a.trigger_summary ?? a.instruccionTitle ?? "Cambio"}</span>
            {a.reverted_at && <span className="shrink-0 text-[11px] text-muted-foreground">revertida</span>}
            <span className="shrink-0 text-xs text-muted-foreground">{fecha(a.at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Badge({ tone, children }: { tone: "auto" | "human" | "neutral" | "off"; children: React.ReactNode }) {
  const cls = {
    auto: "bg-primary/15 text-primary",
    human: "bg-secondary text-secondary-foreground",
    neutral: "bg-secondary text-muted-foreground",
    off: "bg-muted text-muted-foreground",
  }[tone];
  return <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", cls)}>{children}</span>;
}
