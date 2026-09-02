"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  SNIPPET_KINDS,
  SNIPPET_KIND_LABEL,
  type MarcaOpt,
  type SnippetKind,
  type SnippetRow,
} from "@/lib/admin-tipos";
import {
  alternarSnippetActivo,
  crearSnippet,
  editarSnippet,
  eliminarSnippet,
} from "@/app/(app)/admin/actions";

type Edicion =
  | { modo: "nuevo"; kind: SnippetKind }
  | { modo: "editar"; snippet: SnippetRow }
  | null;

export function BibliotecaTab({
  snippets: inicial,
  marcas,
}: {
  snippets: SnippetRow[];
  marcas: MarcaOpt[];
}) {
  const [snippets, setSnippets] = useState<SnippetRow[]>(inicial);
  const [edicion, setEdicion] = useState<Edicion>(null);
  const [confirmarId, setConfirmarId] = useState<string | null>(null);

  const marcaName = (id: string | null) => marcas.find((m) => m.id === id)?.name ?? null;

  async function borrar(s: SnippetRow) {
    const r = await eliminarSnippet(s.id);
    setConfirmarId(null);
    if (!r.ok) {
      toast.error(r.error ?? "No se pudo borrar.");
      return;
    }
    setSnippets((xs) => xs.filter((x) => x.id !== s.id));
    toast.success("Borrado");
  }

  async function toggle(s: SnippetRow, active: boolean) {
    setSnippets((xs) => xs.map((x) => (x.id === s.id ? { ...x, active } : x)));
    const r = await alternarSnippetActivo(s.id, active);
    if (!r.ok) {
      setSnippets((xs) => xs.map((x) => (x.id === s.id ? { ...x, active: !active } : x)));
      toast.error(r.error ?? "No se pudo guardar.");
    }
  }

  return (
    <div className="space-y-6">
      {SNIPPET_KINDS.map((kind) => {
        const delKind = snippets.filter((s) => s.kind === kind);
        return (
          <section key={kind}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {SNIPPET_KIND_LABEL[kind]}{" "}
                <span className="font-normal normal-case text-muted-foreground/70">· {delKind.length}</span>
              </p>
              <Button type="button" size="xs" variant="outline" onClick={() => setEdicion({ modo: "nuevo", kind })}>
                <Plus /> Agregar
              </Button>
            </div>
            {delKind.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                Nada en {SNIPPET_KIND_LABEL[kind].toLowerCase()} todavía.
              </p>
            ) : (
              <div className="space-y-2">
                {delKind.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "gl-card rounded-xl border border-border bg-card p-3",
                      !s.active && "opacity-55",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                          {s.title}
                          {marcaName(s.marca_id) && (
                            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-normal text-secondary-foreground">
                              {marcaName(s.marca_id)}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                          {s.body}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Editar"
                        onClick={() => setEdicion({ modo: "editar", snippet: s })}
                        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <Switch
                        checked={s.active}
                        onCheckedChange={(v) => toggle(s, v)}
                        aria-label="Activo"
                      />
                      {confirmarId === s.id ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            aria-label="Cancelar"
                            onClick={() => setConfirmarId(null)}
                            className="rounded p-1 text-muted-foreground hover:bg-secondary"
                          >
                            <X className="size-3.5" />
                          </button>
                          <Button type="button" size="xs" variant="destructive" onClick={() => borrar(s)}>
                            Borrar
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label="Borrar"
                          title="Borrar"
                          onClick={() => setConfirmarId(s.id)}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      <EditorSnippet
        edicion={edicion}
        marcas={marcas}
        onClose={() => setEdicion(null)}
        onCreado={(s) => setSnippets((xs) => [...xs, s])}
        onEditado={(id, patch) => setSnippets((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)))}
      />
    </div>
  );
}

function EditorSnippet({
  edicion,
  marcas,
  onClose,
  onCreado,
  onEditado,
}: {
  edicion: Edicion;
  marcas: MarcaOpt[];
  onClose: () => void;
  onCreado: (s: SnippetRow) => void;
  onEditado: (id: string, patch: Partial<SnippetRow>) => void;
}) {
  const editando = edicion?.modo === "editar" ? edicion.snippet : null;
  const kind = edicion?.modo === "nuevo" ? edicion.kind : editando?.kind;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [marcaId, setMarcaId] = useState<string>("");
  const [guardando, setGuardando] = useState(false);
  // Sincroniza el formulario cuando cambia qué se edita (patrón render, sin useEffect).
  const [ref, setRef] = useState<string | null>(null);
  const clave = edicion ? (editando?.id ?? `nuevo-${kind}`) : null;
  if (clave !== ref) {
    setRef(clave);
    setTitle(editando?.title ?? "");
    setBody(editando?.body ?? "");
    setMarcaId(editando?.marca_id ?? "");
  }

  const guardar = async () => {
    setGuardando(true);
    if (edicion?.modo === "nuevo") {
      const r = await crearSnippet({ kind: edicion.kind, title, body, marca_id: marcaId || null });
      setGuardando(false);
      if (r.ok && r.snippet) {
        onCreado(r.snippet);
        toast.success("Agregado");
        onClose();
      } else toast.error(r.error ?? "No se pudo crear.");
    } else if (editando) {
      const r = await editarSnippet(editando.id, { title, body, marca_id: marcaId || null });
      setGuardando(false);
      if (r.ok) {
        onEditado(editando.id, { title: title.trim(), body: body.trim(), marca_id: marcaId || null, scope: marcaId ? "marca" : "global" });
        toast.success("Guardado");
        onClose();
      } else toast.error(r.error ?? "No se pudo guardar.");
    }
  };

  return (
    <Dialog open={edicion !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {edicion?.modo === "nuevo" ? "Agregar" : "Editar"}
            {kind ? ` · ${SNIPPET_KIND_LABEL[kind]}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="f-t-tulo" className="mb-1 block">Título</Label>
            <input id="f-t-tulo"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Legal CAT — Préstamos"
              autoFocus
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <Label htmlFor="f-texto" className="mb-1 block">Texto</Label>
            <textarea id="f-texto"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="El texto completo (legal, selling point, instrucción…)"
              className="w-full resize-y rounded-md border border-input bg-background p-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <Label htmlFor="f-marca" className="mb-1 block">Marca <span className="text-muted-foreground">(opcional)</span></Label>
            <select id="f-marca"
              value={marcaId}
              onChange={(e) => setMarcaId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Todas (global)</option>
              {marcas.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={!title.trim() || !body.trim() || guardando} onClick={guardar}>
            {guardando ? "Guardando…" : edicion?.modo === "nuevo" ? "Agregar" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
