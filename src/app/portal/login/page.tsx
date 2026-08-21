import Image from "next/image";
import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { RequestForm } from "./request-form";

function mensajeDeError(code: string): string {
  switch (code) {
    case "link-invalid":
    case "link-expired":
      return "Ese enlace ya no es válido o expiró. Pide acceso de nuevo y te mandaremos uno nuevo.";
    default:
      return "Algo salió mal. Intenta de nuevo.";
  }
}

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

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
            <Image src="/brand/logo-h-color.png" alt="Rünna" width={132} height={33} className="h-8 w-auto" priority />
            <Wordmark on="light" className="text-[24px]" />
          </div>

          <div className="px-8 py-7">
            <h1 className="text-center text-lg font-semibold text-foreground">Portal de clientes</h1>
            <p className="mt-1 text-center text-sm leading-relaxed text-muted-foreground">
              Pide acceso a tu portal. Un miembro del equipo lo aprueba y te llega un enlace de entrada por correo.
            </p>

            {error && (
              <p
                role="alert"
                className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
              >
                {mensajeDeError(error)}
              </p>
            )}

            <RequestForm />

            <p className="mt-4 border-t border-border pt-4 text-center text-xs text-muted-foreground">
              ¿Eres del equipo Rünna?{" "}
              <Link href="/login" className="font-medium text-foreground underline-offset-2 hover:underline">
                Inicia sesión aquí
              </Link>
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-sidebar-foreground/50">Greenlight · by Rünna</p>
      </div>
    </div>
  );
}
