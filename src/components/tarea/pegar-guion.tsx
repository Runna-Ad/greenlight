"use client";

import { useState, useTransition } from "react";
import { ClipboardPaste, Trash2, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { importarGuion, importarEstatico, extraerGuion } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import type { PlanoVista, EstaticoVista } from "./preview-slide";
import {
  parseGuion,
  parseEstatico,
  contarPlanos,
  type PlanoParsed,
  type EstaticoParsed,
} from "@/lib/guion";

const CAMPOS_PLANO: { k: keyof PlanoParsed; label: string; rows: number; ancho?: boolean }[] = [
  { k: "titulo", label: "Plano", rows: 1, ancho: true },
  { k: "accion", label: "Acción", rows: 2, ancho: true },
  { k: "copy_in", label: "Copy in", rows: 2, ancho: true },
  { k: "sfx", label: "SFX", rows: 1 },
  { k: "gfx", label: "GFX", rows: 1 },
  { k: "edicion", label: "Edición", rows: 1 },
  { k: "dialogo", label: "Diálogo", rows: 3, ancho: true },
];

const CAMPOS_ESTATICO: { k: keyof EstaticoParsed; label: string; rows: number }[] = [
  { k: "copy_titulo", label: "Título", rows: 1 },
  { k: "copy_subtitulo", label: "Subtítulo", rows: 2 },
  { k: "copy_cta", label: "Botón CTA", rows: 1 },
  { k: "legales_extra", label: "Legales extra", rows: 2 },
];

/**
 * "Pegar guión" / "Pegar copy": pega el guión del deck → vista previa EDITABLE →
 * confirmar. El parseo es determinista (src/lib/guion.ts); el humano SIEMPRE
 * revisa antes de escribir. Un pegado sin saltos de línea se detecta y se avisa
 * (el arreglo automático con IA llega en el paso 4).
 */
export function PegarGuion({
  ideaId,
  modo,
  onPlanos,
  onEstatico,
}: {
  ideaId: string;
  modo: "guion" | "estatico";
  /** Al importar, el editor actualiza su estado con las filas resultantes (sin recargar). */
  onPlanos?: (planos: PlanoVista[]) => void;
  onEstatico?: (estatico: EstaticoVista) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [paso, setPaso] = useState<"pegar" | "revisar">("pegar");
  const [planos, setPlanos] = useState<PlanoParsed[]>([]);
  const [estatico, setEstatico] = useState<EstaticoParsed | null>(null);
  const [reemplazar, setReemplazar] = useState(true);
  // El parser determinista salió débil (menos planos que marcadores, o cero) →
  // ofrecemos que H.Ü.E lo lea. `extraidoPorIA` marca la vista previa que vino de
  // H.Ü.E para nudgear a revisar que no falte ni cambie nada.
  const [ofrecerHue, setOfrecerHue] = useState(false);
  const [extraidoPorIA, setExtraidoPorIA] = useState(false);
  const [pendiente, start] = useTransition();
  const [leyendo, startLectura] = useTransition();

  const reset = () => {
    setTexto("");
    setPaso("pegar");
    setPlanos([]);
    setEstatico(null);
    setReemplazar(true);
    setOfrecerHue(false);
    setExtraidoPorIA(false);
  };
  const cerrar = () => { setAbierto(false); reset(); };

  const analizar = () => {
    if (!texto.trim()) return;
    if (modo === "guion") {
      const p = parseGuion(texto);
      setPlanos(p);
      // Débil = perdió saltos (marcadores ≫ parseados) o formato desconocido (0 planos).
      setOfrecerHue(contarPlanos(texto) > p.length || p.length === 0);
      setExtraidoPorIA(false);
    } else {
      setEstatico(parseEstatico(texto));
    }
    setPaso("revisar");
  };

  // Formato que el parser determinista no separó bien → H.Ü.E lee el texto crudo
  // (cualquier formato) y devuelve los planos ya estructurados, con guardarraíl en
  // el servidor (no inventa/cambia copy). El humano igual revisa la vista previa.
  const extraerConHue = () =>
    startLectura(async () => {
      const res = await extraerGuion(texto);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPlanos(res.planos);
      setOfrecerHue(false);
      setExtraidoPorIA(true);
      toast.success("H.Ü.E leyó el guión — revisalo abajo.");
    });

  const editarPlano = (i: number, k: keyof PlanoParsed, v: string) =>
    setPlanos((prev) => prev.map((p, j) => (j === i ? { ...p, [k]: v || null } : p)));
  const quitarPlano = (i: number) => setPlanos((prev) => prev.filter((_, j) => j !== i));
  const editarEstatico = (k: keyof EstaticoParsed, v: string) =>
    setEstatico((prev) => (prev ? { ...prev, [k]: v || null } : prev));

  const confirmar = () =>
    start(async () => {
      if (modo === "guion") {
        const res = await importarGuion(ideaId, planos, reemplazar ? "replace" : "append");
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        // Un import siempre crea ≥1 plano; lista vacía = el refetch falló (raro) →
        // recarga segura en vez de dejar el workspace en blanco (los datos SÍ están).
        if (!res.planos.length) {
          window.location.reload();
          return;
        }
        onPlanos?.(res.planos); // el editor reemplaza su estado; entra con animación
      } else {
        const res = await importarEstatico(ideaId, estatico!);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        if (!res.estatico) {
          window.location.reload();
          return;
        }
        onEstatico?.(res.estatico);
      }
      toast.success(modo === "guion" ? "Guión importado" : "Copy importado");
      cerrar();
    });

  const nPlanos = planos.length;
  const puedeConfirmar =
    modo === "guion"
      ? nPlanos > 0
      : !!estatico && CAMPOS_ESTATICO.some((c) => estatico[c.k]?.trim());

  return (
    <>
      {/* Botón BLANCO con texto morado: sobre la banda morada, el morado sobre
          morado se perdía. (Pedro.) */}
      <Button
        size="sm"
        onClick={() => setAbierto(true)}
        className="w-full shrink-0 bg-white font-semibold text-primary shadow-sm hover:bg-white/90 hover:text-primary sm:w-auto"
      >
        <ClipboardPaste className="size-4" /> {modo === "guion" ? "Pegar guión" : "Pegar copy"}
      </Button>

      <Dialog open={abierto} onOpenChange={(o) => (o ? setAbierto(true) : cerrar())}>
        {/* Alto fijo con la parte de en medio scrollable y el header/footer
            SIEMPRE visibles — así "Analizar"/"Importar" nunca se salen de la
            pantalla por más largo que sea el guión. Más ancho para que las
            tarjetas no se apachurren. */}
        <DialogContent className="grid max-h-[88svh] w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-3 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {modo === "guion" ? "Pegar guión" : "Pegar copy del estático"}
            </DialogTitle>
          </DialogHeader>

          {paso === "pegar" ? (
            <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
              <p className="shrink-0 text-[12px] text-muted-foreground">
                Pega el {modo === "guion" ? "guión" : "copy"} tal cual del deck. Verás una vista
                previa para revisar y editar antes de crear nada; un campo que no aparezca queda
                en blanco.
              </p>
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                autoFocus
                aria-label="Texto del guión"
                placeholder={
                  modo === "guion"
                    ? "Plano 1 - int. Sala - MCU\nAcción…\nCopy in: …\nSFX: …\nActriz\nDiálogo…\n\nPlano 2 - …"
                    : "Título: …\nSubtítulo: …\nBotón CTA: …"
                }
                className="min-h-0 flex-1 resize-none overflow-y-auto font-mono [field-sizing:fixed]"
              />
            </div>
          ) : (
            <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
              {ofrecerHue && (
                <div className="flex items-start gap-2 rounded-md border border-status-progress/40 bg-[color-mix(in_srgb,var(--status-progress)_10%,transparent)] p-2.5 text-[12px]">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-progress" />
                  <div className="min-w-0">
                    <p>
                      {nPlanos === 0
                        ? "No se reconoció el formato del guión."
                        : "Parece que el texto perdió sus saltos de línea, así que la separación por planos puede no estar bien."}{" "}
                      H.Ü.E puede leerlo en cualquier formato y llenar los campos.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      disabled={leyendo}
                      onClick={extraerConHue}
                    >
                      <Sparkles className="size-3.5" /> {leyendo ? "H.Ü.E está leyendo…" : "Deja que H.Ü.E lo lea"}
                    </Button>
                  </div>
                </div>
              )}

              {extraidoPorIA && (
                <div className="flex items-start gap-2 rounded-md border border-border bg-secondary/40 p-2.5 text-[12px] text-muted-foreground">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-status-progress" />
                  <p>
                    H.Ü.E leyó el guión. Copia el texto tal cual —no inventa ni cambia palabras—,
                    pero revisá que no haya <strong>omitido</strong> nada y que cada campo esté en su lugar
                    antes de importar.
                  </p>
                </div>
              )}

              {modo === "guion" ? (
                nPlanos === 0 ? (
                  <p className="text-[12px] text-muted-foreground">
                    No se detectó ningún plano. Revisa que el texto tenga encabezados «Plano 1 - …»
                    y vuelve a intentar.
                  </p>
                ) : (
                  planos.map((p, i) => (
                    <div key={i} className="rounded-lg border border-border bg-card p-2.5">
                      <div className="mb-1.5 flex items-center gap-2">
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                          Plano {i + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => quitarPlano(i)}
                          aria-label={`Quitar plano ${i + 1}`}
                          className="ml-auto rounded p-1 text-muted-foreground hover:bg-secondary hover:text-status-corrections"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {CAMPOS_PLANO.map((c) => (
                          <label key={c.k} className={c.ancho ? "sm:col-span-3" : ""}>
                            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {c.label}
                            </span>
                            <Textarea
                              value={p[c.k] ?? ""}
                              rows={c.rows}
                              onChange={(e) => editarPlano(i, c.k, e.target.value)}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))
                )
              ) : (
                estatico && (
                  <div className="grid gap-2">
                    {CAMPOS_ESTATICO.map((c) => (
                      <label key={c.k}>
                        <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {c.label}
                        </span>
                        <Textarea
                          value={estatico[c.k] ?? ""}
                          rows={c.rows}
                          onChange={(e) => editarEstatico(c.k, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:items-center sm:justify-between">
            {paso === "revisar" && modo === "guion" && nPlanos > 0 ? (
              <div className="flex items-center gap-3 text-[12px]">
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="modo-import"
                    checked={reemplazar}
                    onChange={() => setReemplazar(true)}
                  />
                  Reemplazar todos
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="modo-import"
                    checked={!reemplazar}
                    onChange={() => setReemplazar(false)}
                  />
                  Agregar al final
                </label>
              </div>
            ) : (
              <span />
            )}

            <div className="flex gap-2">
              {paso === "revisar" && (
                <Button variant="outline" size="sm" onClick={() => setPaso("pegar")}>
                  Volver
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={cerrar}>
                Cancelar
              </Button>
              {paso === "pegar" ? (
                <Button size="sm" disabled={!texto.trim()} onClick={analizar}>
                  Analizar
                </Button>
              ) : (
                <Button size="sm" disabled={pendiente || !puedeConfirmar} onClick={confirmar}>
                  {modo === "guion"
                    ? `Importar ${nPlanos} plano${nPlanos === 1 ? "" : "s"}`
                    : "Importar copy"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
