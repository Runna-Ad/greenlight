"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { guardarTopeGemini, hubGastoGemini } from "@/app/(app)/admin/gasto-actions";
import { COSTO_SIN_REPORTE_USD, leerTope, usd } from "@/lib/prisma/formatos/tope-gemini";

type Datos = { hoyUsd: number; mesUsd: number; llamadasHoy: number; sinCostoHoy: number };

/** Hub › Prisma › Gasto IA: lo gastado en Gemini (hora de México) y el tope diario, apagado hasta que el Master lo ponga. */
export function PrismaGasto() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activo, setActivo] = useState(false);
  const [monto, setMonto] = useState("");
  const [guardado, setGuardado] = useState<number | null>(null);
  const [ocupada, setOcupada] = useState(false);

  useEffect(() => {
    let vivo = true;
    void hubGastoGemini().then((r) => {
      if (!vivo) return;
      if (!r.ok) return setError(r.error);
      const { tope, hoyUsd, mesUsd, llamadasHoy, sinCostoHoy } = r;
      setDatos({ hoyUsd, mesUsd, llamadasHoy, sinCostoHoy });
      setGuardado(tope);
      setActivo(tope !== null);
      setMonto(tope === null ? "" : String(tope));
    }).catch(() => {
      if (vivo) setError("No se pudo cargar. Recarga la página.");
    });
    return () => {
      vivo = false;
    };
  }, []);

  async function guardar(tope: number | null) {
    setOcupada(true);
    const r = await guardarTopeGemini(tope);
    setOcupada(false);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    setGuardado(tope);
    toast.success(tope === null ? "Tope quitado." : `Tope guardado: ${usd(tope)} al día.`);
    return true;
  }

  async function cambiarSwitch(on: boolean) {
    if (on) return setActivo(true);
    if (guardado === null) return setActivo(false);
    if (await guardar(null)) setActivo(false);
  }

  const leido = leerTope(monto);
  if (error) return <p className="text-sm text-muted-foreground">{error}</p>;
  if (!datos) return <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Cargando" />;

  return (
    <div className="max-w-xl space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Cifra titulo="Hoy" valor={usd(datos.hoyUsd)} />
        <Cifra titulo="Este mes" valor={usd(datos.mesUsd)} />
        <Cifra titulo="Llamadas hoy" valor={String(datos.llamadasHoy)} />
      </div>
      {datos.sinCostoHoy > 0 && <p className="text-xs text-muted-foreground">{datos.sinCostoHoy} de hoy sin costo reportado por Google: no suman arriba, pero para el tope cada una cuenta como {usd(COSTO_SIN_REPORTE_USD)}.</p>}
      <div className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p id="tope-titulo" className="text-sm font-medium text-foreground">Tope diario de Gemini</p>
            <p className="text-xs text-muted-foreground">{guardado === null ? "Apagado: la IA no se detiene por gasto." : `Al llegar a ${usd(guardado)} en el día, la IA de Formatos se detiene hasta mañana.`}</p>
          </div>
          <Switch aria-labelledby="tope-titulo" checked={activo} disabled={ocupada} onCheckedChange={(on) => void cambiarSwitch(on)} />
        </div>
        {activo && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (leido !== null) void guardar(leido);
            }}
          >
            <label htmlFor="tope-monto" className="text-sm text-muted-foreground">US$</label>
            <Input id="tope-monto" inputMode="decimal" className="w-28" autoFocus value={monto} aria-invalid={monto !== "" && leido === null} onChange={(e) => setMonto(e.target.value)} placeholder="5.00" />
            <Button type="submit" size="sm" disabled={ocupada || leido === null || leido === guardado}>Guardar</Button>
          </form>
        )}
        <p className="text-xs text-muted-foreground">El día corre en hora de México. Lo que ya iba en camino al llegar al tope termina y se cobra, así que el día puede cerrar un poco arriba.</p>
      </div>
    </div>
  );
}

function Cifra({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-lg font-semibold tabular-nums text-foreground">{valor}</p>
    </div>
  );
}
