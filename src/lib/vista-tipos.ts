import type { AssetStatus } from "@/lib/brand";

// Las "vistas" de plano/estático/cabecera que comparten el editor, el documento, el
// portal y las server actions. Vivían en components/tarea/preview-slide.tsx, el viejo
// renderer del diálogo ("Actor: «texto»") que DialogoLectura reemplazó: nadie montaba el
// componente, pero 8 archivos importaban sus tipos, así que seguía vivo y era candidato a
// re-adoptarse y volver a bifurcar el render. Sólo los tipos sobreviven, aquí.
// (reap pre-lanzamiento 2026-09-02, sweep I3)

export type PlanoVista = {
  id: string;
  orden: number;
  titulo: string | null;
  accion: string | null;
  copy_in: string | null;
  sfx: string | null;
  gfx: string | null;
  edicion: string | null;
  dialogo: string | null;
  es_cierre: boolean;
};

export type EstaticoVista = {
  id: string;
  copy_titulo: string | null;
  copy_subtitulo: string | null;
  copy_cta: string | null;
  legales_extra: string | null;
  referencia_url: string | null;
  referencia_nota: string | null;
};

export type CabeceraVista = {
  naming: string | null;
  tipoAsset: string | null;
  plataformas: string[];
  tamanos: string[];
  duracion: string[];
  marca: string | null;
  formato: string | null;
  status: AssetStatus;
  /** Resumen (concepto) y Trend SÍ los ve el cliente. Las Notas (peloteo) son
      INTERNAS y NO se exponen aquí (Pedro). */
  concepto: string | null;
  trend: string | null;
};
