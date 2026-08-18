import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Hammer, Lock } from "lucide-react";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { ROLE_LABEL, canSee, canOverrideStatus } from "@/lib/roles";
import { type AssetStatus } from "@/lib/brand";
import { ESTADOS_CERRADOS, plantillaPara, notaGlobal } from "@/lib/plantilla";
import { posicionEnBundle } from "@/lib/bundle";
import { cargarBundle } from "@/lib/bundle-data";
import { CorreccionesProvider } from "@/components/tarea/correcciones/contexto";
import { WorkspaceProvider } from "@/components/tarea/workspace-provider";
import { PanelCorrecciones } from "@/components/tarea/correcciones/panel";
import { SubHeaderTarea } from "@/components/tarea/sub-header-tarea";
import { HeroTarea } from "@/components/tarea/hero-tarea";
import { TabsTarea } from "@/components/tarea/tabs-tarea";
import { BannerPegarGuion } from "@/components/tarea/banner-pegar-guion";
import { DocumentoGuion } from "@/components/tarea/documento-guion";
import { BottomBarTarea } from "@/components/tarea/bottom-bar-tarea";
import { estadoDeTimestamps, type Correccion } from "@/lib/correcciones";
import type { RefVista } from "@/components/tarea/referencias-plano";
import type { EstaticoVista, PlanoVista } from "@/components/tarea/preview-slide";

export const dynamic = "force-dynamic";

