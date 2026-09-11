/**
 * Tipos/estilos de video: la taxonomía que nació con Sora 2 (retirada por OpenAI el
 * 24-sep-2026) sobrevive como VOCABULARIO que Veo 3.1 y Kling 3 entienden igual de bien.
 * `tipoEn` = etiqueta corta en inglés (para Kling, que cuenta palabras); `lookDeTipo` =
 * pistas de look (para Veo, que tiene espacio). Módulo puro.
 */
import type { VideoType } from "../spec.ts";

export const VIDEO_TYPE_EN: Record<VideoType, string> = {
  "Trailer cinematográfico": "Cinematic trailer",
  "Comercial de producto": "Product commercial",
  "Video de celular sin cortes": "Handheld phone video, one take",
  "GoPro POV": "GoPro POV",
  "Cámara de seguridad": "Security camera footage",
  "Tomas aéreas de drone": "Aerial drone shots",
  ASMR: "ASMR",
  "Vlog Selfie": "Selfie vlog",
  "Unboxing de producto": "Product unboxing",
  "Story Vertical": "Vertical story",
  "Video Old VHS": "Old VHS tape",
};

export const LOOK_POR_TIPO: Record<VideoType, string> = {
  "Trailer cinematográfico": "epic scale, cinema camera, fluid moves, dramatic contrast",
  "Comercial de producto": "product is the hero, macro details, clean background, studio light",
  "Video de celular sin cortes": "handheld, casual, realistic imperfections, one continuous take",
  "GoPro POV": "wide FOV, action camera, subjective, fast and energetic",
  "Cámara de seguridad": "fixed angle, slight distortion and noise, CCTV timestamp look",
  "Tomas aéreas de drone": "wide establishing shots, smooth travelling, altitude, landscape",
  ASMR: "macro on hands and textures, slow movements, sound is the protagonist",
  "Vlog Selfie": "front camera, natural arm movement, breathing, facial micro-gestures",
  "Unboxing de producto": "hands, table, product, focus on opening and details",
  "Story Vertical": "9:16, agile pace, clear actions, made for social",
  "Video Old VHS": "tape texture, glitches, washed colors, analog noise",
};

/** Etiqueta corta en inglés del tipo, o null. */
export const tipoEn = (t: VideoType | null | undefined): string | null => (t ? VIDEO_TYPE_EN[t] : null);
/** Pistas de look del tipo, o null. */
export const lookDeTipo = (t: VideoType | null | undefined): string | null => (t ? LOOK_POR_TIPO[t] : null);
