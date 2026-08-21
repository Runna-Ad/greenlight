import Image from "next/image";
import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { GoogleSignIn } from "@/components/shell/google-sign-in";

// Friendly Spanish for the reasons /auth/callback can bounce someone back.
function mensajeDeError(code: string): string {
  switch (code) {
    case "not-allowed":
      return "Esa cuenta no tiene acceso. Entra con tu correo @runna.com.mx — o si eres cliente, pide acceso abajo.";
    case "missing-code":
    case "exchange-failed":
    case "no-user":
      return "No se pudo completar el inicio de sesión. Vuelve a intentarlo.";
    default:
      return "No se pudo iniciar sesión. Vuelve a intentarlo.";
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sidebar p-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(40rem 30rem at 15% 10%, color-mix(in srgb, #775cbf 45%, transparent), transparent 60%), radial-gradient(36rem 28rem at 90% 90%, color-mix(in srgb, #00e676 22%, transparent), transparent 60%)",
        }}
      />

      <div className="relative w-full max-w-sm animate-in fade-in zoom-in-95 duration-500">
        <div className="overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-white/10">
          <div className="flex flex-col items-center gap-3 border-b border-border bg-secondary/40 px-8 pt-8 pb-6">
            <Image
              src="/brand/logo-h-color.png"
              alt="Rünna"
              width={192}
              height={48}
              className="h-12 w-auto"
              priority
            />
            <Wordmark on="light" className="text-[24px]" />
          </div>

          <div className="px-8 py-7">
            <h1 className="text-center text-lg font-semibold text-foreground">Bienvenido</h1>
            <p className="mt-1 text-center text-sm leading-relaxed text-muted-foreground">
              Smart production platform. H.Ü.E included.
            </p>

            {error && (
              <p
                role="alert"
                className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
              >
                {mensajeDeError(error)}
              </p>
            )}

            <GoogleSignIn next={next} />

            <p className="mt-4 border-t border-border pt-4 text-center text-xs text-muted-foreground">
              ¿Eres cliente?{" "}
              <Link href="/portal/login" className="font-medium text-foreground underline-offset-2 hover:underline">
                Solicita acceso a tu portal
              </Link>
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-sidebar-foreground/50">Greenlight · by Rünna</p>
      </div>
    </div>
  );
}
