/**
 * HÜE Prisma — interruptores. Públicos (NEXT_PUBLIC_) a propósito: sólo esconden o
 * enseñan pantallas, no protegen datos (eso lo hacen los gates de rol y el servidor).
 *
 * En desarrollo local Prisma está SIEMPRE encendido para poder verlo sin tocar
 * .env.local. En producción/preview se enciende con NEXT_PUBLIC_PRISMA_ENABLED=true
 * en Vercel. Módulo puro (lo leen server y client components).
 */
export const prismaActivo = (): boolean =>
  process.env.NEXT_PUBLIC_PRISMA_ENABLED === "true" || process.env.NODE_ENV === "development";

/** v2: generar la imagen/video dentro de la app. Hoy sólo muestra el botón apagado. */
export const prismaGeneracionActiva = (): boolean =>
  process.env.NEXT_PUBLIC_PRISMA_GENERATION_ENABLED === "true";
