import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shell/wordmark";

// P0 placeholder — Google OAuth wiring lands with the Supabase auth setup (P1).
export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sidebar p-6">
      {/* Fondo de marca: dos halos morados + el verde signal, difuminados, para
          que el navy no se sienta muerto detrás de la card. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(40rem 30rem at 15% 10%, color-mix(in srgb, #775cbf 45%, transparent), transparent 60%), radial-gradient(36rem 28rem at 90% 90%, color-mix(in srgb, #00e676 22%, transparent), transparent 60%)",
        }}
      />

      <div className="relative w-full max-w-sm animate-in fade-in zoom-in-95 duration-500">
        <div className="overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-white/10">
          {/* cabecera con la firma de marca */}
          <div className="flex flex-col items-center gap-3 border-b border-border bg-secondary/40 px-8 pt-8 pb-6">
            <Image
              src="/brand/logo-h-color.png"
              alt="Rünna"
              width={132}
              height={33}
              className="h-8 w-auto"
              priority
            />
            <Wordmark on="light" className="text-[24px]" />
          </div>

          <div className="px-8 py-7">
            <h1 className="text-center text-lg font-semibold text-foreground">Bienvenido de vuelta</h1>
            <p className="mt-1 text-center text-sm leading-relaxed text-muted-foreground">
              Producción de anuncios. Inicia sesión con tu cuenta de Rünna.
            </p>

            <Button className="mt-6 w-full gap-2" size="lg" disabled>
              <GoogleMark />
              Continuar con Google
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Se habilita al conectar Supabase (P1).
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-sidebar-foreground/50">
          Greenlight · by Rünna
        </p>
      </div>
    </div>
  );
}

/** La "G" de Google en sus colores, para que el botón se lea de un vistazo. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
