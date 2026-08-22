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
} from "@/app/(app)/admin/hue-actions";
import type { HueInstruction, HueKbDocument } from "@/lib/database.types";
import type { Winner, AdaptacionRow } from "@/lib/hue-data";

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
const kb = (bytes: number | null) => (bytes === null ? "" : `${Math.max(1, Math.round(bytes / 1024))} KB`);

type TrainingData = {
  instrucciones: HueInstruction[];
  kb: HueKbDocument[];
  adaptaciones: AdaptacionRow[];
  autoLearn: boolean;
};

export function HueTraining() {
  const [data, setData] = useState<TrainingData | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [cargando, setCargando] = useState(true);

  const recargar = () => {
    hubTraining().then((res) => {
      if (res.ok) setData({ instrucciones: res.instrucciones, kb: res.kb, adaptaciones: res.adaptaciones, autoLearn: res.autoLearn });
      else toast.error(res.error);
    });
  };

  useEffect(() => {
    let vivo = true;
    Promise.all([hubTraining(), hubWinners()]).then(([t, w]) => {
      if (!vivo) return;
      if (t.ok) setData({ instrucciones: t.instrucciones, kb: t.kb, adaptaciones: t.adaptaciones, autoLearn: t.autoLearn });
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
      <Cerebro instrucciones={data.instrucciones} onReload={recargar} />
      <Ganadores winners={winners} />
      <KBDocs docs={data.kb} onReload={recargar} />
      <Auditoria filas={data.adaptaciones} />
    </div>
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
          Aprender solo al estrellar un ganador
        </label>
        <Button variant="outline" size="sm" onClick={sintetizar} disabled={pend}>
          {pend ? "Analizando…" : "Correr síntesis ahora"}
        </Button>
      </div>
    </section>
  );
}

// ── El Cerebro (hue_instructions) ────────────────────────────
function Cerebro({ instrucciones, onReload }: { instrucciones: HueInstruction[]; onReload: () => void }) {
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
          onCancel={() => setCreando(false)}
          onSave={async (title, body) => {
            const r = await crearInstruccion(title, body);
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
            <LessonCard key={i.id} i={i} onReload={onReload} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LessonForm({
  inicial,
  onSave,
  onCancel,
}: {
  inicial?: { title: string; body: string };
  onSave: (title: string, body: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(inicial?.title ?? "");
  const [body, setBody] = useState(inicial?.body ?? "");
  const [pend, setPend] = useState(false);
  const guardar = async () => {
    if (!title.trim() || !body.trim()) return toast.error("Título y cuerpo son obligatorios.");
    setPend(true);
    await onSave(title, body);
    setPend(false);
  };
  return (
    <div className="gl-card space-y-2 p-3">
      <Input placeholder="Título de la lección" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea placeholder="La guía accionable…" value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={guardar} disabled={pend}>Guardar</Button>
      </div>
    </div>
  );
}

function LessonCard({ i, onReload }: { i: HueInstruction; onReload: () => void }) {
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

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
            <Badge tone={i.source === "auto" ? "auto" : "human"}>{i.source === "auto" ? "auto" : "manual"}</Badge>
            <Badge tone="neutral">v{i.version}</Badge>
            {i.scope !== "global" && <Badge tone="neutral">{i.scope}</Badge>}
            {!i.active && <Badge tone="off">inactiva</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{i.body}</p>
          {i.source === "auto" && i.reason && (
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
function KBDocs({ docs, onReload }: { docs: HueKbDocument[]; onReload: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [preview, setPreview] = useState<{ id: string; texto: string } | null>(null);

  const subir = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Elige un archivo.");
    const form = new FormData();
    form.set("file", file);
    form.set("title", title);
    setSubiendo(true);
    const r = await subirKb(form);
    setSubiendo(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Documento subido");
    setTitle("");
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
      </p>

      <div className="gl-card flex flex-wrap items-center gap-2 p-3">
        <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" className="max-w-[220px] text-xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs file:text-secondary-foreground" />
        <Input placeholder="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 max-w-[200px]" />
        <Button size="sm" onClick={subir} disabled={subiendo}>
          <Upload className="size-3.5" /> {subiendo ? "Subiendo…" : "Subir"}
        </Button>
      </div>

      {docs.length > 0 && (
        <ul className="space-y-1.5">
          {docs.map((d) => (
            <li key={d.id} className="gl-card flex items-center gap-2 p-2.5 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-foreground">{d.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{kb(d.size_bytes)}</span>
              <Button variant="ghost" size="xs" onClick={() => verTexto(d.id)}>Ver texto</Button>
              <Button variant="ghost" size="icon-xs" aria-label="Borrar" onClick={async () => {
                const r = await borrarKb(d.id);
                if (!r.ok) toast.error(r.error);
                else { toast.success("Documento borrado"); onReload(); }
              }}>
                <Trash2 />
              </Button>
            </li>
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
