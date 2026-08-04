-- Greenlight — la plantilla de trabajo: guión y estático (0012)
--
-- La pantalla donde el equipo realmente trabaja. Reemplaza un deck de Google
-- Slides que hoy llenan a mano. `planos` ya existía desde la 0001 con el
-- trigger de read-time; nunca se usó desde la app.
--
-- Copies queda FUERA de esta migración por decisión de Pedro — y además es la
-- única de las tres plantillas que no existe en el deck (ese slide sólo enlaza
-- a otra hoja), así que sería UI inventada.

-- ─────────────────────────────────────────────────────────────
-- 1. planos: la fidelidad que le faltaba al deck
-- ─────────────────────────────────────────────────────────────
-- En el deck, SFX: y GFX: son dos líneas separadas. `gfx_sfx` era una columna
-- para dos campos. Con 0 filas y ninguna referencia en src/ (sólo el espejo de
-- tipos), partirla ahora es gratis; después no.
alter table produccion.planos rename column gfx_sfx to gfx;
alter table produccion.planos add column sfx text;

-- La "Cortinilla de Cierre" es la última fila del guión y lleva los legales.
alter table produccion.planos add column es_cierre boolean not null default false;
comment on column produccion.planos.es_cierre is
  'Cortinilla de Cierre — última fila. Sus legales salen de la biblioteca vía idea_snippets.';

-- ─────────────────────────────────────────────────────────────
-- 2. estaticos: sub-campos dentro de COPY IN
-- ─────────────────────────────────────────────────────────────
-- Tabla aparte y no columnas más en `planos`: un plano tiene diálogo y
-- read-time, un estático tiene botón de CTA y no dura. No hay una columna que
-- signifique lo mismo en ambos, y meterlos juntos deja doce columnas nulas por
-- fila. Tampoco jsonb — choca con "campos definidos, no parsers inteligentes".
create table produccion.estaticos (
  id              uuid primary key default gen_random_uuid(),
  idea_id         uuid not null references produccion.ideas(id) on delete cascade,
  orden           int not null default 1,
  -- columna COPY IN, con la estructura que muestra el deck
  copy_titulo     text,        -- [Beneficio principal]
  copy_subtitulo  text,        -- [Dos o tres beneficios secundarios]
  copy_cta        text,        -- Botón CTA (ojo: GG estático NO lleva)
  legales_extra   text,        -- añadidos al legal de biblioteca, no en vez de
  -- columna REFERENCIA / IMAGEN
  referencia_url  text,
  referencia_nota text,
  notas           text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idea_id, orden)
);
create index estaticos_idea_idx on produccion.estaticos(idea_id);

alter table produccion.estaticos enable row level security;
create policy estaticos_team_read on produccion.estaticos
  for select using (produccion.is_team());
create policy estaticos_write on produccion.estaticos
  for all using (produccion.is_lead() or produccion.is_assigned(idea_id))
  with check (produccion.is_lead() or produccion.is_assigned(idea_id));
-- Mismo patrón que planos_client_read (0002): el cliente sólo ve lo publicado
-- de su propio cliente.
create policy estaticos_client_read on produccion.estaticos for select using (
  produccion.is_client_user()
  and idea_id in (
    select i.id from produccion.ideas i
    join produccion.briefs b on b.id = i.brief_id
    where i.published_at is not null and b.client_id = produccion.current_client_id()
  )
);

create trigger set_updated_at_estaticos before update on produccion.estaticos
  for each row execute function produccion.set_updated_at();

