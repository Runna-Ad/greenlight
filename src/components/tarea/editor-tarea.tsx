"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, Trash2, Eye, EyeOff, Clock, ShieldCheck, Clapperboard } from "lucide-react";
import { toast } from "sonner";

import { agregarPlano, borrarPlano } from "@/app/(app)/[cliente]/tareas/[id]/actions";
import {
  PLACEHOLDER_ESTATICO,
  notaGlobal,
  placeholdersGuion,
  readTimeS,
  voz,
} from "@/lib/plantilla";
import { reglasQueAplican, type Regla } from "@/lib/reglas";
import { Button } from "@/components/ui/button";
import { Campo } from "./campo";
import { CampoIntake } from "./campo-intake";
import { PegarGuion } from "./pegar-guion";
import { ChipsReglas } from "./chips-reglas";
import { ReferenciasPlano, type RefVista } from "./referencias-plano";
import { EmptyState } from "@/components/ui/empty-state";
import { CortinillaCierre, type LegalSnippet } from "./cortinilla-cierre";
import {
  PreviewSlide,
  type CabeceraVista,
  type EstaticoVista,
  type PlanoVista,
} from "./preview-slide";

export function EditorTarea({
  ideaId,
  cabecera,
  marcaSlug,
  planosIniciales,
  estaticoInicial,
  refsPorPlano,
  refsEstatico,
  reglas,
  legales,
  cortinilla,
  notaGuion,
  soloLectura,
}: {
  ideaId: string;
  cabecera: CabeceraVista;
  marcaSlug: string | null;
  planosIniciales: PlanoVista[];
  estaticoInicial: EstaticoVista | null;
  refsPorPlano: Record<string, RefVista[]>;
  refsEstatico: RefVista[];
  reglas: Regla[];
  legales: string[];
  notaGuion: string | null;
  cortinilla: {
    legalesLibres: string | null;
    seleccionados: LegalSnippet[];
    biblioteca: LegalSnippet[];
  };
  soloLectura: boolean;
}) {
  // El preview se alimenta de ESTE estado: se actualiza en la misma tecla, sin
  // ir al servidor. Los campos persisten aparte, con su propio autoguardado.
  const [planos, setPlanos] = useState(planosIniciales);
  const [estatico, setEstatico] = useState(estaticoInicial);
  const [verPreview, setVerPreview] = useState(true);
  const [, startTransition] = useTransition();

  const esEstatico = estatico !== null;
  // Real Person y Normal no son la misma plantilla: cambian los placeholders,
  // el título del plano y quién habla en la columna del diálogo.
  const PH = placeholdersGuion(cabecera.tipoAsset);
  const quienHabla = voz(cabecera.tipoAsset);
  const nota = notaGlobal(cabecera.tipoAsset);

  const editarPlano = (id: string, campo: keyof PlanoVista, valor: string) =>
    setPlanos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [campo]: valor || null } : p)),
    );

  const editarEstatico = (campo: keyof EstaticoVista, valor: string) =>
    setEstatico((prev) => (prev ? { ...prev, [campo]: valor || null } : prev));

  // Todo el texto escrito, para las reglas que miran contenido (CASHBACK/MSI).
  const textoTotal = useMemo(() => {
    if (estatico) {
      return [estatico.copy_titulo, estatico.copy_subtitulo, estatico.copy_cta]
        .filter(Boolean).join(" ");
    }
    return planos
      .flatMap((p) => [p.copy_in, p.dialogo, p.accion])
      .filter(Boolean).join(" ");
  }, [planos, estatico]);

  const reglasActivas = useMemo(
    () =>
      reglasQueAplican(reglas, {
        tipoAsset: cabecera.tipoAsset,
        plataformas: cabecera.plataformas,
        duracion: cabecera.duracion,
        marcaSlug,
        texto: textoTotal,
      }),
    [reglas, cabecera, marcaSlug, textoTotal],
  );

  // Informativo, no un juicio. La Duración la decide la persona en la cabecera
  // (Pedro: "no lo adaptes basado en cuánto escrito está en el diálogo"), así
  // que aquí sólo se suma lo que tarda en leerse.
  const totalS = useMemo(
    () => planos.reduce((n, p) => n + readTimeS(p.dialogo), 0),
    [planos],
  );

  const nuevoPlano = () =>
    startTransition(async () => {
      const res = await agregarPlano(ideaId);
      if (!res.ok) toast.error("error" in res ? res.error : "No se pudo agregar el plano.");
      else window.location.reload();
    });

  const quitarPlano = (id: string) =>
    startTransition(async () => {
      const res = await borrarPlano(id);
      if (!res.ok) toast.error("error" in res ? res.error : "No se pudo borrar.");
      else setPlanos((prev) => prev.filter((p) => p.id !== id));
    });

  return (
    <div className="space-y-4">
      {/* Reglas de la pieza + read-time — arriba de todo, con encabezado claro.
          Cada chip abre su regla completa en un tooltip al pasar el mouse. */}
      {(reglasActivas.length > 0 || !esEstatico) && (
        <div className="space-y-2.5 rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              Reglas que aplican
            </span>
            {!esEstatico && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5 shrink-0" />
                {totalS}s de lectura en total
              </span>
            )}
          </div>
          {reglasActivas.length > 0 ? (
            <ChipsReglas reglas={reglasActivas} plataformas={cabecera.plataformas} />
          ) : (
            <p className="text-[11px] text-muted-foreground/70">
              No hay reglas especiales para esta combinación. Pasa el mouse por un
              chip para ver el detalle cuando aparezcan.
            </p>
          )}
        </div>
      )}

      {/* Nota del guión — editable (Real Person: actriz/actor/outfits). El texto
          del tipo queda de placeholder para seguir guiando. */}
      {!esEstatico && (
        <CampoIntake
          ideaId={ideaId}
          campo="nota_guion"
          label="Nota del guión"
          valorInicial={notaGuion}
          placeholder={nota ?? "Nota general del guión (p. ej. # de outfits, tono, continuidad)…"}
          rows={2}
          caja
          soloLectura={soloLectura}
        />
      )}

      <div className={verPreview ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]" : ""}>
        {/* ── cuerpo ── */}
        <div className="min-w-0 space-y-3">
          {esEstatico && estatico ? (
            <div className="grid gap-3 rounded-xl border border-border bg-card p-3 shadow-sm md:grid-cols-2">
              <div className="space-y-3">
                <p className="rounded bg-[#4a86e8] px-2 py-1 text-center text-[10px] font-bold uppercase text-white">
                  Copy in
                </p>
                {!soloLectura && <PegarGuion ideaId={ideaId} modo="estatico" />}
                <Campo tabla="estaticos" filaId={estatico.id} grupoCorreccion="Estático" campo="copy_titulo" label="Título"
                  valorInicial={estatico.copy_titulo} rows={2} soloLectura={soloLectura}
                  placeholder={PLACEHOLDER_ESTATICO.copy_titulo}
                  onCambio={(v) => editarEstatico("copy_titulo", v)} />
                <Campo tabla="estaticos" filaId={estatico.id} grupoCorreccion="Estático" campo="copy_subtitulo" label="Subtítulo"
                  valorInicial={estatico.copy_subtitulo} rows={3} soloLectura={soloLectura}
                  placeholder={PLACEHOLDER_ESTATICO.copy_subtitulo}
                  onCambio={(v) => editarEstatico("copy_subtitulo", v)} />
                <Campo tabla="estaticos" filaId={estatico.id} grupoCorreccion="Estático" campo="copy_cta" label="Botón CTA"
                  valorInicial={estatico.copy_cta} rows={1} soloLectura={soloLectura}
                  placeholder={PLACEHOLDER_ESTATICO.copy_cta}
                  onCambio={(v) => editarEstatico("copy_cta", v)} />
                <Campo tabla="estaticos" filaId={estatico.id} grupoCorreccion="Estático" campo="legales_extra" label="Legales extra"
                  valorInicial={estatico.legales_extra} rows={2} soloLectura={soloLectura}
                  placeholder={PLACEHOLDER_ESTATICO.legales_extra} />
              </div>
              <div className="space-y-3">
                <p className="rounded bg-[#ff6d01] px-2 py-1 text-center text-[10px] font-bold uppercase text-white">
                  Referencia / Imagen
                </p>
                {/* En estático, la referencia es el drag & drop de IMÁGENES (sin
                    video): sube al bucket privado, thumbnails con popup grande. */}
                <ReferenciasPlano
                  owner={{ tipo: "estatico", id: estatico.id }}
                  refs={refsEstatico}
                  soloImagenes
                  etiqueta="Imágenes de referencia"
                  soloLectura={soloLectura}
                />
                <Campo tabla="estaticos" filaId={estatico.id} grupoCorreccion="Estático" campo="referencia_nota" label="Nota de diseño"
                  valorInicial={estatico.referencia_nota} rows={4} soloLectura={soloLectura}
                  placeholder={PLACEHOLDER_ESTATICO.referencia_nota}
                  onCambio={(v) => editarEstatico("referencia_nota", v)} />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-t-lg">
                <p className="bg-[#4a86e8] px-2 py-1.5 text-center text-[10px] font-bold uppercase text-white">
                  Acción + Copy in + GFX / SFX (Motion)
                </p>
                <p className="bg-[#ff6d01] px-2 py-1.5 text-center text-[10px] font-bold uppercase text-white">
                  Diálogo · {quienHabla}
                </p>
              </div>

              {planos.length === 0 && (
                <EmptyState
                  icon={Clapperboard}
                  titulo="Todavía no hay planos"
                  descripcion="Agrega el primero para empezar el guión."
                />
              )}

              {planos.map((p) => (
                <div key={p.id} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                      Plano {p.orden}
                    </span>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {readTimeS(p.dialogo)}s de lectura
                    </span>
                    {!soloLectura && (
                      <button
                        onClick={() => quitarPlano(p.id)}
                        aria-label={`Borrar plano ${p.orden}`}
                        className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-status-corrections"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-3">
                      <Campo tabla="planos" filaId={p.id} grupoCorreccion={`Plano ${p.orden}`} campo="titulo" label="Plano"
                        valorInicial={p.titulo} rows={1} soloLectura={soloLectura}
                        placeholder={PH.titulo}
                        onCambio={(v) => editarPlano(p.id, "titulo", v)} />
                      <Campo tabla="planos" filaId={p.id} grupoCorreccion={`Plano ${p.orden}`} campo="accion" label="Acción"
                        valorInicial={p.accion} rows={2} soloLectura={soloLectura}
                        placeholder={PH.accion}
                        onCambio={(v) => editarPlano(p.id, "accion", v)} />
                      <Campo tabla="planos" filaId={p.id} grupoCorreccion={`Plano ${p.orden}`} campo="copy_in" label="Copy in"
                        valorInicial={p.copy_in} rows={2} soloLectura={soloLectura}
                        placeholder={PH.copy_in}
                        onCambio={(v) => editarPlano(p.id, "copy_in", v)} />
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Campo tabla="planos" filaId={p.id} grupoCorreccion={`Plano ${p.orden}`} campo="sfx" label="SFX"
                          valorInicial={p.sfx} rows={2} soloLectura={soloLectura}
                          placeholder={PH.sfx}
                          onCambio={(v) => editarPlano(p.id, "sfx", v)} />
                        <Campo tabla="planos" filaId={p.id} grupoCorreccion={`Plano ${p.orden}`} campo="gfx" label="GFX"
                          valorInicial={p.gfx} rows={2} soloLectura={soloLectura}
                          placeholder={PH.gfx}
                          onCambio={(v) => editarPlano(p.id, "gfx", v)} />
                        <Campo tabla="planos" filaId={p.id} grupoCorreccion={`Plano ${p.orden}`} campo="edicion" label="Edición"
                          valorInicial={p.edicion} rows={2} soloLectura={soloLectura}
                          placeholder={PH.edicion}
                          onCambio={(v) => editarPlano(p.id, "edicion", v)} />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Campo tabla="planos" filaId={p.id} grupoCorreccion={`Plano ${p.orden}`} campo="dialogo" label={quienHabla}
                        valorInicial={p.dialogo} rows={8} soloLectura={soloLectura}
                        placeholder={PH.dialogo}
                        onCambio={(v) => editarPlano(p.id, "dialogo", v)} />
                      {/* La caja REFERENCIA del wireframe, junto al diálogo */}
                      <ReferenciasPlano
                        owner={{ tipo: "plano", id: p.id }}
                        refs={refsPorPlano[p.id] ?? []}
                        soloLectura={soloLectura}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {!soloLectura && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" size="sm" onClick={nuevoPlano} className="w-full">
                    <Plus className="size-4" /> Agregar plano
                  </Button>
                  <PegarGuion ideaId={ideaId} modo="guion" />
                </div>
              )}

              {/* La Cortinilla de Cierre va al FINAL, después de todos los
                  planos: los legales de la pieza entera. */}
              <CortinillaCierre
                ideaId={ideaId}
                legalesLibres={cortinilla.legalesLibres}
                seleccionados={cortinilla.seleccionados}
                biblioteca={cortinilla.biblioteca}
                soloLectura={soloLectura}
              />
            </>
          )}
        </div>

        {/* ── preview ── */}
        {verPreview && (
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Como lo verá el cliente
              </span>
              <button
                onClick={() => setVerPreview(false)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <EyeOff className="size-3" /> Ocultar
              </button>
            </div>
            <PreviewSlide
              cabecera={cabecera}
              planos={esEstatico ? undefined : planos}
              estatico={estatico}
              legales={legales}
              refsPorPlano={refsPorPlano}
              refsEstatico={refsEstatico}
            />
          </aside>
        )}
      </div>

      {!verPreview && (
        <Button variant="outline" size="sm" onClick={() => setVerPreview(true)}>
          <Eye className="size-4" /> Ver preview
        </Button>
      )}
    </div>
  );
}
