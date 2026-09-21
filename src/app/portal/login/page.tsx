import Image from "next/image";
import Link from "next/link";
import { Wordmark } from "@/components/shell/wordmark";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/identity";
import { hasSupabase } from "@/lib/supabase-admin";
import { leerPerfil, esClienteAprobado, destinoDentroDelPortal } from "@/lib/auth/acceso-cliente";
import { PortalAcceso } from "./portal-acceso";

function mensajeDeError(code: string): string {
  switch (code) {
    case "link-invalid":
    case "link-expired":
      return "Ese enlace ya no es válido o expiró. Entra con tu contraseña o con Google; si no tienes contraseña, toca \"¿Olvidaste tu contraseña?\".";
    case "access-revoked":
      return "Tu acceso fue dado de baja. Si crees que es un error, escríbele a tu contacto en Rünna.";
    case "google-sin-acceso":
      return "Esa cuenta de Google aún no tiene acceso al portal. Si ya pediste acceso, espera la aprobación; si no, solicítalo abajo.";
    case "sesion":
      return "No pudimos confirmar tu sesión. Vuelve a entrar.";
    case "access_denied":
      return "Se canceló el inicio de sesión con Google. Vuelve a intentarlo o entra con tu correo.";
    default:
      return "Algo salió mal. Intenta de nuevo.";
  }
}

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; solicitar?: string; modo?: string }>;
}) {
  const { error, next, solicitar, modo } = await searchParams;

  // Un cliente que YA tiene sesión y abre esta página (marcador, correo viejo) va
  // directo a su portal en vez de ver un formulario. Sólo sin `error`: si el portal lo
  // mandó aquí con un error, se muestra el error — así nunca hay un bucle.
  // Usa getCurrentUser (el mismo guardia que las páginas) para no discrepar nunca con él.
  if (!error && process.env.AUTH_ENABLED === "true" && hasSupabase()) {
    const u = await getCurrentUser();
    if (u?.role === "client") {
      const perfil = await leerPerfil({ id: u.userId });
      if (esClienteAprobado(perfil)) redirect(destinoDentroDelPortal(next, `/${perfil.slug}/portal`));
    }
  }

  const modoInicial = modo === "recuperar" ? "recuperar" : modo === "solicitar" || solicitar === "1" ? "solicitar" : "entrar";

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
            <Image src="/brand/logo-h-color.png" alt="Rünna" width={192} height={48} className="h-12 w-auto" priority />
            <Wordmark on="light" className="text-[24px]" />
          </div>

          <div className="px-8 py-7">
            <h1 className="text-center text-lg font-semibold text-foreground">Portal de clientes</h1>

            <PortalAcceso
              next={next}
              modoInicial={modoInicial}
              aviso={error ? mensajeDeError(error) : null}
            />

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
