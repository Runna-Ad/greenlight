import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Files, Hammer, Lock } from "lucide-react";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { ROLE_LABEL, canSee, canOverrideStatus } from "@/lib/roles";
import { STATUS_LABEL, STATUS_TOKEN, type AssetStatus } from "@/lib/brand";
import { ESTADOS_CERRADOS, plantillaPara } from "@/lib/plantilla";
import type { Regla } from "@/lib/reglas";
import { EditorTarea } from "@/components/tarea/editor-tarea";
import { CabeceraTarea } from "@/components/tarea/cabecera";
import { AccionesTarea } from "@/components/tarea/acciones-tarea";
import type { EstaticoVista, PlanoVista } from "@/components/tarea/preview-slide";

export const dynamic = "force-dynamic";

type Idea = {
  id: string; code: string | null; status: AssetStatus; track: string;
  naming_base: string | null; concepto: string | null; tipo_asset: string | null;
  formato_code: string | null; duracion: string | null; tamanos: string[] | null;
  plataformas: string[] | null; marca_id: string | null; brief_id: string;
  entrega_num: string | null; entrega_final: string | null; entrega_url: string | null;
  trend: string | null; notas: string | null;
};

export default async function TareaPage({
  params,
}: {
  params: Promise<{ cliente: string; id: string }>;
}) {
  const { cliente, id } = await params;
  const [role, soy] = await Promise.all([getViewAs(), getSoy()]);

  if (!canSee(role, "tablero")) {
    return (
      <Denegado texto={`Un ${ROLE_LABEL[role]} no entra a la plantilla de producción.`} />
    );
  }
  if (!hasSupabase()) return <Denegado texto="La base de datos no está configurada." />;

  const db = supabaseAdmin();
  const { data: idea } = await db
    .from("ideas")
    .select(
      "id, code, status, track, naming_base, concepto, tipo_asset, formato_code, duracion, tamanos, plataformas, marca_id, brief_id, entrega_num, entrega_final, entrega_url, trend, notas",
    )
    .eq("id", id)
    .maybeSingle<Idea>();

  if (!idea) notFound();

  const plantilla = plantillaPara(idea.tipo_asset);

  // Copies todavía no se construye. Se dice, en vez de fingir una plantilla.
  if (plantilla === "copies") {
    return (
      <div className="mx-auto max-w-2xl">
        <Volver cliente={cliente} />
        <div className="mt-4 rounded-xl border border-dashed border-border p-6">
          <div className="flex items-start gap-3">
            <Hammer className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div className="text-sm leading-relaxed text-muted-foreground">
              <p className="text-foreground">
                La plantilla de <strong>Copies</strong> todavía no está construida.
              </p>
              <p className="mt-2">
                A diferencia del guión y del estático, esta no existe en el deck del
                cliente — ese slide sólo enlaza a otra hoja de cálculo. Construirla
                a ciegas sería inventarla, así que se hará con su preview antes de
                cablear nada.
              </p>
              <p className="mt-2 text-xs">
                Acordado: temas con cuota (el lead define los temas y cuántos por
                tema; el copy llena headline + descripción, con contador).
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const [{ data: marca }, { data: reglas }, { data: archivos }, { data: durVocab }, { data: asignaciones }] =
    await Promise.all([
      idea.marca_id
        ? db.from("marcas").select("name, slug").eq("id", idea.marca_id).maybeSingle()
        : Promise.resolve({ data: null }),
      db.from("reglas").select("*").eq("activo", true).returns<Regla[]>(),
      db
        .from("assets")
        .select("filename, tamano_code, plataforma_code")
        .eq("idea_id", idea.id)
        .order("tamano_code")
        .order("plataforma_code")
        .returns<{ filename: string | null }[]>(),
      // Sugerencias para la Duración. Salen de vocab_terms (una sola fuente) y
      // NO limitan: el campo acepta lo que sea, como el "Otro" de los dropdowns.
      db
        .from("vocab_terms")
        .select("label_es")
        .eq("set", "duracion")
        .order("sort_order")
        .returns<{ label_es: string }[]>(),
      // Quién la trabaja — alimenta la decisión de botones (actionsFor).
      db
        .from("idea_assignments")
        .select("member_id")
        .eq("idea_id", idea.id)
        .returns<{ member_id: string | null }[]>(),
    ]);
  const memberIds = (asignaciones ?? []).map((a) => a.member_id).filter(Boolean) as string[];
  const filenames = (archivos ?? []).map((a) => a.filename).filter(Boolean) as string[];

  // El cuerpo: se crea la primera fila al abrir, para que la persona escriba ya.
  let planos: PlanoVista[] = [];
  let estatico: EstaticoVista | null = null;

  if (plantilla === "guion") {
    const { data } = await db
      .from("planos")
      .select("id, orden, titulo, accion, copy_in, sfx, gfx, edicion, dialogo, es_cierre")
      .eq("idea_id", idea.id)
      .order("orden")
      .returns<PlanoVista[]>();
    planos = data ?? [];
    if (!planos.length) {
      const { data: creado } = await db
        .from("planos").insert({ idea_id: idea.id, orden: 1 })
        .select("id, orden, titulo, accion, copy_in, sfx, gfx, edicion, dialogo, es_cierre")
        .single<PlanoVista>();
      if (creado) planos = [creado];
    }
  } else {
    const { data } = await db
      .from("estaticos")
      .select("id, copy_titulo, copy_subtitulo, copy_cta, legales_extra, referencia_url, referencia_nota")
      .eq("idea_id", idea.id)
      .order("orden")
      .maybeSingle<EstaticoVista>();
    estatico = data ?? null;
    if (!estatico) {
      const { data: creado } = await db
        .from("estaticos").insert({ idea_id: idea.id, orden: 1 })
        .select("id, copy_titulo, copy_subtitulo, copy_cta, legales_extra, referencia_url, referencia_nota")
        .single<EstaticoVista>();
      estatico = creado ?? null;
    }
  }

  // Legales de la biblioteca, por marca. Se seleccionan, no se pegan.
  const { data: legalesData } = await db
    .from("snippets")
    .select("body")
    .eq("kind", "legal")
    .eq("active", true)
    .or(idea.marca_id ? `marca_id.eq.${idea.marca_id},scope.eq.global` : "scope.eq.global")
    .returns<{ body: string }[]>();

  const cerrada = ESTADOS_CERRADOS.includes(idea.status);
  const soloLectura = cerrada && !canOverrideStatus(role);
  const token = STATUS_TOKEN[idea.status];

  return (
    <div>
      <Volver cliente={cliente} />

      <div className="mb-4 mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {idea.code && (
              <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-semibold text-secondary-foreground">
                {idea.code}
              </span>
            )}
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase text-white"
              style={{ backgroundColor: `var(--status-${token})` }}
            >
              {STATUS_LABEL[idea.status]}
            </span>
            {marca?.name && (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                {marca.name}
              </span>
            )}
            {idea.tipo_asset && (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">
                {idea.tipo_asset}
              </span>
            )}
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Files className="size-3" /> {filenames.length} archivos
            </span>
          </div>
          <h2 className="mt-1.5 font-mono text-xl font-semibold text-foreground">
            {idea.naming_base ?? "Sin naming"}
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {idea.concepto ?? "Sin concepto"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {soloLectura && (
            <p className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2.5 py-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5 shrink-0" />
              Cerrada — sólo un lead puede reabrirla
            </p>
          )}
          {/* Wireframe: "Enviar a revisión" arriba a la derecha. Misma decisión
              de botones que el tablero (actionsFor), no una copia. */}
          <AccionesTarea
            ideaId={idea.id}
            status={idea.status}
            ctx={{
              role,
              isAssignee: soy ? memberIds.includes(soy.id) : false,
              hasAssignee: memberIds.length > 0,
            }}
          />
        </div>
      </div>

      {!soy && (
        <p className="mb-3 rounded-md border border-primary/30 bg-primary/8 px-3 py-2 text-xs">
          Dinos quién eres arriba a la derecha para que quede registrado quién escribe.
        </p>
      )}

      {/* La cabecera va aquí y no como prop del editor: pasar JSX por prop hacía
          que React reportara una key faltante contra el componente equivocado. */}
      <div className="mb-4">
        <CabeceraTarea
          ideaId={idea.id}
          tipoAsset={idea.tipo_asset}
          plantilla={plantilla}
          plataformas={idea.plataformas ?? []}
          tamanos={idea.tamanos ?? []}
          duracion={idea.duracion}
          trend={idea.trend}
          notas={idea.notas}
          marca={marca?.name ?? null}
          formato={idea.formato_code}
          entregaNum={idea.entrega_num}
          entregaFinal={idea.entrega_final}
          entregaUrl={idea.entrega_url}
          filenames={filenames}
          duracionesSugeridas={(durVocab ?? []).map((v) => v.label_es)}
          soloLectura={soloLectura}
        />
      </div>

      <EditorTarea
        ideaId={idea.id}
        marcaSlug={marca?.slug ?? null}
        cabecera={{
          naming: idea.naming_base,
          tipoAsset: idea.tipo_asset,
          plataformas: idea.plataformas ?? [],
          tamanos: idea.tamanos ?? [],
          duracion: idea.duracion,
          marca: marca?.name ?? null,
          formato: idea.formato_code,
          status: idea.status,
        }}
        planosIniciales={planos}
        estaticoInicial={estatico}
        reglas={reglas ?? []}
        legales={(legalesData ?? []).map((l) => l.body)}
        soloLectura={soloLectura}
      />
    </div>
  );
}

function Volver({ cliente }: { cliente: string }) {
  return (
    <Link
      href={`/${cliente}/tablero`}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" /> Volver al tablero
    </Link>
  );
}

function Denegado({ texto }: { texto: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-dashed border-border p-8 text-center">
      <Lock className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-3 text-sm text-foreground">{texto}</p>
    </div>
  );
}
