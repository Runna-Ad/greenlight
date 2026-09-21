"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Eye, EyeOff, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GoogleSignIn } from "@/components/shell/google-sign-in";
import { createClient } from "@/lib/supabase/client";
import { confirmarCodigo, destinoTrasEntrar, pedirCodigo } from "./actions";

const inputCls =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

const ERROR_RED = "No se pudo conectar. Revisa tu internet e intenta de nuevo.";

const linkCls =
  "cursor-pointer font-medium text-foreground underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none";

type Modo = "entrar" | "solicitar" | "recuperar";

const SUBTITULO: Record<Modo, string> = {
  entrar: "Entra con Google o con tu correo y contraseña.",
  solicitar: "Pide acceso a tu portal. Confirmas tu correo con un código y un admin de Rünna lo aprueba.",
  recuperar: "Te mandamos un código para crear una contraseña nueva. También sirve si nunca tuviste una.",
};

/**
 * La puerta del cliente (Partner):
 *  • "entrar" — Google, o correo + contraseña (la contraseña la valida el NAVEGADOR
 *    directo con Supabase; luego el servidor decide a dónde va).
 *  • "solicitar" — primera vez: datos + contraseña → código al correo → solicitud.
 *  • "recuperar" — olvidó (o nunca tuvo) contraseña: código al correo → nueva.
 */
export function PortalAcceso({ next, modoInicial, aviso }: { next?: string; modoInicial: Modo; aviso: string | null }) {
  const [modo, setModo] = useState<Modo>(modoInicial);
  const [mostrarAviso, setMostrarAviso] = useState(true);
  const [emailCompartido, setEmailCompartido] = useState("");

  function ir(m: Modo) {
    setMostrarAviso(false);
    setModo(m);
  }

  return (
    <>
      <p className="mt-1 text-center text-sm leading-relaxed text-muted-foreground">{SUBTITULO[modo]}</p>

      {aviso && mostrarAviso && (
        <p
          role="alert"
          className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive"
        >
          {aviso}
        </p>
      )}

      {modo === "entrar" && (
        <EntrarForm next={next} email={emailCompartido} onEmail={setEmailCompartido} onOlvide={() => ir("recuperar")} />
      )}
      {modo === "solicitar" && <CodigoFlow motivo="solicitud" next={next} email={emailCompartido} onEmail={setEmailCompartido} onEntrar={() => ir("entrar")} />}
      {modo === "recuperar" && <CodigoFlow motivo="recuperar" next={next} email={emailCompartido} onEmail={setEmailCompartido} onEntrar={() => ir("entrar")} />}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        {modo === "solicitar" ? (
          <>
            ¿Ya tienes acceso?{" "}
            <button type="button" className={linkCls} onClick={() => ir("entrar")}>
              Entra aquí
            </button>
          </>
        ) : (
          <>
            ¿Primera vez aquí?{" "}
            <button type="button" className={linkCls} onClick={() => ir("solicitar")}>
              Solicita acceso
            </button>
          </>
        )}
      </p>
    </>
  );
}

/** Entra con la contraseña desde el navegador y pregunta al servidor a dónde ir. null = ya navegó. */
async function entrarConContrasena(email: string, password: string, next?: string): Promise<string | null> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) {
    if (error.code === "invalid_credentials") {
      return "Correo o contraseña incorrectos. ¿Nunca creaste una contraseña? Toca \"¿Olvidaste tu contraseña?\".";
    }
    if (error.code === "email_not_confirmed") {
      return "Tu correo aún no está confirmado. Toca \"¿Olvidaste tu contraseña?\" y te mandamos un código.";
    }
    if (error.status === 429 || error.code === "over_request_rate_limit") {
      return "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.";
    }
    return "No se pudo iniciar sesión. Intenta de nuevo.";
  }
  const d = await destinoTrasEntrar(next ?? null);
  if (!d.ok) {
    // El servidor ya cerró la sesión; se limpia también la copia del navegador.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    return d.error;
  }
  window.location.assign(d.url);
  return null;
}

