"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cambiarMiContrasena } from "@/app/(app)/cuenta-actions";
import { CLAVE_MIN, motivoClaveInvalida } from "@/lib/auth/clave-marca";

/**
 * «Cambiar contraseña» del cliente, desde su menú de cuenta. Quien recibió su login
 * por chat (DiDi@657) puede poner una suya o quedarse con ésa.
 */
export function CambiarContrasena({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [ver, setVer] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const motivo = nueva ? motivoClaveInvalida(nueva) : null;
  const noCoincide = !!repetir && repetir !== nueva;
  const puede = !!nueva && !motivo && repetir === nueva && !pending;

  const cerrar = (v: boolean) => {
    if (!v) {
      setNueva("");
      setRepetir("");
      setVer(false);
    }
    onOpenChange(v);
  };

  const guardar = () =>
    start(async () => {
      const res = await cambiarMiContrasena({ nueva });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      cerrar(false);
      if (res.reentrar) {
        toast.success("Contraseña cambiada. Entra otra vez con la nueva.");
        router.push("/portal/login");
      } else {
        toast.success("Contraseña cambiada. La próxima vez entra con la nueva.");
      }
    });

  const campo =
    "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>
            Escribe la contraseña que quieras usar de ahora en adelante (al menos {CLAVE_MIN} caracteres).
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (puede) guardar();
          }}
        >
          <label className="block space-y-1 text-xs font-medium text-muted-foreground">
            Contraseña nueva
            <div className="relative">
              <input
                type={ver ? "text" : "password"}
                autoComplete="new-password"
                value={nueva}
                onChange={(e) => setNueva(e.target.value)}
                className={`${campo} pr-9`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setVer((v) => !v)}
                aria-label={ver ? "Ocultar contraseña" : "Ver contraseña"}
                className="absolute inset-y-0 right-0 grid w-9 place-items-center text-muted-foreground hover:text-foreground"
              >
                {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {motivo && <span className="block text-[11px] font-normal text-destructive">{motivo}</span>}
          </label>
          <label className="block space-y-1 text-xs font-medium text-muted-foreground">
            Repítela
            <input
              type={ver ? "text" : "password"}
              autoComplete="new-password"
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
              className={campo}
            />
            {noCoincide && <span className="block text-[11px] font-normal text-destructive">No coinciden.</span>}
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => cerrar(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={!puede}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
