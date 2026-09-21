"use client";

import { useState } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enviarEnlaceDeEntrada } from "./actions";
import { RequestForm } from "./request-form";

const inputCls =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

const linkCls =
  "cursor-pointer font-medium text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none";

/**
 * La puerta del cliente. Dos caminos:
 *  • "entrar" (por defecto) — ya aprobado: escribe su correo y recibe un enlace nuevo.
 *  • "solicitar" — primera vez: pide acceso y un admin lo aprueba.
 * Antes sólo existía "solicitar", y un cliente aprobado cuya sesión caducaba no tenía
 * cómo volver a entrar.
 */
export function PortalAcceso({
  next,
  modoInicial,
  aviso,
}: {
  next?: string;
  modoInicial: "entrar" | "solicitar";
  aviso: string | null;
}) {
  const [modo, setModo] = useState(modoInicial);

  return (
    <>
      <p className="mt-1 text-center text-sm leading-relaxed text-muted-foreground">
        {modo === "entrar"
          ? "Escribe tu correo y te mandamos un enlace para entrar a tu portal."
          : "Pide acceso a tu portal. H.Ü.E lo aprueba y te manda un enlace de entrada por correo."}
      </p>

      {aviso && (
        <p
          role="alert"
          className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
        >
          {aviso}
        </p>
      )}

      {modo === "entrar" ? <EntrarForm next={next} /> : <RequestForm />}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        {modo === "entrar" ? (
          <>
            ¿Primera vez aquí?{" "}
            <button type="button" className={linkCls} onClick={() => setModo("solicitar")}>
              Solicita acceso
            </button>
          </>
        ) : (
          <>
            ¿Ya tienes acceso?{" "}
            <button type="button" className={linkCls} onClick={() => setModo("entrar")}>
              Recibe tu enlace de entrada
            </button>
          </>
        )}
      </p>
    </>
  );
}

function EntrarForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviadoA, setEnviadoA] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const r = await enviarEnlaceDeEntrada({ email, next });
    setCargando(false);
    if (r.ok) setEnviadoA(email.trim());
    else setError(r.error);
  }

  if (enviadoA) {
    return (
      <div
        role="status"
        className="mt-6 rounded-lg border border-[color:var(--greenlight)]/30 bg-[color:var(--greenlight)]/10 px-4 py-5 text-center"
      >
        <MailCheck className="mx-auto size-6 text-[color:var(--greenlight)]" aria-hidden />
        <p className="mt-2 text-sm font-medium text-foreground">Revisa tu correo</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Si <span className="font-medium text-foreground">{enviadoA}</span> tiene acceso al portal, te llegó un
          enlace para entrar. Puede tardar un par de minutos — revisa también tu carpeta de spam.
        </p>
        <button type="button" className={`mt-3 text-xs ${linkCls}`} onClick={() => setEnviadoA(null)}>
          Usar otro correo o reenviar
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <div className="space-y-1">
        <label htmlFor="entrar-email" className="text-xs font-medium text-muted-foreground">
          Tu correo
        </label>
        <input
          id="entrar-email"
          type="email"
          autoComplete="email"
          className={inputCls}
          placeholder="tucorreo@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="mt-1 w-full" disabled={cargando}>
        {cargando ? "Enviando…" : "Mándame mi enlace"}
      </Button>
    </form>
  );
}
