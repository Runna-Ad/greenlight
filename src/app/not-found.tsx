import Link from "next/link";
import { Compass, ArrowLeft } from "lucide-react";

/**
 * 404 raíz — cubre CUALQUIER ruta sin match, incluida la superficie pública del
 * portal. Sin esto, una URL rota caía a la pantalla 404 genérica de Next (sin
 * estilo, en inglés, sin salida). Espeja el tono de (app)/error.tsx: propio, en
 * español, con una salida clara. (reap 2026-08-26)
 */
export default function NotFound() {
  return (
    <main className="grid min-h-screen w-full place-items-center bg-background p-6">
      <div className="mx-auto flex max-w-lg flex-col items-center rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-primary">
          <Compass className="size-5" />
        </span>
        <h1 className="mt-4 text-base font-semibold text-foreground">Esta página no existe</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          La dirección que abriste no lleva a ningún lado. Puede que el enlace esté roto o que la
          tarea ya no esté aquí.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:brightness-110"
        >
          <ArrowLeft className="size-4" /> Volver al inicio
        </Link>
      </div>
    </main>
  );
}
