"use client";

import { useState } from "react";
import { Loader2, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { crearPersonaje, describirPersonaje } from "@/app/(app)/prisma/actions";
import { UI, tx, type Lang } from "@/lib/prisma/copy";
import type { PersonajeUI } from "@/lib/prisma/personajes";
import { RefUploader, type RefLocal } from "./ref-uploader";

/**
 * Alta de un personaje/producto guardado, dentro del paso 3 del estudio.
 * Flujo de la casa para una acción de IA que ESCRIBE: H.Ü.E PROPONE la descripción (en
 * inglés, con lo que vio en la foto + las notas del diseñador), el humano la lee y la
 * corrige, y sólo entonces se guarda tal cual (determinista). Nada se guarda sin que el
 * diseñador lo haya visto: es la frase que entrará como "sujeto" de cada prompt.
 */
export function PersonajeForm({ marcaId, lang, onGuardado, onCancelar }: { marcaId: string; lang: Lang; onGuardado: (p: PersonajeUI, fotoLocal: RefLocal | null) => void; onCancelar: () => void }) {
  const [nombre, setNombre] = useState("");
  const [notas, setNotas] = useState("");
  const [foto, setFoto] = useState<RefLocal | null>(null);
  const [descripcion, setDescripcion] = useState<string | null>(null);
  /** Las notas con las que se hizo la propuesta: si cambian después, se avisa que quedó desfasada. */
  const [notasDeLaPropuesta, setNotasDeLaPropuesta] = useState("");
  const [describiendo, setDescribiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const desfasada = descripcion !== null && notas.trim() !== notasDeLaPropuesta.trim();
  // Hace falta un nombre y ALGO que describir: notas, o una foto que H.Ü.E sí pudo leer.
  const puedeDescribir = nombre.trim().length > 0 && (notas.trim().length > 0 || !!foto?.caption);

  const describir = async () => {
    setDescribiendo(true);
    try {
      const r = await describirPersonaje({ nombre, notas, caption: foto?.caption ?? null, dna: foto?.dna ?? null });
      if (!r.ok) return toast.error(r.error);
      setDescripcion(r.descripcion);
      setNotasDeLaPropuesta(notas);
    } catch {
      toast.error(tx(UI.error, lang));
    } finally {
      setDescribiendo(false);
    }
  };

  const guardar = async () => {
    if (!descripcion?.trim()) return;
    setGuardando(true);
    try {
      const r = await crearPersonaje({ marcaId, nombre, descripcion, storage_path: foto?.storage_path ?? null });
      if (!r.ok) return toast.error(r.error);
      toast.success(tx(UI.personajeGuardado, lang));
      onGuardado(r.personaje, foto);
    } catch {
      toast.error(tx(UI.error, lang));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="p-enter space-y-3 rounded-xl border border-border bg-card/60 p-4">
      <p className="text-sm text-muted-foreground">{tx(UI.personajeQueEs, lang)}</p>
      <div>
        <label htmlFor="prisma-personaje-nombre" className="block text-sm font-medium text-foreground">
          {tx(UI.personajeNombre, lang)}
        </label>
        <input
          id="prisma-personaje-nombre"
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={60}
          placeholder={tx(UI.personajeNombrePh, lang)}
          className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        />
      </div>
      <RefUploader
        role="sujeto"
        etiqueta={UI.personajeFoto}
        opcional
        value={foto}
        onChange={(v) => {
          setFoto(v);
          setDescripcion(null); // otra foto = otra descripción; la anterior ya no vale
        }}
        lang={lang}
      />
      <div>
        <label htmlFor="prisma-personaje-notas" className="block text-sm font-medium text-foreground">
          {tx(UI.personajeNotas, lang)}
        </label>
        <Textarea id="prisma-personaje-notas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} maxLength={600} placeholder={tx(UI.personajeNotasPh, lang)} className="mt-1.5" />
      </div>

      {descripcion === null ? (
        <div className="flex items-center justify-between gap-2">
          <Button size="sm" onClick={describir} disabled={!puedeDescribir || describiendo} aria-live="polite">
            {describiendo ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {describiendo ? tx(UI.personajeDescribiendo, lang) : tx(UI.personajeDescribir, lang)}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancelar}>
            {tx(UI.cancelar, lang)}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <label htmlFor="prisma-personaje-desc" className="block text-sm font-medium text-foreground">
            {tx(UI.personajeDescripcion, lang)}
          </label>
          <Textarea id="prisma-personaje-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={4} maxLength={600} />
          <p className="text-xs text-muted-foreground">{tx(UI.personajeDescripcionAyuda, lang)}</p>
          {desfasada && <p className="text-xs text-status-warning">{tx(UI.personajeDesfasada, lang)}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={guardar} disabled={guardando || !descripcion.trim()}>
                {guardando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {tx(UI.personajeGuardar, lang)}
              </Button>
              <Button size="sm" variant="outline" onClick={describir} disabled={describiendo || !puedeDescribir}>
                {describiendo ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {tx(UI.personajeOtraPropuesta, lang)}
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={onCancelar}>
              {tx(UI.cancelar, lang)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
