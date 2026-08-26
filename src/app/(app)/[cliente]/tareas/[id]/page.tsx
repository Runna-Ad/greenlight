import { notFound } from "next/navigation";
import { Lock } from "lucide-react";

import { supabaseAdmin, hasSupabase } from "@/lib/supabase-admin";
import { getViewAs } from "@/lib/view-as";
import { getSoy } from "@/lib/soy";
import { assertCanActOnTask } from "@/lib/auth/task-scope";
import { ROLE_LABEL, canSee, canOverrideStatus, canAssign } from "@/lib/roles";
import { type AssetStatus } from "@/lib/brand";
import { ESTADOS_CERRADOS, plantillaPara, notaGlobal, readTimeS } from "@/lib/plantilla";
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
import { DocumentoCopies, type TemaRow } from "@/components/tarea/documento-copies";
import { legalSugerido } from "@/lib/legal-sugerido";
import { BottomBarTarea } from "@/components/tarea/bottom-bar-tarea";
import { estadoDeTimestamps, type Correccion } from "@/lib/correcciones";
import type { RefVista } from "@/components/tarea/referencias-plano";
import type { EstaticoVista, PlanoVista } from "@/components/tarea/preview-slide";

export const dynamic = "force-dynamic";
// Las acciones de H.Ü.E de esta ruta (crearGuion escribe un guión completo, extraerGuion,
// validarCambios) pueden tardar >10s — sube el techo del serverless para que no corten.
export const maxDuration = 60;

