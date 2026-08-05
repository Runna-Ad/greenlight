"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Link2, X, ExternalLink, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import {
  subirReferencia,
  agregarReferenciaLink,
  quitarReferencia,
  type RefOwner,
} from "@/app/(app)/[cliente]/tareas/[id]/referencias-actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type RefVista = {
  id: string;
  kind: "imagen" | "video";
  /** Imagen: signed URL (privada). Video: la url del link. */
  displayUrl: string | null;
  thumbnail: string | null;
  platform: string | null;
};

/**
 * La caja "REFERENCIA" del wireframe, por plano: arrastra imágenes o pega ligas
 * de video. Se ven como thumbnails; al pasar el mouse crecen y al hacer clic se
 * abren en grande. Imágenes suben al bucket privado; videos van por link.
 */
export function ReferenciasPlano({
  owner,
  refs,
  soloImagenes,
  etiqueta = "Referencia",
  soloLectura,
}: {
  owner: RefOwner;
  refs: RefVista[];
  /** Estáticos: sólo imágenes, sin el botón de link de video. */
  soloImagenes?: boolean;
  etiqueta?: string;
  soloLectura?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [arrastrando, setArrastrando] = useState(false);
  const [grande, setGrande] = useState<RefVista | null>(null);
  const [pidiendoLink, setPidiendoLink] = useState(false);
  const [link, setLink] = useState("");
  const inputFile = useRef<HTMLInputElement>(null);

  const subir = (files: FileList | null) => {
    if (!files?.length) return;
    startTransition(async () => {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("file", file);
        const res = await subirReferencia(owner, form);
        if (!res.ok) toast.error(res.error);
      }
    });
  };

  const agregarLink = () =>
    startTransition(async () => {
      const res = await agregarReferenciaLink(owner, link);
      if (!res.ok) toast.error(res.error);
      else {
        setLink("");
        setPidiendoLink(false);
      }
    });

  const quitar = (referenceId: string) =>
    startTransition(async () => {
      const res = await quitarReferencia(owner, referenceId);
      if (!res.ok) toast.error(res.error);
    });

  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {etiqueta}
      </p>

      <div
        onDragOver={(e) => {
          if (soloLectura) return;
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          if (soloLectura) return;
          e.preventDefault();
          setArrastrando(false);
          subir(e.dataTransfer.files);
        }}
        className={`rounded-lg border border-dashed p-2 transition-colors ${
          arrastrando ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        <div className="flex flex-wrap gap-1.5">
          {refs.map((r) => (
            <Thumb key={r.id} r={r} soloLectura={soloLectura} onAbrir={() => setGrande(r)} onQuitar={() => quitar(r.id)} />
          ))}

          {!soloLectura && (
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => inputFile.current?.click()}
                disabled={pending}
                title="Subir imagen"
                className="flex size-14 flex-col items-center justify-center gap-0.5 rounded-md border border-border text-muted-foreground hover:border-primary hover:text-primary"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                <span className="text-[8px]">Imagen</span>
              </button>
              {!soloImagenes && (
                <button
                  type="button"
                  onClick={() => setPidiendoLink(true)}
                  disabled={pending}
                  title="Pegar link de video"
                  className="flex size-14 flex-col items-center justify-center gap-0.5 rounded-md border border-border text-center text-muted-foreground hover:border-primary hover:text-primary"
                >
                  <Link2 className="size-4" />
                  <span className="text-[8px] leading-tight">Link de video</span>
                </button>
              )}
            </div>
          )}

          {refs.length === 0 && soloLectura && (
            <span className="py-4 text-center text-[11px] text-muted-foreground/70">Sin referencias</span>
          )}
        </div>

        {/* Leyenda de que la zona es drag & drop */}
        {!soloLectura && (
          <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground/70">
            <UploadCloud className="size-3" />
            {soloImagenes
              ? "Arrastra imágenes aquí, o usa el botón."
              : "Arrastra imágenes aquí, o usa los botones. Videos van por link."}
          </p>
        )}

        <input
          ref={inputFile}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => subir(e.target.files)}
        />
      </div>

      {/* pop-up en grande — la referencia se ve para juzgarla, no de miniatura.
          Se fuerza sm:max-w para ganarle al sm:max-w-sm por defecto de Dialog. */}
      <Dialog open={grande !== null} onOpenChange={(o) => !o && setGrande(null)}>
        <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-sm">Referencia</DialogTitle>
          </DialogHeader>
          {grande?.kind === "imagen" && grande.displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={grande.displayUrl}
              alt="Referencia"
              className="max-h-[85vh] w-full rounded object-contain"
            />
          ) : (
            <a
              href={grande?.displayUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-md border border-border p-4 text-sm text-primary hover:underline"
            >
              <ExternalLink className="size-4" /> Abrir en {grande?.platform ?? "el navegador"}
            </a>
          )}
        </DialogContent>
      </Dialog>

      {/* pedir la liga */}
      <Dialog open={pidiendoLink} onOpenChange={setPidiendoLink}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sm">Pegar liga de referencia</DialogTitle>
          </DialogHeader>
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://tiktok.com/… o Drive, IG, YouTube…"
            aria-label="Liga de referencia"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPidiendoLink(false)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={pending || !link.trim()} onClick={agregarLink}>
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Thumb({
  r,
  soloLectura,
  onAbrir,
  onQuitar,
}: {
  r: RefVista;
  soloLectura?: boolean;
  onAbrir: () => void;
  onQuitar: () => void;
}) {
  const fondo = r.kind === "imagen" ? r.displayUrl : r.thumbnail;
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onAbrir}
        className="size-14 overflow-hidden rounded-md border border-border transition-transform hover:z-10 hover:scale-[2] hover:shadow-lg"
        title={r.platform ?? "Referencia"}
      >
        {fondo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fondo} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center bg-secondary text-[8px] font-semibold uppercase text-muted-foreground">
            {r.platform ?? "link"}
          </span>
        )}
      </button>
      {!soloLectura && (
        <button
          type="button"
          onClick={onQuitar}
          aria-label="Quitar referencia"
          className="absolute -right-1 -top-1 hidden size-4 items-center justify-center rounded-full bg-status-corrections text-white group-hover:flex"
        >
          <X className="size-2.5" />
        </button>
      )}
    </div>
  );
}
