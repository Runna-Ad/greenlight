"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { solicitarAcceso } from "./actions";

const inputCls =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function RequestForm() {
  const [enviado, setEnviado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", name: "", brand: "" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(null);
    const r = await solicitarAcceso({ email: form.email, name: form.name, brand: form.brand });
    setCargando(false);
    if (r.ok) setEnviado(true);
    else setError(r.error);
  }

  if (enviado) {
    return (
      <div className="mt-6 rounded-lg border border-[color:var(--greenlight)]/30 bg-[color:var(--greenlight)]/10 px-4 py-5 text-center">
        <CheckCircle2 className="mx-auto size-6 text-[color:var(--greenlight)]" />
        <p className="mt-2 text-sm font-medium text-foreground">Tu solicitud fue enviada</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Recibirás un correo con tu enlace de acceso en cuanto H.Ü.E la apruebe.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <div className="space-y-1">
        <label htmlFor="name" className="text-xs font-medium text-muted-foreground">Tu nombre</label>
        <input
          id="name"
          className={inputCls}
          placeholder="Nombre y apellido"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          autoFocus
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="email" className="text-xs font-medium text-muted-foreground">Tu correo</label>
        <input
          id="email"
          type="email"
          className={inputCls}
          placeholder="tucorreo@empresa.com"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          required
        />
      </div>
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

      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="mt-1 w-full" disabled={cargando}>
        {cargando ? "Enviando…" : "Solicitar acceso"}
      </Button>
    </form>
  );
}
