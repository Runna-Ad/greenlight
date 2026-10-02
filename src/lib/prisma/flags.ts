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

/** Prisma › Formatos (adaptar un anuncio terminado a N tamaños). Va DENTRO de Prisma: sin Prisma no hay
 *  Formatos. En desarrollo siempre encendido, como Prisma. El relleno con IA tiene su propio interruptor,
 *  de servidor (lib/prisma/formatos/proveedor.ts), porque cuesta. */
export const prismaFormatosActivo = (): boolean =>
  prismaActivo() && (process.env.NEXT_PUBLIC_PRISMA_FORMATOS_ENABLED === "true" || process.env.NODE_ENV === "development");
