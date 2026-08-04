# Prompt para la próxima sesión — Greenlight · by Rünna

Copy everything below into a new session.

---

Continuamos **Greenlight · by Rünna** (`/Users/work/Projects/runna-command-center`) —
la app de producción de anuncios que reemplaza el Google Sheet de DiDi.

**Antes de escribir código, lee en este orden:**
1. `tasks/session-log.md` — dónde quedamos (2026-07-31)
2. `tasks/lessons.md` — **hay 5 PEDRO_OVERRIDE, respétalos**
3. `tasks/todo.md` — estado por fase
4. `/Users/work/.claude/plans/flickering-plotting-brook.md` — el plan completo

## Estado actual (todo desplegado y funcionando)

- **En vivo:** https://runna-command-center.vercel.app
- **Base de datos LIVE** — proyecto Supabase de S.P.A.M, esquema propio `produccion` (29 tablas).
  S.P.A.M no se toca nunca. `npm run check:isolation` lo garantiza.
- **Sync de Google Sheets funciona de punta a punta** vía Apps Script. Ya importó
  Brief 24/07: **32 tareas, 227 archivos**. Re-sincronizar da "0 nuevas · todo al día".
- **Tablero lee datos reales** pero NO es interactivo todavía.

## Reglas que NO se discuten (decisiones de Pedro)

- **Una TAREA = una fila del sheet.** Los tamaños × plataformas son ARCHIVOS que esa
  tarea entrega, no tareas separadas. (Ya me equivoqué en esto una vez: 32 filas
  se volvieron 227 tarjetas.)
- **Los nombres de las columnas del sheet son literales** — # Entrega, Asignación,
  Comentarios Leads, Peloteo, Marca, Plataforma, Tipo de Asset, Formato, Concepto,
  Selling Points, Referencias, Tamaño, Duración, # Idea, Versión, Género, Naming,
  Mes, Brief Name, Entrega final. No renombrar nunca.
- **El login queda apagado hasta justo antes del lanzamiento.** No insistir en
  seguridad; ya se decidió. El flag `AUTH_ENABLED` está listo.
- **Campos definidos, no parsers "inteligentes".**
- **Todo dropdown lleva opción "Otro"** de texto libre.

## Lo primero, antes que nada

**El proyecto NO tiene repo de git propio** — `git rev-parse --show-toplevel`
devuelve `/Users/work`. Todo lo construido está sin versionar. Hacer `git init`
en la carpeta del proyecto, `.gitignore` correcto (que `.env.local` quede fuera),
primer commit. Es media hora y protege semanas de trabajo.

## Trabajo pendiente, en orden

### 1. Tablero interactivo
- Asignar personas a una tarea (`idea_assignments`; los 14 nombres ya están en
  `produccion.track_members`, separados por track Real/Normal)
- Arrastrar entre estados (@dnd-kit ya instalado) con el guard de transiciones
  que ya existe en la BD
- Filtros: pod, persona, brief, plataforma

### 2. La plantilla de trabajo (ya está planeada — ver abajo)
Cuando se asigna una tarea, la persona abre **una página por tarea**:
- **Arriba, automático desde el intake**: pleca de color por plataforma, Formatos,
  Duración, Referencia, Marca, Tipo de Asset, Formato, naming + la lista de
  archivos que entrega
- **Abajo, la plantilla — CAMBIA SEGÚN "Tipo de Asset"**:
  | Tipo de Asset | Plantilla | Columnas |
  |---|---|---|
  | RP Video · Normal Video · AIGC video · GIF | Guión por planos | `ACCIÓN + COPY IN + GFX/SFX (Motion)` \| `DIÁLOGO` |
  | Images | Pieza estática | `COPY IN` \| `REFERENCIA / IMAGEN` |
  | Copies | Lista de copies | headlines numerados + descripción, con meta de cantidad |
- Read-time automático del diálogo (ya existe el trigger en la BD), comparado
  contra la Duración de la tarea
- Reglas contextuales como chips, SOLO las que aplican a esa tarea:
  GG estático → NO CTA · FB estático → WITH CTA · FB → safe zones ·
  Card → mencionar timeframes · Préstamos → no timeframes ·
  CASHBACK/MSI → `*Aplican` en TyC · ≥30s → mínimo 5 beneficios
- Legales desde la biblioteca por marca (se seleccionan, no se pegan)

**PEDRO TIENE QUE CONTESTAR 3 COSAS ANTES DE CONSTRUIR ESTO:**
1. **Copies** — ¿es una lista numerada con meta de cantidad ("15 headlines"), o
   tiene estructura propia?
2. **Estáticos** — ¿`COPY IN | REFERENCIA/IMAGEN` es toda la plantilla, o los
   diseñadores también necesitan campos de legales / ubicación del CTA?
3. **Preview** — ¿la persona asignada ve la vista tipo slide mientras trabaja, o
   sólo el lead al revisar?

### 3. Revisión + Gary
Checklist antes de enviar · revisión de gramática es-MX con Claude (marca el
texto exacto, no bloquea, se puede sobreescribir y queda registrado) ·
lead aprueba o pide cambios · V1→V2 automático

### 4. Portal del cliente + "Ver como cliente"
Ideas publicadas, Revisión / Cambios / Aprobado, hilo de comentarios.
Para admins: selector de cliente + banner permanente "vista previa" (no dar dos
roles a una cuenta).

### 5. Captura múltiple en la app
Ya hay un spec de agente + validación con datos reales: agrupando por
Marca+Formato+Tamaño+Duración, **el 76% de las tareas caen en grupos de 2+, el
mayor de 5** — o sea "base + tabla de diferencias" con columnas sólo para lo que
cambia (# Idea, Concepto, Naming, **y Asignación** — ésta varía dentro del grupo,
corrección contra el spec original). El check de nombres de archivo duplicados
NO es opcional: si Naming y # Idea se comparten, todas las tareas generan el
mismo nombre.

## Comandos

```bash
npm run dev            # puerto 3100 vía preview
npm test               # isolation + lib + db (PGlite) + sync (red en vivo)
npm run migrate        # aplica migraciones pendientes (NO usar supabase db push)
npm run check:leak URL # verifica que no se filtren secretos al HTML
```

## Trampas conocidas (ya me costaron tiempo)

- **Nunca `supabase db push`** — pide reparar el historial de S.P.A.M y lo dañaría.
  Usar `npm run migrate`.
- **Migraciones con timestamp**, nunca `0001_` — choca con las de S.P.A.M y no
  crea nada, en silencio.
- **Nunca pasar secretos como props a client components** — Next los serializa
  al HTML. Ya pasó una vez.
- El preview del navegador se va solo a `/clientes` cada cierto tiempo; verificar
  con consultas a la BD o `curl`, no sólo con screenshots.
- Los tests de red (`test:sync`) son intermitentes por naturaleza — re-correr
  antes de investigar un fallo.

## Deuda menor

- Rotar `SHEETS_SCRIPT_SECRET` (estuvo público ~4 min por el leak ya corregido)
- `src/lib/database.types.ts` es manual — regenerar cuando haya login
- `check:leak` sólo cubre 3 rutas