function CampoContrasena({
  id,
  label,
  value,
  onChange,
  nueva,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  nueva: boolean;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={ver ? "text" : "password"}
          autoComplete={nueva ? "new-password" : "current-password"}
          className={`${inputCls} pr-10`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          minLength={nueva ? 8 : undefined}
          maxLength={72}
          required
          aria-describedby={nueva ? `${id}-ayuda` : undefined}
        />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-md"
          aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={ver}
        >
          {ver ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
      {nueva && (
        <p id={`${id}-ayuda`} className="text-[11px] text-muted-foreground">
          Mínimo 8 caracteres.
        </p>
      )}
    </div>
  );
}

function Alerta({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}

function EntrarForm({
  next,
  email,
  onEmail,
  onOlvide,
}: {
  next?: string;
  email: string;
  onEmail: (v: string) => void;
  onOlvide: () => void;
}) {
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    try {
      const err = await entrarConContrasena(email, password, next);
      if (err) {
        setError(err);
        setCargando(false);
      }
    } catch {
      setError(ERROR_RED);
      setCargando(false);
    }
  }

  return (
    <>
      <GoogleSignIn next={next} volverA="/portal/login" variant="outline" className="mt-6" />

      <div className="mt-5 flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className="h-px flex-1 bg-border" />o con tu correo<span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} className="mt-4 space-y-3">
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
            onChange={(e) => onEmail(e.target.value)}
            required
          />
        </div>
        <CampoContrasena id="entrar-password" label="Contraseña" value={password} onChange={setPassword} nueva={false} />

        {error && <Alerta>{error}</Alerta>}

        <Button type="submit" size="lg" className="mt-1 w-full" disabled={cargando}>
          {cargando ? "Entrando…" : "Entrar"}
        </Button>
        <p className="text-center text-xs">
          <button type="button" className={linkCls} onClick={onOlvide}>
            ¿Olvidaste tu contraseña?
          </button>
        </p>
      </form>
    </>
  );
}

/**
 * Solicitar acceso y recuperar contraseña comparten el mismo flujo de 2 pasos:
 * datos → código al correo → (código + contraseña) → resultado.
 */
function CodigoFlow({
  motivo,
  next,
  email,
  onEmail,
  onEntrar,
}: {
  motivo: "solicitud" | "recuperar";
  next?: string;
  email: string;
  onEmail: (v: string) => void;
  onEntrar: () => void;
}) {
  const [paso, setPaso] = useState<"datos" | "codigo" | "hecho">("datos");
  const [form, setForm] = useState({ name: "", brand: "", password: "" });
  const [codigo, setCodigo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ titulo: string; texto: string } | null>(null);
  const codigoRef = useRef<HTMLInputElement>(null);

  // Al llegar al paso del código, el cursor va directo al campo (autoFocus no alcanza
  // cuando el campo aparece después de enviar el formulario).
  useEffect(() => {
    if (paso === "codigo") codigoRef.current?.focus();
  }, [paso]);

  async function enviarCodigo() {
    setCargando(true);
    setError(null);
    try {
      const r = await pedirCodigo({ email, motivo });
      if (!r.ok) {
        setError(r.error);
        return false;
      }
      return true;
    } catch {
      setError(ERROR_RED);
      return false;
    } finally {
      setCargando(false);
    }
  }

  async function onDatos(e: React.FormEvent) {
    e.preventDefault();
    if (motivo === "solicitud" && form.password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (await enviarCodigo()) {
      setNota(null);
      setPaso("codigo");
    }
  }

  async function onReenviar() {
    if (await enviarCodigo()) {
      setNota("Si corresponde, te mandamos un código nuevo (máximo 3 cada 10 minutos). Usa el del correo más reciente.");
    }
  }

  async function onCodigo(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    setNota(null);
    try {
      await confirmarYSeguir();
    } catch {
      setError(ERROR_RED);
      setCargando(false);
    }
  }

  async function confirmarYSeguir() {
    const r = await confirmarCodigo({
      email,
      codigo,
      password: form.password,
      motivo,
      name: form.name,
      brand: form.brand || null,
    });
    if (!r.ok) {
      setCargando(false);
      setError(r.error);
      return;
    }
    if (r.estado === "listo") {
      const err = await entrarConContrasena(email, form.password, next);
      if (err) {
        setCargando(false);
        setError(err);
      }
      return;
    }
    setCargando(false);
    setResultado(
      r.estado === "pendiente"
        ? {
            titulo: motivo === "solicitud" ? "Solicitud enviada" : "Contraseña guardada",
            texto:
              "Un admin de Rünna revisará tu acceso. Te avisamos por correo en cuanto esté aprobado; después entra con tu correo y contraseña (o con Google).",
          }
        : r.estado === "revocado"
          ? {
              titulo: "Contraseña guardada",
              texto: "Tu acceso al portal está dado de baja. Si crees que es un error, escríbele a tu contacto en Rünna.",
            }
          : {
              titulo: "Contraseña guardada",
              texto: "Ese correo aún no tiene acceso al portal. Pide acceso con \"¿Primera vez aquí?\".",
            },
    );
    setPaso("hecho");
  }

  if (paso === "hecho" && resultado) {
    return (
      <div
        role="status"
        className="mt-6 rounded-lg border border-[color:var(--greenlight)]/30 bg-[color:var(--greenlight)]/10 px-4 py-5 text-center"
      >
        <CheckCircle2 className="mx-auto size-6 text-[color:var(--greenlight)]" aria-hidden />
        <p className="mt-2 text-sm font-medium text-foreground">{resultado.titulo}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{resultado.texto}</p>
        <button type="button" className={`mt-3 text-xs ${linkCls}`} onClick={onEntrar}>
          Volver a la entrada
        </button>
      </div>
    );
  }

  if (paso === "codigo") {
    return (
      <form onSubmit={onCodigo} className="mt-6 space-y-3">
        <div className="flex items-start gap-2 rounded-md bg-secondary/60 px-3 py-2.5 text-sm text-muted-foreground" role="status">
          <MailCheck className="mt-0.5 size-4 shrink-0 text-[color:var(--greenlight)]" aria-hidden />
          <span>
            Si <span className="font-medium text-foreground">{email.trim()}</span>{" "}
            {motivo === "recuperar" ? "tiene acceso al portal, " : ""}te llegó un código de 6 dígitos. Puede tardar un par
            de minutos — revisa también spam.
          </span>
        </div>
        <div className="space-y-1">
          <label htmlFor="codigo" className="text-xs font-medium text-muted-foreground">
            Código del correo
          </label>
          <input
            id="codigo"
            ref={codigoRef}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,12}"
            maxLength={12}
            className={`${inputCls} text-center font-mono text-lg tracking-[0.3em]`}
            placeholder="000000"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            required
          />
        </div>
        {motivo === "recuperar" && (
          <CampoContrasena
            id="nueva-password"
            label="Tu nueva contraseña"
            value={form.password}
            onChange={(v) => setForm((f) => ({ ...f, password: v }))}
            nueva
          />
        )}

        {error && <Alerta>{error}</Alerta>}
        {nota && !error && (
          <p role="status" className="text-center text-xs text-muted-foreground">
            {nota}
          </p>
        )}

        <Button type="submit" size="lg" className="mt-1 w-full" disabled={cargando}>
          {cargando ? "Verificando…" : motivo === "solicitud" ? "Confirmar y enviar solicitud" : "Guardar y entrar"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          <button type="button" className={linkCls} onClick={onReenviar} disabled={cargando}>
            Reenviar código
          </button>
          {" · "}
          <button
            type="button"
            className={linkCls}
            onClick={() => {
              setError(null);
              setCodigo("");
              setPaso("datos");
            }}
          >
            Cambiar correo
          </button>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={onDatos} className="mt-6 space-y-3">
      {motivo === "solicitud" && (
        <div className="space-y-1">
          <label htmlFor="name" className="text-xs font-medium text-muted-foreground">
            Tu nombre
          </label>
          <input
            id="name"
            autoComplete="name"
            className={inputCls}
            placeholder="Nombre y apellido"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
            autoFocus
          />
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor={`${motivo}-email`} className="text-xs font-medium text-muted-foreground">
          Tu correo
        </label>
        <input
          id={`${motivo}-email`}
          type="email"
          autoComplete="email"
          className={inputCls}
          placeholder="tucorreo@empresa.com"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          required
          autoFocus={motivo === "recuperar"}
        />
      </div>
      {motivo === "solicitud" && (
        <>
          <div className="space-y-1">
            <label htmlFor="brand" className="text-xs font-medium text-muted-foreground">
              Tu marca <span className="font-normal text-muted-foreground/70">(opcional)</span>
            </label>
            <input
              id="brand"
              className={inputCls}
              placeholder="¿Con qué marca trabajas?"
              value={form.brand}
              onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
            />
          </div>
          <CampoContrasena
            id="solicitud-password"
            label="Crea tu contraseña"
            value={form.password}
            onChange={(v) => setForm((f) => ({ ...f, password: v }))}
            nueva
          />
        </>
      )}

      {error && <Alerta>{error}</Alerta>}

      <Button type="submit" size="lg" className="mt-1 w-full" disabled={cargando}>
        {cargando ? "Enviando…" : "Mándame el código"}
      </Button>
      {motivo === "recuperar" && (
        <p className="text-center text-xs">
          <button type="button" className={linkCls} onClick={onEntrar}>
            Volver a la entrada
          </button>
        </p>
      )}
    </form>
  );
}
