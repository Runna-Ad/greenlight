import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shell/wordmark";

// P0 placeholder — Google OAuth wiring lands with the Supabase auth setup (P1).
export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar p-6">
      <div className="w-full max-w-sm rounded-2xl bg-card p-8 shadow-xl">
        <Image
          src="/brand/logo-h-color.png"
          alt="Rünna"
          width={132}
          height={33}
          className="mx-auto h-8 w-auto"
          priority
        />
        <div className="mt-6 flex justify-center">
          <Wordmark on="light" className="text-[22px]" />
        </div>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          Producción de anuncios. Inicia sesión con tu cuenta de Rünna.
        </p>

        <Button className="mt-6 w-full" size="lg" disabled>
          Continuar con Google
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Se habilita al conectar Supabase (P1).
        </p>
      </div>
    </div>
  );
}