-- Grants explícitos. `alter default privileges` de la 0006 debería bastar, pero
-- un 42501 es de los tres fallos que PGlite NO puede ver (junto con la
-- resolución de nombres de PostgREST y el esquema expuesto).
grant all on produccion.estaticos to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 3. Reglas contextuales, evaluables
-- ─────────────────────────────────────────────────────────────
-- Hoy la regla de CASHBACK es prosa dentro del body de un snippet y la de
-- "+30s: 5 beneficios" está enterrada en el punto 3 de otro. Ninguna se puede
-- evaluar. Aquí son condición → mensaje, con columnas explícitas combinadas con
-- AND — nada de un lenguaje de expresiones que haya que interpretar.
create table produccion.reglas (
  id        uuid primary key default gen_random_uuid(),
  codigo    text not null unique,
  titulo    text not null,                  -- el chip, corto
  mensaje   text not null,                  -- la frase al desplegarlo
  severidad text not null default 'aviso'
            check (severidad in ('info','aviso','bloqueo')),

  scope     text not null default 'global'
            check (scope in ('global','client','marca')),
  client_id uuid references produccion.clients(id) on delete cascade,
  marca_id  uuid references produccion.marcas(id)  on delete cascade,

  -- CONDICIÓN. null o '{}' = no restringe. Todo se combina con AND.
  cond_media          text check (cond_media in ('video','static')),
  cond_tipo_group     text check (cond_tipo_group in ('video','images','copies')),
  cond_plataformas    text[] not null default '{}',  -- basta que UNA coincida
  cond_marca_slug     text,
  cond_duracion_min_s int,
  cond_texto_contiene text[] not null default '{}',  -- sin acentos, MAYÚSCULAS

  activo     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table produccion.reglas enable row level security;
create policy reglas_team_read on produccion.reglas
  for select using (produccion.is_team());
create policy reglas_lead_write on produccion.reglas
  for all using (produccion.is_lead()) with check (produccion.is_lead());
create trigger set_updated_at_reglas before update on produccion.reglas
  for each row execute function produccion.set_updated_at();
grant all on produccion.reglas to anon, authenticated, service_role;

insert into produccion.reglas
  (codigo, titulo, mensaje, severidad, scope, cond_media, cond_plataformas,
   cond_marca_slug, cond_duracion_min_s, cond_texto_contiene, sort_order)
values
  ('GG_STATIC_SIN_CTA', 'GG estático → sin CTA',
   'Los estáticos de Google no llevan botón de CTA.',
   'aviso','global','static','{GG}', null, null, '{}', 1),

  ('FB_STATIC_CON_CTA', 'FB estático → con CTA',
   'Los estáticos de Facebook sí llevan botón de CTA.',
   'aviso','global','static','{FB}', null, null, '{}', 2),

  ('FB_SAFE_ZONES', 'FB → safe zones',
   'Respetar las safe zones de Facebook: nada importante en los bordes.',
   'info','global', null,'{FB}', null, null, '{}', 3),

  ('DUR30_MIN5_BENEF', '≥30s → mínimo 5 beneficios',
   'De 20 a 30s van al menos 4 beneficios; de 30s en adelante, 5; de 40s, 6.',
   'aviso','global', null,'{}', null, 30, '{}', 4),

  ('CARD_TIMEFRAMES', 'Card → mencionar timeframes',
   'Las piezas de Card deben mencionar timeframes (TIME: 00).',
   'aviso','marca', null,'{}','card', null, '{}', 5),

  ('PREST_SIN_TIMEFRAMES', 'Préstamos → sin timeframes',
   'Préstamos NO menciona timeframes, y nunca menos de 6 quincenas.',
   'aviso','marca', null,'{}','prestamos', null, '{}', 6),

  ('CASHBACK_ASTERISCO', 'CASHBACK/MSI → *Aplican en TyC',
   'Si el texto menciona CASHBACK o MSI, poner un asterisco antes de "Aplican" (*Aplican) en los Términos y Condiciones.',
   'aviso','global', null,'{}', null, null, '{CASHBACK,MSI}', 7);

-- Las reglas de marca emparejan por `cond_marca_slug`, no por marca_id: así no
-- dependen de que las marcas existan cuando corre la migración, ni de uuids
-- fijos entre entornos. marca_id queda para reglas que alguien cree desde admin.

/**
 * Qué reglas aplican a una tarea. p_texto es lo que la persona lleva escrito,
 * para las reglas que dependen del contenido (CASHBACK/MSI).
 */
create or replace function produccion.reglas_para_tarea(
  p_idea_id uuid, p_texto text default null
) returns setof produccion.reglas
language sql stable security definer set search_path = '' as $$
  with t as (
    select i.plataformas, i.duracion, i.tipo_asset,
           produccion.tipo_group(i.tipo_asset) as grupo,
           case when produccion.tipo_group(i.tipo_asset) = 'video'
                then 'video' else 'static' end as media,
           m.slug as marca_slug,
           b.client_id,
           -- "10-40s" → 40 ; "30s" → 30 ; "-" → null
           nullif((regexp_match(coalesce(i.duracion,''), '(\d+)\s*s?\s*$'))[1], '')::int as dur_s
      from produccion.ideas i
      join produccion.briefs b on b.id = i.brief_id
      left join produccion.marcas m on m.id = i.marca_id
     where i.id = p_idea_id
  )
  select r.* from produccion.reglas r, t
   where r.activo
     and (r.scope <> 'client' or r.client_id = t.client_id)
     and (r.cond_media      is null or r.cond_media = t.media)
     and (r.cond_tipo_group is null or r.cond_tipo_group = t.grupo)
     and (cardinality(r.cond_plataformas) = 0 or r.cond_plataformas && t.plataformas)
     and (r.cond_marca_slug is null or r.cond_marca_slug = t.marca_slug)
     and (r.cond_duracion_min_s is null or coalesce(t.dur_s, 0) >= r.cond_duracion_min_s)
     and (cardinality(r.cond_texto_contiene) = 0 or exists (
            select 1 from unnest(r.cond_texto_contiene) w
             where upper(coalesce(p_texto,'')) like '%' || w || '%'))
   order by r.sort_order;
$$;

grant execute on function produccion.reglas_para_tarea(uuid, text)
  to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 4. Biblioteca: legales y selling points
-- ─────────────────────────────────────────────────────────────
-- Se reutiliza `snippets`, no tablas nuevas: ya tiene scope global/client/marca,
-- `active`, `usage_count`, y `idea_snippets` (con position y override_body) YA
-- es el registro de cuál se usó. Sólo le faltaba vigencia.
alter table produccion.snippets add column vigente_desde date;
alter table produccion.snippets add column vigente_hasta date;
-- Para que el selector muestre los claims en un orden estable y no alfabético.
alter table produccion.snippets add column sort_order int not null default 0;

comment on column produccion.snippets.vigente_hasta is
  'Los legales caducan: en el deck del cliente conviven un CAT de mayo y uno de enero, 9 slides con el viejo.';

-- La biblioteca depende de que existan el cliente y sus marcas. En producción ya
-- existen; en un entorno recién migrado todavía no. Por eso va en una función
-- IDEMPOTENTE que la migración llama al final y que las pruebas pueden volver a
-- llamar después de crear sus datos. Sembrar directo aquí ataba la migración al
-- orden de creación de los datos, que es justo lo que no debe importar.
create or replace function produccion.sembrar_biblioteca()
returns void language plpgsql security definer set search_path = '' as $fn$
begin
-- Los snippets que el seed nunca aplicó a producción, ahora bien scopeados.
  -- El legal es de MARCA (el seed lo tenía en client), porque Card y Préstamos no
  -- comparten CAT.
  insert into produccion.snippets (kind, title, body, scope, client_id, marca_id)
  select 'instruccion', 'Indicaciones para la producción',
    E'1. En los videos con personas reales, los primeros 3 segundos deben captar la atención. El primer valor añadido o el nombre del producto debe aparecer entre 3 y 5 segundos después.\n'
    || E'2. En ilustraciones, el ritmo debe ser rápido; cada valor añadido coordinado con la música.\n'
    || E'3. Duración 20–30s: al menos 4 beneficios; +30s: 5; +40s: 6.\n'
    || E'4. Combinar Real Person con efectos y transiciones dinámicas.\n'
    || E'5. Hacerlo ver orgánico.',
    'client', c.id, null
  from produccion.clients c
   where c.slug = 'didi'
     and not exists (select 1 from produccion.snippets s
                      where s.kind = 'instruccion' and s.title = 'Indicaciones para la producción');
  
  insert into produccion.snippets (kind, title, body, scope, client_id, marca_id)
  select 'legal', 'Legal CAT — Card',
    'Regigold, S.A. de C.V., CAT promedio informativo: 130.4% sin IVA. Fecha de cálculo 31 de mayo del 2026. Tasa de interés promedio ponderada anual fija del 85.27%, sin IVA. *Aplican Términos y Condiciones.',
    'marca', m.client_id, m.id
  from produccion.marcas m
   where m.slug = 'card'
     and not exists (select 1 from produccion.snippets s
                      where s.kind = 'legal' and s.title = 'Legal CAT — Card');
  
  -- Selling points: la lista de claims aprobados del deck, scopeada a Card.
  -- Se siembran VERBATIM y sin fusionar los parecidos — "Hasta 6% de CASHBACK*" y
  -- la versión sin asterisco son dos claims distintos, y esa distinción es
  -- justamente lo que hace que la cifra sea correcta. Pedro los cura desde admin.
  insert into produccion.snippets (kind, title, body, scope, client_id, marca_id, sort_order)
  select 'selling_point', left(sp.txt, 80), sp.txt, 'marca', m.client_id, m.id, sp.n
  from produccion.marcas m,
    (values
      ('Hasta 6% de CASHBACK*',1),
      ('Hasta 6% de CASHBACK* en tus compras',2),
      ('La tarjeta que te da hasta 6% de CASHBACK* diario',3),
      ('Cashback hasta $500 mensuales',4),
      ('Cashback que puedes usar para pagar tu tarjeta',5),
      ('Hasta 12 Meses Sin Intereses',6),
      ('Meses Sin Intereses en comercios seleccionados',7),
      ('Cupón de 3MSI',8),
      ('Línea de crédito hasta $60,000 m.n.',9),
      ('Sin anualidad de por vida',10),
      ('Cero anualidad de por vida',11),
      ('Solicítala en 5 minutos',12),
      ('Solicítala en minutos',13),
      ('Aprobada en menos de 10 minutos',14),
      ('Aprobada en minutos',15),
      ('Sin comprobante de ingresos',16),
      ('Sin historial crediticio',17),
      ('Sin comisiones ocultas',18),
      ('Diferir compras hasta 12 meses',19),
      ('Diferir saldo total hasta 12 meses',20),
      ('Ajusta tu límite de crédito',21),
      ('Ajustar fecha límite de pago',22),
      ('Selección de fecha de pago cada 6 meses',23),
      ('Revisa gastos por categoría en app',24),
      ('Monitoreo de transacciones en app',25),
      ('Notificaciones en tiempo real',26),
      ('Apagar/bloquear tarjeta desde la app',27),
      ('Prender/apagar tarjeta (on/off)',28),
      ('Paga sin contacto (wireless)',29),
      ('CVV dinámico para compras en línea',30),
      ('Protegemos tus datos personales',31),
      ('Creada por DiDi, respaldada por Mastercard',32),
      ('DiDi Card te la pone fácil',33)
    ) as sp(txt, n)
  where m.slug = 'card'
     and not exists (select 1 from produccion.snippets s
                      where s.kind = 'selling_point' and s.body = sp.txt);
end $fn$;

select produccion.sembrar_biblioteca();

grant execute on function produccion.sembrar_biblioteca() to service_role;

-- ─────────────────────────────────────────────────────────────
-- 5. Lo que el seed nunca llevó a producción
-- ─────────────────────────────────────────────────────────────
-- La matriz base de tamaño↔plataforma. En la base viva sólo estaban las 16
-- filas de EC y "2736 x 1260" que metió la 0003 — faltaba la matriz entera, así
-- que rpc_generate_assets habría rechazado combinaciones legítimas.
insert into produccion.size_platform_validity (media, tamano, plataforma) values
  ('video','1:1','GG'),('video','1:1','FB'),('video','1:1','TT'),
  ('video','9:16','FB'),('video','9:16','TT'),('video','9:16','GG'),
  ('video','4:5','FB'),
  ('video','16:9','GG'),
  ('static','1:1','GG'),('static','1:1','FB'),('static','1:1','TT'),
  ('static','9:16','FB'),('static','9:16','TT'),
  ('static','4:5','GG'),('static','4:5','FB'),
  ('static','1.91:1','GG'),('static','1.91:1','TT')
on conflict do nothing;

-- 1.91:1 está en los chips de FORMATOS del deck y en la matriz, pero la 0003 no
-- lo sembró en el vocabulario. Sin él, labelToCode() cae al valor crudo y vuelve
-- el bug de SPAPGGWALLET_1X110801080_...
insert into produccion.vocab_terms (set, code, label_es, sort_order, track) values
  ('tamano','1.91X1','1.91:1',6,'both')
on conflict do nothing;

-- El set `duracion` existe en el enum pero está vacío. Se siembran los buckets
-- del deck más lo que el equipo ya usa de verdad, para no perder nada.
insert into produccion.vocab_terms (set, code, label_es, sort_order, track) values
  ('duracion','15-30S','15-30s',1,'both'),
  ('duracion','30-40S','30-40s',2,'both'),
  ('duracion','40-50S','40-50s',3,'both'),
  ('duracion','50-60S','50-60s',4,'both')
on conflict do nothing;

-- ─────────────────────────────────────────────────────────────
-- 6. is_assigned() no veía las asignaciones desde la 0008
-- ─────────────────────────────────────────────────────────────
-- Sólo comparaba profile_id, pero desde la 0008 las asignaciones apuntan a
-- member_id. O sea la policy `planos_write` (is_lead() or is_assigned(...)) era
-- FALSA para todos. No se nota porque todo pasa por service-role — pero gobierna
-- justo la tabla que la plantilla de trabajo empieza a usar.
create or replace function produccion.is_assigned(p_idea_id uuid)
returns boolean language sql stable
security definer set search_path = '' as $$
  select exists (
    select 1 from produccion.idea_assignments ia
     where ia.idea_id = p_idea_id
       and (
         ia.profile_id = produccion.current_profile_id()
         or exists (
           select 1 from produccion.track_members tm
            where tm.id = ia.member_id
              and tm.profile_id = produccion.current_profile_id())
       ));
$$;

-- ─────────────────────────────────────────────────────────────
-- 7. Referencias: la tercera columna que el import tiraba en silencio
-- ─────────────────────────────────────────────────────────────
-- Igual que Asignación y Marca en la 0008: sheet-sync la lee y el import nunca
-- la guardaba. El dato sigue verbatim en staged_rows.data. La cabecera de la
-- plantilla la necesita (la caja "TREND" del deck, que el plan renombró a
-- "Referencia").
insert into produccion.references (url)
select distinct btrim(u)
  from produccion.staged_rows s,
       lateral unnest(regexp_split_to_array(coalesce(s.data->>'Referencias',''), '[\s,;]+')) u
 where btrim(u) like 'http%'
on conflict (url) do nothing;

insert into produccion.idea_references (idea_id, reference_id)
select distinct s.idea_id, r.id
  from produccion.staged_rows s,
       lateral unnest(regexp_split_to_array(coalesce(s.data->>'Referencias',''), '[\s,;]+')) u
  join produccion.references r on r.url = btrim(u)
 where s.idea_id is not null
on conflict do nothing;

-- El botón ENTREGA FINAL necesita una URL. `entrega_final` es "AGOSTO 7" — una
-- fecha en texto, no un link. Cablear el botón ahí daría un enlace roto.
alter table produccion.ideas add column entrega_url text;

-- ─────────────────────────────────────────────────────────────
-- 8. board_tasks gana client_slug
-- ─────────────────────────────────────────────────────────────
-- /mi-trabajo no lleva el cliente en la URL: sin esto, enlazar a la página de
-- tarea costaría una consulta por tarjeta.
-- create or replace (añadir columna al final) a propósito: un drop view pierde
-- los grants y deja el tablero en 500 — el fallo que arregló la 0006.
create or replace view produccion.board_tasks as
select
  i.id, i.brief_id, i.code, i.status, i.track, i.naming_base, i.concepto,
  i.tipo_asset, i.formato_code, i.duracion, i.tamanos, i.plataformas,
  i.marca_id, m.name as marca, i.pod_id, i.created_at,
  b.client_id, b.title as brief_title, b.source_tab as brief_tab,
  coalesce(f.n, 0) as file_count,
  coalesce(a.members, '[]'::jsonb) as members,
  coalesce(a.member_ids, '{}'::uuid[]) as member_ids,
  c.slug as client_slug
from produccion.ideas i
join produccion.briefs b on b.id = i.brief_id
join produccion.clients c on c.id = b.client_id
left join produccion.marcas m on m.id = i.marca_id
left join lateral (
  select count(*)::int as n from produccion.assets x where x.idea_id = i.id
) f on true
left join lateral (
  select jsonb_agg(
           jsonb_build_object('id', tm.id, 'name', tm.name, 'color', tm.color)
           order by tm.sort_order
         ) as members,
         array_agg(tm.id) as member_ids
    from produccion.idea_assignments ia
    join produccion.track_members tm on tm.id = ia.member_id
   where ia.idea_id = i.id
) a on true;

grant select on produccion.board_tasks to anon, authenticated, service_role;
