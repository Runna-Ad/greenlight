# Observaciones de SKILLS y WORKFLOW — Greenlight

Qué falló (o funcionó) en el PROCESO, no en el código. Alimenta el ajuste de las skills.

[2026-09-01] OBSERVATION: replicable-win
CONTEXTO: la reap "invariant sweep" (Pass 0 sobre el repo ENTERO, no sobre el diff) encontró dos bugs
PREEXISTENTES que 6+ reaps por-diff no vieron, porque vivían en código sin tocar: el fork de renderers
de diálogo (client-facing) y el hueco de revalidate del portal. Formato que funcionó: 5 agentes en
paralelo, read-only, reportando hallazgos rankeados; seguridad y paridad en OPUS, el resto en Sonnet;
el main loop arregla en SERIE para no chocar ediciones.
RECOMMENDATION: en `beast-mode-dev`, hacer del "invariant sweep" el modo por defecto ANTES de cualquier
milestone/lanzamiento (no sólo cuando se pide). Y dejar escrito el patrón: agentes read-only en paralelo
+ arreglo serial.

[2026-09-01] OBSERVATION: missing-rule
CONTEXTO: dos bugs de la MISMA clase en un día (`"use server"` sólo exporta funciones async). El primero
lo cazó el build y asumí que el build cubría la clase entera; el segundo llegó a PRODUCCIÓN porque el
build sólo valida cuando el símbolo cruza a un componente CLIENTE. "Verde local" no era cobertura.
RECOMMENDATION: regla para `beast-mode-dev` — cuando una lección diga "el build/test lo caza", preguntar
EN QUÉ CONDICIONES lo caza. Si la cobertura depende de por dónde se importe/llame algo, no es cobertura:
escribe un guard determinista. (Hecho: `scripts/check-server-actions.mjs` en `npm test`.)

[2026-09-01] OBSERVATION: missing-rule
CONTEXTO: arreglé un bug de datos razonando hacia adelante desde MI cambio reciente en vez de hacia atrás
desde el síntoma. El arreglo era correcto… para un caso con CERO ocurrencias en prod. Pedro tuvo que
reportar "sigue igual". Una sola query de conteo por estado lo habría dicho en 20 segundos.
RECOMMENDATION: añadir al loop de depuración de `beast-mode-dev` un paso obligatorio ANTES de escribir el
fix: ENUMERAR la población real por estado y confirmar que el caso a arreglar existe. Y: si el usuario
dice "sigue igual", descartar la hipótesis con datos en vez de refinarla.

[2026-09-01] OBSERVATION: missing-rule
CONTEXTO: al ampliar una función para leer un campo nuevo lo declaré OPCIONAL "para no tocar a todos los
llamadores". Tres consultas se quedaron sin traerlo, el fallback las degradó en silencio y el bug lo
encontró Pedro probando. Cero errores de tipos.
RECOMMENDATION: regla — un parámetro nuevo del que depende el COMPORTAMIENTO va OBLIGATORIO (aunque
acepte null), para que el compilador enumere los call sites. Opcional-con-fallback sólo cuando el
llamador legítimamente puede no tener el dato.

[2026-09-01] OBSERVATION: replicable-win
CONTEXTO: antes de aplicar el candado RLS, saqué la anon key REAL del bundle desplegado y probé la API
REST — encontrando una fuga de datos VIVA (`board_tasks`, 2,355 bytes sin login). El "antes/después" con
la llave real convirtió un cambio teórico en una prueba.
RECOMMENDATION: para cualquier cambio de seguridad, exigir prueba ANTES/DESPUÉS ejecutada con la
credencial real del atacante, no razonamiento sobre el código. Un 200 con `[]` parece seguro y no lo es.

[2026-09-01] OBSERVATION: missing-rule (ALTA — fallo real de 6 horas)
CONTEXTO: dejé un watcher de deploy sondeando ~6 h; sólo se paró porque Pedro preguntó. La lección ya
estaba en el Brain y el hook me la mostró DOS veces en la sesión; incluso se la cité a Pedro mientras el
zombi corría. El wrap-up dio la sesión por "limpia" mirando sólo git.
RECOMMENDATION (dos cambios concretos en `beast-mode-dev`):
 1. **SESSION WRAP-UP**: añadir un paso OBLIGATORIO "enumerar y parar tareas en background" junto al de
    "revisar trabajo sin commitear". Hoy el wrap-up sólo mira git, así que un proceso vivo pasa el
    checklist sin que nadie lo vea. `ps` no vale como prueba: la fuente de verdad es el registro de
    tareas del harness (TaskStop responde si seguía viva).
 2. **Regla de watchers**: prohibido el bucle de sondeo sin tope; comprobar la condición UNA vez en
    primer plano antes de armarla; y al relanzar, parar el anterior en el MISMO bloque de tool calls.
META-OBSERVACIÓN (lo más importante): el sistema de recall FUNCIONÓ —me dio la lección exacta, dos
veces— y aun así el fallo ocurrió. Una lección que se lee y se cita pero no cambia la conducta necesita
un GUARD, no otra redacción. Es exactamente [[encode-recurring-agent-steps-as-hooks]] aplicado a mí
mismo: si el cumplimiento depende de acordarse en el momento, el cumplimiento será 0%.