type Idea = {
  id: string; code: string | null; status: AssetStatus; track: string;
  naming_base: string | null; concepto: string | null; tipo_asset: string | null;
  formato_code: string | null; duracion: string | null; tamanos: string[] | null;
  plataformas: string[] | null; marca_id: string | null; brief_id: string;
  entrega_num: string | null; entrega_final: string | null; entrega_url: string | null;
  trend: string | null; notas: string | null; legales_libres: string | null; nota_guion: string | null;
  comentarios_creativo: string | null; peloteo_raw: string | null;
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
      "id, code, status, track, naming_base, concepto, tipo_asset, formato_code, duracion, tamanos, plataformas, marca_id, brief_id, entrega_num, entrega_final, entrega_url, trend, notas, legales_libres, nota_guion, comentarios_creativo, peloteo_raw",
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

  const [{ data: marca }, { data: archivos }, { data: asignaciones }, { data: brief }] =
    await Promise.all([
      idea.marca_id
        ? db.from("marcas").select("name, slug, logo_url").eq("id", idea.marca_id).maybeSingle()
        : Promise.resolve({ data: null }),
      db
        .from("assets")
        .select("filename, tamano_code, plataforma_code")
        .eq("idea_id", idea.id)
        .order("tamano_code")
        .order("plataforma_code")
        .returns<{ filename: string | null }[]>(),
      // Quién la trabaja (con lead/team y nombres) — alimenta la decisión de
      // botones (actionsFor) y el panel Rünna tools.
      db
        .from("idea_assignments")
        .select("member_id, es_lead, track_members(id, name, color)")
        .eq("idea_id", idea.id)
        .returns<{
          member_id: string | null;
          es_lead: boolean;
          track_members: { id: string; name: string; color: string } | null;
        }[]>(),
      // El número de Brief para el pill de la hero ("Brief 24/07").
      db.from("briefs").select("brief_name, code, brief_date").eq("id", idea.brief_id).maybeSingle(),
    ]);
  const memberIds = (asignaciones ?? []).map((a) => a.member_id).filter(Boolean) as string[];
  const personas = (asignaciones ?? [])
    .filter((a) => a.track_members)
    .map((a) => ({
      id: a.track_members!.id,
      name: a.track_members!.name,
      color: a.track_members!.color,
      es_lead: a.es_lead,
    }));

  const brf = brief as
    | { brief_name: string | null; code: string | null; brief_date: string | null }
    | null;
  // Preferir la FECHA del brief en formato compacto "DD/MM" (igual que el
  // tablero) — el brief_name es la etiqueta libre del cliente y a veces es un
  // título largo. Cae a brief_name y luego a code.
  const md = brf?.brief_date?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const fechaBrief = md ? `${md[3]}/${md[2]}` : null;
  // Con fecha → "Brief 24/07" (compacto, como el mockup y el tablero). Sin fecha,
  // el brief_name ya es un nombre propio (no se le antepone "Brief"); cae a code.
  const briefLabel = fechaBrief
    ? `Brief ${fechaBrief}`
    : brf?.brief_name?.trim() || brf?.code?.trim() || null;

  // El bundle: las tareas hermanas de este brief, con el MISMO filtro y orden
  // que los cards de /briefs (lib/bundle.ts es la única fuente).
  const bundle = await cargarBundle(idea.brief_id, role, soy?.id ?? null);
  const posicion = posicionEnBundle(bundle, idea.id);
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

  // Referencias por plano (imágenes subidas + links de video). Las imágenes
  // viven en un bucket PRIVADO — se firma una URL por render (la página es
  // force-dynamic), nunca se expone el bucket.
  const refsPorPlano: Record<string, RefVista[]> = {};
  if (plantilla === "guion" && planos.length) {
    const { data: vinculos } = await db
      .from("plano_references")
      .select("plano_id, position, references(id, kind, url, storage_path, thumbnail_url, platform)")
      .in("plano_id", planos.map((p) => p.id))
      .order("position")
      .returns<
        {
          plano_id: string;
          references: {
            id: string;
            kind: "imagen" | "video";
            url: string;
            storage_path: string | null;
            thumbnail_url: string | null;
            platform: string | null;
          } | null;
        }[]
      >();

    for (const v of vinculos ?? []) {
      const r = v.references;
      if (!r) continue;
      let displayUrl: string | null = r.kind === "video" ? r.url : null;
      if (r.kind === "imagen" && r.storage_path) {
        const { data: firmada } = await db.storage
          .from("greenlight-referencias")
          .createSignedUrl(r.storage_path, 60 * 60); // 1h
        displayUrl = firmada?.signedUrl ?? null;
      }
      (refsPorPlano[v.plano_id] ??= []).push({
        id: r.id,
        kind: r.kind,
        displayUrl,
        thumbnail: r.thumbnail_url,
        platform: r.platform,
      });
    }
  }

  // Referencias del ESTÁTICO — sólo imágenes, mismo bucket privado + signed URL.
  const refsEstatico: RefVista[] = [];
  if (plantilla === "estatico" && estatico) {
    const { data: vinculos } = await db
      .from("estatico_references")
      .select("position, references(id, kind, url, storage_path, thumbnail_url, platform)")
      .eq("estatico_id", estatico.id)
      .order("position")
      .returns<
        {
          references: {
            id: string;
            kind: "imagen" | "video";
            url: string;
            storage_path: string | null;
            thumbnail_url: string | null;
            platform: string | null;
          } | null;
        }[]
      >();
    for (const v of vinculos ?? []) {
      const r = v.references;
      if (!r) continue;
      let displayUrl: string | null = r.kind === "video" ? r.url : null;
      if (r.kind === "imagen" && r.storage_path) {
        const { data: firmada } = await db.storage
          .from("greenlight-referencias")
          .createSignedUrl(r.storage_path, 60 * 60);
        displayUrl = firmada?.signedUrl ?? null;
      }
      refsEstatico.push({
        id: r.id,
        kind: r.kind,
        displayUrl,
        thumbnail: r.thumbnail_url,
        platform: r.platform,
      });
    }
  }

  // Legales: la BIBLIOTECA disponible (por marca) + cuáles están SELECCIONADOS
  // en esta tarea (idea_snippets). El picker agrega/quita; el texto libre es
  // aparte (ideas.legales_libres).
  const [{ data: bibliotecaLegal }, { data: idSnippets }] = await Promise.all([
    db
      .from("snippets")
      .select("id, title, body")
      .eq("kind", "legal")
      .eq("active", true)
      .or(idea.marca_id ? `marca_id.eq.${idea.marca_id},scope.eq.global` : "scope.eq.global")
      .order("title")
      .returns<{ id: string; title: string; body: string }[]>(),
    db
      .from("idea_snippets")
      .select("snippet_id")
      .eq("idea_id", idea.id)
      .returns<{ snippet_id: string }[]>(),
  ]);
  const seleccionadosIds = new Set((idSnippets ?? []).map((s) => s.snippet_id));
  const legalesSeleccionados = (bibliotecaLegal ?? []).filter((s) => seleccionadosIds.has(s.id));
  const legalesDisponibles = (bibliotecaLegal ?? []).filter((s) => !seleccionadosIds.has(s.id));

  // Correcciones localizadas (0028): comentarios kind='correction_request' que
  // apuntan a un campo. Se muestran fijados al campo + en el panel lateral.
  type CorrRow = {
    id: string; body: string; ronda: number | null;
    target_tabla: string | null; target_fila_id: string | null;
    target_campo: string | null; target_label: string | null;
    target_quote: string | null; target_start: number | null; target_end: number | null;
    atendido_at: string | null; resolved_at: string | null; author_member_id: string | null;
  };
  const { data: corrRows } = await db
    .from("comments")
    .select(
      "id, body, ronda, target_tabla, target_fila_id, target_campo, target_label, target_quote, target_start, target_end, atendido_at, resolved_at, author_member_id",
    )
    .eq("idea_id", idea.id)
    .eq("kind", "correction_request")
    .order("created_at")
    .returns<CorrRow[]>();

  const autorIds = [...new Set((corrRows ?? []).map((r) => r.author_member_id).filter(Boolean) as string[])];
  const { data: autores } = autorIds.length
    ? await db.from("track_members").select("id, name").in("id", autorIds).returns<{ id: string; name: string }[]>()
    : { data: [] as { id: string; name: string }[] };
  const nombrePorId = new Map((autores ?? []).map((a) => [a.id, a.name]));

  const correcciones: Correccion[] = (corrRows ?? []).map((r) => ({
    id: r.id,
    targetTabla: r.target_tabla,
    targetFilaId: r.target_fila_id,
    targetCampo: r.target_campo,
    targetLabel: r.target_label,
    targetQuote: r.target_quote,
    targetStart: r.target_start,
    targetEnd: r.target_end,
    body: r.body,
    autor: r.author_member_id ? nombrePorId.get(r.author_member_id) ?? null : null,
    ronda: r.ronda ?? 1,
    estado: estadoDeTimestamps(r),
  }));
  const abiertasN = correcciones.filter((c) => c.estado === "open").length;

  const cerrada = ESTADOS_CERRADOS.includes(idea.status);
  const soloLectura = cerrada && !canOverrideStatus(role);
  const esEstatico = plantilla === "estatico";
  const esEquipo = role !== "client";
  const puedeEditar = canOverrideStatus(role);

  const notaG = notaGlobal(idea.tipo_asset);
  const notaPlaceholder = notaG
    ? `Notas de guión: ${notaG}`
    : "Notas de guión (p. ej. # de outfits, tono, continuidad)…";

  const ctx = {
    role,
    isAssignee: soy ? memberIds.includes(soy.id) : false,
    hasAssignee: memberIds.length > 0,
  };

  return (
    <CorreccionesProvider
      ideaId={idea.id}
      clienteSlug={cliente}
      esRevisor={canOverrideStatus(role)}
      esEquipo={esEquipo}
      correcciones={correcciones}
    >
      {/* key por idea.id: al pasar de una tarea a otra con las flechas del bundle
          (nav client-side que sólo cambia [id]), React conservaría el useState de
          este provider y mostraría/editaría el CUERPO de la tarea anterior. El key
          fuerza un remount con el estado fresco de la nueva tarea. */}
      <WorkspaceProvider key={idea.id} planosIniciales={planos} estaticoInicial={estatico}>
        <div className="space-y-4">
          {/* ── SECCIÓN DE ARRIBA: su menú (sub-header) se queda pegado ARRIBA
                mientras se ve esta sección; al pasar el banner "Pegar guión"
                (último hijo) se despega y toma el relevo el menú de abajo. Pega
                a top-16 = debajo del topbar (h-16). El fondo sangra a los bordes
                de main (-mx) para que el contenido no se asome al costado. ── */}
          <div className="space-y-4">
            <div className="sticky top-16 z-20 -mx-4 bg-background/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
              <SubHeaderTarea
                cliente={cliente}
                ideaId={idea.id}
                status={idea.status}
                ctx={ctx}
                abiertas={abiertasN}
                indice={posicion.indice}
                total={posicion.total}
                anterior={posicion.anterior}
                siguiente={posicion.siguiente}
              />
            </div>

            {soloLectura && (
              <p className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5 shrink-0" />
                Cerrada — sólo un lead puede reabrirla
              </p>
            )}

            {!soy && (
              <p className="rounded-md border border-primary/30 bg-primary/8 px-3 py-2 text-xs">
                Dinos quién eres arriba a la derecha para que quede registrado quién escribe.
              </p>
            )}

            <HeroTarea
              ideaId={idea.id}
              marca={marca?.name ?? null}
              logoUrl={marca?.logo_url ?? null}
              briefLabel={briefLabel}
              naming={idea.naming_base}
              status={idea.status}
              notaGuion={idea.nota_guion}
              notaPlaceholder={notaPlaceholder}
              esEstatico={esEstatico}
              entregaUrl={idea.entrega_url}
              soloLectura={soloLectura}
            />

            <TabsTarea
              ideaId={idea.id}
              esEstatico={esEstatico}
              soloLectura={soloLectura}
              detalles={{
                tipoAsset: idea.tipo_asset,
                plataformas: idea.plataformas ?? [],
                tamanos: idea.tamanos ?? [],
                duracion: idea.duracion,
                concepto: idea.concepto,
                trend: idea.trend,
              }}
              // Rünna tools SÓLO para el equipo — no se construye para el cliente
              // (no se filtra en el payload RSC, no sólo se oculta con CSS).
              runna={
                esEquipo
                  ? {
                      personas,
                      entregaUrl: idea.entrega_url,
                      filenames,
                      comentariosCreativo: idea.comentarios_creativo,
                      peloteo: idea.peloteo_raw,
                      puedeEditar,
                    }
                  : undefined
              }
            />

            <BannerPegarGuion ideaId={idea.id} esEstatico={esEstatico} soloLectura={soloLectura} />
          </div>

          {/* ── SECCIÓN DEL GUIÓN: su menú (barra inferior) se queda pegado ABAJO
                mientras se ve esta sección. Es el relevo del menú de arriba. ── */}
          <div className="space-y-4">
            <DocumentoGuion
              ideaId={idea.id}
              tipoAsset={idea.tipo_asset}
              esEstatico={esEstatico}
              refsPorPlano={refsPorPlano}
              refsEstatico={refsEstatico}
              soloLectura={soloLectura}
              cortinilla={{
                legalesLibres: idea.legales_libres,
                seleccionados: legalesSeleccionados,
                biblioteca: legalesDisponibles,
              }}
            />

            <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-background/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
              <BottomBarTarea esEstatico={esEstatico} />
            </div>
          </div>

          {esEquipo && correcciones.length > 0 && (
            <div className="mt-2">
              <PanelCorrecciones />
            </div>
          )}
        </div>
      </WorkspaceProvider>
    </CorreccionesProvider>
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