type Idea = {
  id: string; code: string | null; status: AssetStatus; track: string;
  naming_base: string | null; concepto: string | null; tipo_asset: string | null;
  formato_code: string | null; duracion: string[] | null; tamanos: string[] | null;
  plataformas: string[] | null; marca_id: string | null; brief_id: string;
  entrega_num: string | null; entrega_final: string | null; entrega_url: string | null;
  trend: string | null; notas: string | null; legales_libres: string | null; nota_guion: string | null;
  comentarios_creativo: string | null; peloteo_raw: string | null; selling_points: string[] | null;
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
      "id, code, status, track, naming_base, concepto, tipo_asset, formato_code, duracion, tamanos, plataformas, marca_id, brief_id, entrega_num, entrega_final, entrega_url, trend, notas, legales_libres, nota_guion, comentarios_creativo, peloteo_raw, selling_points",
    )
    .eq("id", id)
    .maybeSingle<Idea>();

  if (!idea) notFound();

  // Scope de LECTURA: además del gate de rol (canSee), el usuario debe poder
  // actuar sobre ESTA tarea — creative → asignado, lead → su track, admin/master
  // → todo. Sin esto cualquier rol interno abría cualquier tarea de cualquier
  // cliente por URL (la ruta cargaba por `id` e ignoraba el slug) y le firmaba
  // URLs de 1h al bucket PRIVADO de referencias. Espeja el gate del lado de
  // escritura (assertCanActOnTask). notFound() en vez de "denegado" para no
  // revelar que la tarea existe. (reap 2026-08-26)
  const scope = await assertCanActOnTask(id);
  if (!scope.ok) notFound();

  const plantilla = plantillaPara(idea.tipo_asset);

  const [{ data: marca }, { data: archivos }, { data: asignaciones }, { data: brief }, { data: clienteRow }] =
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
      // Color de marca del cliente — pinta el badge "Cliente" de sus cambios (Pedro).
      db.from("clients").select("brand_color").eq("slug", cliente).maybeSingle<{ brand_color: string | null }>(),
    ]);
  const marcaColor = clienteRow?.brand_color ?? null;
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
  // (bundle + legales + correcciones + feedback del cliente se cargan más abajo en
  // UN Promise.all — sólo necesitan idea.*, no hay que serializarlos.)
  const filenames = (archivos ?? []).map((a) => a.filename).filter(Boolean) as string[];

  // El cuerpo: se crea la primera fila al abrir, para que la persona escriba ya.
  let planos: PlanoVista[] = [];
  let estatico: EstaticoVista | null = null;
  let temas: TemaRow[] = [];

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
  } else if (plantilla === "estatico") {
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
  } else {
    // copies: cargar los temas + sus copies (ordenados). NO se auto-siembra: el lead
    // define los temas. Vacío → empty-state en el documento.
    const { data: temasRaw } = await db
      .from("copies_temas").select("id, tema, cuota, orden").eq("idea_id", idea.id).order("orden")
      .returns<{ id: string; tema: string | null; cuota: number; orden: number }[]>();
    const filasTema = temasRaw ?? [];
    if (filasTema.length) {
      const { data: copiesRaw } = await db
        .from("copies").select("id, tema_id, headline, descripcion, orden")
        .in("tema_id", filasTema.map((t) => t.id)).order("orden")
        .returns<{ id: string; tema_id: string; headline: string | null; descripcion: string | null; orden: number }[]>();
      const porTema = new Map<string, TemaRow["copies"]>();
      for (const c of copiesRaw ?? []) {
        (porTema.get(c.tema_id) ?? porTema.set(c.tema_id, []).get(c.tema_id)!).push({
          id: c.id, headline: c.headline, descripcion: c.descripcion, orden: c.orden,
        });
      }
      temas = filasTema.map((t) => ({ id: t.id, tema: t.tema, cuota: t.cuota, orden: t.orden, copies: porTema.get(t.id) ?? [] }));
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

    // Las URLs firmadas se generan EN PARALELO (antes era una llamada de storage
    // secuencial por imagen → N viajes en serie, lento con varias referencias).
    const firmados = await Promise.all(
      (vinculos ?? []).map(async (v) => {
        const r = v.references;
        if (!r) return null;
        let displayUrl: string | null = r.kind === "video" ? r.url : null;
        if (r.kind === "imagen" && r.storage_path) {
          const { data: firmada } = await db.storage
            .from("greenlight-referencias")
            .createSignedUrl(r.storage_path, 60 * 60); // 1h
          displayUrl = firmada?.signedUrl ?? null;
        }
        return {
          plano_id: v.plano_id,
          ref: { id: r.id, kind: r.kind, displayUrl, thumbnail: r.thumbnail_url, platform: r.platform },
        };
      }),
    );
    for (const f of firmados) if (f) (refsPorPlano[f.plano_id] ??= []).push(f.ref);
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
    const firmados = await Promise.all(
      (vinculos ?? []).map(async (v) => {
        const r = v.references;
        if (!r) return null;
        let displayUrl: string | null = r.kind === "video" ? r.url : null;
        if (r.kind === "imagen" && r.storage_path) {
          const { data: firmada } = await db.storage
            .from("greenlight-referencias")
            .createSignedUrl(r.storage_path, 60 * 60);
          displayUrl = firmada?.signedUrl ?? null;
        }
        return { id: r.id, kind: r.kind, displayUrl, thumbnail: r.thumbnail_url, platform: r.platform };
      }),
    );
    for (const f of firmados) if (f) refsEstatico.push(f);
  }

  // Correcciones localizadas (0028): comentarios kind='correction_request'. Tipo
  // de fila definido antes del Promise.all para tiparlo dentro.
  type CorrRow = {
    id: string; body: string; ronda: number | null;
    target_tabla: string | null; target_fila_id: string | null;
    target_campo: string | null; target_label: string | null;
    target_quote: string | null; target_start: number | null; target_end: number | null;
    atendido_at: string | null; resolved_at: string | null; author_member_id: string | null;
    categoria: string | null;
  };
  // client_change (0037/0038): el cambio del cliente es una CORRECCIÓN de primera
  // clase — mismo lifecycle (atendido/confirmar/gate/rondas), única diferencia: badge
  // "Cliente" + sin categoría. Enviado = `ronda is not null` (0038). Se fusiona con
  // las correcciones internas; el flag `cliente` sólo cambia la presentación.
  type ClientChangeRow = {
    id: string; ronda: number | null;
    target_tabla: string | null; target_fila_id: string | null; target_campo: string | null;
    target_label: string | null; target_quote: string | null;
    target_start: number | null; target_end: number | null;
    body: string; atendido_at: string | null; resolved_at: string | null;
  };
  // TODO lo que sólo depende de idea.* corre EN PARALELO (antes: bundle, legales,
  // correcciones y feedback del cliente iban en serie, un viaje de red tras otro).
  const [bundle, [{ data: bibliotecaLegal }, { data: idSnippets }], { data: corrRows }, { data: cambiosCliente }] =
    await Promise.all([
      cargarBundle(idea.brief_id, role, soy?.id ?? null),
      Promise.all([
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
      ]),
      db
        .from("comments")
        .select(
          "id, body, ronda, target_tabla, target_fila_id, target_campo, target_label, target_quote, target_start, target_end, atendido_at, resolved_at, author_member_id, categoria",
        )
        .eq("idea_id", idea.id)
        .eq("kind", "correction_request")
        .order("created_at")
        .returns<CorrRow[]>(),
      // Sólo los ENVIADOS (ronda is not null); los borradores del cliente (ronda null)
      // viven en el portal, no en el lado interno.
      db
        .from("comments")
        .select(
          "id, ronda, target_tabla, target_fila_id, target_campo, target_label, target_quote, target_start, target_end, body, atendido_at, resolved_at",
        )
        .eq("idea_id", idea.id)
        .eq("kind", "client_change")
        .not("ronda", "is", null)
        .order("created_at")
        .returns<ClientChangeRow[]>(),
    ]);
  const posicion = posicionEnBundle(bundle, idea.id);
  const seleccionadosIds = new Set((idSnippets ?? []).map((s) => s.snippet_id));
  const legalesSeleccionados = (bibliotecaLegal ?? []).filter((s) => seleccionadosIds.has(s.id));
  const legalesDisponibles = (bibliotecaLegal ?? []).filter((s) => !seleccionadosIds.has(s.id));
  // El legal ÚNICO de la tarea (snippet elegido o texto libre) → su tiempo de lectura
  // se suma a la barra inferior (la cortinilla también se lee en pantalla — Pedro).
  const cortinillaTexto = legalesSeleccionados[0]?.body ?? idea.legales_libres ?? "";
  const cortinillaS = readTimeS(cortinillaTexto);

  // Phase B — legal sugerido para este guión (determinista, por marca). Se computa
  // sobre el guión GUARDADO (la fuente legalmente relevante); el humano confirma.
  const guionTexto = [
    idea.concepto,
    idea.peloteo_raw,
    ...planos.flatMap((p) => [p.titulo, p.accion, p.copy_in, p.sfx, p.gfx, p.edicion, p.dialogo]),
    // El estático no tiene planos: su "guión" es el copy del arte (título/subtítulo/
    // CTA + legal libre). Incluirlo deja que la sugerencia detecte cashback/MSI/etc.
    estatico?.copy_titulo,
    estatico?.copy_subtitulo,
    estatico?.copy_cta,
    estatico?.legales_extra,
  ]
    .filter(Boolean)
    .join(" ");
  const sugerenciaLegal = legalSugerido(marca?.slug ?? null, guionTexto, [
    ...legalesSeleccionados,
    ...legalesDisponibles,
  ]);

  // Phase 2 — pool ASIGNABLE del track de la tarea: leads (rol `lead`) +
  // especialistas (rol `creative`), activos. Admins/master NO son asignables (no
  // son doers). El editor de asignación de la tarea usa esto (fuente viva, por rol
  // y track — nunca la lista hardcodeada de vocab.ts).
  const { data: poolRows } = hasSupabase()
    ? await db
        .from("track_members")
        .select("id, name, color, role")
        .eq("active", true)
        .eq("track", idea.track)
        .in("role", ["lead", "creative"])
        .order("name")
    : { data: [] };
  const pool = (poolRows ?? []) as { id: string; name: string; color: string; role: string }[];
  const leadsPool = pool.filter((m) => m.role === "lead").map(({ id, name, color }) => ({ id, name, color }));
  const especialistasPool = pool
    .filter((m) => m.role === "creative")
    .map(({ id, name, color }) => ({ id, name, color }));

  const autorIds = [...new Set((corrRows ?? []).map((r) => r.author_member_id).filter(Boolean) as string[])];
  const { data: autores } = autorIds.length
    ? await db.from("track_members").select("id, name").in("id", autorIds).returns<{ id: string; name: string }[]>()
    : { data: [] as { id: string; name: string }[] };
  const nombrePorId = new Map((autores ?? []).map((a) => [a.id, a.name]));

  // Correcciones = internas (correction_request) + cambios del cliente ENVIADOS
  // (client_change, ronda not null). Ambos son de PRIMERA CLASE: mismo lifecycle
  // (estado por timestamps), mismo panel, mismo gate, mismas rondas. La ÚNICA
  // diferencia del cliente: `cliente:true` (badge "Cliente") + sin categoría.
  const correcciones: Correccion[] = [
    ...(corrRows ?? []).map((r) => ({
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
      categoria: r.categoria,
    })),
    ...(cambiosCliente ?? []).map((c) => ({
      id: c.id,
      targetTabla: c.target_tabla,
      targetFilaId: c.target_fila_id,
      targetCampo: c.target_campo,
      targetLabel: c.target_label,
      targetQuote: c.target_quote,
      targetStart: c.target_start,
      targetEnd: c.target_end,
      body: c.body,
      autor: "Cliente",
      ronda: c.ronda ?? 1,
      estado: estadoDeTimestamps(c),
      categoria: null,
      cliente: true,
    })),
  ];
  const abiertasN = correcciones.filter((c) => c.estado === "open").length;

  const cerrada = ESTADOS_CERRADOS.includes(idea.status);
  const soloLectura = cerrada && !canOverrideStatus(role);
  const esEstatico = plantilla === "estatico";
  const esEquipo = role !== "client";
  const puedeEditar = canOverrideStatus(role);
  // El panel de correcciones + los cambios del cliente viven en una COLUMNA DERECHA
  // fija, junto al documento (antes iban al fondo / arriba). Sólo se arma la rejilla
  // de 2 columnas cuando hay algo que mostrar; si no, el documento va a todo el ancho.
  const mostrarPanel = esEquipo && correcciones.length > 0;

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
    <WorkspaceProvider
      key={idea.id}
      planosIniciales={planos}
      estaticoInicial={estatico}
      verClienteInicial={puedeEditar}
    >
      {/* key por idea.id en el Workspace (provider EXTERIOR): al pasar de una tarea a
          otra con las flechas del bundle (nav client-side que sólo cambia [id]), React
          conservaría el estado y mostraría/editaría el CUERPO de la tarea anterior. El
          key fuerza un remount con el estado fresco — y como Correcciones vive DENTRO,
          sus veredictos de H.Ü.E también se resetean por tarea.
          Orden Workspace-afuera / Correcciones-adentro (Pedro 2026-08-20): así el
          provider de correcciones puede `useWorkspace()` y aplicar la sugerencia de
          H.Ü.E al campo EN MEMORIA (sin recargar). Antes, con Correcciones afuera, no
          alcanzaba el estado del documento y recargaba — borrando los demás veredictos. */}
      {/* Vista por defecto por rol: los revisores (lead/admin/master) arrancan en
          "Vista cliente" (sobre todo revisan); los especialistas en "Vista
          editor" (producen). Sigue siendo un toggle en la barra inferior. */}
      <CorreccionesProvider
        ideaId={idea.id}
        clienteSlug={cliente}
        marcaColor={marcaColor}
        esRevisor={canOverrideStatus(role)}
        esEquipo={esEquipo}
        correcciones={correcciones}
      >
        {/* Un solo flujo. Los DOS menús son PERSISTENTES (Pedro): el de arriba
            (sub-header) se queda pegado arriba TODA la página — como el de abajo
            está en el borde inferior, ya no necesita cederle el turno a mitad de
            camino. El de abajo (read-time + Vista) va al final, pegado abajo.
            Arriba pega a top-16 (debajo del topbar h-16); el fondo sangra a los
            bordes de main (-mx) para que el contenido no se asome al costado. */}
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

          <HeroTarea
            ideaId={idea.id}
            marca={marca?.name ?? null}
            logoUrl={marca?.logo_url ?? null}
            briefLabel={briefLabel}
            naming={idea.naming_base}
            status={idea.status}
            notaGuion={idea.nota_guion}
            notaPlaceholder={notaPlaceholder}
            plantilla={plantilla}
            entregaUrl={idea.entrega_url}
            soloLectura={soloLectura}
          />

          <TabsTarea
            ideaId={idea.id}
            plantilla={plantilla}
            soloLectura={soloLectura}
            detalles={{
              tipoAsset: idea.tipo_asset,
              plataformas: idea.plataformas ?? [],
              tamanos: idea.tamanos ?? [],
              duracion: idea.duracion ?? [],
              concepto: idea.concepto,
              trend: idea.trend,
            }}
            // Rünna tools SÓLO para el equipo — no se construye para el cliente
            // (no se filtra en el payload RSC, no sólo se oculta con CSS). Los Selling
            // Points viven aquí (guía interna): el cliente nunca los recibe.
            runna={
              esEquipo
                ? {
                    personas,
                    entregaUrl: idea.entrega_url,
                    filenames,
                    comentariosCreativo: idea.comentarios_creativo,
                    peloteo: idea.peloteo_raw,
                    sellingPoints: (idea.selling_points ?? []).join("\n"),
                    puedeEditar,
                    puedeAsignar: canAssign(role),
                    leadsPool,
                    especialistasPool,
                  }
                : undefined
            }
          />

          {/* Documento (izq) + panel FIJO a la derecha. La rejilla sólo se arma
              cuando hay panel; en móvil (<lg) todo se apila (aside debajo). El aside
              es sticky para seguir visible mientras se recorren los planos. */}
          <div
            className={
              mostrarPanel ? "lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5" : ""
            }
          >
            <div className="min-w-0 space-y-4">
              {plantilla === "copies" ? (
                <DocumentoCopies ideaId={idea.id} temasIniciales={temas} soloLectura={soloLectura} />
              ) : (
                <>
                  <BannerPegarGuion ideaId={idea.id} esEstatico={esEstatico} soloLectura={soloLectura} />

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
                      sugerencia: sugerenciaLegal,
                    }}
                  />
                </>
              )}
            </div>

            {mostrarPanel && (
              <div className="mt-4 lg:mt-0 lg:sticky lg:top-32">
                <PanelCorrecciones />
              </div>
            )}
          </div>

          <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-background/95 px-4 py-2 backdrop-blur md:-mx-6 md:px-6">
            <BottomBarTarea plantilla={plantilla} cortinillaS={cortinillaS} />
          </div>
        </div>
      </CorreccionesProvider>
    </WorkspaceProvider>
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
