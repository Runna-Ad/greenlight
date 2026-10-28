# Greenlight · by Rünna — Build Todo

## 🔨 2026-10-09 — Prisma › Formatos v2 (rama `prisma`, SIN fusionar main todavía — Pedro: "don't merge yet")
Pedro trae una lista real de un cliente: 9:16 (1080×1920), 1200×627, 320×250, 320×50, 1280×720, 600×500, 876×324,
768×1024, 720×1600, 720×1280, 640×100, 4:5 (1200×1500) — varias NO estándar. Quiere rápido, exacto y lo más barato.
**Diagnóstico de v1:** "escalar parejo + rellenar" no sirve en banners extremos: en 320×50 / 640×100 el anuncio queda de
50×50 / 100×100 (16 % de cobertura) y 876×324 queda en 37 %; además 1 llamada de IA POR TAMAÑO (~$0.60-0.80 por anuncio
con Nano Banana 2) y Gemini redibuja todo el lienzo (sin máscara) → la unión puede notarse.
**Decisiones de Pedro (2026-10-09):** recortar fondo VACÍO está OK (lo intocable = texto, logo, producto, caras, sin
deformar) · REACOMODAR las piezas del anuncio está OK (banners) · los anuncios vienen sobre todo de **Photoshop (PSD)** y
de herramientas de IA (planos) · IA = Nano Banana 2.1.
**Pedro (2026-10-13):** "the assets are always psd files" → los anuncios llegan SIEMPRE en PSD. **Eligió la opción B
("go with B"):** la puerta PSD va PRIMERO (antes del análisis con visión, 3d), con caída a la vía plana cuando el
archivo usa algo que no sabemos redibujar. Regla del día: nada que toque lo vivo (ni fusión a main, ni la base
compartida, ni deploy) hasta que Pedro diga; todo se prueba en este Mac.

**Pedro (2026-10-13, tras ver `con-capas/`):** "the subfolder con capas options look really good" → seguir con B.
**Regla del LEGAL (Pedro, textual):** "legal text should get resized to the most readable size without disturbing the
asset and if it still too small flag it for review" → el LEGAL lleva su PROPIA escala (lo más grande que quepa sin
mover lo demás) y, si aun así queda chico, la medida se marca "revisar". Falta el número de "chico" (propuesta: alto de
mayúscula < 7 px) → confirmar con diseño.
**La guía del equipo** (Pedro la compartió; resumen en la memoria `didi-art-iterations-guide`): carpetas EXACTAS BRAND /
TITULO / SUBTITULO / CTA / HERO / FOOTER / BACKGROUND (en el archivo real cambian mayúsculas → comparar sin mayúsculas ni
acentos, nombre COMPLETO, no "contiene"). El equipo YA adapta con un script de Photoshop (`DiDi_Adaptations_V3.jsx`) y
su bitácora del caso Giant Card (el MISMO PSD de la prueba) reporta: horizontales rehechas casi por completo a mano,
logo / tiendas / legal desproporcionados en chicos (320x50), artes descentrados o fuera del lienzo. Su checklist de
revisión (sección 4) = nuestras comprobaciones automáticas. No trae números de safe zones ni de texto mínimo. En este
Mac NO hay Photoshop. Pendiente de Pedro: el archivo del script (sólo para leerlo), safe zones por medida, y si en el
nombre de entrega cambia también la plataforma (`_FB_` en las mesas vs `_EC_` en el ejemplo de 320x50).

**El script del equipo, leído (2026-10-13, `DiDi_Adaptations_V3.jsx`, 381 líneas, sólo lectura; es un PILOTO atado
a este anuncio):**
- Sus 12 medidas SON nuestras 12. Por medida dice de qué mesa sale (9x16 → 1080×1920, 720×1280, 720×1600; 4x5 → el
  resto) y su "familia": clone · portrait · tall · landscape · landscapeCompact · wide · display · banner. Coincide con
  nuestra regla "la mesa de forma más parecida".
- Acomodo por familia = centro (cx, cy) y ANCHO de cada carpeta como fracción del lienzo; el fondo, a cubrir.
  Intención del equipo: horizontales = texto a la IZQUIERDA y HERO a la DERECHA, pie abajo a todo lo ancho; "wide" =
  tres zonas (texto · beneficios · hero); "banner" = una sola fila; todas las adaptadas llevan `review: true`.
- Por qué dio los problemas de su bitácora (mi lectura del código): (1) mide sólo el ANCHO, nunca el alto → en
  640×100 el HERO sale de ~131 px de alto en un lienzo de 100 y el pie de ~47; (2) usa los límites de la CARPETA
  (con sombras y con capas más grandes que la mesa) → centra mal ("no detectó el centro del arte"); (3) coordenadas
  fijas afinadas a ojo para ESTE anuncio; (4) no revisa choques ni tamaño de letra.
- Nombre de salida: cambia `_4x5_` / `_9x16_` por `_ANCHOxALTO_` en el nombre de la mesa; la plataforma (`_FB_`) NO
  cambia. El `_EC_` del ejemplo de la guía sigue sin explicación → pregunta a Pedro.
**Las 12 medidas desde las piezas (laboratorio `psd-armar.mjs`, usa `psd.ts` de la app):** salida en
`~/Desktop/formatos-salida/12-medidas/` con el nombre del equipo. Familias propias por proporción: igual (misma
forma que una mesa: mismo acomodo a escala) · display · horizontal · ancho · banner; cada pieza se ajusta por ancho
Y alto de su parte sólida; el fondo cubre y conserva el piso bajo el HERO; el pie crece hasta donde quepa (regla del
LEGAL). Revisión automática: nada fuera del lienzo, nada encimado, LEGAL < 7 px de alto de letra → "revisar".
Resultado: 8 sin avisos; 4 marcadas por LEGAL chico (600×500 ≈6.2 px, 640×100 ≈3.5, 320×250 ≈3.3, 320×50 ≈1.7).
El alto de letra del legal es una APROXIMACIÓN del laboratorio (9 px en el maestro): en la app sale del texto real.
RESUELTO (Pedro, 2026-10-13): HERO a la DERECHA como el script del equipo, con volteo de un clic. Las cifras de
letra de arriba eran la aproximación del laboratorio; las reales (del texto del PSD) están en B3.

**Pedro (2026-10-13, respuestas a las preguntas abiertas):**
- NOMBRE de entrega (FB / EC / GG por medida): **ESTACIONADO por Pedro** ("dont worry about the long name will fix
  that later is not really important right now"). No volver a preguntarlo ni invertir en ello hasta que él lo traiga.
  `nombreSalida` se queda como está (cambia sólo la medida).
- ZONAS SEGURAS, respuesta del equipo (textual): "solo en las 4:5, 1:1, 9:16 y 16:9.. a menos q sean escalas directas
  d ellas, no hay nada especifico mas q reglas d buen uso que hay online para tamanos de FB, IG, etc".
  Lo que significa: sólo importan en esas 4 formas (y sus escalas directas); el equipo NO tiene números propios.
  - **Medido (scratchpad `zonas-medir.mjs`):** de las 12 medidas caen en la regla 4: 1080×1920 y 720×1280 (9:16),
    1200×1500 (4:5), 1280×720 (16:9). Ninguna es 1:1. Las 3 primeras conservan el acomodo del diseñador (no se
    mueve nada); sólo 1280×720 la acomoda la herramienta.
  - **Medido:** el maestro 9:16 del propio equipo NO cumple ni la regla más suave: BRAND empieza al 10.5 % del alto
    (regla: 14-15 % libre arriba) y el FOOTER termina al 19.0 % del borde de abajo (regla: 20 % libre). Con la de
    Reels (14 / 35 / 6 %) quedan dentro FOOTER, HERO, CTA y BRAND. Un chequeo estricto marcaría SU original siempre.
  - **Las reglas "que hay online" no coinciden entre sí y no hallé una página oficial** (ver research.md 2026-10-13).
    Lo más citado, 9:16 de Meta: 14 % arriba; abajo 20 % (Stories) o 35 % (Reels); 6 % a los lados. La app ya usa
    15 % / 20 % para historias (`compilers/zonas.ts`). Feed 4:5 y 1:1: la plataforma no tapa la imagen; sólo
    márgenes de buen uso. 16:9: sin número oficial hallado.
  - **DECIDIDO por Pedro (2026-10-13): opción B**, "go with B and build the screen". La zona segura es una GUÍA que
    se prende en la vista de los 9:16 (15 % arriba, 20 % abajo: la misma regla de los prompts, una sola constante en
    `compilers/zonas.ts`). No va en la descarga y nunca marca lo que colocó el diseñador. Hoy la herramienta no
    acomoda verticales por su cuenta, así que la guía no mueve nada; el día que exista una familia vertical, ahí manda.
- Siguen abiertas: letra mínima aceptable del legal (hoy 10 px provisional) · 3-5 PSD más.

### Plan B — puerta PSD (2026-10-13)
**Next Step (2026-10-15):** B15 (editor + botón IA) y B16 (contraste: los dos, la plataforma elige) en la preview.
Pedro prueba. Colchón: Pedro eligió que diseño lo arregle a mano → B18 (PSD por medida). Falta que un diseñador abra los 2 PSD de prueba (Escritorio › formatos-prueba › psd-prueba) y diga si Photoshop acepta los objetos inteligentes.
B19 (rediseño de la página): opción A en la preview; Pedro la probó ("overall looking way better") y pidió 3 arreglos (vista grande, contraste en medida editada, editor a la forma de la medida): hechos el 2026-10-15, falta que los pruebe.
Reels se queda sin zoom (Pedro: "yes leave reels as it is").
**Antes:** B9 (Google + exclusivas + selector de cliente) construido; falta cerrar la revisión y
subir. La prueba de punta a punta de tipografías espera el "ship it" de 0079 + bucket. 320×50 se queda igual
(Pedro). Después: que pruebe la preview con su PSD y las DiDi; B4.
**Antes (Pedro, 2026-10-13, al ver la pantalla):** (1) que las medidas CHICAS no pierdan calidad: nítidas y
legibles ("they need to be crisp and high quality in order to have them legible"): proponerle 2-3 caminos y que
elija · (2) la guía de zona segura debe decir de QUÉ app: un selector de canal ("if you want to check safe zones
select a Channel and then it shows you") en vez de un genérico "la app tapa aquí" · (3) qué hacer con un PSD muy
grande. Después: B4 y una familia propia para verticales altos (720×1600) y para 1:1.
**Propuesto a Pedro 2026-10-13 (espera su elección; nada construido):** nitidez → A filtro más fino al reducir · B dar más lugar al texto en
las 3 medidas chicas (quitar piezas por prioridad hasta que la letra llegue al mínimo) · C redibujar el texto vivo con la tipografía DiDi
(pide los archivos de la fuente). Recomendado: B + A; C después. Medición en `tasks/research.md` (2026-10-13). Zona segura → selector de canal,
sin canal por defecto, con cifras marcadas "aprox." hasta confirmarlas. PSD muy grande → dejar el rechazo de hoy con un mensaje que diga qué
hacer; elegir mesas sólo si aparece un caso real. Preview de Vercel del commit 9a9f901: `success` (estado de GitHub, 2026-10-13).
Que Pedro pruebe la pantalla en la preview (HÜE Prisma › carta "Adaptar a formatos") con su PSD y con 3-5 más.
Esperando de Pedro: letra mínima aceptable del legal (hoy `LETRA_MIN_PX = 10`, provisional) · más PSD. El nombre
largo: estacionado por él.
- [x] B0. Laboratorio FUERA del repo, guardado en `~/Projects/greenlight-psd-lab/` (`psd-leer.mjs` lector ·
      `psd-mesas.mjs` informe por mesa + resizer de hoy · `psd-piezas.mjs` piezas + acomodo horizontal ·
      `psd-correr.mjs` y `hacer-psd-falso.mjs` ensayo con PSD inventados). Trae su propio `ag-psd`; usa `sharp` y el
      motor de Formatos de este repo por ruta absoluta.
      Probado con 2 PSD inventados: lee capas y grupos, ignora las ocultas, mide la FIDELIDAD (nuestro pintado simple
      vs la copia aplanada que guarda Photoshop: 0.00 % distinto en el limpio, 1.48 % en el que trae una sombra que no
      redibujamos → cae a la vía plana), separa fondo / piezas y arma "fondo aparte" en las 12 medidas.
- [~] B1. Leer los PSD REALES con el laboratorio. **1 de N leído (2026-10-13): `APGIANTCARDUGC 2.psd`** (DiDi Card,
      72 MB, RGB 8 bits, CON copia aplanada). Salida en `~/Desktop/formatos-salida/` (`psd-mesas.mjs`). Hallazgos:
      - **Dos mesas de trabajo en un archivo**: 9:16 (1080×1920) y 4:5 (1200×1500), hechas a mano por el diseñador
        (en 9:16 el CTA baja y el logo se recorre: ya "reacomodan"). → partir por mesa y, para cada medida, salir de
        la mesa de forma más parecida.
      - **7 grupos con nombre por mesa** (31 capas c/u): Background · HERO · TITULO (EYEBROW, HEADLINE) · Subtitulo
        (BENEFIT_01/02) · CTA · BRAND · FOOTER (APP STORES, LEGAL). Los grupos YA dicen qué es cada pieza.
        PREGUNTA A PEDRO: ¿todo el equipo arma así los archivos (misma plantilla)?
      - **El pintado simple NO alcanza**: 31-32 % de píxeles distintos a Photoshop. Por pieza (9:16 / 4:5): BRAND
        0.0/0.0 · CTA 3.4/3.8 · Background 4.7/11.6 · TITULO 6.0/5.1 · Subtitulo 23.3/23.0 · FOOTER 46.5/45.3 ·
        HERO 79.2/83.8. Causas: capas de ajuste con recorte (levels, hue/saturation, black & white), modos de
        fusión (multiply, darken, linear burn, lighter color, vivid light), efecto solidFill (color overlay) y
        objetos inteligentes. FORMAS y POSICIONES sí coinciden; lo que falla es el COLOR.
      - **Resizer de hoy sobre el anuncio real** (vista previa, juicio mío): bien en 7 medidas (1080×1920,
        1200×1500, 768×1024, 720×1280, 720×1600, 600×500, 320×250); MAL en las 5 horizontales (1200×627, 1280×720,
        876×324: anuncio chico con franjas estiradas a los lados; 320×50 y 640×100: diminuto).
      - **Ajuste al diseño de B:** las capas dan DÓNDE está cada pieza y su SILUETA (alfa); el COLOR sale de la copia
        aplanada de Photoshop (fiel por construcción; en los bordes se "des-mezcla" contra el fondo limpio). Lo único
        que hay que pintar nosotros es el FONDO LIMPIO (grupo Background: 3 modos de fusión + hue/saturation) y se
        comprueba contra la copia aplanada donde ninguna pieza lo tapa. Sombras (linear burn / darken) = capa
        multiplicativa que se vuelve a aplicar. Falta PROBARLO en este archivo antes de escribir B2.
      Faltan más PSD (otros diseñadores / otros clientes) antes de fijar reglas: un archivo no es una plantilla.
      - **PROBADO el mismo día (`psd-piezas.mjs`, laboratorio):** con multiply / darken / linear burn / lighter color /
        vivid light pintados, nuestro fondo difiere de Photoshop en 1.8 % (4:5) y 0.8 % (9:16) de lo visible ANTES
        de corregir; el resto se corrige con un relleno suave ("push-pull") de la diferencia. Autoprueba (rearmar
        las piezas en su lugar): **0.69 % (4:5) y 0.04 % (9:16)** de píxeles distintos, contra 31-32 % del pintado
        simple. Ninguna pieza tapa a otra en este archivo (0.0 %). Con un acomodo de 2 columnas (HERO a la
        izquierda; BRAND, TITULO, Subtitulo, CTA, FOOTER en columna) salieron 1200×627, 876×324 y 1280×720 limpios
        (en `~/Desktop/formatos-salida/con-capas/`). Sin IA, $0.
      - Pendientes que la prueba dejó a la vista: (1) en 876×324 el LEGAL queda ilegible (~5 px): hace falta regla
        de tamaño mínimo de texto / qué hacer con el legal en medidas chicas → decide Pedro; (2) los roles se
        sacaron del NOMBRE del grupo y `/titul/` agarró "Subtitulo" antes que "TITULO" (anclar los patrones; mejor
        un mapa de nombres confirmado por Pedro); (3) máscaras de capa ignoradas (aquí no afectó); (4) piezas que se
        tapan entre sí: sin resolver (aquí no hubo); (5) banners 320×50 / 640×100: otro acomodo (una fila, sin HERO
        o con HERO recortado) → decidir qué piezas entran.
- [x] B2. `src/lib/prisma/formatos/psd.ts` (puro: sin sharp ni DOM; Node, navegador y Web Worker). HECHO 2026-10-13,
      SIN commit: `leerPsd` (estructura primero con `useRawData`, límites, píxeles por capa a pedido, mesas de
      trabajo, máscaras de capa, halos de efectos) · `rolDe` (nombre COMPLETO de la guía, sin mayúsculas ni acentos)
      · `despiezar` (fondo limpio + piezas resueltas de ABAJO hacia ARRIBA contra lo ya armado, color del aplanado,
      sombras como mapa multiplicativo) · `rearmar` · `despieceUsable` (rearmado ≤ 2 %, fondo ≤ 10 % de textura que
      no coincide, pieza tapada u oscurecida ≤ 2 %) · `ErrorPsd` con motivo → vía plana.
      **Dependencia nueva: `ag-psd` ^31.0.3** (package.json + lock). 16 modos de fusión por canal + lighter/darker color.
      **Reap (2026-10-13):** code-reviewer (sonnet) + security-reviewer (opus), los dos sólo leyendo.
      - Reproducidos con PSD sintéticos ANTES de arreglar y ahora con test: sombra paralela que dejaba fantasma en el
        fondo (dif. 92 → 0) · velo de una pieza de arriba que se aplicaba dos veces sobre una de abajo (51 → 0) ·
        tinte que se perdía bajo una pieza grande (23 → 6) · fondo negro que volvía la sombra negro sólido.
      - Arreglados sin reproducir (por lectura, baratos): 4º canal del aplanado ignorado · errores de decodificación
        → `ErrorPsd` · mesa con coordenadas no enteras · Relleno de capa.
      - Seguridad (archivo ajeno; se lee en el navegador de quien lo sube): tope de bytes (250 MB), de ÁREA de
        lienzo (60 MP) y de capa/máscara (48 MP), de piezas (40) y de memoria del despiece (1.5 GB) ANTES de
        reservar · canales en ZIP rechazados (el PSD real sólo trae crudo y RLE) · PSB rechazado por cabecera ·
        `totalMemoryLimit` 64 MB al leer · nombres del archivo sin caracteres de control/dirección y ≤ 120 ·
        copia de la entrada si es una vista parcial de su búfer.
      - Hallado al correr el PSD real tras la reescritura: la sombra del HERO es un rectángulo OPACO blanco →
        "tapaba" 90 % del FOOTER; ahora la fuerza de sombra = alfa × lejanía del blanco, y sólo cuenta si se nota.
      - **Segunda pasada de los MISMOS dos revisores (sobre el código arreglado):** botón al 0 % de Relleno con
        contorno interior desaparecía (ahora la silueta es la forma completa cuando hay efectos, con aviso) · los
        halos se sellaban con fuerza 1 y una sombra tenue del titular "tapaba" al HERO (ahora fuerza = opacidad del
        efecto; el resplandor sólo aparta su zona; cada píxel cuenta una vez) · máscara "ocultar todo" sin pintar ·
        umbral de lo visible igual al de lo medido (multiplicar casi blanco ya no da sin-fondo) · capa estacionada
        fuera de la mesa cuya sombra entra · halos: a lo más uno por tipo y la capa se decodifica una vez ·
        presupuesto de memoria cuenta 15 bytes por pieza (tope 2 GB) · tamaño revisado ANTES de copiar la entrada.
        Los 4 tests nuevos de esta pasada se vieron FALLAR quitando cada arreglo (mutación) y pasar al restaurarlo.
      Tests: `scripts/test-formatos.mjs` **104/0** (antes 67). `npm test` completo: lib 481/0 · prisma 975/0 ·
      formatos 104/0 · db 543/0 · import 81/0 · sync 44/0. tsc y eslint limpios. PSD real: fondo 0.00 % y rearmado
      0.03 % en las DOS mesas (antes 0.70 % en 4:5), las dos usables, ~0.4 s por mesa.
      **B2 queda cerrado en código; SIN commit.** Los arreglos de la segunda pasada NO pasaron por un tercer
      revisor (tope de 3 vueltas; el archivo se vuelve a revisar cuando se conecte a la pantalla, B5).
      **Deuda anotada (no bloquea):** búferes de alfa/sombra por pieza recortados a su caja (hoy miden la mesa
      entera; lo acota el tope de memoria) · validar las tablas RLE antes de decodificar · resplandor exterior no
      viaja (se avisa) · contorno grueso en formas redondas: la silueta se engorda en CUADRADO (se pasa ~0.4×radio
      en las diagonales; con contornos de 1-4 px no se nota) · `npm audit --omit=dev`: 6 avisos previos (next, nodemailer, source-map-js, sprintf-js vía
      mammoth), ninguno de ag-psd visto en la salida.
      **Requisitos que B5 hereda:** leer el PSD SIEMPRE en un Web Worker con reloj que lo mate (un archivo hecho con
      mala intención aún puede colgar a la librería dentro de `leerPsd`); revisar `File.size` antes de leerlo;
      pintar avisos, motivos y nombres como TEXTO, nunca HTML; lo que acabe en nombre de archivo pasa por
      `limpiarNombre` (geometria.ts).
- [x] B3. Acomodo en la app. HECHO 2026-10-13 (la lógica aquí; pintado en la pantalla en B5).
      `src/lib/prisma/formatos/acomodo.ts` (puro: sólo cajas y números): `elegirMaestro` (la mesa de forma más
      parecida) · `familiaDe` (igual / display / horizontal / ancho / banner) · `acomodar(maestro, W, H, { heroLado,
      zona })` · `sePuedeVoltear` · `nombreSalida` (cambia `_4x5_` por `_1200x627_`).
      - **Decisión de Pedro (2026-10-13): opción B = HERO a la DERECHA por omisión (como el script del equipo) + un
        volteo de un clic a la izquierda.** `heroLado: "izquierda"` da el espejo exacto (probado).
      - Cada pieza se ajusta por ancho Y alto de su parte sólida (el script del equipo sólo miraba el ancho).
      - Regla del legal (Pedro): con la forma del maestro, el pie recupera lo que la reducción le quitó (crece sobre
        su borde de abajo hasta el ancho útil o la pieza de arriba) y NUNCA queda más grande de como lo dejó el
        diseñador; a la medida del maestro no se mueve nada. En los acomodos nuevos el pie lleva su propia escala
        (tope 1.15× y una franja del alto). Si la letra queda < `LETRA_MIN_PX`, aviso "letra".
      - La letra real sale del PSD: `psd.ts` ahora da `letraPx` por capa de texto y `letraMinPx` por pieza (tamaño ×
        escala de la transformación). El legal de este archivo mide 16.0 px en las dos mesas.
      - Avisos por medida (lo medible de la sección 4 de la guía): pieza sin lugar ("falta") · fuera de la medida ·
        dentro de la zona segura · dos piezas encimadas · letra chica.
      - PSD real, 12 medidas: 9 sin avisos; 320×250, 640×100 y 320×50 marcadas SÓLO por letra chica (legal 5.9 /
        6.2 / 3.1 px). Letra más chica en las demás: 10.8 px (600×500) a 18.4 px (1200×627, 1280×720).
      - **Reap (code-reviewer, sólo leyendo): 4 SERIOS, los 4 reproducidos con números ANTES de arreglar y ahora
        con test.** (1) el pie crecía ENCIMA de una pieza que tuviera al lado (sólo miraba a la de arriba): ahora cada
        tamaño se prueba contra todas las piezas · (2) una zona segura más grande que la medida daba tamaños
        NEGATIVOS: ahora se avisa y se acomoda sin ella (tope 75 % de un lado; NaN/negativos cuentan como 0) · (3) un
        legal aplanado (sin letra medible) nunca se marcaba: ahora se avisa en cuanto se reduce · (4) una medida
        vertical lejos de la forma del maestro salía con el acomodo del maestro, chico y sin aviso: ahora aviso "forma".
        De paso: caja vacía o con NaN → aviso (antes se perdía callada) · carpeta repetida → aviso propio ·
        `nombreSalida` recibe la mesa y cambia la ficha con SU forma (un nombre con promo "2x1" ya no se rompe; ve la
        medida al principio y al final) · `elegirMaestro([])` → −1 · `acomodar` rechaza Infinity.
        No tocado (dicho por el revisor, inofensivo): no se registra cuánto se corre el ancla del fondo al amarrarlo.
      - Tests: `scripts/test-formatos.mjs` **128/0** (antes 104): las 12 medidas contra el reparto del script, el
        maestro intacto, el volteo, zona segura, nombre de entrega, y 2,418 casos de maestros raros × medidas × lado
        × zona (números finitos, fondo que cubre, nada fuera, nada encimado, el pie no crece sobre nadie, toda pieza
        colocada o avisada). 30 mutaciones probadas (romper el código a propósito): 29 hicieron fallar un test; la
        otra era una condición redundante y se quitó. `npm test` completo: lib 481/0 · prisma 975/0 · formatos
        128/0 · db 543/0 · import 81/0 · sync 44/0. tsc y eslint limpios.
        Los arreglos de la revisión NO pasaron por un segundo revisor; el archivo se vuelve a revisar en B5.
      - El laboratorio (`~/Projects/greenlight-psd-lab/psd-armar.mjs`) ya sólo PINTA: lee y acomoda con el código de
        la app. Salida para Pedro: `~/Desktop/formatos-salida/12-medidas/index.html` (12 medidas + sección "El
        volteo" con las 5 que se pueden voltear). Miradas una por una antes de enseñarlas.
      - Limitaciones a la vista: 720×1600 conserva el acomodo del 9:16 centrado (queda aire arriba y abajo; el
        script del equipo tiene una familia "tall" aparte) · una medida vertical lejos de la forma del maestro cae
        en "igual" sin acomodo propio · un solo PSD real probado · la zona segura es opcional y nadie la manda aún.
- [ ] B4. Banners delgados (320×50, 640×100): la fila ya existe (marca · título · beneficios · hero · botón + pie)
      y no se enciman, pero la letra queda chica y se marca. Falta decidir CON EL EQUIPO qué piezas se quedan fuera
      en esas medidas (¿legal en una línea aparte?, ¿sin beneficios?) y partir el FOOTER en LEGAL / APP STORES.
- [x] B5. La pantalla de la puerta PSD. HECHA 2026-10-13 (Pedro: "go with B and build the screen, also remember to
      add the resizing card here as well"). Alternativas descartadas: meterla en la pantalla de imagen plana (esa
      necesita la 0078, estacionada) · leer el PSD en el servidor (Vercel corta los cuerpos a 4.5 MB; el PSD pesa 72).
      - Ruta nueva `/prisma/formatos/psd` (`app/(app)/prisma/formatos/psd/page.tsx`): sólo el gate de HÜE Prisma (flag
        de Prisma + rol). NO usa el interruptor de Formatos: no toca la base ni cuesta, todo pasa en el navegador.
      - `components/prisma/formatos/psd.worker.ts`: Web Worker que lee y despieza; la página lo mata a los 120 s.
        Una mesa que falla no tumba a las demás; si todas fallan por lo mismo, ese es el mensaje (p. ej. "guárdalo
        con Maximizar compatibilidad").
      - `lib/prisma/formatos/listo.ts` (puro, sin `ag-psd`): lo que cruza del worker a la página + topes. La página
        sólo importa TIPOS de `psd.ts`, así la librería vive en el worker.
      - `components/prisma/formatos/pintar.ts`: pinta cada medida en un <canvas> (fondo que llena, piezas de abajo
        hacia arriba, sombras en "multiplicar", reducción por mitades).
      - `components/prisma/formatos/formatos-psd.tsx`: soltar el PSD · una tarjeta por medida con su vista, "Voltear"
        donde hay columnas, "Voltear todas", guía de zona segura en 9:16, avisos, PNG por medida y ZIP · pegar la
        lista del cliente (arranca con las 12 del equipo, tope 30).
      - `acomodo.ts`: `MEDIDAS_EQUIPO`, `zonaGuia`, `acomodarMedida` · `geometria.ts`: `limpiarNombre(base, max)` (el
        nombre de entrega del equipo pasa de 50) · `compilers/zonas.ts`: `ZONA_HISTORIA_PCT`.
      - **La carta en el inicio de Prisma:** cuarta carta "Adaptar a formatos" junto a las tres (4 en fila cuando la
        columna da, 2 × 2 si no). Sustituye a la fila ancha que dependía del interruptor de Formatos.
      - **Probado en el navegador (localhost, PSD real de 72 MB):** 12 medidas en ~0.9 s · mismas 3 marcadas que el
        laboratorio · píxeles contra los PNG del laboratorio: idénticos a la medida de la mesa (dif. media 0.01),
        0.5-3.2 niveles en las demás por el remuestreo (≤ 2.75 % de píxeles a más de 24 niveles) · "Voltear" con un
        clic real pasa el HERO de lado · PNG y ZIP (12 entradas) con el nombre del equipo, interceptados sin guardar
        archivo · archivo que no es PSD y PSD sin BACKGROUND dan su mensaje · un nombre de archivo con `<script>` sale
        como texto · 375 px sin scroll horizontal · consola sin errores.
      - **Reap (3 revisores en paralelo, sólo leyendo: salud + rendimiento, seguridad [opus], accesibilidad + UI).**
        Ningún CRÍTICO. SERIOS arreglados, cada uno comprobado después en el navegador:
        · dos archivos casi a la vez arrancaban dos lectores y el viejo podía pisar al nuevo → cada lectura toma un
          turno, el cuadro se cierra antes del primer `await`, y sólo el worker vigente puede cerrar la lectura
        · si el worker no arrancaba, el reloj giraba para siempre → try/catch + `onmessageerror`
        · el ZIP podía salir con menos archivos y decir "listo" → todas las fotos se toman en el mismo instante y, si
          falta una, no se entrega · nombres repetidos en el ZIP ya no se pisan
        · una vista que no se podía pintar quedaba en blanco con palomita → se avisa en su tarjeta y no va al ZIP
        · (seguridad) un PSD hecho a propósito podía pasarle >1 GB de píxeles a la página → tope de mesas (24) y de
          bytes que cruzan (600 MB) en el worker, tope de píxeles de la lista de medidas (80 MP), y el worker se
          suelta ANTES de armar los lienzos. Confirmado seguro: nada sale del navegador, los nombres y textos del
          archivo se pintan como texto, el gate es el de HÜE Prisma.
        · (accesibilidad) `lang` en la pantalla y en los textos del motor · el foco vuelve al cuadro al cambiar de
          PSD, cancelar o fallar · "Voltear" es una acción (sin `aria-pressed`), dice de qué lado quedó y se anuncia
          · la lista pegada se anuncia · las notas del archivo cuentan en el resumen y tienen título
        También: soltar el PSD en cualquier parte de la página (antes, fuera del cuadro, el navegador se lo llevaba) ·
        botón "Cancelar" mientras lee · "Voltear todas" voltea cada una · insignia "Revisar" junto a la medida ·
        avisos en ámbar y con letra normal · el panel ya no se mete bajo la barra de arriba (también en la pantalla de
        imagen plana) · textos más claros · la carta usa un color propio (verde; el cian es de "Crear video").
        NO hecho (anotado, no bloquea): exportar JPG además de PNG (decisión de producto: los banners de Google
        tienen tope de peso) · repetir el botón del ZIP al final en el teléfono · mandar una mesa por mensaje para
        bajar el pico de memoria · hook `useLectorPsd` · contraste del borde del textarea (token global `--input`)
        · anillos de foco que recorta `.prisma-root{overflow-x:clip}` (sin confirmar). Los arreglos del reap NO
        pasaron por una segunda ronda de revisores: se comprobaron uno por uno en el navegador.
      - Tests `scripts/test-formatos.mjs` **146/0** (antes 128). 15 mutaciones nuevas, las 15 atrapadas. `npm test`
        completo: lib 481/0 · prisma 975/0 · formatos 146/0 · db 543/0 · import 81/0 · sync 44/0. tsc, eslint y
        `npm run build` limpios (la ruta `/prisma/formatos/psd` sale en el build).
      - Limitaciones a la vista: los avisos del motor salen sólo en español aunque la pantalla esté en inglés · 1:1
        desde un 4:5 conserva el acomodo del diseñador con aire a los lados · 720×1600 igual, con aire arriba y abajo
        · no hay "ver grande" (la descarga es el tamaño real) · un solo PSD real probado.
- [x] B6. Lo que Pedro pidió al ver B5 (2026-10-14): "do A, B and C" (nitidez) · zona segura por canal con sus cifras
      de TikTok · "A and B now" (PSD grandes). Commits f594f52 · 1fcd249 · f8b9655 · e99b44b (rama `prisma`).
      - **Zona segura por canal** (`acomodo.ts` `CANALES`, `zonaCanal`): selector, sin canal por defecto; IG/FB
        Stories y Reels "aprox."; TikTok con las cifras de Pedro (arriba 200, derecha 120, abajo 300 de 1080×1920).
      - **PSD grandes A+B**: mensajes "Qué hacer" · `adelgazar.ts` quita lo que no se usa antes de leer (PSD real
        71.8 → 21.8 MB, mismo despiece) · elegir mesas cuando hay más de 4 · una mesa enorme se lee reducida.
      - **Nitidez A** (`nitido.ts`): filtro propio Lanczos-3, igual en todo navegador; identidad exacta; 12 medidas
        en ~0.9 s. **B** (`acomodo.ts`): en medidas chicas se quita el legal y luego el subtítulo y el texto gana
        lugar; 320×50 sigue con el título a 6.9 px (marcado).
      - **Nitidez C** (`textos.ts`, `escritura.ts`, `textosDe` en `psd.ts`): con las tipografías soltadas, cada texto
        se prueba contra Photoshop y sólo si coincide se vuelve a escribir. PSD real: 10 de 12. El legal (16 px) da
        0.218 contra el tope 0.20 en su lugar exacto (el navegador dibuja la letra 10-14 % más gruesa que Photoshop)
        y se queda como imagen; NO se aflojó la prueba para que pase. Medido: en las medidas chicas C sale casi
        igual de nítido que A (de +6 % a -15 % en salto de borde): A ya hacía el trabajo. Donde C ganaría es al
        AGRANDAR texto, y en este PSD sólo el legal se agranda (×1.15 en 1280×720 y 1200×627).
      - Tests formatos 213/0; 20 mutaciones de C, las 20 atrapadas (4 se escapaban al principio: se cerraron).
        `npm test` completo verde, tsc, eslint y build limpios. Navegador: carga limpia 0 errores, voltear y ZIP (12).
      - Limitaciones: cursivas de la variable no se cargan · texto con efectos, fusión, máscara o capa encima va
        como imagen · tipografías recordadas sólo en ese navegador · 320×50 título 6.9 px.
      - **Reap (5 revisores en paralelo, sólo leyendo; 2026-10-14).** Ningún CRÍTICO. Arreglados y comprobados en el
        navegador (carga limpia, 0 errores): soltar un .zip/.woff2 con resultados ya no los borra (aviso) · el foco
        va a "Cancelar" tras "Leer las marcadas" y a "Agregar" tras "Olvidar" · aviso "Sin legal en N medidas" junto
        al ZIP · el ZIP espera a que se pinten todas las vistas (antes: "faltaron 12" si se pulsaba pronto) · la
        prueba de textos salió del pintado (si falla no tumba la pantalla) y cuenta bien: un texto que pasó en una
        pieza que va como imagen ya no cuenta como escrito · margen alrededor de la tinta (una palabra que salta de
        línea ya no pasa) · tipografías: topes ANTES de leer (20 MB c/u, 200, 200 MB total), registro por pestaña
        (volver a la pantalla no carga otra copia; "Olvidar" las saca de verdad), IndexedDB con conexión cerrada,
        transacción esperada y topes (60 archivos / 100 MB), sólo se recuerdan las que cargaron · `fuentesDe`
        blindado contra archivos hechos a propósito (tabla de 65 535 nombres: 1 ms) · texto con >64 cambios de
        estilo o tinta >4 MP va como imagen · PSB rechazado antes de recorrerlo y "ya sin los originales" sólo si es
        verdad · cifras del canal a la vista (TikTok en px de Pedro) y anuncio al elegirlo · "proporción" en vez
        de "forma" · "mesa 0 de N" · plurales de tipografías · títulos de tarjeta como encabezados · `lang` bien
        puesto · etiqueta de zona que puede bajar de línea. Tests 221/0; 8 mutaciones nuevas, todas atrapadas.
        NO hecho (anotado): reducir más las mesas enormes para pintar rápido (si luego se pega una medida mayor,
        saldría agrandada: pide decidir) · filtro en un worker · `base` sólo cuando hay tipografías · leer el final
        del PSD en menos pasos · arrastrar con resaltado en la tarjeta (se cambió el texto a "Arrastra a esta
        página") · confirmar "Olvidar" (las tipografías se vuelven a soltar; el archivo original no se toca).
- [x] B7. El legal (Pedro, 2026-10-14: "keep the legal as an image unless loosening the check would make it crispier
      and more readable, whatever makes it better"). Medido en el PSD real antes de decidir:
      - **Bug de fondo encontrado:** el legal escrito salía MUCHO más oscuro que el de Photoshop. No era el navegador:
        Photoshop mezcla el texto con lo de abajo en gamma 1.45 («Blend Text Colors Using Gamma», Ajustes de color).
        Con 1.45 se reproducen sus 6 textos a 0.2-1.5 niveles; con la mezcla normal (la nuestra) a 1.4-11. El legal
        (capa al 60 %) salía 131 donde Photoshop da 146. Arreglo: `gammaDeTexto` (psd.ts) averigua en cada PSD cuál
        de las dos usó (orillas de sus letras contra la copia aplanada; PSD real: 1.45 en las dos mesas) y `encima`
        (nitido.ts) mezcla el texto escrito igual. Afecta a TODO texto escrito: la letra oscura ya no sale más gruesa
        de lo que se veía en Photoshop.
      - **A su tamaño, píxeles de Photoshop:** pieza a menos de 2 % de su escala → no se escribe (`ESCRIBIR_LEJOS_DE_1`).
        Comprobado en el navegador con las DiDi cargadas: 1080×1920 y 1200×1500 salen idénticas, 0 píxeles distintos.
      - **El legal se escribe:** con la gamma, el legal escrito tiene el tono de Photoshop y orilla de 88 (la de
        Photoshop a su tamaño) donde la imagen da 74 al ampliarlo ×1.15 y 78-80 al reducirlo; a ×0.69 empatan (92 con
        enfoque). Para que pase, `TEXTO_DIF_MAX` 0.2 → 0.3, medido antes: con su tipografía los textos dan 0.035-0.218;
        con otro grosor de la familia, 0.392 o más (6 textos × 5 grosores × 2 mesas). PSD real: 12 de 12 se escriben.
      - Tests 228/0; 9 mutaciones, 8 atrapadas; la que se escapa (contar también píxeles llenos al medir la gamma) no
        cambia nada en este tamaño: sólo pesaría con más de 20 000 píxeles llenos antes que las orillas.
- [ ] B8. Tipografías por cliente (Pedro, 2026-10-14, eligió la opción 1: "1 and leave it"; 320×50 se queda igual).
      Se suben UNA vez en Admin › Marcas, en la tarjeta del CLIENTE (DiDi cubre Card y Préstamos); Formatos pide
      por nombre las que le faltan al PSD y las carga solo. Nadie elige nada.
      - [x] Migración 0079 `produccion.tipografias_cliente` (en B9 pasó a `produccion.tipografias`) (cliente, archivo, ruta, sha256, bytes, nombres[]),
            RLS master-only, escribe service_role · bucket PRIVADO `greenlight-tipografias` en setup-storage.mjs
            (letra con licencia: sólo el equipo con sesión la baja, por URL firmada de 10 min). SIN APLICAR.
      - [x] `lib/prisma/formatos/tipografias.ts` (puro): ¿es otf/ttf? (por sus bytes, con `fuentesDe`), nombres del
            archivo, saneo de lo que pide el navegador, cuáles archivos cubren qué nombres (tope 30 por PSD).
      - [x] Admin: subir (sólo admin, 4 MB c/u, mismo archivo dos veces = uno), lista con sus nombres, borrar con
            confirmación. Sin la migración: "falta aplicar en la base el cambio 0079", nada se rompe.
      - [x] Formatos: al leer un PSD, si faltan tipografías, las pide a Greenlight y las carga por el mismo camino
            que soltarlas; se recuerdan en el navegador. Candado = el de la página de Formatos + sesión (no `gate()`:
            ése exige ficha de equipo porque guarda filas; aquí sólo se lee). Si falla, lo dice y se pueden soltar.
      - [~] Pruebas: test-db 563/0 (19 nuevas: rutas, huella, otro cliente, tope, RLS, borrar cliente con
            tipografías bloqueado) · test-formatos 236/0 · `npm test` completo verde · navegador SIN sesión: con las
            recordadas no se pide nada (12/12); sin ellas se pide, al fallar lo dice y enseña "Faltan" (0 errores).
            Falta: Admin y Formatos CON sesión de admin (Pedro inicia sesión) y, tras "ship it" (0079 + bucket),
            subir las DiDi y ver que Formatos las trae solo.
      - [x] Revisión (seguridad opus + código/a11y sonnet, 2026-10-14). Comprobado en el proyecto: storage.objects
            NO tiene ninguna política (0 filas) → el bucket privado sólo lo lee el servidor. Arreglado: candado =
            `gate()` (exige ficha de equipo) · enlaces de 1 min · las de Greenlight NO se guardan en el navegador ·
            borrar = archivo primero, si falla se dice · cliente con tipografías no se puede borrar (restrict) ·
            "falta la tabla" sólo con 42P01/PGRST205, otro error se dice · la cuenta del tope falla cerrada ·
            Admin: subida a prueba de errores de red (no tumba la página), "Subiendo 3 de 20…", prueba con
            FontFace antes de subir, un error de "todas" se dice una vez y para, foco que sí llega, etiquetas con
            el nombre del archivo y del cliente, input oculto · Formatos: pedidos cruzados (otro PSD encima)
            ignorados, contadores de carga, `allSettled` (un archivo que falla se nombra), 20 s de tope, la nota
            del PSD anterior se borra, "Faltan" sólo cuando se resolvió el pedido.
            NO hecho (anotado): botón "Reintentar" (volver a leer el PSD lo repite) · botones de 44 px en Admin
            (igual que el resto de Marcas) · filtrar en SQL con overlaps + índice (el catálogo es chico; se cruza en
            el servidor a propósito) · borrar la caché del navegador al cerrar sesión (sólo guarda lo que la persona
            soltó). Pedro decidió (2026-10-14): se busca en TODOS los clientes ("if more than one client use the same font thats fine"); comerciales se suben igual; sin advertencias de licencia.
- [~] B9. Biblioteca de tipografías: gratuitas de Google + exclusivas por cliente (Pedro, 2026-10-14: "1, go ahead but
      also there are specific client fonts like didi pro sans can only be used by didi" y, a media obra, "for the
      client it can be a manual selector like the other sections of prisma work... select skip and go with no client").
      - [x] 0079 reescrita (SIN APLICAR): tabla `produccion.tipografias` (antes `tipografias_cliente`): `client_id` null
            = de Google; `origen` subida|google; `exclusiva` (sólo de cliente); subidas ≤ 4 MB, Google ≤ 10 MB; ruta
            `<cliente|google>/<sha256>.<ext>` atada a su dueño; la misma de Google una vez (índice parcial). Bucket a 10 MB.
      - [x] `google-fonts.ts`: carpeta por el nombre PostScript ("OpenSans-Bold" → opensans), METADATA.pb en
            ofl/apache/ufl, baja las variables o las estáticas pedidas (6 familias × 8 archivos), se queda sólo con lo
            que de verdad trae el nombre (leído de sus bytes), "no está" se recuerda 1 h. Probado contra GitHub real:
            Montserrat, Montserrat Italic, Lato, Open Sans sí; DiDi no (y no se vuelve a preguntar).
      - [x] `fuentesDe` (arreglo encontrado así): un estilo variable con nombre propio completo ya no se duplica
            ("MontserratItalic-Montserrat-ThinItalic") y cada estilo responde también al nombre de su estática
            ("OpenSans-Bold" para "OpenSansRoman-Bold"). La variable de DiDi sigue dando sus 4 nombres iguales.
      - [x] Formatos PSD: selector «Cliente» arriba ("Sin cliente" = sólo las que sirven para todos). Las exclusivas
            sólo llegan con su cliente elegido; al cambiar de cliente se sueltan y se vuelve a pedir. Lo que falta y es
            exclusivo de otro cliente se dice aparte ("es sólo para anuncios de DiDi: elige DiDi arriba").
      - [x] Admin › Marcas: casilla "Sólo para {cliente}" al subir (marcada), botón por fila "Sólo DiDi / Para todos"
            (al instante, vuelve si falla), sección "Tipografías gratuitas (Google Fonts)" con borrar.
      - [x] Pruebas: test-db 574/0 · test-formatos 254/0 · `npm test` verde · tsc/eslint limpios.
      - [x] "Ship it" (Pedro, 2026-10-14): 0079 APLICADA sola (`migrate.mjs --only 20261014120001 --project-ref
            ybbrpqzbedaxsmotgtkh`; 0078 sigue sin aplicar) y bucket `greenlight-tipografias` creado solo
            (`setup-storage.mjs --only`). Verificado en vivo: tabla, RLS, 1 política, ledger, bucket privado 10 MB.
      - [x] Prueba de punta a punta en vivo: subidas las 9 DiDi Sans Pro como "Sólo DiDi" (9 filas, 9 archivos).
            APGIANTCARD con "Sin cliente": no llegan y dice "son sólo para anuncios de DiDi, elige DiDi arriba";
            con DiDi: 12 de 12 textos escritos, todo desde Greenlight; de vuelta a "Sin cliente": se sueltan.
            PSD de prueba con Montserrat-Bold: la trajo de Google sola, quedó en la biblioteca (Montserrat[wght].ttf,
            745 KB, 9 estilos) y llegó al navegador.
      - [x] Revisión (código sonnet + seguridad opus, 2026-10-14). Arreglado: freno por persona para Google, un
            archivo a la vez con 40 MB por pedido, 2 búsquedas a la vez, plazo de 12 s, lectura con tope (sin fiarse
            del content-length), sin redirecciones, "el estilo no está" también se recuerda, tope de 300 de Google,
            archivo huérfano se borra, nombre de archivo ≤ 120 · lo de su cliente gana aunque otro archivo cubra más ·
            tope de 30 archivos entre las dos vueltas · guardados a la vez · cambiar de cliente a media carga ya no
            revive exclusivas (sólo se suma lo nuevo) · pedido con 45 s (van en fila) · "Olvidar" vuelve a pedir ·
            nota y aviso al soltar exclusivas · las exclusivas de otro cliente se dicen al lector de pantalla ·
            clientes activos (no sólo los que tienen marcas) · nombre de estilo con guion lleva prefijo · Admin: el
            botón Sólo/Para todos espera al servidor, aviso al confirmar, aria-label fijo · selector de 44 px.
            NO hecho (anotado): no buscar en Google las exclusivas de otro cliente (las gratuitas son de todos; lo
            que no está se recuerda 1 h) · filtrar en SQL con índice GIN (catálogo chico, con topes) · mandar menos
            nombres a Admin · avisar "no se pudo consultar Google" aparte · recordar en el navegador las de Google.
- [x] B10. Carpetas con otro nombre (Pedro, 2026-10-14: "go with option 3"). El PSD s33-BFDIRECT20CASH trae Logo /
      Copy / CARD / Legales en vez de la guía: 7 de 12 medidas (todas las horizontales y banners) se quedaban sólo con
      el CTA. Ahora `roles.ts` reconoce los otros nombres comunes (Logo → BRAND, Copy → TITULO, CARD → HERO,
      Legales → FOOTER, Fondo/BG → BACKGROUND…) y la pantalla enseña «Carpetas con otro nombre» con un selector por
      carpeta ya puesto en lo que parece; cambiarlo rehace las medidas al instante (sin volver a leer el PSD).
      Probado con s33: "no entra" 28 → 0, para revisar 10 → 6; CARD → "Sin papel" lo regresa a 7 avisos; de vuelta
      a Hero, 6. test-formatos 256/0, `npm test` verde, tsc/eslint limpios.
      Visto con s33 (para Pedro, no es de las carpetas): (1) dos tarjetas en las horizontales: la imagen de IA del
      Background ya trae una tarjeta pintada justo debajo de la de CARD; al mover CARD, la pintada se queda. Es del
      PSD. (2) 876×324: la parte de arriba del titular ("Hasta" y el 20 %) queda debajo de la fila de logos y NO se
      avisa. Pendiente de proponer arreglo. **CORREGIDO 2026-10-14:** no se enciman (11 px libres medidos a tamaño
      real); el problema es contraste: letras de nube blancas sobre nubes blancas → B11.
- [x] B11. Copia en el fondo + contraste (Pedro, 2026-10-14: "build the contrast check and option 1 with option 3
      first meaning it detects warns and suggest fix. if they approve then option 1 kicks in"; Gemini como respaldo).
      · `gemela.ts`: `buscarGemela` (bajo el HERO, ≥ 75 % parecido Y 30 puntos más que a los lados; s33 91 %, 2 ms;
        APGIANT nada) · `quitarGemela` (sólo al aprobar: espejo por renglón + mezcla vertical + quita el reflejo de
        color alrededor sin tocar el brillo; 13-24 ms; fondo nuevo, el original queda para «Deshacer»).
      · `revisar.ts`: `revisarMedida` = acomodo + avisos de píxeles, una sola entrada para la tarjeta y el resumen
        (caché por lista de maestros). Avisos: «copia» (se ve dos veces), «retoque» (se ve el relleno), «contraste»
        (≥ 30 % de la pieza casi del mismo tono que lo de atrás Y ≥ 15 puntos peor que en el original).
      · Pantalla: «Copia en el fondo» en el panel con «Quitar del fondo» / «Deshacer» y aviso al lector de pantalla.
      · Medido con los 2 PSD reales: s33 tal cual → 11 medidas con «copia» (no 2: en las verticales la copia sale más
        grande DETRÁS de la tarjeta), contraste en 1280×720, 1200×627, 876×324, 640×100 y 320×50 (TITULO) + BRAND en
        los 2 banners; con la copia quitada → 11 «retoque» y además FOOTER en 720×1600 (33 % vs 17 %). APGIANT: 0
        avisos nuevos en las 12. test-formatos 268/0. Probado en el navegador (localhost): quitar, deshacer, 12
        lienzos pintados, foco se queda en el botón, aviso role=status.
      · NO hecho: Gemini como respaldo del relleno (espera llave con saldo para probarlo con una llamada real).
      · Revisión (3 revisores, abaa346): arreglado: retoque viejo tras cambiar el papel de una carpeta · HERO grande
        pasaba sin comparar lados (y no se ofrece si tapa > 50 % del maestro) · el PSD anterior quedaba en memoria ·
        el nombre del botón para lector de pantalla no empezaba con su texto · doble clic deshacía (ahora `detail`) ·
        caché con clave distinta en tarjeta y resumen · quitar la copia de una mesa repintaba las de otra · avisos
        nombran la carpeta («Copy» (TITULO)) · try/catch en las ayudas · reflejo por lado y apagado hacia la orilla.
        NO arreglado (a propósito): los avisos del motor siguen sólo en español (diseño de siempre) · «se ve la copia»
        compara lugar y escala, no cobertura (avisa de más, nunca de menos) · el borrado corre en la página, no en el
        worker (13-24 ms en el PSD real; con el tope de 50 % el peor caso estimado es ~0.5 s).
- [x] B12. «Rellenar con IA», segundo botón tras «Quitar del fondo» (Pedro, 2026-10-14: "yes build it as a second
      button"). Se ofrece sólo después del relleno gratis y sólo si `PRISMA_FORMATOS_IA=gemini` + `GEMINI_API_KEY`.
      · Pantalla: recorta el fondo ORIGINAL alrededor de la copia en una proporción que Gemini acepta (≤ 1536 px) +
        la pieza (≤ 768 px), los achica hasta que quepan en el límite de 4.5 MB de Vercel, y pega lo que vuelve sólo
        en el hueco y un anillo que se desvanece (`pegarRellenoIA`; la orilla de la caja queda idéntica). Mide la
        «deriva» (cuánto cambió la IA el aire alrededor) y avisa si pasa de 18.
      · Ruta `/api/prisma/formatos/copia`: mismo origen (sec-fetch-site + Origin), gate de Prisma, freno propio
        10 / 10 min + el freno de todo lo que se cobra, largo del cuerpo ANTES de leerlo, PNG decodificado y vuelto a
        codificar (sin metadatos), proporción ±3 %, salida re-codificada. Costo en `x-costo-usd`.
      · Revisión (código + seguridad + accesibilidad): arreglado: pedido cancelable (cambiar de PSD o salir lo corta;
        tope 170 s) · resultado tardío de otro PSD o con otro papel de carpetas se descarta y se avisa · lienzo sin
        contexto ya no manda una imagen en blanco · el foco pasa a «Deshacer» al terminar · `aria-busy` y
        `aria-disabled` en vez de quitar el botón del teclado · aviso al empezar · costo estimado en el botón ·
        «Probar otra vez con IA» después de una · ayuda dice qué se manda a Google (un recorte, no el PSD).
        test-formatos 280/0 · npm test 44/0 · tsc y eslint limpios.
      · NO arreglado (a propósito): errores de la ruta sólo en español · el freno vive en memoria por instancia: ANTES
        de producción, registro por llamada en la base con tope diario · `npm audit` no corrido · nitidez en maestros
        grandes (recorte de 1536 px estirado) no medida: se ve en la prueba real.
      · Prueba real en la preview (1b9bbbc, s33, 2026-10-14): US$0.041 (el botón estima ≈ 0.035: subir la estimación);
        en 1080×1920 a tamaño real no se ve la tarjeta repetida ni la unión; sin aviso de deriva.
- [x] B13. Verticales: la tarjeta flota, el botón cae sobre el colchón y el legal encima del colchón (Pedro, 2026-10-14,
      con capturas de 1080×1920 y 720×1600: "they should look like the 1200x1500"). CAUSA medida: en «igual» las piezas
      van a ×0.90 (caben a lo ancho) y el fondo a ×1.28 (llena el alto), y como el fondo llena el alto exacto no se
      puede mover hacia arriba ni abajo. Desfase sobre el fondo (px del maestro, pie de cada pieza): 1080×1920 y
      720×1280 botón −156, legal −200, tarjeta −114, logos +167; 720×1600 −230 / −294 / −168 / +247; 768×1024
      −33 / −42 / −24 / +35. En las 5 horizontales el legal también queda 165-201 px arriba de su lugar (medido, sin
      ver los renders). Prototipos (scratchpad/anclar.mjs): A = cada pieza con su pie sobre su mismo punto del fondo
      (se ve como el maestro; los logos suben a ~7 % del borde de arriba y el legal a ~5 % del de abajo, donde
      Stories/TikTok tapan); E gratis (espejo abajo) = sale un colchón de cabeza: descartado; E con IA no probado.
      · Construido (Pedro: "yes build option 1 with the safe zone"): `anclarAlFondo` en acomodo.ts para «igual».
        Cada pieza con su pie sobre su punto del fondo; el fondo se corre con el grupo donde le sobra. Con canal
        (sólo en otra forma; en la del maestro el diseñador manda y se avisa): 1) se juntan hacia el pie del HERO,
        que no se mueve; 2) si el HERO no cabe en su punto, el grupo se corre; 3) se achican todas por igual hasta
        60 %; 4) si ni así, el acomodo de antes y aviso de zona. La zona entra en `revisarMedida` (tarjeta y
        resumen) y en su caché.
      · Medido con s33: sin canal, 1080×1920 / 720×1280 / 720×1600 / 768×1024 con tarjeta sobre el colchón, botón
        enfrente y legal en las nubes. TikTok: igual, el grupo un poco a la izquierda. Stories (abajo 20 %) y Reels
        (abajo 35 %): el colchón queda bajo la franja de la app; las piezas se achican (×0.87 / ×0.65) y la tarjeta
        flota sobre el cielo. APGIANT: sin cambios donde manda su mesa 9:16. Navegador (localhost): elegir canal
        cambia la 9:16 y la ayuda nueva se ve. test-formatos 286/0 · npm test 81/0 y 44/0 · tsc y eslint limpios.
      · También: el botón de IA estima US$0.041 (lo medido), `COSTO_COPIA_IA_USD`.
      · Zoom del fondo (Pedro: "yes build the background zoom"): con canal, si la tarjeta no cabe sobre su punto, el
        fondo se agranda lo MENOS posible, hasta ×1.5 sobre lo que cubre (`FONDO_ZOOM_MAX`). s33 a 1080×1920:
        TikTok ×1.30 y Stories ×1.46 → tarjeta sobre el colchón, botón enfrente, legal abajo fuera de la franja
        (a tamaño real se lee; el fondo, más suave). Reels pediría ×1.95 (tarjeta chiquita, nubes borradas): no
        se agranda y la tarjeta flota. APGIANT con Stories pediría ×2.1: tampoco. Navegador (localhost): con
        Stories la 9:16 sale con el zoom. test-formatos 290/0 · npm test 81/0 y 44/0 · tsc y eslint limpios.
- [x] B14. Lo que vio Pedro en la preview (2026-10-15):
      · Silueta de la tarjeta en 768×1024: era la sombra del título (Copy, multiplicar) detrás de la tarjeta, guardada
        "sin sombra" porque el PSD no la deja ver. psd.ts la llena con la de alrededor (`rellenarSuave`, Laplace de
        grueso a fino). Comprobado: sobre azul liso ya no hay marco. +21 a +62 ms al leer cada mesa.
      · 640×100 logos chicos / 600×500 botón chico: en columnas, la pieza más ancha que la columna se ajusta sola y
        el alto que suelta va a las demás (botón y marca hasta 1.3× el título); en banners, el ancho que una celda no
        usa pasa a las que se quedan cortas (marca hasta 40 % del alto, botón 55 %). s33: logos 98×12 → 196×24,
        botón 105×29 → 180×50 (640×100); botón 108×30 → 209×57 y título 188×141 → 278×209 (600×500).
      · El legal NUNCA se quita (PEDRO_OVERRIDE). Su franja crece si el resto del texto puede ceder; el resumen dice
        en qué medidas queda bajo 10 px. Costo medido: en 640×100 el título de s33 baja de 11.6 a 7.8 px; en 320×50
        el legal queda en 3.1 px y el título en 3.9 px (un legal de 3 renglones no cabe legible en 50 px).
      · test-formatos 294/0 · npm test 81/0 y 44/0 · tsc y eslint limpios.
- [x] B15. Editor por medida + botón de IA visible (Pedro, 2026-10-15: "yes build the editor"):
      · «Editar» en cada tarjeta abre esa medida: arrastrar mueve una pieza, las 4 esquinas la agrandan o achican sin
        deformarla, flechas 1 px (Mayús 10), + / − ×1.02. Imán al centro con guías. Panel: estado, lista de piezas con
        «automático» por pieza, avisos en vivo. «Volver al automático» + Guardar borra la edición.
      · Se guarda sólo lo que cambió ({x,y,k} por pieza) en el navegador, por archivo + mesa + medida, con huella de
        las piezas (otro PSD con el mismo nombre no la hereda). Tarjeta, resumen y ZIP leen la misma edición
        (`revisarMedida(..., { edicion })`); una medida editada no se voltea.
      · `aplicarEdicion` vuelve a revisar con la edición; a mano no se avisa "encima" ni "forma" (es decisión del
        diseñador), sí lo que se sale, la zona del canal y la letra.
      · Botón de IA: sólo aparecía después de «Quitar del fondo». Ahora sale desde el inicio como «Quitar con IA
        (≈ US$0.041)». Modelo: `gemini-nano-banana-2.1` (el más nuevo, 2026-10-06). En local no sale (sin llave).
      · Probado en localhost con s33: mover, esquina, flechas, −, guardar, chip, recarga, volver al automático. Bug
        encontrado probando: la esquina del botón agarraba la tarjeta (caja de abajo en el DOM) → la seleccionada va
        al frente (z-20). test-formatos 300/0 · npm test verde · tsc y eslint limpios.
      · Revisión (2 revisores en paralelo: código + accesibilidad/UX), arreglado:
        - Una edición callaba el aviso "se enciman" de piezas que la persona NO tocó (y el editor lo callaba sin
          cambios). Ahora sólo se calla si una de las dos es hecha a mano; test nuevo (falla con la regla vieja).
        - Lo guardado no sabía de qué acomodo era: el lado del HERO y la zona del canal van en la clave (v2) y la
          huella lleva el papel de cada pieza. Con otro lado/canal la medida sale en automático, no mezclada.
        - Datos guardados fuera de rango se recortan a los topes del editor (test nuevo, `topesPieza` compartido).
        - Esc / clic afuera con cambios sin guardar no cierran (el pie lo explica); Esc a medio arrastre la regresa.
        - El foco vuelve al «Editar» de la tarjeta (por `data-editar`, también en Safari).
        - Cmd/Ctrl + / − vuelve a ser el zoom del navegador; un clic sin mover ya no cuenta como edición (umbral 3 px);
          Alt quita el imán; el lector de pantalla oye la posición y los avisos medio segundo después, no cada píxel.
        - Repintar la vista medía 69-97 ms (s33): el fondo se guarda y a medio arrastre se pinta a la mitad.
        - Los avisos de píxeles (contraste, pieza repetida) se recalculan en vivo en el editor (~1 ms), igual que la
          tarjeta. El texto se escribe con la tipografía también en la vista del editor.
        - Pie pegado abajo, 2 columnas desde 1024 px, «cambiada» en la lista, «Volver al automático» apagado sin cambios,
          chip con explicación de por qué no se voltea, aviso si el navegador no deja guardar.
      · No arreglado (bajo): rayas de la zona sin etiqueta en el editor; Mayús + / − para pasos grandes; el foco
        inicial cae en la primera pieza; la caché de `revisarMedida` recalcula el automático por cada edición nueva.
      · Contraste: Pedro eligió "do both and let the user decide" → B16.
- [x] B16. Arreglos de contraste, los dos, y la plataforma elige (Pedro, 2026-10-15: "yes build it that way"):
      · «Mover fondo»: busca dentro de la holgura del fondo (rejilla 9×9 + afinado) el lugar donde se pierde menos.
        «Sombra detrás» (halo.ts): sombra suave que viaja con la pieza, con un tono oscuro del mismo fondo.
      · La plataforma elige sola el que deja TODO legible y se pierde menos, nunca un fondo que deja la tarjeta
        flotando (piso bajo el HERO corrido > 5 % de su alto) ni uno que haga asomar la copia; si ninguno alcanza, se
        queda el original con el aviso y se dice. La tarjeta lo explica en una frase y ofrece los tres con su %.
      · Orden: acomodo → contraste → edición a mano. Con fondo movido, la edición guardada lleva ":fondo" en su clave;
        editada a mano, el contraste no se cambia (se vuelve al automático en el editor). El editor, la tarjeta y el
        ZIP pintan lo mismo (la sombra se pinta en `armarMedida` y la mide `perdidas`).
      · Medido en s33 (copia quitada): 5 medidas pierden el título (42-58 %); mover fondo → 0 % pero la tarjeta flota
        en las 5; sombra → 0-2 % → la plataforma elige la sombra en las 5. APGIANT: nada que arreglar. ≤ 33 ms por
        medida. En el navegador: nota, cambio a «Mover fondo» (repinta, avisa que flota), «Original» (vuelve el aviso),
        y el editor pinta la sombra.
      · test-formatos 308/0 (6 nuevos) · npm test verde · tsc y eslint limpios.
      · No probado en el navegador: los botones apagados en una medida editada a mano.
- [~] B17. Prueba: separar el colchón del fondo con IA (Pedro, 2026-10-15: "yes run the mattress test on s33" + su idea
      de tapar con nubes lo enredado). Sin código nuevo: la ruta de «Quitar con IA» con el colchón como "la pieza"
      (recorte 1120×480, 21:9). US$0.0422, 15 s. Panel temporal en la preview (Pedro eligió los 2 PNG; el panel del
      navegador bloquea que una página pública lea archivos de la Mac: ERR_BLOCKED_BY_CLIENT).
      · La IA quitó el colchón muy limpio: nubes continuas, las 2 almohadas intactas.
      · El colchón se sacó comparando original contra lo de la IA: lados y orilla de arriba limpios; la cara de
        arriba (blanco sobre nubes blancas) salía con hoyos → relleno por dentro del contorno, gratis, y la orilla de
        atrás creciendo hacia arriba fila por fila. La base enredada con nubes se resuelve con la idea de Pedro: un
        desvanecido de 22 % del alto hacia las nubes nuevas. Movido 50 px abajo y 60 arriba se ve creíble.
      · Defectos que quedan: la neblina de sol pintada detrás de la cara de arriba viaja con el colchón (y su borde de
        arriba queda recto si se mueve mucho); las puntas izquierda/derecha salen un poco cuadradas.
      · Caminos: (1) que diseño entregue el colchón en su propia capa (gratis, perfecto); (2) segunda llamada que
        pida el colchón solo sobre un color plano (idea de Pedro: "colchón nuevo generado") para orillas limpias,
        ≈ US$0.04 más; (3) seguir con la comparación + arreglos. En el motor falta: tarjeta y colchón como grupo.
- [x] B18. «PSD» en cada tarjeta: la medida en capas para terminarla a mano (Pedro, 2026-10-15: "give them the option
      to download that specific size as a psd with the available layers"; eligió la opción 1 + archivo de prueba de la 2).
      · psd-salida.ts + `capasDeMedida` (nitido.ts): carpeta BACKGROUND con el fondo entero (más grande que la medida,
        se recorre), y una carpeta por pieza con el nombre del PSD original: la pieza a su tamaño, «· sombra» y la
        sombra de contraste en multiplicar. Texto como imagen. La librería se carga al hacer clic.
      · Medido con s33: 1200×627 → 7.8 MB (armar 228 ms, escribir 44 ms); 1080×1920 → 13.1 MB. Las capas puestas en
        orden dan la tarjeta ±2. En el navegador: nombre de entrega con .psd, 7.9 MB, firma 8BPS, mismas carpetas.
      · Opción 2 (prueba, no está en la app): s33_1200x627_objetos-inteligentes.psd, cada pieza objeto inteligente con
        su PNG del maestro adentro (5 de 5 leídos de vuelta). Si Photoshop lo acepta, se cambia la opción 1 por ésta.
      · No probado: abrir los PSD en Photoshop (no hay Photoshop aquí). Piezas quitadas (subtítulo) no van en el PSD.
      · test-formatos 311/0 (3 nuevos) · npm test verde · tsc y eslint limpios.
- [~] B19. Rediseño de la página Formatos (Pedro, 2026-10-15: "feels too dirty and ugly… seems confusing what is
      what and where are things"; /design-god-mode). Pedro eligió A ("yes build option A").
      · Hecho: ajustes.tsx (pastillas de medidas por forma Vertical/Horizontal/Banner, «Agregar medida» con «Usar sólo
        éstas», canal en pastillas con punto de color, chips de estado con Popover); panel de ajustes arriba; «En varias
        medidas» (pieza repetida + legal chico, una vez); resultados agrupados por forma con barra pegajosa; tarjeta nueva
        (estado «Listo»/«N avisos», contraste en una línea que se abre, avisos repetidos en una línea corta, botones al
        pie). `--plat-ig`. 8 textos muertos fuera de copy.ts. Grupos: vertical si ancho/alto < 0.95, banner si ≥ 3.
      · Medido (localhost, s33): página 6259 → 3055 px a 1440; 5/4/2 tarjetas por fila a 1440, 4/3/2 a 1180, 2/2/1 a
        820; sin scroll horizontal. Los resultados empiezan a 868 px a 1440×900 (la barra con el ZIP se ve al pie).
      · Revisión (2 revisores: accesibilidad + código): arreglado lo serio (cuadros sin nombre, foco perdido al borrar
        una pastilla o volver a la lista, h3 dentro de h3, estado sólo por color en carpetas y «En varias medidas», foco
        tapado por la barra pegajosa, errores de tipografías escondidos en el chip cerrado) y lo barato (anuncios al
        prender/apagar, estado vacío con botón, 44 px con `pointer-coarse` también en enlaces y contraste, «×» de 44 px,
        idioma en los cuadros, tope de 2000 letras al pegar, «0 de N» de la pieza repetida con medidas apagadas, texto
        EN «Retouched background»). Probado en el navegador después.
      · Sin hacer (reporte): canal y contraste como `radiogroup` con flechas (hoy botones `aria-pressed`); ayuda del
        cliente y del «PSD» sólo con el mouse (`title`; lo del cliente también está en el chip de tipografías);
        `edicionesVista` relee localStorage en cada clic de pastilla (no repinta); medidas que no caben por el tope
        siguen viéndose prendidas (sólo pasa con más de 30).
      · No probado: táctil real (44 px con `pointer-coarse`, la regla está en el CSS), Enter en el campo de medidas,
        zoom de Safari en iPad al tocar el campo.
      · Arreglos tras la prueba de Pedro (2026-10-15):
        - [x] Vista grande (vista-grande.tsx): clic en la vista de la tarjeta abre la medida casi a pantalla completa,
          «Ajustar a la pantalla · N %» (crece si es chica; píxeles nítidos desde 200 %) o «Tamaño real · 100 %» con
          desplazamiento. Copia el lienzo de la tarjeta (mismos píxeles que el PNG). Ícono de la esquina siempre visible.
          Medido: 1080×1920 al 37 % (400×712) y a 100 % con scroll; 320×50 al 425 % (1360×212); 0 píxeles distintos
          de la tarjeta; el foco vuelve a la tarjeta; cada vez que se abre empieza ajustada.
        - [x] Contraste en una medida editada: ya se puede cambiar. La clave de la edición ya no lleva el contraste
          (sólo lado del HERO y zona del canal); la clave vieja «:fondo» se lee y se borra al guardar. Probado: editar
          1280×720, guardar, elegir «Original»: queda elegido y la tarjeta sigue «Editada».
        - [x] Editor a la forma de la medida: diálogo casi a pantalla completa, la vista toma lo más grande que cabe con
          su forma; tiras (ancho ÷ alto ≥ 2) con el panel abajo. Pintado limitado por área (1400², nítido en Retina).
          Medido a 1440×900: 320×50 en 1360×213 (antes 790×123), 1080×1920 en 393×699 (antes 344×612). A 1180×820:
          876×324 en 1057×391. A 820×1180: 1080×1920 en 422×750, panel abajo en 3 columnas. Pie del editor y lista de
          piezas con 44 px al dedo.
        - Revisión (1 revisor): arreglado lo serio (la vista grande podía copiar una tarjeta aún sin pintar o quedarse
          vieja si la tarjeta se repintaba: ahora espera la primera pintada y vuelve a copiar con cada una) y lo barato
          (aviso si no se puede copiar, memoria de la copia soltada al cerrar, «Cerrar» de 44 px al dedo en vez de la X
          de 28 px, título «Vista de …», recuadro con nombre que entra al Tab sólo si se desplaza, píxeles nítidos a
          100 % en Retina, sin «0 %» antes de medir, una sola medición en el editor, idioma en el editor, la ayuda
          ligada a las piezas, franjas en un solo lugar).
        - Sin hacer (reporte): el editor guarda hasta 4 fondos de ~31 MB y repinta en cada cambio de tamaño de ventana
          sin esperar (igual que antes en un cuadrado; podría pesar en iPad); la clave vieja «:fondo» se lee una vez más
          por medida sin edición (sólo localStorage); el % de «Ajustar» puede moverse 1-3 % con barras de scroll fijas.
        - No probado: un iPad de verdad; la vista grande con una medida de más de 4000 px.
      · Medido hoy (localhost, s33, 1440×900): la columna de ajustes mide 300 px y trae 1675 px de contenido en una
        ventana de 804 (más de la mitad escondida, con su propia barra de scroll); 424 palabras, 208 de ayuda gris en
        7 párrafos; 4 cajas iguales; 5 selects. «Se ve dos veces CARD» se repite en 11 de 12 tarjetas y su arreglo
        está en la columna. En el teléfono (375 px) los resultados empiezan a 2157 px (2.7 pantallas abajo).
      · Propuesta A (recomendada): barra de control arriba y resultados a todo lo ancho. Archivo y cliente en chips;
        medidas como pastillas agrupadas por forma (Vertical / Feed / Horizontal / Display) que se prenden y apagan al
        clic, más «Agregar medida» (escribir o pegar la lista: reusa `leerMedidas`); canal como pastillas con el color
        de la app (falta `--plat-ig`); tipografías y carpetas como chips de estado con detalle en un Popover; «Por
        revisar» junta los avisos repetidos con su botón una sola vez; resultados agrupados por forma, 3-4 por fila,
        tarjetas más ligeras (contraste en una línea, avisos en un conteo que se abre).
      · Sólo escritorio e iPad (Pedro, 2026-10-15: "strict desktop use maybe ipad but no smaller"). Hoy en iPad: la
        página se apila como en teléfono. Vertical 820: contenido 580 px, resultados a 1763 px, 1 por fila. Horizontal
        1180: 1 por fila (568 px). Meta con A: 1440 → 4 por fila; iPad horizontal → 3; iPad vertical → 2, con la barra
        de ajustes arriba en los tres. Táctil: nada sólo con hover, pastillas y botones de 44 px con `pointer: coarse`.
        Debajo de 768 no se diseña ni se prueba (la página carga, nada más).
      · Alternativas: B paso a paso (1 PSD → 2 medidas → 3 canal → 4 revisa), más claro la primera vez pero más
        lento a diario y no deja ver el resultado mientras se cambian medidas; C limpiar la columna actual (menos
        riesgo, pero 12 pastillas en 300 px dan 5-6 renglones y los resultados siguen a 2 por fila).
      · Medidas de DiDi: siguen en código (`MEDIDAS_EQUIPO`) y se rotulan con el cliente; guardarlas por cliente es
        el 3e (migración, más adelante).
      · Skills: ui-ux-pro-max (base), design-taste-frontend (herramienta interna: variación baja, movimiento bajo,
        densidad alta), shadcn-ui (Popover, Sheet, Tooltip ya existen), §R3 responsivo, §R4 revisión.
- [ ] B20. Todo lo editable sigue editable (Pedro, 2026-10-19, tras la prueba del diseñador). Los 3 arreglos de B19
      funcionaron ("the fixes worked"). El diseñador abrió el PSD de objetos inteligentes sin problema, pero:
      · "every single element that is editable in the orignal psd should be editable in the one you can download by
        size individually ... the legales should be editable not an image" → el «PSD» por medida conserva texto vivo,
        objetos inteligentes, formas, subcarpetas y orden de capas, movidos y escalados (hoy: una imagen por carpeta).
      · Leer SUBCARPETAS, no sólo las 7 principales: más piezas movibles y editables en el editor.
      · Editor: reordenar capas (qué va encima de qué) y el LEGAL editable (cambiar o borrar el texto).
      · Pedro eligió (2026-10-19): "lets do download first", probando con `Desktop/formatos-prueba/s33-BFDIRECT20CASH.psd`
        (nada de PSD inventado). Después: subcarpetas y orden de capas en el editor, y el legal editable.
      · Prueba de factibilidad (scratchpad, s33 real): ag-psd lee y vuelve a escribir la mesa 4x5 con 5 textos, 11
        objetos inteligentes, 4 formas, efectos y subcarpetas (57.7 MB, 79 ms al escribir; casi todo el peso son los
        archivos de adentro de los objetos inteligentes). Las coordenadas de las formas vienen en px del documento.
      **Next Step:** ver el de abajo (paso 2b). En paralelo, un diseñador abre los PSD de B20.
      **Paso 2 — subcarpetas y orden de capas en el editor** (Pedro, 2026-10-19, eligió: "Parts inside a piece" y
      "One part together"; en dos entregas, primero el orden):
      · Las 12 medidas automáticas NO cambian. Una subcarpeta es una PARTE de su pieza: en el editor se abre la pieza y
        la parte se mueve o cambia de tamaño sola; las capas sueltas de la carpeta van juntas como una parte.
      **Paso 2a — orden de capas:**
      - [x] `Edicion` pasa a `{ piezas, orden? }` (orden = índices de abajo hacia arriba); lo guardado antes (sólo
            lugares) se sigue leyendo. `aplicarEdicion` reordena las piezas puestas (las que no estén en `orden` se
            quedan en su lugar); la firma de la caché lleva el orden.
      - [x] Todo lo que pinta sigue `puestas` (tarjeta, vista grande, PNG, PSD de capas planas): sale solo.
      - [x] PSD editable: `PlanEditable.orden` (nombres de abajo hacia arriba); las carpetas de las piezas se reacomodan
            en los lugares que ya ocupaban piezas (fondo, ocultas y sueltas no se mueven; una recortada va con su base).
      - [x] Editor: la lista «Piezas» pasa a «Capas», la de arriba al frente (como Photoshop), con «Más al frente» /
            «Más atrás» por renglón y `]` / `[` con la pieza elegida; el estado dice «capa n de m»; «Volver al
            automático» también vuelve el orden.
      **Verificación 2a:** pruebas de `aplicarEdicion` (orden, orden con lugar, orden inválido, lo viejo se lee),
      del PSD editable con s33 (reordenado: árbol con las carpetas en el orden nuevo, fondo abajo, nada perdido;
      sin orden: igual que hoy) y mutaciones; navegador (localhost, s33): subir el CTA encima de la tarjeta, guardar,
      ver la tarjeta, bajar PNG y los dos PSD y leerlos de vuelta; tsc, eslint, npm test, build.
      · Hecho y medido (2026-10-19): test-formatos 365/0 (orden en `aplicarEdicion`, caché, PSD de capas planas y
        editable; s33 con el CTA al frente: su carpeta sube entera, fondo abajo, la oculta en su lugar); 7 de 7 cambios
        a propósito atrapados. Navegador (localhost, s33): el CTA sube capa por capa con «Más al frente» (el foco sigue
        en su botón y, arriba del todo, pasa a la pieza), `[` y `]` lo bajan y suben, el estado dice «capa 1 de 5 desde
        el frente», «Guardar» guarda `{ orden: [1,2,3,4,0], piezas: {} }`, la tarjeta dice «Editada a mano», el PSD
        editable sale con «CTA» arriba de «Logo»; al recargar sigue igual; una edición guardada al modo viejo (sólo
        lugares) se abre con su lugar y el orden automático.
      · Revisión (2026-10-19), arreglado: con los botones de la lista la pieza queda elegida (el lector de pantalla
        dice su capa); `[` y `]` también con Option / AltGr (teclado español) y Re Pág / Av Pág; en el tope el foco pasa
        al otro botón del renglón; «Volver al automático» deja el foco en «Guardar»; «otra capa» marca sólo lo que se
        movió (la subsecuencia más larga en orden queda sin marca); renglón con el texto entero al pasar el ratón; un
        renglón fijo «Fondo (siempre hasta atrás)»; lo guardado se lee en `leerEdicion` (con pruebas, avisa si descarta
        un orden roto); sin orden cambiado el PSD editable sale con el orden del original (dos carpetas del mismo nombre
        con otra en medio no se juntan). Aceptado: la clave del navegador sigue en v2 (sólo preview; una pestaña vieja
        no ve el orden). test-formatos 369/0; mutaciones 3/3 en lo nuevo.
      **Paso 2b — partes (subcarpetas)** (Pedro, 2026-10-19, eligió: "Double-click to open", "Yes, parts stay
      attached", "Only inside its piece", "Fill and warn"):
      · Lo que ve el diseñador: doble clic (o Enter) sobre una pieza la abre; adentro cada parte tiene su marco y se
        mueve o cambia de tamaño sola; Esc (o clic fuera) la cierra. Mover la pieza después mueve sus partes con ella
        (lo de cada parte se guarda relativo a su pieza). El orden de las partes se cambia sólo dentro de su pieza. Lo
        que una parte tapaba de otra se rellena, y la tarjeta dice «Revisar» si el relleno es grande (el tope se fija
        midiendo s33).
      · Las 12 medidas automáticas NO cambian: una pieza con las partes sin tocar se pinta igual que hoy.
      - [x] Lectura (psd.ts): `CapaPsd.parte` = la subcarpeta directa de la carpeta de su pieza (clave: posición +
            nombre; null = suelta, y las sueltas van juntas como la parte «resto»). Lo más hondo se queda dentro de su
            parte. Hay partes sólo si la pieza sale de UNA carpeta de arriba y trae 2 o más partes con algo visible;
            las vacías u ocultas no cuentan.
      - [x] Despiece (`despiezarMesa`): una segunda pasada dentro de la caja de cada pieza con partes: lo de abajo
            (lo que había antes de la pieza) más las partes en el orden de su primera capa; el color de cada parte se
            des-mezcla igual que el de las piezas. Lo que tapa una parte de arriba se rellena (`rellenarSuave` /
            `rellenar`) y se mide (tapada por parte) sólo para avisar: una parte nunca rechaza el maestro. Cada parte
            trae lo suyo: textos, base, oscurece, letraMinPx, sólido, caja.
      - [x] Modelo: `PiezaLista.partes?: ParteLista[]`; los campos de la pieza no cambian. Búferes transferidos.
      - [x] Edición: `Edicion.partes?` (por pieza, por parte: `{x,y,k}` relativo a la pieza) y `ordenPartes?` (por
            pieza). `leerEdicion` lo valida (lo guardado antes se sigue leyendo); la firma de la caché lo lleva.
            `aplicarEdicion` abre en partes (`Puesta.parte?`) sólo las piezas con partes tocadas.
      - [x] Una sola función dice qué se pinta de una puesta (la pieza o una parte) y reemplaza las ~18 lecturas de
            `ma.piezas[q.pieza]` (nitido, sombra, revisar, escritura, psd-salida, letras de acomodo, editor, gemela,
            formatos-psd). Texto reescrito: `TextoEscrito` recibe la parte y escribe sólo los textos de ella.
      - [x] PSD editable: `plan.partes` (posición de la subcarpeta → su movimiento). Las capas de una pieza abierta se
            mueven con su parte (las sueltas con «resto»); la carpeta de la pieza con la pieza; las subcarpetas se
            reordenan con `ordenPartes`; la sombra de contraste, junta, debajo de la carpeta. PSD de capas planas:
            una capa por parte dentro de la carpeta de la pieza.
      - [x] Editor: doble clic / Enter abre la pieza, Esc la cierra; marcos de las partes; en «Capas» la pieza se
            despliega con sus partes y «Más al frente / Más atrás» dentro de ella; «Volver al automático» por parte;
            el aviso del relleno.
      **Verificación 2b:** s33 lee 3 piezas con partes (Legales: Iconos + legal; Copy: Subtítulo + Hasta; Logo:
      buenfin + logo con divisor) y las demás sin partes; las 12 medidas sin tocar salen idénticas a las de hoy
      (píxel por píxel); una parte movida: tarjeta, PNG y los dos PSD (el editable con la subcarpeta movida y nada
      perdido); la pieza movida lleva sus partes; orden de partes; lo guardado antes se lee; mutaciones; navegador
      (localhost, s33): abrir Legales con doble clic, mover el legal, Esc, mover la pieza, guardar, recargar, bajar y
      leer de vuelta; revisión en paralelo; tsc, eslint, npm test, build.
      · Hecho y medido (2026-10-19, Pedro: "Yes, build delivery 2b in the order you listed"): s33 da las 3 piezas con
        partes que se esperaban (Legales: Iconos + el legal; Copy: Subtitulo + Hasta; Logo: logo y divisor sueltos +
        buenfin), 0 % de relleno, y rearmar con las partes en su lugar da 0 píxeles distintos. Las 12 medidas sin tocar,
        con el código de HEAD y el de ahora: 12 de 12 idénticas (píxeles, capas, avisos y plan del PSD editable). Abrir
        las piezas sin mover nada: a 1200×1500 igual (0); en otras medidas, la orilla del filtro entre partes (máx. 6, 5,
        3 niveles; 320×50 hasta 30 en 57 px: las partes quedan a 3 px). test-formatos 407/0 (28 nuevas, sección "2b").
        Navegador (localhost, s33, 1200×627): doble clic abre Legales (foco en su parte de enfrente), arrastrar el legal,
        Esc cierra (foco en Legales), Mayús+flecha mueve la pieza y el legal va con ella, Enter abre, `[` cambia la parte
        de capa dentro de su pieza, Guardar guarda `partes` (relativo) y `ordenPartes`; el PSD editable bajado trae en
        Legales el legal (texto vivo) más arriba y abajo de «Iconos», los iconos en su lugar; al recargar sigue igual.
        Logo desde su botón de carpeta: agrandar buenfin por su esquina (169 %), la otra parte quieta; «Volver a su lugar»
        de la parte y «Volver al automático» (también las partes). Consola: 0 errores en una corrida limpia.
      · Arreglado en el camino: el tope de tamaño por parte agrandaba en 320×50 las partes que su pieza ya achicaba (208
        niveles de diferencia): ahora sólo frena lo que la persona cambió. Un clic fuera de las partes dejaba el foco en
        el diálogo: ahora queda en la pieza.
      · Revisión en paralelo (5 pasadas, 2026-10-19) y arreglos, medidos:
        - Motor: el tope del PSD editable medía las partes con el movimiento de su pieza (ahora con el de cada parte;
          prueba con s33 que falla sin el arreglo); el costo en memoria de abrir una pieza se contaba a la mitad (ahora
          por pieza y por mesa, y si algo falla la pieza se mueve entera, con aviso); prueba por pieza de que sus partes
          juntas dan la pieza (si no, entera con aviso); si la mesa pesa demasiado para la página se sueltan primero las
          partes; las sombras de contraste de una pieza abierta van todas debajo de sus partes (tarjeta, PSD plano,
          contraste); el contraste de una pieza abierta se mide como si fuera una; el aviso de relleno sale sólo si se
          puede ver; la carpeta se encuentra por su lugar en la mesa; el tamaño máximo lo frena también la caja con
          sombras; lo guardado de partes que ya no sirve deja rastro en la consola.
        - Editor: marcas en su propio renglón (no se cortan), aviso «Abierta: … · Esc» con «Cerrar la pieza» sobre la
          vista, orilla doble, «Abrir en partes» visible al elegir una pieza con partes, clic en el margen también cierra,
          las piezas de atrás `inert`, botón de carpeta con nombre fijo, `aria-expanded`/`aria-controls` y el foco se queda
          en él, la lista de partes dentro del renglón de su pieza, nombres en palabras («Iconos» de Legales), «otra capa»
          también en partes (y con un empate entre dos de al lado, en la que se movió), «Volver a su lugar» de una pieza
          también regresa sus partes, botón de volver con lugar reservado, ayuda de partes aparte.
        - Medido: test-formatos 416/0; npm test completo verde; tsc y eslint limpios; build 0; 12 de 12 medidas sin
          tocar idénticas a HEAD. Navegador (localhost, s33, 1200×627): todo lo de arriba probado con clics y teclado;
          consola sin errores después de una marca, en una corrida completa (cargar, editar, abrir, reordenar, guardar).
        - No arreglado (anotado): confirmar «Volver al automático»; marca en el lienzo de las partes movidas; atenuar lo
          de atrás al abrir; decodificar las capas una sola vez y no recorrer la mesa entera por pieza; Safari y Firefox
          (foco) sin probar; un lector de pantalla real sin probar; el respaldo de «sin partes si pesa demasiado» del
          worker no tiene prueba automática (corre en el Web Worker).
      **Next Step:** paso 3 hecho (abajo, Review 3), en `prisma` (preview). Que Pedro o un diseñador abran en
      Photoshop el PSD de una medida con el legal cambiado y lo prendan donde se quitó.
      **Paso 3 — textos editables en el editor** (Pedro, 2026-10-20, eligió: "All sizes, once", "Let the box grow
      down", "Any text HÜE can redraw"):
      · Lo que ve la persona: en el editor de cualquier medida, al elegir una pieza (o parte) con texto que HÜE sabe
        volver a escribir, el panel trae su texto en un campo. Lo que escribe se ve al momento en la vista; al guardar,
        las 12 medidas usan el texto nuevo. «Quitar en esta medida» lo quita sólo de esa medida (como mover una pieza);
        «Volver al original» regresa el texto del PSD. Si no cabe en su caja de párrafo, la caja crece hacia abajo.
      · Qué textos: los que pasan la prueba contra Photoshop con la tipografía cargada y cuya pieza tiene base (s33: el
        legal y «Aplica hoy»; los de Copy no, porque «esta temporada» trae efectos de capa). Con varios estilos dentro
        del mismo texto: no se edita aquí (el campo lo dice: "cámbialo en Photoshop"). Sin la tipografía: el campo dice
        cuál falta y cómo cargarla; quitar sí se puede (sólo pide la base).
      · Medido en s33 (2026-10-20): debajo del legal caben 1-2 líneas más en las medidas altas (99 px en 1080×1920, una
        línea ≈ 19 px) y menos de una en las tiras (876×324: 14 px, 320×50: 2 px). Por eso la pieza crece EN EL MAESTRO
        y el acomodo automático la vuelve a poner en cada medida; en una medida movida a mano crece desde donde quedó
        y, si se sale, lo dice el aviso de siempre («se sale de la medida»). «Aplica hoy» mide 216 px en un botón de
        352: un texto más largo que el botón se avisa («se sale de su pieza»), no se corta.
      **Cómo (un maestro derivado):** el texto cambiado se escribe UNA vez a la escala del maestro y sale un maestro
      nuevo con esa pieza (y su parte) ya con el texto nuevo: su color, su base y su caja crecen lo que haga falta. Todo
      lo de después (acomodo, tarjeta, vista del editor, PNG, PSD plano, contraste, plan del PSD editable) lo usa sin
      cambios. La huella de lo guardado por medida sale del maestro ORIGINAL (si no, cambiar un texto borraría las
      ediciones guardadas).
      - [x] `textos.ts` (puro): `textoCambiado(capa, nuevo)` (un estilo: el tramo cubre el texto nuevo) y la caja de
            párrafo que crece hasta que quepan las líneas (`maquetar` con el medidor); pruebas con un medidor de mentira.
      - [x] Lectura: cada capa de texto sabe su ruta en el árbol de la mesa (índices de hijos) para encontrarla en el
            PSD editable aunque dos se llamen igual.
      - [x] `cambiarTextos(ma, cambios, escritura, pintar)` (puro, con `pintar` inyectado): maestro y escritura
            derivados (mismos objetos de texto compartidos entre pieza y parte), caja y sólido que crecen, base y sombras
            con margen; sin cambios, el mismo maestro (las 12 medidas idénticas).
      - [x] `Edicion.sinTexto` por medida (qué textos se quitan en esa medida): `nitido` escribe la pieza con su base y
            sus otros textos aunque esté a su tamaño; lo leído de lo guardado se revisa como lo demás.
      - [x] Avisos: «se sale de su pieza» (tinta nueva fuera de la parte sólida original) y el de la medida.
      - [x] PSD editable: la capa de texto con sus letras nuevas, su tramo y su caja de párrafo crecida (Photoshop la
            vuelve a dibujar); sus píxeles, los que pinta la página (pasan como las sombras de contraste); quitada en esa
            medida = capa oculta (el diseñador la vuelve a prender).
      - [x] Lo guardado del anuncio: `hue-formatos-textos:v1` por nombre de PSD; la clave de cada texto es «capa +
            letras del PSD» (eso es su huella: con otro texto no aplica); se lee sin confiar (largo máximo, 200, claves
            con «\n»). A la vista en la página («N textos cambiados…» + «Volver a los textos del PSD», con Deshacer).
      - [x] Editor: el campo de cada texto de lo elegido (con su nombre de capa), vista al momento, «Cambia en las 12
            medidas», «Quitar en esta medida» / «Volver a ponerlo», «Volver al original», motivo si no se puede; Guardar
            guarda las dos cosas; Cancelar y «sin guardar» cuentan el texto; las teclas del campo no mueven la pieza.
      - [x] La pantalla: el maestro derivado alimenta tarjetas, PNG, los dos PSD y el resumen.
      **Verificación 3:** pruebas puras (texto y caja que crece, maestro derivado, sin cambios = mismo objeto, huella
      del original, `sinTexto`, lo guardado roto); s33 en Node con un pintor de prueba: el legal con una línea más crece
      en el maestro y el acomodo lo deja dentro en las 12; PSD editable de s33 leído de vuelta (texto nuevo, tramo del
      largo nuevo, caja crecida, oculto donde se quitó); 12 de 12 medidas idénticas sin cambios; mutaciones; navegador
      (localhost, s33, con las tipografías de `Desktop/formatos-prueba/DiDi Sans Pro`): cambiar el legal en 1200×627,
      verlo al momento, guardar, ver las 12 tarjetas con el texto nuevo, quitarlo en 320×50, «Aplica hoy» más largo
      que su botón (aviso), bajar PNG y los dos PSD y leerlos de vuelta, recargar; tsc, eslint, npm test, build;
      revisión en paralelo (5 pasadas). Sin probar (se dirá): Photoshop abriendo el PSD con el texto cambiado.
      **Review 3 (2026-10-20):** pruebas 459/0; 12 de 12 medidas idénticas a 4c8eed5 sin cambios de texto; 10 + 11
      mutaciones, cada una tumba una prueba. Navegador (localhost, s33, DiDi Medium/Bold): legal +1 frase en 1200×627 se
      ve en el editor y en las 12 tarjetas (crece hacia abajo, el acomodo lo reacomoda: letra 18.4 → 12.8 px en esa
      medida); quitado en 320×50 (sólo cambian 379 px, en el legal; aviso del legal obligatorio); «Aplica hoy» largo:
      aviso, sin bloquear; Cancelar lo descarta; PNG = tarjeta y igual tras recargar; PSD editable leído de vuelta:
      1200×627 legal vivo con las letras nuevas (289), caja 50 → 83, DiDi Medium; 320×50 oculto CON las letras nuevas.
      Encontrado al leer de vuelta y arreglado: saltos suaves («\u0003») de la caja; oculto con letras viejas.
      Revisión en paralelo (5 pasadas) — arreglado: tope de tamaño (un texto pegado enorme pedía GB de lienzo); un
      texto que no se pudo escribir (sin tipografía en otra mesa, demasiado largo, lienzo vacío, error) va como en el
      PSD y CADA medida lo avisa (antes: callado); la vista se reescribe 200 ms después de la última letra («Actualizando
      la vista…»); lo ya escrito se guarda por maestro (guardar no reescribe; otra mesa no repinta ésta); aviso visible
      al guardar textos (antes decía «volvió al automático»); nota en la página con vuelta a los del PSD; el panel de
      textos se desplaza a la vista (tiras); «Volver al original» deja el foco en su campo; el lector de pantalla oye
      quitar/poner/original; etiquetas por pieza («Texto de «Legales» (FOOTER)»); motivo del motor marcado en español;
      «Quitar» dice por qué no se puede; nota de «vacío»; Esc en el campo no cierra la pieza; la sombra y el contraste
      de una pieza sin sus letras salen de su base; las piezas sin mover siguen al automático aunque vuelvan a su lugar
      con Esc o flechas; el orden de capas se rehace sobre las piezas de ahora; «se sale de su pieza» sólo si el texto
      del PSD estaba dentro de algo sólido (botón), no en un texto suelto ni junto a iconos; mezcla con la gamma de
      Photoshop; caracteres de control fuera, corte por letra; primera corrida con letras; párrafos no se vuelven
      saltos suaves; «uno de sus textos».
      No arreglado (anotado): confirmar al Cancelar con texto escrito (igual que con piezas movidas); avisos de texto
      también junto al campo (hoy en «Revisar» y en la tarjeta); lo guardado no va por persona (en una Mac compartida,
      otra persona con un PSD del mismo nombre ve los textos: la nota de la página lo enseña y se vuelven al PSD de un
      clic); un texto quitado en una pieza de varios textos, si después se olvidan las tipografías, sale en el PNG (el
      editor no deja quitarlo sin ellas); pintar una vez por texto en vez de dos; Photoshop abriendo el PSD con texto
      cambiado, Safari/Firefox y un lector de pantalla real: sin probar.
      **Paso 1 — el PSD por medida, editable:**
      - [x] `psd-editable.ts` (puro): copia el árbol de la mesa (carpetas, subcarpetas, orden, ocultas incluidas) y
            a cada capa le aplica el movimiento de SU pieza (escala pareja + desplazamiento; el fondo, el del fondo):
            píxeles y máscaras remuestreados (Lanczos de nitido.ts), texto vivo (matriz del texto), objetos
            inteligentes (sus 4 esquinas, con su archivo adentro), formas (trazo, caja de origen, radios, grosor),
            efectos en px ×k. Sólo se aplana lo que no se puede escribir (texto vertical) y se dice por capa.
      - [x] Piezas quitadas en esa medida: van ocultas. Sombra de contraste de HÜE: capa en multiplicar al pie de su
            carpeta. Fondo retocado («Quitar del fondo» / IA): sólo el parche, arriba en la carpeta del fondo.
      - [x] `MaestroPsd`/`MaestroListo` cargan qué mesa son y si se leyeron reducidas (para volver a las coordenadas
            del PSD original).
      - [x] Worker nuevo para la descarga: vuelve a leer el archivo ENTERO (con los originales de los objetos
            inteligentes, que la lectura normal quita), arma y escribe; la página no se congela.
      - [x] El botón «PSD» de la tarjeta usa esto; textos del botón al día; aviso con las capas aplanadas, si hay.
      **Verificación:** (1) identidad en s33: a la medida del maestro sale lo mismo capa por capa (píxeles, textos,
      esquinas, trazos); (2) s33 a 1200×627 y 320×250: mismo árbol y nombres que el original, textos con su letra,
      y la caja de cada pieza cae donde la puso el acomodo (±2 px); (3) mutaciones atrapadas; (4) en el navegador
      (localhost, s33): bajar el PSD de una tarjeta editada, leerlo de vuelta; (5) tsc, eslint, test-formatos;
      (6) la prueba REAL: un diseñador lo abre en Photoshop con una lista corta de qué revisar.
      · Hecho y medido (2026-10-19): test-formatos 340/0. s33 identidad: las 24 capas salen iguales (píxeles, caja,
        texto, esquinas, trazos, efectos). 1200×627 / 320×250 / 1080×1920: mismo árbol que el original, textos vivos
        con su letra DiDi (ver la corrección de «Hasta» abajo), 11 objetos inteligentes con su archivo, cada pieza a ±1.5 px de donde la puso
        el acomodo, trazos, esquinas, formas vivas y sombras de capa a escala. 15 mutaciones, las 15 atrapadas (3 se
        escapaban al principio: radios, grosor y caja de la forma viva → prueba nueva). 200-600 ms y 42-60 MB por medida.
      · Navegador (localhost, s33 real, servidor de prueba en 127.0.0.1:8765): «Quitar del fondo» + «PSD» de 1200×627
        → 56 MB en 0.75 s, con «Fondo retocado (HÜE)» en Background y «Sombra de contraste (HÜE)» en Copy; tres clics
        seguidos (y un doble clic) → 3 archivos, uno tras otro; worker forzado a fallar → sale el de capas planas con
        el aviso. Pintando sus capas a mano, cada pieza cae donde la tarjeta (sin efectos: eso lo pinta Photoshop).
      · Arreglado en la revisión propia: recortadas (clipping) de primer nivel iban con el fondo y no con su base;
        topes antes de decodificar (capas ocultas enormes, máscaras, ZIP); de a uno por página (cola).
      · Corrección (2026-10-19): «Hasta» es texto en un trayecto (en arco; `textPath.data.type === 2`) y ag-psd no
        lo sabe escribir: va como imagen y el aviso lo dice. Quedan 4 textos vivos, el legal entre ellos.
      · Revisión (4 revisores + barrido propio), todo arreglado con su prueba: máscaras de carpeta y capas ocultas
        con tope antes de decodificar; registros de objetos inteligentes revisados antes de leer (FEid/FXid fuera);
        tope de memoria 64 MB al leer; tope de lo que sale (las capas crecen con k²) y cajas recortadas a la medida;
        remuestreo por bandas; archivo de hasta 200 MB (antes 500); worker cancelable al salir; la fila arma el pedido
        en su turno; avisos con la medida, persistentes si hay capas aplanadas; códigos de falla («topes» se puede
        reintentar en otra medida, lo demás marca el archivo hasta volver a abrirlo); mesas buscadas a cualquier
        profundidad, con su caja; la sombra de HÜE va dentro de la carpeta sólo si la carpeta no la aísla.
        Rechazado con evidencia: conjugar la transformación de la forma viva (en s33 la mía da la misma caja de
        origen en las dos mesas). test-formatos 348/0.
      · Navegador otra vez (localhost, s33, 2026-10-19): 3 clics → «Armando…» / «En fila…» / «En fila…», 3 archivos en
        2.4 s (55.6 / 42.6 / 64.3 MB), «Hasta» como imagen y el legal como texto vivo al leerlos de vuelta; fallas
        forzadas: «topes» (no marca el archivo), «inseguro» y «otro» (marcan; las que ya estaban en fila no vuelven a
        abrir el worker); «Cambiar PSD» a media armada → worker cerrado, nada se descarga; sin requestAnimationFrame
        (pestaña de fondo) la fila sigue (0.8 s). Arreglados en esta prueba: la fila se detenía en pestaña de fondo y
        las medidas en fila no veían que el archivo ya había fallado.
      · Segunda vuelta de los 4 revisores (2026-10-19), arreglado con prueba (8 de 8 cambios a propósito atrapados):
        recorrido estricto de los bloques del final en el editable (se salta los ceros como ag-psd y lo que no sabe
        seguir lo rechaza, en vez de dejarlo sin revisar); `strict` al leer (nada reserva memoria por leer más allá del
        final, también en los bloques de cada capa); sólo PSD versión 1; la sombra de HÜE va SIEMPRE justo debajo de la
        carpeta de su pieza (adentro, el estilo o la máscara de la carpeta la tomarían como forma); el retoque va sobre
        el fondo de abajo aunque otro fondo vaya encima de una pieza; código «archivo» para topes del archivo (marca el
        archivo y lo dice); sin memoria en una medida = «topes»; las de capas planas también en la fila, de una en una;
        sin espera de cuadro en pestaña de fondo; avisos: el repetido de un mismo archivo se va solo, el de capas planas
        se queda hasta cerrarlo, frases arregladas. Los 5 PSD reales de la Mac se leen igual con todo esto.
      · Límites conocidos: los rellenos de patrón conservan su escala (ag-psd no la escribe); filtros inteligentes van
        con aviso «revisar» (s33 no los trae); texto en trayecto y vertical van como imagen; en mesas leídas reducidas
        (más de 12 MP) puede haber ±1 px; Photoshop pide «Actualizar» los textos al abrir.
      · Pendiente a propósito: contraste del aviso amarillo de sonner y el «Close toast» en inglés del botón de cerrar
        (los dos son del Toaster de toda la app, `components/ui/sonner.tsx`); si se edita una medida mientras espera en la
        fila, baja lo que la tarjeta mostraba al hacer clic; sin botón para cancelar la fila (se cancela al salir).
      · Sin revisar: si Chrome (perfil normal) pide permiso para «descargar varios archivos» con 3+ clics seguidos.
- [~] B21. La lectura de la PANTALLA también en modo estricto (2026-10-19, sesión lateral, rama
      `claude/inspiring-curie-f734db`). En `prisma` (GitHub) desde 2026-10-19 por orden de Pedro ("merge the 2 fixes into
      prisma (test version only, not the live app)"): 2b51dab + 3cc9f7b, avance directo sobre 1e6d99b. NO en main.
      · Hecho: `leerPsd` con `strict: true` (un dato que dice medir más de lo que queda del archivo ya no reserva hasta
        100 MB en ceros); error de archivo mal formado → mensaje claro en español; CMYK / Lab / otro modo y 16 bits →
        "El PSD está en … Qué hacer: guarda una copia en RGB / en 8 bits" (Pedro: "yes" a arreglar el de CMYK).
        test-formatos 365/0; navegador (localhost :3017): copia rota y copia en CMYK dan su mensaje, s33 real 12/12.
      · Riesgo abierto: strict puede rechazar un PSD BUENO si un Photoshop distinto guarda un recurso con bytes de más
        (p. ej. el 1082, información de impresión). Probado sólo con 2 de Photoshop (s33, APGIANTCARD); los otros 3 son
        nuestros. **Siguiente:** que diseño mande 3-4 PSD de otras computadoras (y uno de otra app si alguien la usa)
        a Escritorio › formatos-prueba y correr `node scripts/test-formatos.mjs` (agregar sus rutas a `reales`).
      · Para después (sólo con archivos dañados): un bloque malo dentro de una capa se pierde sin aviso (la capa va
        como imagen, sin texto vivo); el worker editable llama «formato» a un "Invalid signature" de NUESTRO escritor
        (psdWriter.js:104), culpando al archivo.
- [x] B22. Elegir medidas: para bajar y para la IA (Pedro, 2026-10-20: "select which sizes to download… the zip needs
      to have folders inside "Editables" (with the psd's inside) and "Entregables" (with the png's) also that same
      selector should let you select the sizes you want to modify with ai"). Pedro eligió (2026-10-20): "Checkbox on
      each card", "Both folders, can untick" y, para la IA, "Do nothing for AI" (el arreglo del fondo sigue en todas
      las medidas de la mesa, como hoy).
      **Next Step:** B22 hecho (abajo, Review B22), en `prisma` (preview). Que Pedro o un diseñador bajen un ZIP con
      2-3 medidas marcadas en la preview y lo abran con doble clic (Mac; y Windows si alguien lo usa).
      · Hoy: no hay selector. El ZIP lleva SÓLO los PNG, sueltos, de todas las medidas prendidas; la única forma de
        dejar una fuera es apagar su pastilla arriba (y entonces su tarjeta también se va). El PSD de cada medida sale
        sólo con el botón de su tarjeta, uno por uno. «Quitar del fondo» y «Rellenar con IA» arreglan el fondo de la
        mesa UNA vez (una llamada, ≈ US$0.041) y todas las medidas que salen de esa mesa lo usan.
      · Peso (s33): cada PSD editable pesa 42-55 MB → 12 medidas ≈ 600 MB en un ZIP. Tiempo de 12 seguidas: sin medir.
      · Lo que se propuso: (1) casilla en cada tarjeta + barra «5 de 12 elegidas · Todas · Ninguna», empiezan todas
        elegidas; (2) el ZIP lleva `Entregables/` (PNG) y `Editables/` (PSD) de las elegidas, con dos casillas para
        dejar fuera una de las dos (las dos prendidas de inicio), avance «PSD 3 de 5» y Cancelar; (3) la IA y el
        espejo se piden UNA vez por mesa (mismo costo) y el fondo retocado se pone sólo en las medidas elegidas al
        hacer clic; cada medida lo recuerda, así luego se puede elegir otras para bajar.
      · Plan:
        - [x] a. Elegidas en la página (un Set por PSD, todas al abrir), casilla en la tarjeta, barra Todas/Ninguna.
        - [x] b. Sacar el armado del PSD de la tarjeta a UNA función que usen el botón de la tarjeta y el ZIP (mismo
              editable, mismo respaldo plano, mismas notas).
        - [x] c. ZIP por partes (fflate `Zip`, sin copiar todo dos veces en memoria), carpetas, avance, Cancelar, un
              resumen al final (cuáles PSD salieron planos y por qué).
        - ~~d. Retoque de fondo por medida~~: FUERA (Pedro: "Do nothing for AI").
        - [x] e. Pruebas (test-formatos) + navegador con s33: elegir 3, bajar, abrir el ZIP y leer de vuelta sus PSD y
              PNG; con «Quitar del fondo» puesto, el ZIP lleva el fondo retocado igual que la tarjeta.
      · Verificación: npm test verde; el ZIP real abierto (carpetas, nombres, sólo las elegidas); los PNG iguales a la
        tarjeta; los PSD iguales al botón de la tarjeta; tsc, eslint y build limpios. Sin migración ni deploy.
      **Review B22 (2026-10-20):** con s33 en el navegador (localhost, DiDi cargadas): 3 marcadas → ZIP de 141.5 MB con
      sólo esas 3 en `Entregables/` y `Editables/`; su PSD 320×250 es IDÉNTICO byte a byte (sha256) al del botón «PSD»
      de la tarjeta, y sus PNG iguales píxel a píxel a las tarjetas. Las 12 con PNG + PSD: 629.3 MB en 8.4 s; `unzip -t`
      sin errores y `ditto` (lo que usa el doble clic de Finder) saca las 2 carpetas con 12 cada una. Sólo PNG: 15.4 MB.
      Ninguna marcada / ninguna carpeta: lo dice y no baja nada. «Cancelar» a la mitad (PSD 5 de 12): para en ~0.2 s,
      no baja nada, lo dice y el foco vuelve al ZIP. Abrir el PSD otra vez: las 12 marcadas de nuevo. Consola limpia.
      Pruebas: test-formatos 463/0 + las de tope/rutas/falla a medias; npm test todo verde; tsc, eslint y build limpios.
      · Revisión (5 pasadas): arreglado: un archivo que falla a medias dejaba el ZIP trabado hasta el final (ahora lo
        tira al momento); sin tope, más de 4 GiB salía roto sin avisar (fflate no escribe ZIP64) → tope de 2 GiB y los
        PSD que no caben se saltan y se nombran; ruta insegura rechazada en el ZIP; abrir otro PSD corta el ZIP en curso
        y suelta lo marcado (no retiene el PSD viejo); «Cancelar» a la IZQUIERDA del ZIP (el ZIP ya no se corre: un
        doble clic no cancela); «Cancelando…»; la barra no crece en alto (lo del ZIP bajo los botones) y el margen bajo
        la barra subió a 192 px (medido: barra hasta 149 px; foco a 192); los avisos de bajar (ZIP y PSD de tarjeta)
        abajo a la derecha (arriba tapaban el botón del ZIP: lo vi al probar), uno a la vez y con título + líneas; las
        notas de capas ya vistas no detienen el aviso; nombres para lector de pantalla que empiezan con lo que se ve
        («Ninguna: …»); casillas y enlaces más grandes (36 px la de la tarjeta); textos sin "1 PNGs".
      · Después (Pedro, 2026-10-20: "i want to use entregables too … if the zip is to big dont drop psd just generate
        separate zips and named them"): (1) un ZIP que pasaría de 2 GiB sale en varios, `…_formatos_1.zip`,
        `…_formatos_2.zip`… (cada uno se baja al llenarse; abiertos en la misma carpeta se juntan sin pisarse); sólo un
        PSD que no cabe ni solo se salta y se nombra. Probado con el tope bajado a 200 MB: 4 ZIP (189/165/191/85 MB),
        `unzip -t` sin errores en los 4, `ditto` los junta en 12 + 12, el PSD 320×250 idéntico al de la tarjeta.
        (2) La puerta de imagen plana: su ZIP va en `Entregables/png/` y `Entregables/jpg/` (no probado en el
        navegador: necesita sesión y un anuncio generado). (3) Falla encontrada al probar: el TERCER ZIP seguido fallaba
        ("network error": el navegador sin espacio). El ZIP ya no copia los PSD (lo escribe `zip.ts`, sin fflate) y suelta
        el anterior al empezar: 4 seguidos sin falla. Un PSD que no se deja leer queda fuera y se dice; el ZIP sigue.
      · No arreglado (anotado): «Cancelando…»
        sólo se ve si parar tarda (aquí paró antes de pintarse); cuánta memoria pide un ZIP de 12 PSD: sin medir; Safari,
        Firefox y Windows sin probar; el aviso del «PSD» de cada tarjeta sigue en un solo párrafo (el del ZIP ya va en
        título + líneas); los «Todas»/«Ninguna» miden 28 px de alto (la norma de la app es 36).
- [x] B23. Pasada de diseño de la puerta PSD (Pedro, 2026-10-20: "what do you propose?" para que sea más bonita y fácil:
      botones, controles, tarjetas, espacios). Sesión lateral. Propuesta: https://claude.ai/artifact/EiXDS4FkRiB1Zeqxx4VpUT.
      Pedro eligió **B** ("Build B (tidy and lift the results)"). Construida y en `prisma` (preview).
      **Next Step:** que Pedro o diseño abra las dos puertas en el preview de `prisma` y diga qué estorba todavía (la de
      imagen plana ya tiene la misma pasada: ver su Review abajo).
      · Medido hoy (localhost, s33, 12 medidas de DiDi): a 1440×900 la primera tarjeta empieza en 1001 px (bajo el borde
        de la pantalla); a 1280×960 en 1017. Título 88-232, ajustes 252-657, «En varias medidas» 673-856, barra 872-957.
        Cinco altos de botón (24, 28, 32, 36, 40 px): 41 botones de tarjeta + «Cambiar PSD» en 32; «Todas», «Ninguna» y
        las 2 casillas del ZIP en 28; en el editor, flechas de capa 28 y «Quitar en esta medida» 24. Letra de botón 12 px
        y de pastilla 14. 11 de 12 tarjetas en ámbar («11 para revisar»): la pieza repetida cuenta en cada una. En las 5
        verticales «PSD» queda solo en un segundo renglón. «Esta proporción todavía no…» (24 palabras) ocupa 5 renglones
        en tarjetas de 200 px; las verticales miden 688 px. Contraste en caja dentro de la tarjeta. La fila del ZIP mezcla
        enlaces, casillas y botones (la regla de ajustes.tsx dice que lo que se prende es pastilla). Huérfanas: horizontal
        4 + 1 a 1440, 3 + 2 a 1280. Editor: ~100 palabras de ayuda gris antes de «Textos»/«Capas»; panel con scroll (990
        en 875); «Cancelar»/«Guardar» de 32. Prueba de CSS en la página (tirada después): la primera tarjeta sube de 1001
        a 731 px con título en una banda, chips en la fila del archivo y «En varias medidas» en una línea por punto.
      · A (sólo ordenar): un alto (36) y una letra (13) para todo; tarjeta con acciones en 2 renglones («Editar» arriba,
        PNG|PSD juntos abajo), el aviso común en gris con salto al arreglo, texto largo en 2 renglones con «Ver más»,
        contraste sin caja; fila del ZIP con Todas/Ninguna junto al conteo y carpetas como pastillas. Nada se mueve.
      · B (recomendada): A + arriba más corto (título en una banda, chips junto al archivo, «Agregar medida» al final
        de Banner, «En varias medidas» en una línea con «¿Por qué?»); editor con «Capas»/«Textos» primero.
      · C (mesa de revisión): B + tarjetas tipo mosaico con los detalles a un clic, vista grande con ← → y botones, ZIP
        con menú. Más corta, pero esconde notas, contraste y carpetas; cambia el flujo justo cuando diseño prueba B22.
      · No hacer nada: funciona y diseño está por probar B22; pierde porque los 5 altos y el ámbar en 11 tarjetas se
        ven cada vez.
      · No revisado: modo oscuro, tarjeta mientras espera su pintada, la puerta de imagen plana (necesita sesión).
      · **Review (2026-10-20, B construida: 1000ff8 · e158800 · 1977df3 · 0fb1609 · 977ae7a + d105f3a de la revisión):**
        - Un alto (36 px) y una letra (13 px) para los botones de la página, el editor y la vista grande (`BOTON`,
          `BOTON_TARJETA`, `PASTILLA`). Medido en el DOM: todos 36/13 salvo «Todas»/«Ninguna» (34, dentro del grupo con
          borde) y el «Cerrar» que flota sobre la vista del editor (24, a propósito: uno de 36 tapaba piezas de un banner).
          Los enlaces dentro de una frase («Ver más», «Cómo funciona») van con la letra de su frase (12).
        - Tarjetas: acciones al pie (angosta: «Editar» arriba y PNG|PSD juntos abajo; banner: una fila). La pieza repetida
          ya no pinta ámbar: gris «Aviso común» con un botón que sube a «En varias medidas». Resumen con s33: "12 medidas ·
          6 para revisar · 11 con un aviso común" (antes "11 para revisar"). Tras «Quitar del fondo»: "11 para revisar",
          las 11 retocadas en ámbar (clic real, y «Deshacer» lo regresa). Aviso largo en 2 renglones con «Ver más».
          Contraste sin caja.
        - Arriba: título en una banda; fichas en la fila del archivo; «Agregar medida» al final de Banner; «En varias
          medidas» con una frase por pieza y «Cómo funciona» que se abre; junto al botón de la IA, a la vista, qué se le
          manda a Google. Fila del ZIP: conteo + Todas + Ninguna juntos; carpetas como pastillas.
        - Editor: «Capas»/«Textos» primero; la ayuda en «Cómo se usa: mouse y teclado». Panel: 990 px de contenido en 875
          → 746 en 691.
        - Medido (s33, 12 medidas, localhost, sin sesión): 1440×900 primera tarjeta 1001 → 839 px; 1280×960 1017 → 883;
          verticales 688 → 669; barra pegajosa 93 px a los dos anchos (192 de `scroll-mt-48` alcanzan). Sin scroll de
          lado. Ningún botón de contraste se sale de su tarjeta (todas las filas abiertas, 221 y 239 px). La propuesta
          prometía 731: la maqueta era más chica que el plan (lección del día).
        - Revisión (5 pasadas). Seguridad: nada. Arreglado: «Fondo retocado» había quedado como aviso común (lección);
          anillo de foco cortado en «Todas»/«Ninguna» y en «Cómo se usa»; «Ver más» aparecía un cuadro tarde y no decía de
          qué aviso era; «Cómo funciona» sin nombre de la pieza y abierto con otro PSD; la ayuda del editor dentro de un
          <details> cerrado como descripción (ahora copia `hidden`); la nota de Google escondida; grupo PNG|PSD con nombre
          repetido; carpetas del ZIP sin `lang="es"` en inglés; «Volver a la lista» hacía brincar la fila; EN "fixed
          above" → "fix it above"; `lang` del botón de idioma en la puerta plana.
        - No arreglado (anotado): el mismo tamaño escrito en 3 archivos (verificado: 50, sólo mantenimiento); íconos de 14
          en tarjetas y 16 en la barra; «Voltear» desaparece en una tarjeta editada y la razón sólo la oye el lector (ya
          era así); «Volver a los textos del PSD» de 16 px en la barra (ya era así); el «Cerrar» del editor en español con
          la pantalla en inglés (ya era así); `backdrop-blur` de la barra (ya era así); huérfanas 4 + 1 a 1440 y 3 + 2 a
          1280 (ningún `minmax` arregla los dos anchos); a 1440 las fichas bajan a un 2º renglón en la fila del archivo.
        - No revisado: la línea de Google junto a la IA (el botón de la IA no sale en este localhost); la barra con la
          línea de textos cambiados o con zoom; lectores de pantalla reales (VoiceOver/NVDA); la puerta de imagen plana en
          el navegador (sólo cambió su encabezado; sus 14 botones siguen en 28 px / 12 px); Safari y Firefox.
        - Pruebas (sobre d105f3a): test-formatos 469/0 · npm test todas las suites con 0 fallas (prisma 975, formatos 469,
          481, 574, 81, 44) · tsc 0 · eslint 0 · `npm run build` exit 0.
      · **Review puerta de imagen plana (2026-10-20, 57ad8ea · d15bec3, sesión lateral):**
        - Lo mismo que la puerta PSD en `formatos-studio.tsx`: los 14 botones `size="sm"` (28 px, letra de 12) y «Generar»
          (32) pasan a 36 px con letra de 13 (`BOTON`, 44 con dedo); «Usar estas medidas» y «Agregar medida libre» de 40 a
          36; el selector de marca y los campos de ancho y alto de 40/14 a 36/13 (`CAMPO`). El selector de relleno mide 36
          por fuera (sus botones, 30 dentro del riel). «Todos»/«Ninguno»: lo que oye el lector ahora empieza con lo que
          dice el botón ("Todos: elegir…", "None: clear every size"); antes "Elegir…" y "Quitar…".
        - Tarjetas de resultado como en la PSD: botones al pie bajo una línea, PNG|JPG en un par, íconos de 14. Columnas
          por ancho de tarjeta (`minmax(13.5rem,1fr)`), no por ancho de pantalla: con 36 px «Rehacer · IA (0.07 USD)» mide
          ~190 y la tarjeta de 208 px (3 columnas a 1280) deja 182 adentro. 1440: 3 columnas de 261 (tarjetas 446/374 →
          479/407, 3 renglones de botones). 1280: 2 columnas de 318 (2 renglones). Descartado: dejar que ese botón se
          parta en 2 renglones (rompe el alto único) o quitarle relleno (cabía con 0 px de sobra).
        - Medido en el DOM, muestra `?demo=formatos` a 1440×900 y 1280×960: antes 16 botones + 3 enlaces de 28, 57 de 32
          y 2 de 40; después 19 botones + 3 enlaces de 36/13 y campos de 36/13, sin scroll de lado. Con sesión (Pedro, con
          Google): encabezado igual al de la PSD al píxel (1440: título 124-162 con el lema en la misma banda, idioma en
          y126; 1280: el lema baja a 166-186 en las dos puertas); selector de marca 36/13 con 3 opciones; consola sin
          errores.
        - Igual que la PSD a propósito: botón de idioma 36/12 y «Volver» 36/14. Sin tocar: casillas de 20, puntos de color
          de 24, cuadro de la lista de 2 renglones (46).
        - No revisado: con sesión, la lista de tamaños y las tarjetas (subir un anuncio necesita la 0078, que no está en la
          base: se vieron sólo en la muestra local; ACTUALIZADO 2026-10-21: con la 0078 aplicada se subió un anuncio y se
          generó 1 tamaño con sesión, botones de la tarjeta 36/13 y el foco siguió en «Generar» de la fila a «listo»);
          la confirmación de «Cambiar anuncio» (en la muestra está apagado);
          modo oscuro; Safari y Firefox; lectores de pantalla reales.
        - Encontrado, ya era así, y arreglado aparte (adf8cb0, Pedro: "do this task here"): «Rehacer»/«Reintentar»
          desaparecía mientras su tamaño esperaba en la fila y, ya armándose, quedaba deshabilitado; el foco del teclado
          caía al <body> (Chrome 152 lo manda ahí al deshabilitar el botón que lo tiene: medido). Ahora la tarjeta pulsada
          conserva su pie, el botón ocupado va con `aria-disabled` y no hace nada al clic, y no cambia de nombre hasta que
          termina. Medido con un sustituto temporal en la muestra (quitado antes del commit): el foco sigue en el mismo
          botón en fila, armando y al terminar (listo y con error); 2 clics más mientras se arma no arrancan otra tanda;
          con la lógica de antes, el foco caía al <body> a los 42 ms. Pruebas sobre adf8cb0: npm test exit 0 (formatos
          469/0 y las demás con 0 fallas) · tsc 0 · eslint 0 · build exit 0.
        - Mismo problema, arreglado después (9687a3f, Pedro: "fix the same focus loss on Generar, Descargar ZIP, PNG/JPG
          and Reintentar los que no salieron"): «Generar», los dos «Descargar ZIP» (Resultados y la confirmación de «Cambiar
          anuncio») y PNG/JPG se deshabilitaban al pulsarlos, y «Reintentar los que no salieron» se quitaba mientras
          corría. Ahora van apagados con `aria-disabled` (`APAGADO`: opacidad 0.5 y cursor no permitido, medido) y el clic
          no hace nada mientras están ocupados. «Reintentar…» se queda mientras corre; si al final ya no queda ninguno, se
          va y el foco pasa al ZIP de al lado. «Generar» sin nada por generar también va con `aria-disabled` (antes
          `disabled`): se llega con Tab y se anuncia como no disponible.
          Medido con el mismo sustituto en la muestra (quitado antes del commit), antes → después: los cinco perdían el foco
          al <body> a los 41-44 ms → en los cinco el foco sigue en el botón hasta el final; «Reintentar…» con un tamaño que
          vuelve a fallar se queda con el foco y, si sale, el foco pasa a «Descargar ZIP (4)»; 2 clics más mientras están
          ocupados no arrancan otra tanda, otro ZIP ni otra descarga (terminan a tiempo: 830-848 ms ZIP/PNG, sin volver a
          «En fila» en Generar y Rehacer). Hallazgo al probar: en el panel del navegador `focus()` por código no dispara
          eventos de foco (la ventana no está activa), y un botón que se quita no avisa con blur; por eso «tenía el foco» se
          lee al pulsar, no con onFocus/onBlur. Pruebas sobre 9687a3f: npm test exit 0 (481, 975, 469, 574, 81, 44; 0 fallas) ·
          tsc 0 · eslint 0 · build exit 0.
        - Mismo problema en «Usar estas medidas» y «Agregar medida libre», arreglado (3631b1f, Pedro: "Yes, fix the
          focus loss on «Usar estas medidas» and «Agregar medida libre» the same way"): se deshabilitaban solos al vaciar
          su campo después de usarse. Ahora van con `aria-disabled` (`APAGADO`) y su envío no hace nada con el campo
          vacío (antes lo frenaba el botón deshabilitado; Enter en un campo vacío tampoco agrega ni marca error). Medido con
          uso real en la muestra (sin sustituto: los dos sólo cambian la pantalla), antes → después: hacían su trabajo y
          el foco caía al <body> a los ~84 ms → hacen lo mismo («2 medidas de la lista · 1 elegidas · 1 requieren
          rediseño», 500×400 agregada una vez, campos vacíos) y el foco sigue en el botón; pulsarlos apagados (cuadro
          vacío, un solo campo) no agrega nada ni muestra error; `requestSubmit()` con un solo campo no hace nada y con
          los dos agrega 640×480 con el foco en el campo. Pruebas sobre 3631b1f: npm test exit 0 (481, 975, 469, 574,
          81, 44; 0 fallas) · tsc 0 · eslint 0 · build exit 0.
        - La ✕ de una medida libre, arreglada (af74f50, Pedro: "yes fix it"): quitar la medida se lleva su renglón y el
          foco caía al <body>. Ahora, si la ✕ tenía el foco, pasa a la ✕ de la medida siguiente o, si no hay, a la anterior;
          si no queda otra que se pueda quitar, al campo «Ancho». Medido con uso real en la muestra (500×400, 640×480 y
          700×300), antes → después: las tres quitadas dejaban el foco en el <body> → quitar 640×480 lo pasa a la ✕ de
          700×300, quitar 700×300 a la de 500×400 y quitar 500×400 al campo «Ancho»; quitar una con el foco en otro lado
          no lo mueve. No medido: una vecina con resultado (su ✕ está deshabilitada y se salta), porque en la muestra las
          medidas libres no llegan a tener resultado. Pruebas sobre af74f50: npm test exit 0 (481, 975, 469, 574, 81, 44; 0 fallas) ·
          tsc 0 · eslint 0 · build exit 0.
        - El mismo tamaño de botón queda escrito en 4 archivos (antes 3).
        - Pruebas (sobre d15bec3): test-formatos 469/0 · npm test exit 0 (481, 975, 469, 574, 81, 44; 0 fallas) · tsc 0 ·
          eslint 0 · `npm run build` exit 0.
- [x] B24. Elegir el LEGAL de la biblioteca en la puerta PSD (Pedro, 2026-10-21: "a section at the top kind of like
      the legales tab on greenlight where they can click and select one of the saved legales… it gets changed on all
      the sizes but if they go into one specific size and modify it there… it only gets moved in that size"). Pedro
      eligió la **opción 1** ("ok go with option 1"): el selector alimenta los textos cambiados que ya existen (un
      cambio es del anuncio: todas las medidas); mover/agrandar en el editor sigue siendo de UNA medida (ya es así).
      Sin migración: sólo LEE `snippets` (kind legal). Alternativas descartadas: (2) legal distinto por medida (rompe
      "All sizes, once"; sólo si DiDi pide uno corto en banners chicos), (3) nada nuevo (pegar a mano en el editor:
      riesgo de erratas en texto de cumplimiento).
      **Next Step:** que Pedro o diseño lo prueben en el preview de `prisma` con un PSD de DiDi (elegir cliente DiDi,
      «Elegir legal», revisar 2-3 medidas y el ZIP). Y revisar la Biblioteca: los legales de Card guardados dicen CAT
      130.4 % al 31 de mayo; el PSD s33 ya trae 133.9 % al 31 de agosto (¿falta sincronizar Notion?).
      - [x] 1. `page.tsx` (psd): lee los legales activos (kind legal, scope marca o global, como la tarea) con la misma
            condición que los clientes (Supabase + sesión); sólo de marcas activas de clientes activos; letras limpias
            (`limpiarTexto`); los vacíos fuera; si la lectura falla, la fila lo dice (no "no hay").
      - [x] 2. `legal.ts` (puro): `legalDelPsd` (por mesa, en FOOTER: el de la carpeta/parte LEGAL/LEGALES/LEGALS/
            DISCLAIMER, si no el de más letras), `conLegal` (las mismas palabras con otros saltos = sin cambio; vacío o
            de más de 2000 letras no se pone), `conLegalDe` (Deshacer: sólo el legal), `legalVigente`, `legalCabe`,
            `legalesParaCliente`. `limpiarTexto` sale de `textoCambiado` (textos.ts) para que editor y selector limpien
            igual.
      - [x] 3. Fila «Legal» al final del panel de Ajustes (`FilaLegal` en ajustes.tsx): qué legal va (el que trae el PSD,
            uno de la Biblioteca con su marca, o a mano) y «Elegir legal» abre los del cliente por marca + «El que trae
            el PSD». Avisos: legal de otro cliente, mesas donde no se puede poner, lectura fallida, sin cliente, sin
            legales, PSD sin legal, por qué no se puede escribir. «Deshacer» y «El anuncio ya lleva ese legal».
      - [x] 4. Pruebas: test-formatos 489/0 (469 + 20 de B24, una con s33 real) · tsc 0 · eslint 0 · `npm run build`
            exit 0 · npm test (abajo).
      - [x] 5. Revisión (5 revisores en paralelo + Pass 0) y arreglos; navegador con s33 y DiDi (abajo).
      **Review B24 (2026-10-21):**
        - Navegador (localhost, sesión de Pedro, s33, 1440×900): elegir «Legales cuando se hable de CASHBACK*» → la fila
          lo dice, el aviso «Legal «…» en todas las medidas.» con «Deshacer», «1 texto cambiado» en la barra; el editor
          de 1200×627, 1280×720 y 320×250 trae las letras del legal elegido (130.4 %, 31 de mayo). Agrandar el legal en
          1200×627 (102 %, «cambiada») NO cambió 1280×720 ni 320×250 (100 %): sólo esa medida quedó guardada. «El que
          trae el PSD» lo devuelve; «Deshacer» lo vuelve a poner; recargar lo recuerda. Volver a elegir el mismo: «El
          anuncio ya lleva ese legal.» Sin cliente con un legal de DiDi puesto: aviso y el botón sigue (para volver).
          En inglés: la pantalla en inglés y los legales marcados `lang="es"`. Consola: 0 errores después de la marca.
        - Pass 0: los 3 que escriben los textos del anuncio (editor, «Volver a los textos del PSD», legal) usan
          `ponerTextos`; el aviso de éxito sólo si se guardó (como el editor). La consulta de legales = la de la tarea
          (marca o global).
        - Arreglado de la revisión: «Deshacer» restauraba TODOS los textos de antes (borraba lo cambiado en esos 10 s)
          y escribía en otro PSD si ya se había abierto otro → ahora sólo el legal, sobre los textos de ahora, y nada con
          otro PSD (también «Volver a los textos del PSD»); legal de más de 2000 letras se cortaba sin aviso → no se
          ofrece (dice por qué); mesas donde no se puede poner → se dice; vacío → no se pone; lectura fallida decía "no
          hay legales"; el botón desaparecía justo cuando había que volver; legal de otro cliente sin aviso; dos
          palomitas cuando el del PSD = uno guardado; español sin `lang` con la pantalla en inglés; nombre accesible de
          200 letras (ahora título + descripción); grupos por marca con nombre; foco al abrir en el elegido (con
          teclado); «en las 1 medidas»; letra 11/12 px → 12/13 px; sólo marcas y clientes activos; tope de 500 al
          registro.
        - Hallado con el PSD real: su legal trae los saltos del diseñador y los de la Biblioteca son un párrafo; ahora
          las mismas palabras = sin cambio (se quedan los saltos del PSD).
        - No arreglado (dicho): la fila suma ~56 px al panel (B23 cuidó la altura; es la sección que pidió Pedro); con
          varias mesas de legales distintos, «El que trae el PSD» muestra el de la primera y la barra cuenta un texto por
          mesa; con el mouse el foco se queda en «Elegir legal» al abrir (con teclado va al elegido); todos los legales
          de todos los clientes van en la página (5 hoy; cargarlos por cliente si la Biblioteca crece); el aviso de
          «Deshacer» sólo vive 10 s.
- [x] B25. Copiar lo editado en una medida a sus medidas hermanas, según la matriz de producción de Pedro (2026-10-21:
      "if i go to a size and do some changes and based on this table it matches a rule to suggest if you want to apply
      those same changes to the other available size or sizes"). Pedro eligió la **opción 2** ("yes option 2"): la
      tabla entera como reglas; las de la misma forma, copia exacta; las parecidas, copia proporcional marcada
      «revisar». Descartadas: (1) sólo las exactas (4 de 12 medidas), (3) sugerencias esperando en las tarjetas (más
      estado que guardar). Sin migración (todo en el navegador, como las ediciones).
      La matriz (base → hija): 1080×1920 → 720×1280 (escala directa 66.67 %) y → 720×1600 (expansión vertical);
      1200×1500 → 768×1024 (reencuadre leve); 1280×720 → 1200×627 (similar, más comprimida); 600×500 → 320×250 (misma
      lógica); 640×100 → 320×50 (escala directa 50 %). 876×324 sin hermanas.
      **Next Step:** hecho; falta que Pedro lo pruebe en la preview de `prisma`.
      - [x] 1. `matriz.ts` (puro): la tabla (base y modo de cada medida) y `hermanas(medida, activas)`: hijas de la
            medida, su base si es escala directa (las dos direcciones), y cualquier medida activa con la MISMA forma
            (medidas libres). Modo: «igual» (misma forma), «proporcional», «estirar» (720×1600).
      - [x] 2. `copiarEdicion` (puro): igual = todo × el factor; proporcional = cada pieza con su centro en el mismo
            punto relativo y su escala × el factor menor; estirar = escala × el ancho, lo de arriba pegado arriba y lo de
            abajo (legal) pegado abajo. Partes, orden, capas y textos quitados, tal cual. Marca `copiaDe` (de qué medida
            y si hay que revisarla).
      - [x] 3. `aplicarEdicion`: una copia «revisar» avisa «Copiada de W×H con otra forma: revisar» y NO calla los
            avisos de piezas encimadas (nadie la vio). La tarjeta: «Copiada de W×H» en vez de «Editada a mano».
      - [x] 4. Editor: «Aplicar también a» junto a Guardar, una casilla por hermana activa del mismo maestro (igual /
            revisar; «reemplaza sus cambios» si ya tiene), sin marcar. Guardar las copia (también «Volver al
            automático»: las vuelve a su automático). Aviso de lo copiado.
      - [x] 5. Pruebas (matriz, las 3 copias, leerEdicion con copiaDe, s33 1080×1920 → 720×1280 igual al px) · tsc ·
            eslint · npm test · build · revisión · navegador con s33.
      **Verificación:** editar 1080×1920 y marcar 720×1280: sale igual a escala; 720×1600 copiada con «revisar»; una
      medida que no se marcó no cambia; «Volver al automático» con casilla limpia la copia; recargar la recuerda.
      **Review B25 (2026-10-21):**
        - Navegador (localhost, sesión de Pedro, s33, 1440×900 y 1280×800): en 1080×1920 el CTA a (523.7, 1296.5, k 0.9)
          y marcadas las dos → 720×1280 (349.13, 864.33, k 0.6) = exacto × 2/3, sin aviso; 720×1600 (349.13, 1184.33):
          a su distancia × 2/3 del borde de abajo, con «Copiada de 1080×1920, con otra forma…: revisar». 768×1024 y las
          demás, sin cambio. Recargar lo recuerda. «Volver al automático» con 720×1280 marcada: las dos vuelven al
          automático y 720×1600 se queda copiada. Guardar en el editor de la copia: «Editada a mano» (ya es suya).
          «Deshacer la copia»: 720×1280 al automático y 720×1600 a su edición de antes; 1080×1920 se queda. Consola: 0
          errores después de la marca. Pruebas: formatos 506/0, prisma 975/0, npm test y build verdes.
        - Pass 0: un solo camino guarda ediciones (`guardarEditada` → `guardarEdicion`) y una sola etiqueta en la tarjeta.
        - Arreglado de la revisión (5 pasadas): la escala copiada se recorta a los topes de la medida ANTES de ubicar
          la pieza (en 320×50 una pieza chica crecía desde su esquina); «revisar» sale de las dos medidas (misma forma
          o no), no de un dato guardado que podía quitar el aviso; «copiada de» se lee con `medidaValida`; con el HERO
          del otro lado, la copia se refleja; en una copia de la misma forma sí se avisa si una pieza movida queda
          encima de una del automático de AQUÍ; «Deshacer la copia» (reemplazaba lo editado a mano en la hermana sin
          vuelta); el aviso dice qué medida se guardó y sólo cuenta las copias guardadas; el renglón de pastillas le
          quitaba 67 px de alto a la vista (608 → 674 px, medido) → ahora va en el renglón de los botones; «Al guardar,
          aplicar también a:», «misma forma» / «otra forma: revisar», «Guardar y copiar (2)»; el editor de una copia
          la ve con sus avisos y dice «Lo de aquí se copió de… Al guardar, queda como suyo»; lector de pantalla: qué
          quiere decir cada modo, sin «punto» ni la medida dos veces; gris más oscuro en la pastilla marcada.
        - No arreglado (dicho): «estirar» decide arriba/abajo por pieza (el centro justo en medio va arriba): una pieza
          que cruza la mitad puede quedar lejos de la de al lado; va marcada «revisar» y la familia vertical alta es de
          B26. En la familia «igual» el acomodo no busca piezas encimadas: ahí lo que pide revisar es el aviso
          «copiada». Una copia reflejada de la misma forma (sólo pasa con medidas libres horizontales) no se marca
          «revisar». «Copiada de» no se actualiza si después se edita la de origen sin marcar la copia. Los avisos de
          Sonner salen sin `lang` en inglés (todos los de la página, no sólo éstos). «Deshacer la copia» vive 10 s.
- [x] B26. «Comportamiento» de la matriz en el acomodo AUTOMÁTICO (Pedro, 2026-10-21: "yes i do want the
      comportamiento thing"). Primero una comparación del acomodo de hoy contra cada fila (con s33), luego opciones a
      Pedro para las filas que no coincidan.
      **Decisiones de Pedro (2026-10-21), opción 2 ("yes with your recommendation"):**
      1. Legal: "you shouod be able to expand the legals like if they are normally 3 lines reduced to 2 lines or even
         one in the long banners" → el legal sigue lo más legible posible (como hoy) y, en anchas y banners, se puede
         volver a acomodar en menos renglones. Investigación aparte (agente), con opciones a Pedro.
      2. HERO en 768×1024 y altura extra en 720×1600: "middle point as long as it looks good" → a la mitad entre el
         acomodo de B13 (cada pieza en su lugar del fondo) y el de la tabla (bloque de arriba arriba, legal abajo, el
         HERO crece con la altura extra).
      3. 876×324: "whatever comes from the script takes precedence and if its different from the table have a warning
         saying that but leave it to the designer to choose" → se queda el orden del script, con un aviso.
      4. 320×50: "follow the table" → la mitad exacta de 640×100 (deja sin efecto «320×50 se queda igual» de B8).
      **Next Step:** hecho; falta que Pedro lo pruebe en la preview de `prisma` y elija cómo seguir con el legal (A/B/C).
      - [x] 1. 876×324 (familia ancha): aviso «la matriz pide texto · HERO · beneficios+CTA; este sigue el script»
            (no sale si la persona ya la editó).
      - [x] 2. Más alta que su maestro (familia «igual»: 768×1024, 720×1600; y las 9:16 cuando el PSD sólo trae 4:5):
            el acomodo de la tabla (arriba / HERO / abajo; el HERO toma la altura extra hasta ×1.5 y sin pasar de sus
            píxeles) mezclado a la mitad con el de hoy. El aviso de «forma» dice lo que se hizo.
      - [x] 3. Medidas que la matriz saca a escala de otra (320×50 ← 640×100; 720×1280 ← 1080×1920): si el maestro no
            tiene su forma, su acomodo es el de la base × el factor, y el legal crece si cabe sin tocar a nadie.
      - [x] 4. Pruebas · tsc · eslint · npm test · build · revisión · navegador y hojas de contacto con s33 y AP.
      **Review B26 (2026-10-21):**
        - Hecho: la tabla vive en `tabla-matriz.ts` (sin imports; la leen `acomodo.ts` y `matriz.ts`). 720×1280 y 320×50
          salen de su base × el factor cuando el maestro no tiene su forma (`aEscala`), con una nota gris. Más alta que
          su mesa (768×1024, 720×1600, 1080×1920 desde un 4:5): `acomodoAlto` (bloque de arriba arriba, legal abajo, el
          HERO crece con su pie fijo en su punto del fondo, hasta ×1.5 y sin pasar de ×1.25 sus píxeles), mezclado a la
          mitad con B13. 876×324: nota «distinto de la matriz… como el script del equipo» (se voltea con el lado del
          HERO; se va al editarla). Las notas (`esNota`) no cuentan en tarjeta, resumen ni editor.
        - Hojas de contacto antes/después (s33 y APGIANTCARDUGC 2, scratchpad b26/ y b26/despues/): HERO ×1.12 en AP
          720×1600, ×1.055 en AP 768×1024; tarjeta de s33 ×1.19 en 1080×1920, ×1.25 en 720×1600, ×1.09 en 768×1024.
          Las demás medidas, sin cambio. Repetido después de los últimos arreglos: las 12 medidas de los 2 PSD, iguales.
        - 320×50 = 640×100 × 0.5, como pidió Pedro: las letras quedan más chicas (s33: título 7.8 → 3.9 px, legal 5.9 →
          3.5 px; AP: título 5.1, subtítulo 5.0, legal 3.5). Dicho a Pedro una vez con la alternativa.
        - Navegador (localhost, sesión de Pedro, s33, 1440×900 y 1280×800): nota gris en 720×1600; 876×324 con su
          «Aviso común» y la nota; el resumen pasa de 7 a 6 «para revisar»; el editor de 320×50 abre; 0 errores en
          consola después de la marca. Pruebas: formatos 523/0, prisma 975/0, npm test y build verdes.
        - Arreglado de la revisión (5 pasadas + 2.ª vuelta de código): el HERO se salía 69 px de su punto (pie fijo);
          crecía poco (tope de píxeles 1.25); una búsqueda podía dar k negativo; posible recursión (`acomodarPropio`);
          la nota contaba como defecto en cada 876×324 (ahora nota, sólo en 876×324, con el lado correcto); zonas de los
          lados ignoradas; reparto del aire muerto; helpers duplicados; el legal podía crecer más alto que el área;
          editar sólo el orden borraba las notas; el texto decía que la matriz se aplicaba a cualquier medida más alta;
          una prueba negativa que nunca podía fallar (/más alta/ sin /i); el legal usa `mayor`; el grupo del HERO guarda
          el aire de abajo como el de arriba; sin nada arriba, el tope es el margen del maestro o la zona.
        - No arreglado (dicho): el legal en menos renglones espera la decisión de Pedro (A/B/C abajo). `capasDeMedida`
          en nítido no se protege de k ≤ 0 (de antes; hoy no se llega). `crecerPie` parte del tamaño ya puesto, así que
          con zona segura el legal puede salir algo más grande que antes (más legible: la regla del legal). Las dos
          copias de `entre` en las ediciones son de antes de B26. Los avisos de Sonner siguen sin `lang`.
      **Investigación del legal en menos renglones (2026-10-21, agente opus, sólo lectura; scripts en el scratchpad
      b26-legal/):** el legal es texto de caja (DiDiSans-Pro-Medium 16 px, 205 letras, 3 renglones) con saltos suaves del
      diseñador (U+0003, que `textoDe` vuelve "\n"), en su propia capa dentro de FOOTER junto a los iconos de las
      tiendas. Hoy los renglones se deciden una vez, a la escala del maestro (`maquetar`); ninguna medida re-acomoda.
      Ganancia estimada con las medidas de la tipografía real (sin dibujarla): 876×324 12.5 → 14.8 px (2 renglones),
      640×100 6.2 → 11.0 px (2, deja de marcarse), 320×50 3.1 → 5.5 px (sigue marcado); 1280×720 y 1200×627 ya están al
      tope. Un solo renglón nunca gana (~1,480 px de largo). Los iconos tienen que achicarse con el legal o no se gana
      nada. Sin la tipografía del cliente no se puede (queda como hoy y se dice). Opciones A (banners, M), B (todas las
      anchas + elegir renglones en el editor, L), C (sin tipografía, cortando los píxeles en palabras: adivina). Su
      recomendación: A.
      **Verificación:** 720×1600 (AP y s33): el bloque de arriba más cerca de arriba que hoy, el legal más abajo, el
      HERO más grande que hoy y sin encimarse; 768×1024: HERO ~×1.06; 876×324 con su aviso; 320×50 = 640×100 × 0.5
      (salvo el legal); las 6 que ya coincidían, sin cambio.
      **Comparación (2026-10-21, agente opus, sin cambios al repo; s33 y APGIANTCARDUGC 2, que sí trae 9:16 y 4:5
      visibles; scripts y 24 renders en el scratchpad de la sesión, b26/):**
      - Coinciden: 1080×1920 (AP; s33 no tiene 9:16 visible), 1200×1500, 1280×720, 1200×627, 600×500 (estructura),
        320×250.
      - 720×1280 «escala directa»: todo × 0.667 MENOS el legal (k 0.80 en AP, 0.83 en s33): lo agranda la «Regla del
        LEGAL» (más legible). Cambio chico: en la misma forma, no agrandarlo. Choca con esa regla de Pedro.
      - 768×1024 «hero gana presencia»: hoy todo a 0.64 sobre el fondo; el HERO no gana. Chico-mediano; choca con
        B13 ("they should look like the 1200x1500").
      - 720×1600 «expansión vertical»: hoy cada pieza en su lugar del fondo estirado: el bloque de arriba baja, 19 %
        vacío bajo el legal. Necesita una familia vertical nueva (el script del equipo tiene «tall»). Grande.
      - 876×324: hoy texto · beneficios · hero; la matriz pide copy · hero · beneficios+CTA. Chico; el orden de hoy
        viene del script del equipo (sin cita de Pedro).
      - 640×100: se arma solo desde el 4:5 (HERO de 6-9 % de ancho). La matriz pide diseñarlo primero: una mesa
        640×100 en el PSD ya se usaría como maestro para 640×100 y 320×50 (probado sintético).
      - 320×50 «escala directa 50 %» de 640×100: hoy sale del 4:5, no de 640×100. Mediano (derivar de otra medida
        de salida). Choca con «320×50 se queda igual» (B8) y con la regla del legal.
- [x] B27. El legal en menos renglones en las medidas anchas + elegir los renglones en el editor (Pedro, 2026-10-22:
      "Build option B: fewer legal lines on every wide size, plus a lines picker in the editor"; yo recomendé A, sólo
      banners: PEDRO_OVERRIDE en lessons.md). Sin migración (la elección va en la edición de cada medida, en el navegador).
      **Cómo (mi recomendación; alternativas en una línea abajo):** cada número de renglones es OTRA versión del pie
      (como hace `cambiarTextos` con un texto cambiado): el legal vuelto a escribir con los saltos del PSD juntos y la
      caja de párrafo al ancho mínimo que da N renglones (renglones parejos), los iconos de las tiendas a escala con el
      legal (la misma proporción de alto que en el PSD, del mismo lado y con el hueco a escala), el pie con su mismo
      centro y su mismo borde de abajo. Todo lo de después (acomodo, tarjeta, PNG, contraste, los dos PSD, ZIP) usa esa
      versión sin saber que cambió. En el PSD editable: el texto vivo con sus letras y su caja nuevas, y los iconos
      escalados como capas (no como imagen).
      Alternativas descartadas: (a) que el acomodo mueva las partes del pie sin otra versión del maestro (el texto nuevo
      igual hay que escribirlo, y lo de después tendría que saberlo en 6 lugares); (b) iconos al alto del legal (más
      grande el legal, pero cambia la proporción que eligió el diseñador).
      **Next Step:** hecho (commit en `prisma`, preview). Lo que sigue: que Pedro o el diseñador lo prueben con un PSD real
      y la tipografía del cliente; luego B4/B20.
      - [x] 1. `renglones.ts` (puro): qué legal se puede (pie con UN texto de caja, un estilo, que la página escribe, sin
            placa detrás, con lo demás del pie a un lado; si no, el porqué) y la versión del maestro con N renglones.
      - [x] 2. `revisarMedida`: en las anchas (más anchas que altas) prueba cada N y se queda con el legal más grande sin
            achicar lo demás (empate: los del PSD); la edición puede pedir N (`Edicion.renglones`). Devuelve el maestro
            usado y los renglones (PSD, automático, usados, opciones). Nota gris (no cuenta) cuando van menos que en el PSD.
      - [x] 3. La página: tarjeta, resumen, ZIP y PSD de cada medida con el maestro usado y su escritura; el PSD editable
            con los iconos escalados (`desde` de cada parte) y el texto con su caja nueva.
      - [x] 4. Editor: «Renglones del legal: Automático (N) · 1 · 2 · 3», en todas las medidas donde se puede; si no, el
            porqué. Guardar lo guarda; «Volver al automático» lo quita; B25 lo copia a las hermanas.
      - [x] 5. Pruebas · tsc · eslint · npm test · build · revisión · navegador con s33 (876×324, 640×100, 320×50,
            1280×720, y elegir a mano en 1080×1920) · PSD editable abierto con ag-psd.
      **Verificación:** con la tipografía, 640×100 de s33: legal en 2 renglones y ~11 px (hoy 6.2); 876×324: ~14-15 px;
      1280×720 y 1200×627 se quedan en 3 (ya al tope); las verticales, igual que hoy; elegir 1 o 2 en el editor cambia la
      tarjeta, se guarda, y «Volver al automático» regresa; sin la tipografía, todo igual que hoy y el editor dice por qué.
      **Review B27 (2026-10-22):**
      - Con la DiDi Sans (simulación en Node con la fuente real, s33): 876×324 va en 2 renglones (legal 12.5 → 14.8 px);
        640×100 en 2 (6.2 → 11.2 en la simulación; la página dice 9.8 px, abajo del mínimo de 10, así que su aviso
        sigue); 320×50 en 2 (3.5 → 5.6). 1280×720 y 1200×627 se quedan en 3 (ya al tope). Las altas, como el PSD. El AP
        da lo mismo. En la página: 3 notas grises, el resumen sigue en «6 para revisar», 0 errores en la consola.
      - Editor (navegador, s33): 640×100 ofrece «Automático (2)», «1», «3 · como el PSD» y dice la letra del legal
        (9.8 px; con 1 renglón baja a 6.5 px, porque el pie tiene que caber a lo ancho). 1080×1920 ofrece «Automático
        (3, como el PSD)», «1», «2» (16.0 px). Guardar, recargar y «Volver al automático»: probado antes de la ronda de
        arreglos de la revisión, no otra vez después.
      - Error que vi en el navegador después de la revisión: la tarjeta de una medida alta guardaba su resultado sin
        las opciones y el editor recibía sólo «3» («no se pueden cambiar»). Las opciones van ahora en la clave; prueba
        nueva con la tarjeta primero y el editor después (lessons.md).
      - Segunda pasada de revisión (re-verificación): confirmó los 5 arreglos y encontró 3 serios, arreglados:
        (1) el editor abría lo movido a mano del legal sobre otra forma cuando los renglones guardados no se podían usar
        (ahora lo suelta al abrir, como la tarjeta, y lo dice); (2) lo movido sobre el automático se guardaba sin
        renglones (ahora se guardan los de la forma con que se movió; sin renglones = la forma del PSD, que también
        cuida lo guardado antes de B27); (3) las opciones eran 1..6 y no las 6 de justo abajo del PSD (un legal de 8
        no ofrecía 7). También: la pieza del legal sin tipografías la dice la página (`legalDelPsd`), un PSD sin legal
        ya no dice «falta la tipografía», una versión que falla dos veces no se vuelve a pintar, y la nota sólo habla de
        lo movido si se movió. La copia a las hermanas (B25) usa la forma que usa la medida.
      - Navegador después de esos arreglos (s33, 640×100): mover el legal sobre el automático y guardar escribe
        `renglones: 2`; al volver a abrir, «Automático (2)» elegido y sin «Cambios sin guardar». Con lo guardado en 5
        renglones (no se ofrecen): la tarjeta dice «no se pueden usar ahora: va en 2, y lo movido… se deja de lado» y
        el editor abre con el legal en su lugar automático y la frase nueva. Sin renglones y con el legal movido: la
        tarjeta y el editor usan los 3 del PSD. 0 errores en la consola. Mis entradas de prueba se borraron.
      - PSD editable: el texto vivo con su caja nueva y los iconos escalados por partes, probado en Node con ag-psd
        (planDeMedida, boxBounds); la descarga en el navegador no la hice (descargar pide permiso).
      - Pruebas (después de todos los arreglos): formatos 552/0, prisma 975/0, npm test exit 0, build exit 0, tsc
        limpio, eslint sólo las 2 advertencias viejas de scripts/test-formatos.mjs.
      - Sin arreglar (anotado): cada versión se pinta dos veces (para la tinta del PSD editable y para la vista); cada
        versión ocupa ~7 MB de memoria; el párrafo del «por qué no» cambia de alto al escribir; no hay tamaño mínimo
        de los iconos de las tiendas al elegir a mano (el automático quita como mucho la mitad de los renglones);
        algunos ayudantes repetidos entre renglones.ts y cambios-texto.ts.
      - Necesita la tipografía del cliente cargada en «Texto nítido»; sin ella todo sale como antes y el editor dice
        por qué. El build de Vercel del preview: no revisado.
- [~] B28. Imagen plana → piezas movibles y textos editables con la tipografía del cliente (Pedro, 2026-10-27: "is
      there a way we can trace the elements and separate them so we are able to move them delete if needed or using
      didi fonts change texts"; eligió la opción 1: "Go with option 1. Run the Gemini reading test on the DiDi Card
      image first."). Plan: la IA LEE (caja, rol y letras de cada elemento) y NUESTRO código corta, rellena el hueco y
      reescribe el texto con la tipografía del cliente → el mismo `MaestroPsd` (fondo limpio + piezas) que da la puerta
      PSD, así editor, cambios de texto, medidas y PSD funcionan sin cambios. Pantalla de revisión para corregir cajas
      (= trazar a mano, la opción 3, como respaldo). Descartada la opción 2 (la IA de imagen redibuja con
      instrucciones): no usa la tipografía y puede errar números. Lo que no se pueda reescribir igual (degradado,
      contorno, texto sobre foto) queda como imagen movible, con aviso.
      · Prueba de lectura (scratchpad `plano-prueba/leer-plano.mjs` + `medir-plano.mjs`; anuncio DiDi Card × iPhone 18,
        1200×1500, fondo casi liso): gemini-3.8-flash, 2 corridas, 8 s y 18 s, < 1 ¢ cada una (tokens 1523/936 y
        1535/1135 + 1330 pensando; el precio exacto de 3.8 Flash no se revisó). La llave la pegó Pedro en la terminal
        (`read -s`); no está en la shell de Claude y `.env.local` está bloqueado.
        - Encontró los 14-15 elementos (la 2.ª separó el ícono de DiDi Finanzas de las tiendas). Cajas a 0-4 px de la
          tinta real; entre corridas se mueven ≤ 4 px (el teléfono 17 px: con o sin reflejo).
        - Letras: la 1.ª no las mandó (campo opcional); con `responseSchema` que las exige, las 7 exactas, legal
          incluido (2 renglones, acentos, %, comas).
        - No sirve para el peso (la 2.ª dijo "bold" a todo) ni para el color (#f04e17 vs #fc4c02 real; #2c0902 vs
          #38161d) → salen de los píxeles. La sombra suave de la tarjeta (≈25 px abajo) quedó FUERA de la caja en las 2
          → crecer cada caja desde los píxeles.
      · Tipografía para el laboratorio: `~/Desktop/formatos-prueba/DiDi Sans Pro/DiDiSansVariableVF/DiDiSansVariableVF.ttf`.
      · Laboratorio (Pedro, 2026-10-27: "Yes, build the lab test of the three edits on the DiDi Card ad."): corre en el
        navegador (el mismo canvas que la app; en el repo no hay librería de tipografías para Node), servidor local
        127.0.0.1:4787. Copia durable: `~/Desktop/formatos-prueba/b28-imagen-plana/` (lab/, resultados/, scripts de
        lectura). Sin IA: todo local.
        - Texto: alfa por "desmezcla" (color de la tinta sobre el fondo, y 0 si el color no está en esa recta) → orilla
          al 50 % → tamaño por el alto, espaciado por el ancho, lugar con ±0.5 px. El PESO se elige por la tinta (grosor),
          no por el IoU. Resultado: renglones oscuros = DiDi Sans Pro Medium, naranjas y precio = Bold, pagos y legal =
          Regular. IoU (lo sólido que coincide): 3 MSI 0.88 · DiDi Card 0.78 · precio 0.74 · Tu nuevo 0.74 · con tus
          cupones 0.70 · pagos 0.64 · legal 0.27-0.33. Helvetica como control: más baja en todos los grandes (0.31-0.74)
          → la letra del anuncio sí es DiDi Sans. La diferencia ×4 sólo marca las orillas de las letras.
        - Fondo: plano inclinado ajustado al anillo LIMPIO (16 px alrededor) + el grano del anillo; se borra la tinta
          + 10 px (las letras traen un halo suave), sin meterse en otro elemento que se queda. Brillo medio del hueco
          253.8 vs 254.0 del fondo de al lado: no se ve; con contraste ×10 se nota un rectángulo un poco más granoso.
        - Las 3 ediciones salen limpias (a-ediciones.png) y una versión con el bloque que queda centrado en el hueco,
          moviendo "Tu nuevo…" con SUS píxeles 69 px (b-ediciones-movido.png).
        - Límites vistos: (1) texto sobre una forma con sombreado (precio sobre la pastilla): el relleno plano deja un
          rectángulo tenue y tocó la orilla de abajo de la pastilla → rellenar sólo dentro de lo sólido de la forma, o
          redibujar la forma; (2) el legal (letra de ~9 px) no se puede confirmar con IoU (Helvetica sacó 0.35-0.42);
          (3) la alineación (centrada / izquierda) la puse a mano: la app la tiene que deducir o preguntar; (4) fondo de
          FOTO no probado (éste es liso) → ahí va la IA (~US$0.04); (5) sombras de objetos (la tarjeta) sin tocar: en el
          lab sólo se movió texto.
      **Pedro (2026-10-27): "Option 1: build B28 in the app, plain backgrounds first."** Plan de construcción:
      Diseño (mapa de la puerta PSD hecho por un agente, 2026-10-27): una imagen plana sale como el MISMO maestro que un
      PSD: UNA pieza por rol (el acomodo busca la pieza por rol, `acomodo.ts:581`, como las 7 carpetas de la guía), cada
      elemento leído es una PARTE de su pieza (`PartePsd`, igual que las subcarpetas), y un texto sobre una forma
      ("sobre") va en la parte de la forma. Cada texto es un `TextoPieza` con un `TextoCapa` de UN tramo (fuente
      PostScript de la biblioteca del cliente, tamaño, track, color, alineación, transform) y su tinta original
      (`caja` + `alfa`); `base` = la pieza sin sus letras. Así la "prueba contra Photoshop" de la página (`probar` →
      `compararAlfa`, escritura.ts) decide sola qué texto se puede reescribir: lo que no pase va como imagen, con su
      motivo. Nada de lo de después cambia; el PSD por medida cae al de capas planas (no hay original).
      - [x] 1. Lectura en el servidor: `POST /api/prisma/formatos/leer` (mismo gate, freno 20/10 min, PRISMA_FORMATOS_IA)
            → `lector()` en proveedor.ts (gemini-3.8-flash con `responseSchema`; precio de listas de terceros) →
            `limpiarLectura` (plano.ts: cajas a px, roles y tipos conocidos, letras limpias, «sobre» por id). Pruebas.
      - [x] 2. Píxeles (puro, plano.ts): ajustar cada caja a su tinta (+ sombra suave), color de fondo y de tinta,
            alfa de los textos por desmezcla y de imágenes/formas por diferencia con el fondo, fondo limpio (plano
            inclinado + grano, tinta + 10 px sin pisar a los vecinos), "fondo no liso" → aviso y parar (foto = después),
            piezas por rol con sus partes, `base` sin letras. Pruebas con imágenes sintéticas.
      - [x] 3. Texto contra la biblioteca (página, canvas): con `maquetar` + el medidor de la página, buscar fuente del
            cliente (peso por la tinta), tamaño (alto al 50 %), track (ancho) y lugar; arma el `TextoCapa`. La prueba de
            la página decide. Alineación: centrada si su centro cae a ≤ 2 % del centro de la mesa o de lo que tiene
            debajo; si no, izquierda. Pruebas con un medidor falso.
      - [x] 4. Página: la puerta PSD acepta PNG/JPG/WebP; reduce a 1600 px, lee, pantalla de revisión (cajas sobre la
            imagen, lista con rol, tipo y letras editables, quitar un elemento), y sigue al flujo de siempre. Nombre sin
            extensión; aviso propio en el PSD por medida.
            · Probado en localhost (2026-10-27) con la lectura guardada de Gemini en lugar de la ruta (en este navegador
              no hay sesión: la ruta da 401 «Inicia sesión», y la pantalla lo dice bien). Revisión: 15 elementos, 7
              textos; DiDi Sans en 6 (3 MSI Bold 12 % · DiDi Card Bold 26 % · Tu nuevo Medium 25 % · cupones Medium 37 %
              · precio Bold 31 % · pagos Regular 55 %), el legal de ~9 px como imagen (96 %). Continuar → 12 medidas.
              Editor 1080×1920: «12 MSI», quitar las dos líneas de cupones, «12 pagos de $3,999» → se ven en DiDi Sans;
              al guardar, «Texto cambiado en las 12 medidas» y la tarjeta «Editada a mano · Listo».
            · Arreglos de esta prueba: (a) la prueba sólo corría el texto a píxeles enteros; ahora las 3 tipografías
              que mejor empatan se prueban corridas a cuartos de píxel (como el laboratorio): el precio pasó de Medium
              a Bold (31 %). (b) `TEXTO_DIF_MAX_PLANO` 0.55 → 0.65: «3 pagos de…» con su DiDi Sans daba 0.551 y lado a
              lado se ve igual (la letra original es más gruesa y borrosa); el legal queda en 0.96. (c) Sin cliente, la
              revisión decía «todos van como imagen» aunque las tipografías que recuerda el navegador sí se prueban.
            · Pendiente fuera de B28: «Quitar» un texto es por medida (como en un PSD); para quitarlo en todas hay que
              repetirlo o usar «aplicar también a». (Arreglado en el reap: los textos del editor que decían «del PSD»
              ahora dicen «original», que sirve para las dos entradas.)
      - [x] 4b. PSD por medida de una imagen plana: hoy cae al de capas planas (texto como imagen). Por la regla de Pedro
            del 2026-10-19 (lo editable sigue editable en el PSD que se baja), los textos reescritos van como capas de
            texto vivo con su tipografía; lo demás, una capa por parte.
            · Hecho (2026-10-27): `textosVivos` (escritura.ts, comparte `listosDelDibujo` con `textoEscrito`) da cada
              texto con su tinta y su `TextoCapa` en px de la medida; `capasDeMedida` (nitido.ts) con `vivos` pone la
              base sin letras y los textos aparte (los quitados en esta medida, apagados, como el PSD editable);
              `psdDeMedida` los escribe como capas de texto (`textoDePsd`: tipografía, tamaño, color, track,
              interlineado, mayúsculas, alineación, caja) y no escribe la base vacía de un texto suelto. La página abre
              cada pieza en sus partes (una capa por elemento) y escribe con `invalidateTextLayers`.
            · Probado: el PSD de 1080×1920 del anuncio editado (capturado en la página, sin bajarlo) trae BACKGROUND +
              5 carpetas, cada elemento en su capa, «12 MSI» Bold, «12 pagos de $3,999» Regular, el precio Bold y
              «Tu nuevo…» Medium como texto vivo, y las dos líneas quitadas como texto apagado; sus capas visibles
              sobre blanco = la tarjeta. Aviso: «PSD de 1080×1920 listo… elige «Actualizar»». Sin probar: abrirlo en
              Photoshop (no hay Photoshop aquí).
      - [~] 5. Revisión (reap) + navegador en la preview con el anuncio DiDi Card: las 3 ediciones de Pedro hechas con
            el editor de siempre.
            · Reap 2026-10-27 (3 revisores en paralelo: salud y rendimiento, seguridad, accesibilidad y UI). Arreglado:
              seguridad (la ruta decodifica ≤ 2048 px por lado y revisa el peso del archivo; la llamada a Gemini con
              `maxOutputTokens` 12k, `maxItems` 60, corte si llega al tope, y se cancela si la persona cancela; sin
              `modelo` en la respuesta; letras sin caracteres invisibles ni de dirección; freno a
              `tipografiasDelCliente`); datos (un elemento sobre otro que va sobre otro ya no se pierde, los círculos
              de «sobre» se rompen; la prueba de tipografías y la nueva medida no dejan la pantalla colgada si fallan;
              tope de 16 MP y el de 600 MB del maestro); pantalla (un solo selector de cliente; «Continuar» justo
              después de corregir letras espera y sigue solo; foco al título al aparecer y a la fila siguiente al
              quitar, con aviso hablado; cada fila con su número para lector de pantalla; colores de rol a 4.5:1;
              avisos de la medida con números de la lista; costo como estimado; imagen con alto tope; la frase de
              arriba ya no dice «no se sube a ningún lado» para una imagen plana); textos del editor dicen «original».
              Prueba fina de tipografía: 8 corrimientos, no 24 (mismos resultados; la revisión 1.4 s, antes 1.8 s).
            · Sin arreglar (anotado): medir y probar siguen en el hilo de la página (un worker sería lo siguiente si
              una imagen grande se traba); la imagen se decodifica antes de revisar su tamaño (sólo afecta la pestaña
              de quien la sube); sin botón de «agregar tipografías» en la revisión (soltar archivos sí funciona); sin
              tope diario en la base para la IA (el PENDIENTE de la ruta, antes de producción); tope 0.65 deja pasar
              una tipografía parecida pero no la misma (la revisión enseña el %).
            · Preguntas para Pedro: ¿las tipografías «exclusivas» de un cliente son un límite de licencia (hoy
              cualquier rol de Prisma las baja de cualquier cliente activo, igual que con un PSD)? ¿La llave de Gemini
              está en un proyecto de Google con facturación (en la gratuita Google puede usar las imágenes)?
            · Sin probar: la ruta de lectura de verdad (en este navegador no hay sesión) y abrir el PSD en Photoshop.
      · Hecho 1-3 (2026-10-27, sin commit): `leer/route.ts` + `lector()` + `limpiarLectura`; `medirPlano` (figura = lo
        que el fondo no alcanza dentro de su caja + lo fuerte pegado; sombra = lo que oscurece, del elemento más
        cercano; fondo = plano + grano por hueco conectado; "no liso" si el anillo se aleja > 6 niveles) y
        `maestroDePlano` (una pieza por rol, partes, la pastilla sin letras como base); `capaDeTexto` +
        `alineacionDe` (puro) y `ajustarTextosPlano` en escritura.ts (prueba cada tipografía con la MISMA comparación
        que un PSD: `compararCon` + `pasa`); acción `tipografiasDelCliente` (todas las del cliente elegido).
        Con el anuncio DiDi Card en Node: medir 336 ms, maestro 85 ms, 5 piezas (HERO 2 partes, BRAND 3, TITULO 4,
        CTA 2, FOOTER 3), 26 MB; fondo + piezas en su lugar vs el original: 0.32 niveles de diferencia media, 0.9 % de
        píxeles > 12 (orillas de letras). Queda en el fondo un reflejo muy tenue bajo los teléfonos (más de 60 px).
      · Tope de la prueba para textos de imagen plana: con el de un PSD (0.30) sólo pasaban "3 MSI" y "DiDi Card".
        Medido con la cuenta de la app (laboratorio, 2026-10-27), mejor DiDi Sans vs mejor Helvetica: 3 MSI 0.13/0.36 ·
        DiDi Card 0.25/0.32 · Tu nuevo 0.29/0.42 · precio 0.30/0.81 · con tus cupones 0.38/0.47 · pagos 0.50/0.61 ·
        legal 0.92-1.07/0.83-0.93. → `TEXTO_DIF_MAX_PLANO` = 0.55 en su `TextoPieza.difMax` (la prueba de la página lo
        usa); el legal de ~9 px va como imagen. Sin probar en la app: su cuenta usa corrimientos enteros (el
        laboratorio, de 0.25 px), así que puede salir un poco más alto.
      **Verificación:** test-formatos verde con las pruebas nuevas · tsc y eslint limpios · build · en la preview: subir
      didi-card.webp → 15 elementos en la revisión → tarjetas por medida → en el editor "3 MSI" → "12 MSI" y "12 pagos de
      $3,999", quitar "con tus cupones de DiDi Card" → PNG. Sin migración ni deploy a producción.
      **Next Step:** commit af54d72 en `prisma`, push hecho 2026-10-27 (Pedro: "commit B28 to the prisma branch").
      PRISMA_FORMATOS_IA y GEMINI_API_KEY existen en Vercel Preview (prisma) (`vercel env ls`, sólo nombres). Falta:
      Pedro entra a la preview con su sesión y sube didi-card.webp de verdad. 1er intento: 502, Gemini rechazó
      `maxItems` del esquema (400 invalid argument); quitado (el tope lo pone limpiarLectura) y vuelto a subir.
      PREVIEW PROBADA 2026-10-27 (090bf78, sesión de Pedro, didi-card.webp real):
      - Lectura real: 200, 15 elementos, 7 textos, ≈ US$0.0111; letras exactas (las mismas del laboratorio).
      - Revisión: 6 textos con tipografía DiDi, legal como imagen (89 %). La biblioteca de la preview trae 12 DiDi
        con DiDiSansVariable: 3 de 7 eligieron la variable (precio Variable-Medium 30 % contra Pro-Bold 31 % en
        localhost). Comparado a 2.6×: el precio se ve igual al original.
      - Editor 1080×1920: «12 MSI», quitados «con tus cupones de» y «DiDi Card», «12 pagos de $3,999»; guardado,
        «Texto cambiado en las 12 medidas».
      - PSD 1080×1920 (5.5 MB, leído en la página): BACKGROUND + 5 carpetas, capa por elemento, textos vivos con
        las ediciones y DiDi Sans; los 2 quitados como capas de texto ocultas.
      HALLAZGOS (sin arreglar): (a) la pastilla del precio queda a 2 px del borde derecho en 1080×1920 y a 1 px en
      720×1280 (57 px en el original; su capa sale 3 px del lienzo); (b) bajo la caja de subida sigue el enlace
      «¿Sólo tienes una imagen plana? Usa Formatos con imagen plana» a la página vieja; (c) si la lectura falla, el
      mensaje sale dos veces; (d) la variable en el PSD pide que diseño tenga DiDi Sans Variable instalada.
      NO PROBADO: abrir el PSD en Photoshop.
      ARREGLADOS (Pedro: "fix the price pill edge, the old flat-image link and the double error message"):
      (a) acomodo.ts: en la familia «igual» el HERO crece dentro de un margen por lado (el menor entre el del
      diseñador × k y el de siempre) y `alAire` corre a lo ancho lo que quedó en el borde. Localhost con la
      lectura guardada: pastilla a 51 px del borde en 1080×1920 (antes 2), 34 en 720×1280 (antes 1), 33 en
      720×1600, 36 en 768×1024, 57 en 1200×1500 (igual); teléfonos a 54/36/35/61 px. (b) el enlace ahora dice
      «¿Tu imagen tiene fondo de foto o textura? Usa Formatos con imagen plana, que rellena el fondo con IA».
      (c) plano-lector quita la frase repetida: «La IA no pudo leer la imagen.» + «Reintenta.».
      Commit 2a7758e. PREVIEW 2026-10-27 (2a idea de Pedro, 2a lectura real, US$0.006): margen medido en la preview:
      precio 51/34/33/36 px (1080×1920, 720×1280, 720×1600, 768×1024), teléfonos 51/34/34/61, 1200×1500 igual.
      HALLAZGOS NUEVOS (sin arreglar): (d) la lectura cambia de una corrida a otra (temperature 0): esta vez 12
      elementos (los 3 logos en uno, el ícono y las tiendas en uno) y «con tus cupones de» como SUBTITULO; su caja
      queda DENTRO de la del TITULO y en 1080×1920 el acomodo alto la sube 15 px sobre su hueco: se encima a «3 MSI».
      No lo causó 2a7758e (el acomodo viejo da lo mismo, probado con 090bf78). (e) sale «2 textos cambiados en
      todas las medidas» (ediciones guardadas de la lectura anterior, mismo archivo) pero el lienzo muestra los
      textos originales: el aviso cuenta ediciones que ya no aplican (no revisado a fondo).
      (d) ARREGLADO (Pedro: "Go with 1 ... treat it as part of the headline (flat images only)"): limpiarLectura
      pasa al TITULO un SUBTITULO con un renglón del TITULO arriba y otro abajo (que lo cruzan a lo ancho); en la
      revisión se puede regresar. Localhost con la lectura guardada marcada así: la fila sale TITULO, «5 piezas», y
      en 1080×1920 «3 MSI» termina en 537 y «con tus cupones de» empieza en 548 (10 px, como el original).
      (e) causa vista: los textos guardados van por «id de la lectura + letras»; otra lectura del mismo archivo trae
      otros ids, así que no aplican pero el aviso los cuenta. ARREGLADO (Pedro: "fix the banner so it only counts
      saved edits that match a text in this reading"): `cambiosQueAplican` (cambios-texto.ts, la misma prueba que
      `conCambio`) cuenta el aviso y el toast del editor. Localhost: 1 que aplica + 2 de otra lectura → «1 texto
      cambiado»; sólo de otra lectura → sin aviso (antes «2»). Lo guardado no se borra.
      **Next Step:** commit + push a `prisma`.
- B17 (colchón): ESTACIONADO por Pedro (2026-10-19, "ignore the matress for now").
- iPad: sin más trabajo (Pedro, 2026-10-19: "it will very rarely be used on anything other than desktop"). Los
  pendientes de iPad de B19 (caché de 4 fondos, táctil real, zoom de Safari) quedan fuera.
- 3d (visión con Gemini) baja de prioridad: sólo sirve a la vía plana.
**Verificación:** `npm test` verde · fidelidad medida en los PSD reales · página A vs B revisada por Pedro · tsc,
eslint y build limpios. Sin migración nueva ni deploy.

**Plan (en orden):**
- [x] 1. Nano Banana 2.1 (`gemini-nano-banana-2.1`, salió 2026-10-06): la `gemini-3.1-flash-image` se apaga el
      **2026-10-29**. Imagen de salida a la mitad (US$30/M tokens: ~$0.034 1K · ~$0.050 2K), entrada ×3 (US$1.50/M,
      irrelevante: 1 imagen). Precios de fuentes secundarias (ai.google.dev bloqueado desde la sesión): la 1ª llamada
      real los confirma con usageMetadata. Sigue sin máscara → el pegado duro se queda. `generateContent` sigue (Google
      ya lo llama "legacy"; la doc nueva es la Interactions API) → confirmar en la prueba real.
- [ ] 2. Prueba con anuncios REALES (2-3 PSD + 2-3 planos de IA) con esa lista de medidas. Necesita de Pedro: los
      archivos + `GEMINI_API_KEY` con saldo como secreto del entorno de la sesión (no pegarla en el chat).
- [~] 3. Métodos gratis + pegar la lista.
  - [x] 3a. Pegar la lista del cliente (`leerMedidas`: "9:16 (1080*1920) 320*250 …" → elige EXACTAMENTE esas; reusa
        presets, el resto medida libre; rediseño queda apagado; fuera de límites se avisa).
  - [x] 3b. Recorte de fondo LISO (`bordesDe` sobre copia de 256 px → `recortable` por lado, 70 % de la franja,
        conservador; `encajar(..., recortable)` crece hasta que el contenido quepa, sin pasar de cover ni de 1×).
  - [x] 3c. Modo "extender" (gratis): cada lado repite su última línea + desenfoque suave; se sugiere cuando todos los
        lados a rellenar son lisos. Sin nada que rellenar → no se rellena ni se llama a la IA. 0078 (sin aplicar)
        acepta 'extender'. Prueba visual con anuncio sintético de degradado: 10/12 medidas de la lista limpias y
        gratis (320×50 y 640×100 siguen "rediseño" → paso 4).
  - [ ] 3d. Análisis del anuncio UNA vez (Gemini visión → cajas de titular/logo/CTA/producto/caras) para recortar
        también fondo de FOTO sin tocar el contenido. Necesita la llave + anuncios reales (paso 2).
  - [ ] 3e. Juegos de medidas guardados por cliente (necesita tabla/columna → va en una migración NUEVA: la 0078 ya
        está aplicada desde 2026-10-21 y no se puede editar).
- [ ] 4. Motor de acomodo (banner / vertical / cuadrado) con las piezas del anuncio sin redibujar — lo usan las 2 puertas.
- [ ] 5. Puerta PSD: leer capas en el NAVEGADOR (ag-psd) y subir sólo las capas necesarias; efectos que no se puedan
      dibujar → caer a la puerta de imagen plana con aviso.
- [ ] 6. IA UNA vez por anuncio (1-2 lienzos grandes, todos los tamaños se recortan de ahí) en vez de 1 por tamaño, con
      ajuste de color de la unión SÓLO del lado del relleno. Meta: ~$0.05-0.10 por anuncio con fondo de foto, $0 con liso.
- [ ] 7. (Último recurso) rediseño con IA marcado "borrador, revisar".
- Aparte: `src/lib/prisma/catalogo.ts` (lo que Prisma recomienda en Higgsfield) sigue con Nano Banana 2 → que lo
  proponga el Vigía o agregarlo cuando Higgsfield tenga la 2.1.

## 🔨 2026-10-02 — Prisma › Formatos (un anuncio terminado → N tamaños, original intocable) · rama `prisma`
Pedro: subo UN anuncio plano, marco 10-15 tamaños por plataforma, recibo cuadrícula + ZIP. El original sólo se escala
parejo (sin recorte, estirado ni redibujo); lo nuevo alrededor = IA, desenfoque o color.

**Decisiones de Pedro (2026-10-02):** una RUTA por tamaño (`POST /api/prisma/formatos/tamano`, 4 a la vez; las Server
Actions van de una en una por cliente, docs de Next 16 `server-actions.md`) · DOS tablas · PNG maestro + JPG q90 en el
ZIP · el botón nuevo se llama "Adaptar formatos" y la sección vieja pasa a "Adaptar el prompt a otro formato" · IA =
Gemini Nano Banana 2 (`gemini-3.1-flash-image`, llave que ya existe) CABLEADA PERO APAGADA hasta probarla.
**Proveedor:** Higgsfield NO tiene outpaint en su API (openapi de docs.higgsfield.ai: 8 rutas, ninguna) · fal descartado
(Pedro no quiere otro gasto) · prueba de Gemini 2026-10-02 → 402 "prepayment credits are depleted" (la llave sirve, la
cuenta prepago está en $0). Desenfoque probado: pixel-lock OK en 4 tamaños (script en el scratchpad de la sesión).
**Bug cazado en la prueba:** `composite({ blend: "source" })` de sharp vacía TODO lo que queda fuera del pegado → el
pegado duro es una copia de bytes sobre el RGBA crudo, no un modo de mezcla.

- [x] 0. Dependencias: `sharp` directo (ya venía con next) + `fflate` (ZIP en el navegador).
- [x] 1. `src/lib/prisma/formatos/geometria.ts` (puro): presets por plataforma, contain-fit, offset centrado, expansión
      por lado, cobertura → modo por omisión (≥50 % ia · 30-50 % blur · <30 % "Requiere rediseño", apagado), aviso si
      el original se agranda, lienzo de Gemini (proporción más cercana + tamaño 0.5K/1K/2K) y costo estimado.
- [x] 2. `src/lib/prisma/formatos/componer.ts` (server, sharp): escalar → relleno (ia | blur | color) → pegado DURO al
      final (copia de bytes) → verificación sobre el PNG releído → `pixel_lock_ok` + deriva de la IA. PNG + JPG q90.
- [x] 3. `src/lib/prisma/formatos/proveedor.ts`: interfaz + Gemini (REST generateContent, como looks-thumbs). Apagado
      con `PRISMA_FORMATOS_IA` ≠ "gemini".
- [x] 4. Migración **0078** (0076 = roles-diseno, 0077 = cambios-cliente en main): `prisma_formatos_lotes` + `prisma_formatos_salidas`, RLS master-only
      + grant service_role (patrón 0063/0070). `database.types.ts`. PGlite.
- [x] 5. Bucket privado `greenlight-formatos` en `setup-storage.mjs`.
- [x] 6. Servidor: `formatos-actions.ts` (crear lote → URL firmada de SUBIDA; confirmar; lote desde un resultado) +
      `POST /api/prisma/formatos/tamano`. Mismo gate/puedeTocar/saturado/fallo; Origin revisado en la ruta.
- [x] 7. UI `/prisma/formatos` + puerta en el estudio + botón "Adaptar formatos" en "¿Cómo salió?". Copy en español.
- [x] 8. Flag `NEXT_PUBLIC_PRISMA_FORMATOS_ENABLED` (encendido en dev).
- [x] 9. Tests: `scripts/test-formatos.mjs` (geometría de todos los presets + pixel-lock con proveedor de basura) en `npm test`.
- [x] 10. Reap → arreglos → `?demo=formatos` local.
- [ ] 11. Preview: push. Prueba real necesita "ship it" (0078 + bucket en el proyecto compartido), `GEMINI_API_KEY` +
      flag + `PRISMA_FORMATOS_IA=gemini` en Vercel › Preview, y saldo en la cuenta de Gemini.

**Verificación:** `npm test` verde · check:actions · lint · tsc · build · PGlite 0078 · local `?demo=formatos`.

### Review (2026-10-02)
- **Hecho y probado local:** `npm test` → aislamiento 74 migraciones OK · 26 "use server" OK · lib 481/0 · prisma 975/0
  · formatos 43/0 · db 543/0 · import 81/0 · sync 44/0. tsc y eslint limpios. `npm run build` exit 0, sin warnings.
  `?demo=formatos` revisado a 1440/1024/375: sin scroll horizontal, error de medida con role="alert".
- **Reap, dos rondas** (5 pases en paralelo + re-revisión de seguridad y de pantalla). Lo serio que se arregló:
  doble cobro por reclamo reiniciado (ahora UPDATE condicional en la base, no leer-y-escribir) · la ruta procesa la
  fila RECLAMADA (no la leída antes) · costo de la IA que se perdía si algo fallaba después, o si Gemini no devolvía
  imagen · memoria (la fuente se guarda codificada) · GIF sin tope de píxeles · lote duplicado desde un resultado
  (índice único parcial + 23505) · borrar el anuncio por un error de red · tarjetas que se quedaban "Armando…" para
  siempre (sondeo cada 5 s + "procesando" muerto a los 4 min se muestra como error) · resumen falso al fallar
  prepararSalidas · tope de 20 tamaños saltable · salir de la página sin aviso · enlaces vencidos (se refirman solos).
- **NO probado todavía (necesita "ship it" + Pedro):** la prueba real en la preview (anuncio real → 15 tamaños → ZIP →
  pixel-lock en cada tarjeta IA → costo en la tabla). La calidad de Gemini: **no checada** (402, cuenta en $0).

### Diferido (no bloquea la preview)
- [ ] Tope de gasto DIARIO de IA por persona y global, en la BASE (hoy el freno vive en memoria por instancia). ANTES de
      poner `PRISMA_FORMATOS_IA=gemini` en producción.
- [ ] Limpieza: lotes que se quedan en 'subiendo' y archivos huérfanos del bucket (cron).
- [ ] Un PNG con transparencia conserva sus huecos en v1 (el pixel-lock lo exige); opción futura: aplanar sobre el relleno.
- [ ] ZIP en streaming (hoy todo en memoria; ~20 tamaños × 2 archivos aguanta) y miniaturas WebP chicas en la cuadrícula.
- [ ] Revisar (sólo lectura) que ninguna policy de `storage.objects` del proyecto compartido exponga `greenlight-formatos`.
- [~] Avisos previos de npm audit: next 16.3.2 (crítico, ARREGLADO en main) y nodemailer (alto) — tarea aparte ya sugerida.
      · 2026-10-20 (Pedro: "do the fix"): next 16.3.8 listo en `chore/next-security-patch` (08fa0da, UN commit sobre
        main f78f651: next + eslint-config-next 16.3.2 → 16.3.8 y el lock). Probado en esa carpeta: npm test todo en 0
        fallas, build con "Next.js 16.3.8" exit 0, `npm audit` ya no marca next.
      · SHIPPEADO 2026-10-20 (Pedro: "ship it: push the Next.js 16.3.8 fix to main"): main f78f651 → 08fa0da (avance
        directo). Vercel: "Deployment has completed" (estado de GitHub del commit, success); runna-greenlight.vercel.app
        responde 200 (/login). Sin probar que ese dominio sirva ya este build (la herramienta de Vercel pide sesión). `prisma` sigue en 16.3.2 (su preview también); siguen marcados nodemailer (alto),
        sharp (alto), source-map-js (alto) y sprintf-js (moderado).

### Para la prueba real — necesita "ship it" de Pedro (en este orden)
1. [x] HECHO 2026-10-21 (Pedro: "Ship it: apply migration 0078 to the shared database and create the
   greenlight-formatos bucket, then check that an upload works"): `node scripts/migrate.mjs --only 20261005120002
   --project-ref ybbrpqzbedaxsmotgtkh` exit 0 (sin claims tomados ni pendientes). Antes: revisión de seguridad (Opus),
   nada bloqueaba; 0 políticas en storage.objects (revisado ese día). Verificado en la base: las 2 tablas (13 y 19
   columnas), RLS encendido, una política master-only cada una, permisos sólo para service_role (nada para anon ni
   authenticated), fila 20261005120002 en `produccion._migrations`.
2. [x] HECHO 2026-10-21: `node scripts/setup-storage.mjs --only greenlight-formatos` exit 0; en la base: privado,
   25000000, png/jpeg/webp. Prueba con sesión de Pedro en localhost: subir «prueba-claude.jpg» (480×358) llegó a la
   lista de tamaños en ~4 s (lote «listo», archivo en el bucket); 1 tamaño gratis (Meta 1080×1080, desenfoque) listo
   en ~5 s: «Original sin cambios», pixel_lock_ok true, US$0, PNG y JPG en el bucket, la imagen carga 1080×1080 por
   URL firmada. Quedan en la base esos datos de prueba (1 lote, 1 salida, 3 archivos), visibles sólo para master.
3. Pedro en Vercel › Preview: `NEXT_PUBLIC_PRISMA_FORMATOS_ENABLED=true` (requiere redeploy). Para IA además:
   `PRISMA_FORMATOS_IA=gemini` + `GEMINI_API_KEY`, y saldo en la cuenta de Gemini.
4. Prueba: anuncio real → 15 tamaños → ZIP → pixel-lock en cada tarjeta → `costo_real_usd` en la tabla.

## ✅ 2026-09-21 (2) — Login de CLIENTES con contraseña + Google + blindaje — SHIPPEADO (main f929fc3 → 24ece16, commit f6d99a4, sin migración)
Pedro: "wouldn't it be easier for the client to add a password on their sign up… after approved" + "use google or normal email password, have both options" + "make sure there's no workaround or URL that can bypass or lock them out".
- [x] /portal/login: **Google** + **correo y contraseña** (la contraseña la valida el NAVEGADOR con Supabase → límite
      por IP del cliente, no la IP compartida de Vercel) → `destinoTrasEntrar` decide: cliente aprobado → su portal;
      pendiente / revocado / equipo / sin acceso → cierra esa sesión y explica.
- [x] "Solicita acceso": nombre, correo, marca, **contraseña** → **código de 6 dígitos** al correo (prueba de que el
      correo es suyo; sin esto cualquiera pedía acceso "como ana@didi.com" con SU contraseña) → solicitud + aviso a admins.
- [x] "¿Olvidaste tu contraseña?" = mismo código → contraseña nueva. Sirve a los clientes de antes (sin contraseña).
- [x] Sin enlaces de un solo uso (Safe Links de Microsoft los gasta — confirmado en docs de Supabase). Aprobar = correo
      "tu acceso está listo" sin enlace. Una contraseña no verificada se neutraliza al aprobar (app_metadata marker).
- [x] Audit (Opus) arreglado: rutas públicas EXACTAS (`/login/tablero`, `/auth/…`, `/robots.txt/…` daban 200 en prod
      sin sesión), `marcarOrtografiaIgnorada` exige identidad + tope 200, una caída de BD ya no dice "acceso dado de
      baja", portal de otra marca → a SU portal, rechazos de Google de clientes → /portal/login (cookie corta, no
      query — la allowlist de Supabase no puede romper OAuth), signOut con scope "local" (no saca otras sesiones).
- [x] Verificado local (login ENCENDIDO, puerto 3002): rutas-trampa → /login; contraseña mala; código malo; foco;
      cookie de Google de un solo uso; móvil. tsc + eslint limpios.
- [x] Security review (Opus) de la reconstrucción: 0 takeover. Arreglado: contraseña sólo vale si pasó por el código
      (getCurrentUser + destinoTrasEntrar leen el `amr` de la sesión: contraseña en cuenta del EQUIPO o de cliente sin
      marca = sin identidad) · reset de contraseñas no verificadas al aprobar salta correos @runna (S.P.A.M compartido)
      · `/auth/confirm` ya no abre sesiones (enlaces viejos → mensaje) · el proxy también revisa perfil en rutas de
      portal (sesión sin perfil / baja = fuera) · 429 de Supabase ≠ "código incorrecto" · botones nunca se quedan
      en "Entrando…" · nota de reenvío honesta. Unit test del `amr` (11/11) + rutas + flujos en navegador OK.
- [x] `next build` limpio. **"ship it" de Pedro** → commit f6d99a4 → merge --no-ff a main (24ece16) → `git push origin main` → Vercel.
- [ ] DECIDE PEDRO (proyecto de auth COMPARTIDO con S.P.A.M): subir "Email OTP Length" a 8 y bajar "Email OTP
      Expiration" a ~900 s en Supabase → Auth → Email. El endpoint público de verificación de Supabase permite adivinar
      códigos directo (igual que con los enlaces de antes); 8 dígitos + 15 min lo vuelve impráctico.
- [ ] Opcional: límites DURABLES de códigos (tabla + RPC) y/o CAPTCHA (Turnstile) en pedir/confirmar código.
- [ ] Diferido con el candado @runna: la puerta del equipo acepta cualquier login por correo (no sólo Google).
- [ ] LIVE-VERIFY con testers reales (Pedro 2026-09-21: opción B): Claudia Aguilar y Hermann (DiDi, revocados) hacen
      "Solicita acceso" → código → Pedro aprueba en Invitaciones pendientes → la fila vuelve a "Activo" → entran con
      contraseña o Google. Si algo falla: pedir el mensaje EXACTO que vieron + la hora (para buscar en los logs de Vercel).
- Nota merge: `prisma` choca en `middleware.ts` (su PUBLIC_EXACT de /api/prisma/vigia vs rutas exactas) — trivial.

## ✅ 2026-09-21 — FIX PROD: el cliente aprobado no puede volver a entrar — SHIPPEADO (main b996640 → f929fc3, merge de `fix/portal-login` 361152f, sin migración)
Bug (foto de Pedro): cliente ya aprobado, sesión caducada → cae en el login de Google del EQUIPO, sólo con "solicita acceso".
- [x] Proxy: `/{slug}/portal` sin sesión → `/portal/login?next=…` (antes `startsWith("/portal")` nunca casaba → /login).
- [x] /portal/login abre en **"Mándame mi enlace"** (correo → enlace nuevo, sólo a clientes aprobados y activos; respuesta
      idéntica y en `after()` para no revelar quién es cliente); "¿Primera vez? Solicita acceso" como segundo camino.
- [x] "Solicitar acceso" de un cliente YA aprobado → le llega su enlace, no una solicitud nueva a los admins.
- [x] Cerrar sesión de un cliente → /portal/login. Copy de /login: "¿Eres cliente? Entra a tu portal".
- [x] Un solo helper `lib/auth/enlace-cliente.ts` (aprobación + re-entrada) — el formato del link vive en un solo sitio.
- [x] tsc + eslint + `next build` limpios; local con login ENCENDIDO: redirect, formulario, toggle, móvil, error de link.
      Security review (Opus): sin takeover ni open redirect; arreglados `*` en ilike, enumeración por respuesta/tiempo,
      enviar al correo guardado, validación de tipos.
- [ ] **LIVE-VERIFY de Pedro** (preview con login): como cliente real, pedir el enlace en /portal/login → llega el correo →
      entra a SU portal; abrir `/{slug}/portal?...` sin sesión → vuelve a esa página tras entrar; "Cerrar sesión" → /portal/login.
- [x] **Commit + ship** — "commit and ship" de Pedro (2026-09-21): commit 361152f → merge --no-ff a main (f929fc3) →
      `git push origin main` → Vercel. Al fusionar `prisma` con main más adelante, el CÓDIGO entra limpio (middleware.ts
      incluido); sólo chocan los `tasks/*.md` (como ya pasaba).
- [ ] Deuda (seguridad, M2): los límites del envío de enlaces viven en memoria (por instancia). Opciones: tabla de
      envíos (migración) o regla de rate-limit en Vercel Firewall para POST /portal/login. Decide Pedro.
- [ ] **DIFERIDO por Pedro** ("@runna is fine for now, we're using them for testing — we'll add the lock later"): aprobar
      una solicitud hecha con un correo del equipo (@runna.com.mx) convierte ese perfil en `client`. Candado pendiente en
      `aprobarInvitacion` (negar si `isAgencyEmail` o si el perfil ya existe con otro rol) + `sinComodines` no escapa `*`
      (PostgREST lo vuelve `%`) en los lookups de provision.ts. NO arreglar hasta que Pedro lo pida.

## 🔵 2026-09-16 (14) — HÜE Prisma · F6b VIGÍA (rama `prisma`, migración **0074** — necesita "ship it")
Pedro: "cant we do vigia? that one seems important and doesnt affect the rest no?" → sí: tablas, pestaña y job propios;
sólo toca el resto al APROBAR (con los mismos validadores del Hub).
- [x] **0074** `prisma_fuentes` (url https única, nombre, tool, origen oficial|comunidad, activa, último hash/texto/lectura/
      error) + `prisma_propuestas` (huella única = no se repite; tipo nota|regla|modelo|limite|fortaleza|deprecacion|codigo;
      origen; fuentes[]; resumen; contenido jsonb; cita literal + url + fecha; estado pendiente|aprobada|descartada;
      motivo; decidido por/cuándo) + función atómica para sumar una fuente. RLS master, service_role. Seed: 14 fuentes
      (docs oficiales + Help Center/blog de Higgsfield) generadas desde `FUENTES_BASE`.
- [x] `lib/prisma/vigia.ts` (puro): extraer texto legible (main/article), párrafos nuevos vs la última lectura, validar
      fuente, sanear propuestas (cita LITERAL del texto nuevo o se tira; contenido por tipo), huella, aplicar a la ficha /
      a una nota, visible = oficial o ≥2 fuentes (comunidad).
- [x] Lectura segura (server): https, sin IPs/hosts internos (y el DNS resuelto tampoco), redirecciones sólo al mismo
      host (máx. 3), 15 s, 2 MB, sólo html/texto. Sin cambio → cero llamadas a H.Ü.E; primera lectura = línea base.
- [x] H.Ü.E propone (tool_use): SÓLO lo nuevo (cercado como dato) + lo que Prisma ya sabe de esa herramienta; máx. 5
      por fuente; tope de llamadas por corrida.
- [x] Hub › Prisma › **Vigía**: fuentes (agregar/editar/pausar), "Revisar ahora", propuestas pendientes con cita y liga
      → Aprobar (escribe con validarRegla / validarFicha) / Descartar (motivo, no vuelve); historial.
- [x] `/api/prisma/vigia` (GET, `Authorization: Bearer CRON_SECRET`, sin secreto = 503) + ruta pública en el proxy +
      `vercel.json` cron semanal — sólo corre en PRODUCCIÓN (Pedro pone CRON_SECRET al pasar a producción).
- [x] Reap doble. Seguridad (Opus, 2 vueltas): 0 críticos. Arreglados: extracción LINEAL (antes regex cuadráticas: 2 MB
      hostiles ≈ 30 min → 1 ms), reglas del vigía nunca bloquean (también al aprobar) y la tarjeta enseña TODO lo que hacen,
      aprobar RECLAMA primero y devuelve a pendiente si falla (try/finally), tocar una herramienta sólo si nadie la editó
      (updated_at) y nunca sobre una ficha rara, filtro de notas/textos que le hablan a alguien, IPv6 sólo 2000::/3 sin
      túneles, redirección sin cambiar de puerto, ruta pública EXACTA, candado de corrida en la BD (0074:
      prisma_vigia_estado + tomar/soltar; botón con pausa de 120 s, cron sin pausa), 60 s por llamada, presupuesto 150 s,
      2 lotes por fuente y las menos recientes primero, minúsculas sólo A–Z. Salud (Sonnet): 1 crítico arreglado —
      cambios grandes se PERDÍAN (tope + marcar todo como leído) → lotes de 6 000 y se marca leído sólo lo leído (por
      posición); prompt con los `campo` válidos y las fortalezas de la herramienta; errores de guardado al log/resumen;
      try/catch en la UI. Aceptado: si el cron coincide con una revisión manual, esa semana la cubre la manual.
- [x] Smokes: lector contra Higgsfield real (ok) + IPs internas/rebinding/http (bloqueados); H.Ü.E con un cambio sintético
      ×2 (≈2.5k tokens c/u): ignoró el banner y la inyección, propuso sólo los 2 hechos reales con cita literal.
      test-prisma 947 · test-db 503 · npm test ✓ · lint 0 · build ✓ · navegador (?demo=vigia, 375 px sin desborde).
- [x] **SHIP 0074** — Pedro: "ship it" → `npm run migrate` (ref ybbrpqzbedaxsmotgtkh) → verificada: 14 fuentes, RLS en las 3
      tablas, 3 policies, anon/authenticated sin acceso a tablas ni funciones, service_role ejecuta, ledger 20260916120003.
      Línea base con `correrVigia(db, 0, { maxLlamadas: 0 })`: 14 leídas en 6 s, 0 errores, 0 llamadas, 0 propuestas,
      candado suelto. Desde la próxima revisión, sólo lo nuevo. Pendiente de Pedro al pasar a producción: CRON_SECRET.
### Verificación F6b
Tests puros (extracción, cambios, saneo con citas falsas, cada tipo, aplicar, huella, visible, validar fuente/hosts) ·
test-db 0074 (RLS, CHECKs, huella única, función) · npm test · tsc · lint · build · navegador (?demo=vigia) · reap doble
(seguridad Opus: SSRF, ruta pública, inyección) · smoke real de "Revisar ahora" con la BD de producción SÓLO tras
"ship it" · commit/push.

## 🔵 2026-09-16 (13) — HÜE Prisma · Higgsfield como plataforma (rama `prisma`)
Pedro: "go" al plan prompt-first (§ DECISIONES DE PEDRO abajo); Wan 2.7 fuera (sin uso desde junio). Sin migración esperada:
`tool` es text libre en todas las tablas (0063/0066/0070) y `prisma_herramientas.tool` sólo exige `^[a-z0-9_]{2,30}$`.
**Paso 4 — "¿Cómo salió?" más rápido** (el arrastre ya existía)
- [x] `src/lib/prisma/subida.ts` (navegador): lo que pase de 3.5 MB se achica ANTES de subir (lado largo ≤ 2048,
      JPEG) → adiós al error "pesa demasiado"; en trabajos de video se puede subir el VIDEO y se toma el cuadro del medio
      (video + canvas). Parte pura `medidaDestino(w, h, max)` con tests. El tope de visión vive AQUÍ (comun.ts lo re-exporta).
- [x] `como-salio.tsx`: pegar con ⌘V / Ctrl+V (copiar imagen en Higgsfield → pegar); nunca roba un pegado de texto;
      el input acepta video en trabajos de video; copy nueva. `?demo=resultado` ahora prueba la preparación (toast, sin servidor).
- [x] Paridad: `ref-uploader.tsx` (referencias del paso 3) achica igual — arriba de 3.5 MB la visión fallaba EN SILENCIO
      (subía sin ADN). Navegador: PNG de 52.5 MB pegado → JPEG 2.9 MB; webm → cuadro JPEG; mp4 roto → aviso, sin romper.
      Tests 778 · npm test ✓ · tsc 0 · lint 0 · commit 0a31361 (sin push aún).
**Paso 1 — prompts para los modelos del equipo, abiertos en Higgsfield**
- [x] Cada modelo del catálogo gana `url` (opcional, https, validada, editable en Hub): "Abrir {modelo} en Higgsfield"
      lleva a la página del modelo recomendado; sin url (filas viejas) → la de la familia. "Cómo llegar" reescrito para
      Higgsfield. Slugs VERIFICADOS en higgsfield.ai (navegador, 2026-09-16) → research.md.
- [x] Familias nuevas (ficha + compiler + validador + golden + recomendación): **seedream** (4.5 / 5.0 Lite; "Image N"),
      **seedance** (2.0 Mini para redes sin voz, 2.0 con voz o pantalla grande, 2.5 en la lista; planos con tiempo en la
      escena por bloques; sonido explícito), **gemini_omni** (instrucción conversacional, 16:9/9:16, 4–10 s). Van al
      FINAL de TOOLS_POR_JOB y con fortalezas debajo del líder → el routing de antes NO cambia (golden); se eligen a mano
      y se calibran en el Hub. "Higgsfield" (la familia vieja) se muestra como **Higgsfield DoP**.
- [x] **Image Auto** y **Kling 3.0 Motion Control** en el catálogo sólo para "¿en cuál lo generaste?" (no se recomiendan).
      Motion Control como TRABAJO (pide un VIDEO de referencia) = fase propia después.
- [x] **0072 (sólo datos) APLICADA 2026-09-16** con el "ship it" de Pedro (`npm run migrate`, ref ybbrpqzbedaxsmotgtkh; verificada: las 5 filas con sus páginas de Higgsfield, ninguna estaba editada) `…_0072_prisma_modelos_higgsfield.sql`: pone al día `modelos` de las 5
      filas de 0071 SÓLO si nadie las editó (`updated_by is null`); test-db lo prueba (fila editada intacta). Sin 0072 la
      app funciona (botón → página de la familia; "cómo llegar" viejo). **F6b Vigía pasa a 0073.**
- Verificado: test-prisma 863 · test-db 478 · npm test ✓ · tsc 0 · lint 0 · build ✓ · navegador (?demo=resultado: botón
  "Abrir Kling 3.0 Turbo en Higgsfield" → kling3_0; ?demo=herramientas: 8 pestañas, url por modelo, routing igual).
### Review (pasos 4 + 1)
- Reap seguridad (Opus): 0 críticos / 0 serios / 0 medios; 4 bajos → 3 ARREGLADOS: el pegado ignora campos de texto y
  diálogos abiertos; la página del modelo sólo acepta https://*.higgsfield.ai (una cuenta master robada no puede mandar el
  "Abrir" de todos a un sitio falso); una comilla recta dentro del diálogo se vuelve tipográfica (`dialogoCitado`, lo usan
  compiler y validador). 1 PENDIENTE (deuda chica): la "fuente" del Hub acepta http:// (no ejecuta nada; código de F6a).
- Reap salud (Sonnet): 2 serios → ARREGLADOS: Seedream no avisaba lo que quedó como "Avoid" (diagnostico.ts ~348: ahora las
  3 de imagen); el pegado global robaba pegados de otros campos/diálogos (arriba) + candado síncrono `enCurso` (dos pegados
  = una sola comparación facturable). 1 ABIERTO para Pedro/fuente: ¿"un solo movimiento de cámara" aplica a Seedance/Omni?
  (hoy sólo Kling/DoP; sin fuente para extenderlo).
- test-db encontró solo que las filas vivas de 0071 ya no igualan al catálogo → 0072 (sólo datos, no pisa lo editado).
- Final: test-prisma 866 · test-db 478 · npm test ✓ · tsc 0 · lint 0 · build ✓ · navegador (pegar en textarea = nada;
  pegar en la página = sube).

### Deep dive Higgsfield (Pedro: "read all and learn… so hue can way more accurately create prompts and guide designers")
- [x] Leído: Help Center (43 páginas) · blog de guías (~40, incl. case4k y full-ad-campaign) · skill de Seedance de Pedro
      → `tasks/higgsfield-guia-prompts-2026-09-16.md` (síntesis) + las dos notas crudas con URLs.
- [x] Seedance en BLOQUES (GLOBAL STYLE … POSITIVE LOCKS), `@imageN`, FOV en grados (`opticaDe`), cortes "0.0s to 3.0s" +
      HARD CUT; Omni con `@imageN` y orden sujeto → lugar/candados → cámara; validadores al día.
- [x] Writer: sección CRAFT (lo visible, inicio→fin, manos, cantidades, una luz, cámara exacta, un beat = una acción,
      sin nombres propios de terceros) · PROMPT_VERSION 2026-09-16.2.
- [x] "Paso a paso en Higgsfield" en cada resultado (`lib/prisma/pasos.ts`): modelo, casilla y orden de las refs,
      ajustes (720p/1K para probar, final con el mismo prompt), sonido, un consejo del modelo, subir lo que salió.
- [x] Reap doble. Seguridad (Opus): 0 críticos/serios; 1 medio + 3 bajos → ARREGLADOS (campos del writer en UNA línea con
      tope; captions sin @imageN ni "HARD CUT"; @imageN fuera de rango = error; HARD CUT sólo cuenta dentro de SHOTS; lente
      con tope antes de las regex; preset sólo de la lista). Salud (Sonnet): 3 serios → ARREGLADOS (sfx por plano y estilo
      del texto en Seedance/Omni; la regla "[Imagen N]" del writer ahora dice que cada herramienta usa su sintaxis) + Veo
      transición en orden en el paso a paso + key estable + Omni con varias fotos del mismo sujeto. Pendiente (viejo, no de
      esto): `marca.tono` no lo usa ningún compiler (sólo el writer). test-prisma 882 · npm test ✓ · lint 0 · build ✓.
- [x] Kling 3–15 s (Pedro: "change kling durations to 3-15 in the hub"): constantes [5,3,4…15] (5 = default), tope del Hub
      6 → 15 duraciones (`MAX_DURACIONES`), chips de duración en orden ascendente, writer 2026-09-16.4, **0073 (sólo datos)
      APLICADA y verificada** (fila viva de Kling = [5,3,4,6,…,15]; no estaba editada). F6b Vigía pasa a **0074**.

**Paso 2** — H.Ü.E elige lo más barato sin perder calidad + estimado en créditos (tasks/higgsfield-costos-2026-09-16.md).
Pedro (2026-09-16): "this is meant to help save costs but no sacrificing quality — don't avoid paid ones, just don't use
them if it's not needed". → REGLA: la CALIDAD/capacidad decide; el costo sólo desempata o elige entre modelos que ya
cumplen lo pedido. Sin migración (el costo por modelo se completa desde las constantes si la fila no lo trae).
- [x] Catálogo: `costo` por modelo {ilimitado, créditos típico/mín/máx} (base = histórico de Pedro + blog), editable en
      el Hub; filas viejas sin `costo` → el de la constante con el mismo id (el test "seed = constantes" sigue verde).
- [x] `lib/prisma/costo.ts`: estimado por intento + por pieza (3–5 intentos, blog) + USD (0.04/crédito, resumen de Pedro).
- [x] Modelo: si el rol pedido lo cumple también un modelo ILIMITADO de la misma herramienta (o el fino es más barato),
      ése; si no, el de siempre. Nunca baja de fino a rápido. Nano Banana → Pro (ilimitado).
- [x] Routing: (a) capacidad — descarta herramientas que no aceptan tantas referencias, esa duración o ese formato
      (hoy sólo avisaba después); (b) empate de fortaleza → la más barata. Los casos de siempre no cambian (golden).
- [x] UI: costo en "Úsalo en…" (paso 3 y resultado), en los botones de cambiar herramienta, y campos en el Hub.
- Datos de Pedro (2026-09-16): GPT Image 2.5 Flare y Sunburst = 3 créditos cada uno (NO ilimitados); GPT Image 2 = 6.5.
- Reap paso 2 — seguridad (Opus): 0 críticos/serios/medios; bajos arreglados (créditos redondeados a 2 decimales y sin
  microvalores; aviso en el log si una fila de modelos es ilegible). Salud (Sonnet): 1 serio arreglado — la capacidad
  sólo descarta por duración si la herramienta NO LLEGA, y Seedance ahora ofrece 4–15 s (Help Center) en vez de 5/10/15,
  así un 6 s ya no se corta a 5; comentario del desempate corregido (a igual precio pagado se queda el rápido); doble
  cálculo del costo en los botones quitado. test-prisma 904 · npm test ✓ · lint 0 · build ✓ · navegador ✓.
- Pendiente para Pedro: confirmar qué "GPT Image" es el ilimitado del plan (no es 2 ni 2.5).

### Verificación paso 2
Golden de routing intacto · tests de capacidad/empate/ilimitado/estimado · npm test · tsc · lint · build · navegador
(?demo=resultado, ?demo=herramientas) · reap doble · commit/push.
**Paso 3** — Performance › Evaluación: por diseñador y mes — piezas, vueltas y tiempo hasta el aceptado, créditos estimados.
### Verificación
Tests puros (medidaDestino; golden de los compilers nuevos; catálogo con url; routing/modelo) · npm test · tsc · lint ·
build · navegador con `?demo=` (pegar, video, abrir en Higgsfield) · reap doble (seguridad Opus + salud Sonnet) ·
commit/push a `prisma` (preview).

## 🔵 2026-09-15 (12) — HÜE Prisma · F5c: lo que pidieron los diseñadores (rama `prisma`, antes de F6b)
Pedro: "go in your order" + deep dive de Higgsfield (sitio + API, la quiere conectar a Prisma). Probablemente SIN migración.
1. [x] **Todo aviso se puede resolver** — `resolucionDe(aviso, acciones, "ahora" | "al_generar")` (diagnostico.ts): "arreglar"
       si ESTA pantalla aplica esa acción (ACCIONES_PASO3 / ACCIONES_RESULTADO = exactamente lo que cada `arreglar` aplica);
       "hue" si no tiene arreglo mecánico y es del prompt (juicio `hue_*`, validador, regla nota sobre idea/texto/acción/
       cámara/salida); si no, "entendido" ("ninguna" sólo para un bloquea). Resultado: "Arreglarlo con H.Ü.E" = refine con
       `instruccionDe` + evento aviso_aplicado. Paso 3: "Que H.Ü.E lo arregle" (toggle) → `avisosPedidos` (CÓDIGOS) → el
       servidor recalcula los avisos y pasa SU texto de arreglo al writer ("PRISMA CHECKS TO RESOLVE", cercado; PROMPT_VERSION
       2026-09-15.2). "Entendido" oculta (nunca un bloquea; el bloqueo no cambia) + "Mostrar N ocultos". Browser: ChatGPT +
       Impreso → el aviso de modelo trae "Entendido" (antes un "Arreglarlo" muerto); ocultar/mostrar ok, sin errores.
2. [x] **Entrevista a fondo** — "Profundizar (3 más)" hasta MAX_RONDAS = 3; 7 ids nuevos (mood, composicion, detalle, hora,
       vestuario, accion, color) — cada id se pregunta UNA vez; la ronda 2+ recibe lo contestado CERCADO (`<answer id>`) y lo
       preguntado en `<known>`; "una lista vacía es buena respuesta" → si no falta nada, "H.Ü.E ya tiene lo que necesita" y el
       botón se va. "Saltar" en ronda 2+ salta sólo ESA ronda. Respuestas guardan `ronda` (2/3) → Hub › Informe "Por rondas"
       (ideas por ronda máxima y cuántas llegaron a un resultado aceptado, contando sus copias). Browser (`?demo=entrevista`,
       rondas de muestra sólo dev): ronda 2 con "Ya contestaste…", ronda 3 sin "Profundizar".
3. [x] **Varias imágenes por casilla** — "+ Otra imagen (N de 6)" en producto/sujeto/estilo/escena/objeto/outfit/empaque
       (`ROLES_MULTI`; logo, pose, toma inicial/final: una). `MAX_REFS = 6` (servidor: tope y casillas de una sola imagen).
       Nano Banana: "[Imagen 1: …] and [Imagen 2: …]"; ChatGPT: "the first attached image … and the second attached image"
       (el validador exige cada una). `soltar_ref` quita sólo la ÚLTIMA de esa casilla; quitar la principal promueve la
       siguiente. Tope por herramienta (Veo/Kling 3) = el aviso "refs de más" de siempre. Subir imágenes en local exige
       sesión → cubierto por tests (compilan y validan con 2–3 del mismo papel).
- Tests F5c: test-prisma 770 · npm test ✓ · tsc 0 · lint 0.
- [x] Reap security (Opus): 0 críticos / 0 serios; 1 medio + 2 bajos → arreglados: "Arreglarlo con H.Ü.E" ya no va por
      refinarPrompt (anotaba texto de la máquina como `refinado` → aprendizaje y "copiado sin refinar" contaminados): acción
      propia `arreglarAviso(specId, promptId, codigo)` — el servidor busca el aviso guardado en ESE prompt, confirma que es
      "hue", arma la instrucción y anota `aviso_aplicado` (núcleo compartido `refinarNucleo`); `avisosPedidos` también se
      filtra con `resolucionDe` en el servidor; el tope de 6 refs se revisa antes de recorrer la lista; la IDEA del writer
      va cercada (`<idea>`) como todo texto humano. Pie de la entrevista en dos filas limpias.
- [x] Reap salud (Sonnet): paridad confirmada (ACCIONES_* = lo que cada `arreglar` aplica; etiquetas multi-imagen = lo que
      piden los validadores; rondas se resetean bien). 1 SERIO → arreglado y RE-VERIFICADO por el mismo revisor: el personaje
      y las "+ otra" — soltar el personaje vaciaba la principal y las extra quedaban en pantalla sin viajar al prompt; quitar
      con la X la foto del personaje lo dejaba elegido (previo a F5c). Ahora `elegirPersonaje` promueve la siguiente, la X
      sobre la foto del personaje lo suelta entero, y el arreglo soltar_ref usa `soltarPersonaje` (sin setRefs que se pisen).
      npm test ✓ (770) · tsc 0 · lint 0 · build ✓.
### 🟣 DECISIONES DE PEDRO (2026-09-15, respuestas del head de diseño) — mandan sobre F5d y F7
- **Plan de Higgsfield: Ultimate.** Pedro ya tiene la llave de la API (la pone ÉL en Vercel Preview/rama `prisma` +
  `.env.local` como `HIGGSFIELD_API_KEY_ID` / `HIGGSFIELD_API_KEY_SECRET`; yo no toco secretos).
- **Modelos que usa el equipo DENTRO de Higgsfield:**
  - Imagen: los ILIMITADOS del plan — sobre todo **Seedream 4.5**, **Nano Banana Pro**, **"auto"** y **Kling** (imagen).
  - Video: depende de la quema de créditos. Hoy **Kling 3.0** y **Kling Motion Control** (lo más barato con mejor resultado);
    **Seedance** = el mejor pero caro → poco, sobre todo cuando se necesita un cuadro en 4K; también **Google Veo 3.1 /
    Gemini Omni**. Modelos para **UGC realista**: aún sin descubrir (pendiente).
- **Higgsfield = default para TODAS las marcas.**
- **Sin tope de gasto.** En lugar del tope: **contador** de cuánto se gastó y cuánto QUEDA (saldo de créditos).
- **Nuevos pedidos:**
  1. **HÜE recomienda qué usar** según lo que el diseñador pide y busca: la mejor opción al MENOR costo sin sacrificar calidad
     (el routing de hoy elige por fortaleza — sumarle costo; los ilimitados del plan cuentan como costo ~0).
  2. **Estimado de costo ANTES de generar** ("¿cuántos créditos puede costar esto?") para que el diseñador sepa lo que gasta.
  3. **Admin › Evaluaciones, por diseñador y por mes:** cuántos prompts/assets generó, cuántas iteraciones o cuánto tiempo le
     tomó llegar a uno bueno, y cuánto gastó cada uno.
- ⚠️ **Hallazgo 2026-09-15 (OpenAPI público v2.0.0, `docs.higgsfield.ai/docs/openapi.json`):** la API con llave sólo trae
  modelos VIEJOS (Kling 2.1/2.5-turbo, Seedance v1, `/nano-banana`, Veo 3.1, Sora 2, Hailuo, Wan 2.5, Reve, Flux Kontext,
  Soul) y NO tiene costo, créditos, saldo ni webhook. Kling 3.0 / Seedream 4.5 / Nano Banana Pro / Seedance 2.5 / Gemini Omni
  aparecen en el CLI (`@higgsfield/cli`, login de usuario, `generate cost`; binario cerrado, backend sin documentar).
  **VERIFICADO (páginas de Higgsfield, 2026-09-15):** (1) "Unlimited access applies only on higgsfield.ai: outside it,
  generations always deduct credits" — API/CLI/MCP SIEMPRE cobran, aunque el modelo sea ilimitado en la web
  ([unlimited](https://higgsfield.ai/creator-hub/help-center/credits/what-are-unlimited-models-and-which-plans-include-them),
  [credits](https://higgsfield.ai/creator-hub/help-center/credits/how-credits-work)); misma bolsa de créditos que la web.
  (2) `POST /estimate/{ruta-del-modelo}` (misma llave) → `{"credits","usd"}` antes de generar
  ([billing](https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md)); sólo para modelos de la API.
  (3) Saldo restante: SIN endpoint — sólo en la barra de higgsfield.ai. (4) El costo real por request no viene en el status.
  IDs del CLI (MODELS.md): kling3_0, seedream_v4_5, nano_banana_2 (= Nano Banana Pro), image_auto, seedance_2_5, veo3_1,
  gemini_omni, marketing_studio_video (modo `ugc`). "Kling Motion Control": NO encontrado → preguntar al head de diseño.
  → Generar DENTRO de Prisma volvería de pago lo que en la web es gratis. Recomendación a Pedro: prompt-first (F5d +
  HÜE barato-sin-perder-calidad + estimado + stats) y la llave sólo para `/estimate`; F7 en pausa. Pedro decide.
- **Pedro preguntó por un iframe** (generar en higgsfield.ai y que HÜE vea): **IMPOSIBLE, verificado** — higgsfield.ai manda
  `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self' *.higgsfield.ai` (curl -I, 2026-09-15); y aunque cargara, el
  navegador no deja leer un iframe de otro dominio. Extensión de navegador propia: técnicamente posible, NO recomendada
  (términos no legibles —página sólo JS—; /trust dice que combaten "coordinated bot usage"; frágil; toca la cuenta pagada).
- **Contador = GASTO ESTIMADO** (Pedro). Pedro pasa su **histórico de gasto** (higgsfield.ai → avatar → Manage Account →
  Usage) → costo real por modelo/ajuste = la tabla de costos del catálogo; + `/estimate` con la llave para los modelos de
  la API. **DIRECCIÓN ELEGIDA (Pedro, 2026-09-15): el ciclo — se sigue generando en higgsfield.ai.** SIN botón de "intentos":
  Pedro — "¿Cómo salió?" (F4) YA lo registra: el diseñador sube lo que salió y pide la revisión → Prisma CUENTA cuántas
  veces volvió. Datos que ya existen: `prisma_resultados` (cada subida + veredicto; `aceptado`), specs con `correccion_de`
  (corrección de H.Ü.E), evento `refinado`, evento `resultado_aceptado`. Por pieza (spec raíz): vueltas = subidas +
  correcciones + refinados hasta la aceptada; tiempo = spec raíz → aceptado. Gasto estimado = vueltas × costo del modelo
  (del histórico de Pedro + `/estimate`). Hacer la subida más rápida (pegar/arrastrar) sigue en pie.
- **Histórico recibido (2026-09-16)** → `tasks/higgsfield-costos-2026-09-16.md`: 1 crédito ≈ USD 0.04; Seedance 2.0 = 59 %
  del gasto (mediana 54 créditos vs Kling v3.0 6); lista de ilimitados del plan; 1,200 créditos/mes que no se acumulan;
  link de Kling 3.0 Motion Control. Plan por pasos (1 prompts por modelo · 2 HÜE barato-sin-perder-calidad + estimado ·
  3 stats en Evaluaciones · 4 subida más rápida) → espera el "go" de Pedro.

4. [ ] **F5d — Higgsfield como plataforma** (decisiones de Pedro ARRIBA: default para todas; modelos del equipo). Plan: "¿Dónde generas?" (Higgsfield por default) → el prompt se sigue escribiendo para el MODELO; el
       catálogo (F6a) gana, por modelo, "cómo llegar en Higgsfield" y los límites de Higgsfield cuando difieren (Kling 3.0
       ahí: hasta 15 s, audio nativo, hasta 6 cortes; Veo 3.1: 1–3 refs, 4/6/8 s, 16:9/9:16 = los nuestros); presets de
       cámara al día con la lista de Camera Controls (50+, hoy tenemos 19); ajustar el compiler de Nano Banana a la guía
       que publica Higgsfield (sujeto → composición → acción → lugar → estilo, restricciones explícitas, texto entre
       comillas + fuente). Modelos nuevos (Seedream 5.0, FLUX.2 con JSON y HEX, Soul 2.0/Soul ID, Seedance 2.5, MiniMax H3,
       Wan 2.7) = un compiler cada uno → sólo los que el equipo use. Probablemente sin migración (jsonb del catálogo).
- [x] **Investigación Higgsfield** → `tasks/higgsfield-research-2026-09-15.md` (fuentes citadas; research.md).
- [ ] **F7 — API de Higgsfield en Prisma** (plan; necesita llaves de Pedro en Vercel — yo no toco secretos): "Generar en
      Higgsfield" en el resultado → server action manda el prompt compilado + las referencias (upload firmado desde
      nuestro bucket) a la ruta del modelo → `request_id` → tabla nueva `prisma_generaciones` (spec, prompt, modelo,
      request_id, estado, costo, salidas; migración con "ship it") → estado por webhook (payload/firma sin verificar) o
      polling acotado → al completar, bajar las salidas a nuestro bucket (Higgsfield las guarda ≥7 días) y correr la
      comparación de F4 SOLA (el ciclo "sube lo que salió" se cierra sin que nadie suba nada). Costos: estimar antes
      (el CLI tiene `generate cost`; en la API, verificar), tope por persona/día, resolución y duración conservadoras
      por default; failed/NSFW no cobran. Antes de construir: leer el OpenAPI (`docs/openapi.json`), confirmar rutas y
      parámetros por modelo, rate limits, estado GA y precios reales con una llave de prueba.

### Verificación F5c
Tests puros por pieza (qué aviso lleva qué botón; rondas y tope; refs por rol y tope por modelo) · browser con `?demo=` en
cada pantalla · reap en paralelo (security Opus + salud Sonnet) · npm test · tsc · lint · build · commit/push a `prisma`.

## 🔵 2026-09-15 (11) — HÜE Prisma v1 · FASE 6 Vigía (rama `prisma`) — F6a HECHA (0071 APLICADA) · sigue F6b
Pedro: "let's start F6 vigia" → eligió **datos de herramienta primero** (F6a → F6b → F6c) y **botón "Revisar ahora" +
cron semanal cableado** que sólo corre al llegar a producción (Vercel cron llama a la URL de PRODUCCIÓN — docs
2026-08-11; Prisma vive en preview). Migraciones **0071** (F6a) y **0072** (F6b) — el plan viejo decía 0069/0070, ya usadas;
main termina en 0064. Cada una con su "ship it".

### F6a — los datos de cada herramienta, editables en el Hub (0071 `prisma_herramientas`)
- [x] **0071** (`20260915120001_…_0071_prisma_herramientas.sql`): `prisma_herramientas` (una fila por tool): `limites`,
      `fortalezas` (sólo las que el routing usa: imagen {texto_exacto, identidad}; video {voz, movimiento, rapidez}),
      `modelos` [{id, etiqueta, rol, como_llegar_es/en}], fuente, updated_by/at. RLS master, service_role escribe, CHECKs
      de forma y tamaño. **Seed GENERADO desde CATALOGO_BASE con fichaAFila** (no transcrito a mano).
- [x] `lib/prisma/catalogo.ts` (puro): `CATALOGO_BASE`, `catalogoDesdeFilas` (tolerante campo a campo; sin audio → voz 0),
      `validarFicha` (estricta, para el Hub), `fichaAFila`, `mejorEn` (empate → la primera), `modeloPorRol`. El catálogo
      viaja DENTRO de `cargarReglas` (misma caché de 60 s, una ida a la BD; sin la 0071 → constantes + warn en el log);
      `olvidarConocimiento()` al guardar en el Hub (también las reglas: antes esperaban hasta 60 s).
- [x] Consumidores con `cat` opcional (default = base): routing por fortaleza con el porqué nombrando a la ganadora;
      recomendarModelo elige ROL y el catálogo da el modelo (los porqués nombran las etiquetas del catálogo);
      duracionValida/duracionVeo (`opciones`), compilers Kling/Higgsfield (`topePalabras`: null = sin tope) y Veo,
      validar, diagnóstico (duración, formato, refs, audio) y writer (compila, valida y repara con el MISMO catálogo).
- [x] Cableado: page `/prisma` → `CatalogoProvider` (contexto) → Studio (sugerencia, chips de duración, "Úsalo en…",
      diagnóstico), Resultado, "¿Cómo salió?"; todas las actions; `subirResultado` valida el modelo contra el catálogo.
      `MODELOS_POR_TOOL` eliminado (vive en el catálogo).
- [x] Hub › Prisma › **Herramientas**: una herramienta a la vez; "Así elige Prisma" en vivo (con "(antes X)" al mover un
      número), fortalezas 0–5, límites, modelos (máx. 4; el primero de cada rol es el recomendado), fuente; "Valores del
      código"; guardar = vivo. Sin la 0071: valores del código y "Guardar" apagado.
- [x] Tests: test-prisma 730 (golden **2,432 combinaciones job × destino × pistas = routing de antes**, también leído desde
      el seed; ida y vuelta del seed; la base pasa la validación estricta; "ChatGPT sube caras" cambia la sugerencia; modelo
      nuevo en "Úsalo en…"; fila rara → base campo a campo; 8 rechazos del Hub; Kling tope 90 compila y valida >60; Veo 10 s;
      diagnóstico con duraciones/refs del catálogo) · test-db 474 (0071: RLS, policy, service_role, PUBLIC sin ACL, 5 filas,
      jsonb como datos, **seed == CATALOGO_BASE**, 6 CHECKs) · npm test ✓ · tsc 0 · lint 0. Browser (`?demo=herramientas`,
      sólo dev): bajar "caras" de Nano Banana a 2 → "Foto sin texto → ChatGPT Images (antes Nano Banana)", Guardar apagado
      en demo; 375 px ok; el estudio carga y el log dice "herramientas no disponibles (¿falta la 0071?)" → constantes.
- [x] Reap en paralelo — **security (Opus): 0 críticos / 0 serios / 0 medios**, 3 bajos; **salud (Sonnet): 0 críticos /
      0 serios** (paridad compilar/validar/diagnosticar/recomendar con el MISMO catálogo en las 20+ llamadas, cliente = servidor).
      Las dos coincidieron en lo mismo → arreglado: validación CRUZADA en el lector compartido (tolerante y estricto igual):
      Veo debe conservar 8 s (`VEO_SEGUNDOS_CON_REFS`), refs máx. ≥ `refsMinimas(tool)` (lo obligatorio del trabajo que más
      pide: 2/2/2/2/1), tope de palabras ≥ 30 (`MIN_PALABRAS`); "otro" no puede ser id de modelo (es la opción de "¿Cómo
      salió?"); surrogate suelto rechazado; `TARGET MODEL` cercado y la pista de tamaño sale del ROL del catálogo ("fast /
      precise tier"), no de nombres de modelo (`Recomendacion.rol`, `EntradaWriter.modeloRol`, PROMPT_VERSION 2026-09-15.1);
      CHECK de `modelos` a 16 000 bytes (un guardado válido con acentos no revienta en la BD); el editor del Hub con import
      dinámico en la demo (no viaja en el bundle de /prisma); pistas en el Hub (8 s de Veo, mín. de refs y de palabras).
      +11 tests (741). Aceptado sin cambio: `?demo=resultado` compila con la base (sólo dev).
- [x] **SHIP 0071** — Pedro: "ship it" → `node scripts/migrate.mjs` → aplicada. Verificada en prod (ybbrpqzbedaxsmotgtkh):
      5 filas, RLS on, 1 policy, anon/authenticated sin SELECT, service_role escribe, Veo [8,6,4], y **prod leído con
      catalogoDesdeFilas == CATALOGO_BASE** (nada cambió para los diseñadores). npm test ✓ · tsc 0 · lint 0 · build ✓.
- [ ] **LIVE-VERIFY de Pedro (preview, sesión master)**: Hub › H.Ü.E › Prisma › Herramientas → bajar "caras" de Nano Banana
      a 2 → "Así elige Prisma" dice "Foto sin texto → ChatGPT Images (antes Nano Banana)" → "Valores del código" → Guardar
      no se prende (sin cambios). (Si quiere probar un guardado real: subir y volver a bajar, o "Valores del código" + Guardar.)

### F6b — el vigía (0072 `prisma_fuentes` + `prisma_propuestas`)
- [ ] Fuentes editables (seed: las oficiales ya citadas — developers.openai.com, ai.google.dev, blog.google, klingai.com,
      higgsfield.ai); lectura segura (https, sólo el host de la fila, sin redirecciones a otro host, 15 s, 2 MB);
      texto → hash; sin cambio = cero llamadas al modelo; con cambio → H.Ü.E lee SÓLO lo que cambió (cercado como dato)
      + lo que Prisma ya sabe de esa herramienta → propone con cita literal + url.
- [ ] Propuestas (nota | regla | modelo | limite | fortaleza | deprecacion | codigo): aprobar escribe en prisma_reglas o
      prisma_herramientas con el MISMO validador del Hub; descartar guarda el porqué y no vuelve; `codigo` = ticket.
- [ ] "Revisar ahora" (master) + `/api/prisma/vigia` con CRON_SECRET (Pedro lo pone en Vercel al pasar a producción).
- [ ] Comunidad: una afirmación necesita 2 fuentes. Costo real medido en el smoke (×2, con una página sin cambios).

### F6c — lo que queda del plan §8
- [ ] Referencias revisadas (aspect vs destino, más de una cara, texto dentro de la ref, calidad) · ejemplos de oro por
      herramienta × job (editables).

## 🟢 2026-09-15 (10) — HÜE Prisma: `filaHermana` — UNA función para el spec hermano (rama `prisma`, SIN migración)
Pedro: "yes do A". La deuda que dejó el reap de salud de F5a (el linaje `correccion_de` se perdía porque 3 sitios copiaban
las columnas a mano).
- [x] `lib/prisma/hermano.ts` (puro): `filaHermana(origen, cambios)` construye la fila hermana; su tipo exige TODAS las
      columnas de `PrismaSpecRow` (`-?`), así que una columna nueva de una migración rompe tsc AHÍ hasta decidir si viaja
      (probado: columna de prueba → TS2741 en hermano.ts:22, revertido).
- [x] `variar`, `adaptarFormato` y `corregirResultado` la usan. `origen_spec_id` = siempre el id del original.
- [x] Divergencia arreglada: `adaptarFormato` copiaba `respuestas` (la entrevista) y `variar` no → el informe contaba la
      MISMA entrevista una vez por cada adaptación. Ahora ningún hermano la copia (nadie más lee esa columna: las
      respuestas ya van aplicadas en el spec).
- [x] Fuera el respaldo "antes de la 0066" en `variar` (la 0066 está en prod desde 2026-09-11: código muerto).
- [x] Tests: 9 checks nuevos en test-prisma (700 ✓) · npm test ✓ · tsc 0 · lint 0 · build ✓.
- [x] Las copias ya no cuentan como ideas (Pedro: "do the habits fix next"): `cargarHabitos` filtra
      `origen_spec_id is null` EN LA BD (con el tope de 60, filtrar después dejaba que las copias se comieran la ventana);
      el informe trae `origen_spec_id` y cuenta "Ideas (specs)" y la entrevista sólo con originales, pero `specPorId`
      sigue con TODOS (una corrección es copia y hace falta para "aceptado tras corrección"). Arregla también el
      histórico: adaptaciones de antes de filaHermana que traían la entrevista copiada. Test: fixture con una corrección
      y una adaptación vieja → ideas 3, entrevista 1/3/1 (701 ✓) · npm test ✓ · tsc 0 · lint 0 · build ✓. Sin browser:
      el informe exige sesión master y los hábitos una marca con specs — no se ven en local.
      Barrido: las demás lecturas de prisma_specs son por id, la idempotencia de corregir o el historial (ahí las copias
      SÍ van). Nota menor, sin arreglar: el aprendizaje puede elegir como "ganadores" dos prompts casi iguales (un
      original y su adaptación, si el diseñador copió ambos).

## 🟡 2026-09-15 (9) — HÜE Prisma v1 · FASE 5a: pulido sin briefs + el Look rebuild (rama `prisma`, 7a0f8c6, SIN migración · reap pendiente)
Pedro: "lets do your recommendation" + "include the look rebuild in phase 5a". Sin migración. Plan §5 plegados.
- [x] **El Look, rehecho** — `lib/prisma/looks.ts` (puro): ~30 "looks" por familia (producto / persona / libre / video /
      edición), cada uno fija luz + lente + ángulo + ambiente + estilo (+ movimiento en video); `looksPara(job)`,
      `lookSugerido` (idea + ADN + destino → uno pre-elegido "H.Ü.E sugiere"), `lookActivo`, `habitosDe` (lo que la marca
      más usa flota arriba). UI `components/prisma/looks-grid.tsx`: tarjetas con miniatura (generadas una vez con Nano
      Banana → `public/prisma/looks/*.jpg`) + "Ajustar" plegable con las filas de siempre (+ Ángulo). La marca pasa al
      paso 1 (así la entrevista y los hábitos SÍ la conocen). Las respuestas de la entrevista se ven con su etiqueta, no
      con el valor crudo en inglés.
- [x] **Adaptar a otros formatos** — `adaptarFormato(specId, destino)`: spec hermano con el destino/aspect nuevo,
      recompilado SIN modelo; bloque en el resultado. **Zonas seguras** story / TikTok en los 5 compilers (`compilers/zonas.ts`).
- [x] **Prompt primero, juicio después** — generar / refinar / otra versión devuelven el prompt al instante con los avisos
      deterministas; en video el juicio de H.Ü.E corre en segundo plano y los avisos llegan unos segundos después
      ("H.Ü.E está revisando…").
- [x] **Informe en el Hub** — `lib/prisma/informe.ts` (puro) + `hubPrismaInforme(dias)` + Hub › Prisma › Informe: prompts por
      herramienta y modelo, copiados sin refinar, refines por prompt, avisos mostrados vs aplicados, preguntas hechas vs
      contestadas, resultados subidos / aceptados a la 1ª / tras corrección, modelo recomendado vs usado, fallos por punto.
- [x] **A11y** del panel de avisos, la entrevista y el grid de looks (aria-pressed, nombres accesibles de "Arreglarlo" y
      de la fuente, grupos con etiqueta en la entrevista y conteo para lectores; `avisosDe` conserva `interno`: un aviso
      interno guardado ya no se le enseña al diseñador al reabrir).
- [x] Tests: test-prisma 658 (todos los looks × job × herramienta válidos = 200+ combinaciones; sugerencia con acentos y
      límites de palabra; hábitos; etiquetas llanas para cada valor; zonas seguras en NB/GPT/Veo/Kling y el tope de Kling;
      informe con fixture) · npm test ✓ · tsc 0 · lint 0 · build ✓. Browser: `?demo=entrevista` → paso 2 con el grid
      ("H.Ü.E sugiere" pre-elegido, "Ajustar" con Ángulo y etiquetas llanas), 375 px a dos columnas; `?demo=resultado` con
      "Adaptar a otros formatos" y la línea de formato; sin errores de consola.
- [x] Commit + push a `prisma` (7a0f8c6, preview).
- [x] Reap security (Opus): 0 críticos / 0 serios; 1 medio + 4 bajos → arreglados (0e86f0b+): los hábitos de marca sólo
      cuentan vocabulario conocido (el texto libre de "Otro…" nunca se vuelve chip sugerido de otra persona); la fila del
      look va al writer cercada como dato (`<look campo>`), no entre comillas de atributo; `revisarBien` con cubo propio
      "juicio" y sin repetir un juicio que ya corrió; `adaptarFormato` respeta el mismo "bloquea" que generar; tope de 120
      letras en los hábitos y `Object.hasOwn` en `etiquetaValor`. INFO aceptado: `listarPersonajes` (marcas + hábitos) para
      cualquier rol interno = modelo de agencia, ya documentado como diferido.
- [x] Reap salud (Sonnet): 0 críticos; 2 serios → arreglados (una versión o una adaptación de una CORRECCIÓN perdía el
      linaje `correccion_de` y el chip "Corrección" —y el informe la contaba como "a la primera"—: ahora viaja con el
      hermano y vuelve en la respuesta; el informe colgaba el spinner al repetir el periodo activo). Mejoras: el juicio en
      segundo plano ya no bloquea refinar/adaptar (era la gracia de F5a); la sugerencia de look se actualiza si la idea
      cambió y nadie ajustó el look; personas del informe = también quien sólo generó; semántica de "copiado sin refinar"
      documentada (a nivel de idea); `corregirResultado` no crea una segunda corrección si la anterior no se pudo abrir;
      la zona segura más corta (un prompt de story con texto y marca cabe en 160) + test de longitud.
- [x] **Miniaturas de los looks** — HECHO 2026-09-15: las 33 generadas (1 MB, 480 px, lazy) y `FOTOS_LISTAS = true`;
      browser: 200 en cada miniatura, sin errores de consola, 375 px a dos columnas. Única floja: `poster_grafico` trae
      letras falsas ("FES IER") pese al "no text" → regenerar sólo ésa si Pedro quiere (borrar el jpg y re-correr).
      Historia: el conector `nano-banana` apunta a un modelo retirado
      (gemini-2.5-flash-image-preview → 404); `scripts/looks-thumbs.mjs` las genera con gemini-3.1-flash-image por REST
      cuando haya `GEMINI_API_KEY` en la shell (Pedro la exporta; no va en el repo), y luego
      **2026-09-15: corrido → 33 × 429 `limit: 0` (free tier). Falta activar billing en el proyecto de AI Studio de
      esa llave (~$2.21 por las 33 a $0.067 c/u en 1K; prepago mínimo $5); luego re-correr el mismo comando.** Y luego `FOTOS_LISTAS = true` en
      looks.ts. Mientras, cada tarjeta enseña su degradado e ícono.

### Verificación F5a (Pedro, preview con login)
1. Paso 1: la marca se elige arriba. Paso 2: tarjetas de looks con foto; uno viene marcado "H.Ü.E sugiere"; "Ajustar" abre las filas.
2. Resultado: "Adaptar a otros formatos" → Story / Feed / Banner… un click cada uno, sin esperar a H.Ü.E.
3. Un video: el prompt aparece al instante y en unos segundos llegan los avisos del juicio.
4. Hub › H.Ü.E › Prisma › Informe: los números de los últimos 30 días.

## 🟢 2026-09-14 (8) — HÜE Prisma v1 · FASE 4: "sube lo que salió" (rama `prisma`, 390b013 · 0070 APLICADA)
Pedro: "lets go with phase 4". Plan §7: el diseñador sube lo que salió de la herramienta, H.Ü.E lo compara con lo pedido,
dice qué falló, ofrece un prompt de corrección (edita ESE resultado) o refinar el original, y se marca el resultado final
aceptado = la señal de aprendizaje más fuerte.
- [x] **0070** `20260914120002_greenlight_0070_prisma_resultados.sql`: tabla `prisma_resultados` (spec, prompt, client_id,
      tool, modelo, storage_path `prisma/out/…`, mime, caption, veredicto jsonb, score 0–100, aceptado, created_by), RLS
      master + grant service_role; `prisma_specs.correccion_de` (el spec que corrige un resultado). Sin storage.* en SQL.
- [x] **`lib/prisma/resultado.ts`** (puro): campos del veredicto (sujeto, texto, encuadre, luz, estilo, identidad, marca),
      `sanearVeredicto` (tolera array / string JSON / envoltorio), `scoreDe`, `detalleFallos`/`fallosDe` (sólo campos del
      enum), `specCorreccion` (spec hermano de edición sobre la imagen subida: job `correccion`, ref `resultado`).
- [x] **Job oculto `correccion`** (edición; no aparece en el wizard) + rol de ref `resultado`; compilers Nano Banana / ChatGPT:
      "Edit [Imagen 1]: {cambio}. Change only that…", sin cláusula de "no text" ni "photorealistic" impuestos.
- [x] **`compararResultado`** (writer.ts, tool_use `emitir_veredicto`, UNA llamada con la imagen): caption + lista
      cumple/no cumple con nota es/en + `refine` (qué pedirle al original) + `correccion_en` (la edición sobre ESTA imagen).
- [x] **Acciones** `prisma/resultado-actions.ts`: `subirResultado(form)` (gate, freno "vision", sniff, ≤ 5 MB, sube,
      compara, guarda fila + evento `resultado_subido` con los campos fallidos), `corregirResultado(id)` (spec hermano +
      prompt + evento `correccion_generada`, idempotente), `aceptarResultado(id, si)` (evento `resultado_aceptado` sólo al
      pasar de no a sí). Helpers compartidos con actions.ts en `prisma/comun.ts` (un solo gate / freno / specDeFila).
- [x] **UI** `components/prisma/como-salio.tsx` dentro del resultado: modelo usado (prellenado con "Úsalo en…"), subir la
      imagen, lista ✓/✗ con notas, "Corregir este resultado" (imagen/edición) · "Refinar el original" · "Marcar como
      resultado final"; chip "Corrección" en el prompt hermano y en el historial; al reabrir desde el historial se ve el
      último resultado y si quedó aceptado.
- [x] **Aprende**: ganadores = aceptado > subido con 👍 > copiado/abierto > 👍; `patronFallos` (un campo falla ≥ 3 de los
      últimos 6 resultados de esa herramienta) → frase al writer + "Úsalo en…" sube a Pro / sunburst cuando el texto o la
      identidad fallan.
- [x] Tests: test-db 460 (bloque 0070: RLS, grants, checks de ruta/mime/score/modelo, set null / cascade); test-prisma 593
      (veredicto tolerante, score, fallos, spec de corrección válido en las 2 herramientas, orden de ganadores, patrón de
      fallos, `<results>` al writer, Úsalo en… con fallos). tsc 0 · lint 0 · build ✓ · npm test ✓. Smoke real
      `scripts/smoke-veredicto.mjs` 2/2 (logo vs producto: 7 puntos, texto y sujeto ✗, refine, sin corrección).
      Browser: `?demo=veredicto` y `?demo=resultado` en desktop y 375 px (sin scroll horizontal, sin errores de consola).
- [x] Reap: security (Opus): 0 críticos, 0 serios, 2 medios + 5 bajos → arreglados: el spec que vuelve al writer (refinar /
      otra versión / reparación) va en `<spec>` cercado y declarado dato; el texto pintado DENTRO de la imagen subida se
      declara contenido, nunca instrucción; lo que vuelve de la visión sale `cercado`; el evento `resultado_aceptado`
      lleva el id del RESULTADO (desmarcar uno no borra la señal de otro); tope de visión 3.5 MB (base64 × 1.33 < 5 MB);
      archivo retirado del bucket si falla el insert; `faltaMigracion` sólo para "no existe la tabla/columna" (probado
      contra prod: PGRST205 / 42703); sólo se acepta un resultado para el prompt VIGENTE del spec. Salud (Sonnet): 1
      crítico (tipo del demo, ya cazado por el build), 2 serios (uno = el del evento; el otro: la corrección repetida
      devolvía `avisos: []` → ahora los guardados), mejoras (modelo validado por herramienta, sin "change only" triple,
      tests del round-trip del veredicto y de `faltaMigracion`). test-prisma 605 · test-db 460 · tsc 0 · lint 0 · build ✓.
- [x] Commit + push a `prisma` (preview, 390b013).
- [x] **SHIP** — Pedro: "ship it" → `npm run migrate` 0070 aplicada y verificada en prod (tabla con RLS, policy master,
      service_role escribe, `prisma_specs.correccion_de`, 4 índices, en el ledger). Siguiente: **F5** ronda de prueba.

### Review F4 — lo que queda (diferido, no bloquea)
- **Memoria de marca abierta a cualquier rol interno** (security LOW): `cargarMarcas` da todas las marcas a todo rol y
  `resultado_aceptado` es ahora la señal más fuerte → un creative podría "enseñarle" a una marca ajena. La inyección está
  cercada; lo que queda es integridad de la memoria. Si las marcas deben ir por track/persona, es un cambio aparte.
- **Referencias > 3.5 MB** (salud #8): `analizarImagen` sigue aceptando 10 MB y, si la visión no lee, la referencia "sirve
  igual" sin ADN. Alinear al tope de visión (o reducir en el servidor con `sharp`, que Next ya trae) = decisión de Pedro.
- La corrección repetida no devuelve su propio resultado subido (reabrir desde el historial sí lo trae).
- **Rol de sesión:** Pedro pidió `/model opus` para migraciones/datos; la revisión de seguridad corrió en Opus (subagente).

### Verificación F4 (Pedro, preview con login)
1. Genera un prompt de imagen, pégalo en Gemini/ChatGPT, baja la imagen y súbela en "¿Cómo salió?".
2. Debe aparecer la lista ✓/✗ (texto, encuadre, luz…) con una nota corta por punto y el modelo que usaste.
3. Si algo falló: "Corregir este resultado" → prompt hermano con chip "Corrección" que edita esa imagen; o "Refinar el original".
4. "Marcar como resultado final" → queda marcado; al reabrir desde el historial se ve.
5. Un video: sube un cuadro (captura) → veredicto; sólo ofrece "Refinar el original".

## 🟢 2026-09-14 (7) — HÜE Prisma: H.Ü.E se corrige solo + palabras llanas (rama `prisma`, 7080c45 · 0069 APLICADA)
Pedro: "if hue generated the prompt by itself shouldn't it adhere to this suggestions… why would it purposely do it wrong?" y
"Cenital / cine anamórfico… overly complicated".
- [x] **cerrarSpec** (writer.ts): compila → diagnostica → si hay avisos REPARABLES por el writer (prompt largo, dos
      movimientos, "avoid" sin positivo) UNA reparación con esos avisos + el conteo de palabras → gana la versión con menos
      problemas y, en empate, la más corta. Aplica a generar, refinar y otra versión. Las reglas del Hub viajan al writer.
- [x] **Andamio más corto** en Nano Banana / ChatGPT (técnica compacta, texto exacto en 8 palabras, marca corta, conservar
      corto, ≤ 3 positivos sin repetir idea, "photorealistic" sólo sin estilo, "Quality: high", segunda mención de una ref
      sin caption, deletreo "Spelled out:") → el caso de Pedro pasa de 162 a ~152 palabras sin reparación; el bloque
      estable pide una cláusula por campo y negativos canónicos (lista); "hands" → "hands kept out of frame".
- [x] **0069** `20260914120001_greenlight_0069_prisma_prompt_largo.sql`: tope de `prompt_largo` 120 → 160 (el andamio fijo
      pesa ~50; con 120 cualquier pieza con texto y marca "pasaba de largo").
- [x] `negativos_sin_mapear` es interno (señal para el Hub; el diseñador no lo ve). Etiquetas llanas en los chips de lente
      y regla de palabras llanas para las opciones de la entrevista.
- [x] Tests: test-prisma 541 (longitud con fixture normal ≤ 160 y estrés ≤ 210 para todos los jobs de imagen × 2
      herramientas). test-db 443. Smoke real 2×: 151–154 palabras, sin reparación, sin avisos visibles.
- [x] **SHIP** — Pedro: "ship it" → `npm run migrate` 0069 aplicada y verificada en prod (umbral 160, en el ledger).


## 🟢 2026-09-14 (6) — HÜE Prisma v1 · FASE 3: la entrevista (rama `prisma`, SIN migración)
Pedro: "ok lets start then" (tras acordar la Fase 6 "Vigía" y los plegados de la Fase 5 en el plan). Plan §2.
- [x] **`lib/prisma/entrevista.ts`** (puro): `necesitaEntrevista` (sin modelo: < 8 palabras siempre pregunta; ≥ 25 + refs +
      ≥ 3 chips de look no pregunta; "sin preguntas" manda), `sanearPreguntas` (ids del enum, 2–4 opciones, tope 3, omite
      las que la marca ya sabe), `sanearRespuestas` (una línea, 120 letras, campo del enum), `aplicarRespuestas` (llena
      luz/movimiento/lente/mood/estilo/duración/formato/idioma desde el CÓDIGO, sólo lo vacío), `detalleRespuestas`/`pares`.
- [x] **H.Ü.E pregunta** (`preguntarFaltante`, tool_use `emitir_preguntas`, `bloqueEntrevista` corto sin caché) → acción
      `entrevistar(input)`: gate → normalizar → heurística → (sólo si hace falta) freno + modelo; las ids "sabidas" de la
      marca no se preguntan. Smoke real: idea "la tarjeta en una mesa" → ángulo / fondo / luz con chips; con `yaSabidas`
      → ninguna. ≈ US$0.005 por entrevista.
- [x] **Al writer**: `DESIGNER ANSWERS` con cada `<answer about="id">` cercada, antes de la orden final; las respuestas con
      campo ya llegan aplicadas al look/duración/formato/idioma. Guardadas en `prisma_specs.respuestas` + evento
      `respondido` (`id=valor; …`). **Aprende**: `patronRespuestas` (misma respuesta ≥ 4 de las últimas 10 → "esta marca
      siempre contesta…" al writer y la pregunta deja de hacerse).
- [x] **UI**: paso "entrevista" entre 1 y 2 (`components/prisma/entrevista.tsx`: chips + "Otra…", "Saltar", "Sin preguntas,
      sorpréndeme (en este navegador)" en localStorage vía useSyncExternalStore, "Seguir con N respuesta(s)"); el botón
      Siguiente del paso 1 muestra "H.Ü.E está viendo qué le falta…"; cero preguntas salta invisible al paso 2; al seguir,
      las respuestas con campo aparecen como chips elegidos en el paso 2 (los valores que no están en la lista se ven como
      chip); punto extra pulsante en la barra; `?demo=entrevista` (sólo dev) para ver la pantalla sin sesión.
- [x] Tests: test-prisma 460 (+22): matriz de `necesitaEntrevista`, saneo (5 opciones → 4, id inventado fuera, campo raro
      → null, sabidas fuera), respuestas, aplicarRespuestas, detalle/pares, DESIGNER ANSWERS cercado y antes de la orden,
      patrón 4 de 5 sí / 3 de 5 no. Gates: tsc · lint · build · test-db 441 · isolation · actions. Navegador: paso 1 →
      spinner → paso 2 (sin sesión); `?demo=entrevista` → contestar 2 → "Seguir con 2 respuesta(s)" → los chips del look
      traen las respuestas.
- [x] Reap (Opus seguridad + Sonnet salud) → arreglado: separadores fuera del `detalle` + `pares()` sólo ids conocidas +
      tope y cerca `<known>`/`<learned>`; el gate de "bloquea" usa los valores ya aplicados; cubo propio para la entrevista
      (20/10 min) y para visión (30); la heurística corre ANTES de tocar la BD; recorte seguro de emojis (`recortar`);
      los `respondido` con su propia ventana; la heurística usa lo que existe en el paso 1 (idea + refs + ADN; los chips
      del look sólo si ya se eligieron); el servidor sólo aplica respuestas al look (formato/duración/idioma los decide el
      wizard); "la marca lo sabe" exige 2 personas (o 6 veces de una); 1,600 tokens para preguntas; un solo `armarInput`;
      "Regresar" en la entrevista; título sin número fijo; error crudo de visión sólo al log.
- [x] Gates finales: tsc · lint · build · test-prisma 473 · test-db 441 · isolation · actions. Commit + push a `prisma`.
- [x] **Pedro probó y "no pasó nada"** → causa: el modelo devolvió las preguntas como STRING JSON dentro del tool_use y el
      saneo (Array.isArray) las tiraba en silencio. Arreglo: `lib/prisma/json.ts` (`listaDe`/`objetoDe`) en preguntas,
      juicio, corrector y listas del spec + warn si hay tokens y 0 elementos; fallos/vacíos de la entrevista ahora se dicen
      con un toast; la sugerencia ortográfica sale AL ESCRIBIR (diccionario, 500 ms) y se ve también en la entrevista y en
      el paso 2. Reproducido 2×: 3 preguntas. test-prisma 483.
### Verificación F3 (Pedro, preview con login)
- Idea corta ("la tarjeta en una mesa") + Siguiente → aparecen 2–3 preguntas con chips; contesta y sigue → el look trae las
  respuestas; el prompt las respeta. Idea larga con referencias y 3 chips de look → no pregunta nada.
- "Sin preguntas, sorpréndeme" → no vuelve a preguntar en ese navegador; en el paso 2 hay un enlace para reactivarlas.
- Tras 4 generaciones de la misma marca contestando igual una pregunta, deja de hacerla.


## 🟢 2026-09-11 (5) — HÜE Prisma v1 · FASE 2: diagnóstico + ortografía (rama `prisma`, SIN migración)
Pedro: "yes and also add a grammar check specially when user writes text to make sure accents, and grammar are correct both in
english and spanish". Plan §3 + la ortografía como UN aviso más.
- [x] **`lib/prisma/diagnostico.ts`** (puro): `Aviso` {codigo, nivel, que, porque, arreglo, accion, fuente}; `REGLAS_BASE` (7:
      duracion_fuera, veo_8s_con_refs, aspect_no_soportado, refs_de_mas, dialogo_sin_voz, texto_en_video, dos_movimientos);
      reglas de la BD compiladas con `regexSegura` al LEER (una mala se descarta con warn); `evaluar` por campo (patrón y/o
      umbral, filtros tool/kind); `diagnosticarEntrada` (cliente, instantáneo) y `diagnosticar` (resultado: + reglas de
      `salida` + errores del validador + negativos sin mapear); `aplicarArreglo` (puro, idempotente); `bloqueado`.
- [x] **`lib/prisma/ortografia.ts`** (puro): diccionario de ≥ 200 acentos frecuentes en copy (sin palabras ambiguas), signos
      de apertura ¿ ¡, `idiomaDe`. + **H.Ü.E como corrector** (`revisarTexto`, tool_use `emitir_correccion`, mismo idioma,
      sin tocar marcas/números/mayúsculas) → acción `revisarOrtografia(campo, texto)` (gate + freno + tope; si el modelo
      falla, vale la capa determinista). Se revisa al SALIR del campo (texto en la pieza y diálogo); es sugerencia: «Usar»
      / «Dejar como está»; también entra como aviso en el paso 3 y se anota `aviso_aplicado` si se usa.
- [x] **Juicio de H.Ü.E** (`juzgarSpec`, tool_use `emitir_avisos`, ≤ 3, saneado): siempre en video al generar/refinar/
      variar; a petición en imagen con "Revísalo bien" (`revisarBien`). Smoke real: 3 avisos bien formados (abrazo+espejo,
      cámara rápida vs acción suave, reflejo) — con 900 tokens se cortaba: ahora 1,600 + frases ≤ 18 palabras + warn.
- [x] **Servidor**: `diagnosticoDe` en generar/refinar/variar (con juicio) y cambiarHerramienta/abrirSpec (determinista);
      se guarda en `prisma_prompts.avisos` y viaja en cada resultado; `InputGenerar.avisosAplicados` → eventos
      `aviso_aplicado`; `registrarEvento(…, "aviso_aplicado", codigo)` desde el resultado; `page.tsx` baja las reglas del
      Hub como `ReglaCliente[]`.
- [x] **UI**: `components/prisma/avisos.tsx` (`PanelAvisos` por nivel con ícono+texto, fuente oficial/comunidad con fecha,
      "Arreglarlo"; `SugerenciaTexto`); paso 3 con el panel (un `bloquea` apaga Generar), arreglos de un click (herramienta,
      duración, formato → `aspectOverride`, texto, diálogo, soltar ref, fusión → prompt de Nano Banana para copiar);
      resultado: el panel sustituye la lista cruda de errores, "Arreglarlo" = cambiar herramienta o refinar con la
      instrucción del arreglo, "Revísalo bien" en imagen. El spinner de "revisando" vive en la etiqueta (no mueve el layout).
- [x] Tests: test-prisma 395 (+59): acentos, mayúsculas, ¿¡, idioma, reglas base, reglas de BD (patrón/umbral/filtros/acción),
      regex mala descartada, bloquea primero, aplicarArreglo, diagnosticar sobre el resultado. Gates: tsc · lint · build ·
      test-db 439 · isolation · actions. Smoke real corrector: "Envio gratis a todo mexico, pidelo hoy y ahorrate" → todo
      acentuado por el diccionario; "Get you order deliver free todays" → "Get your order delivered free today" por H.Ü.E.
      Navegador: paso 3 muestra "Antes de generar → Texto en pantalla en un video → Arreglarlo" y al aplicarlo desaparece.
- [x] Reap (Opus seguridad + Sonnet salud) → arreglado: regex de las reglas acotada (≤ 2 repeticiones sin tope por RUTA +
      sondas de 22/120 letras + entrada acotada a 600/2,000) y el seed entero pasa por el filtro en el test; un aviso
      "bloquea" se impone también en el servidor ANTES de la llamada facturable; `registrarEvento(aviso_aplicado)` con freno,
      código válido y que exista en los avisos del prompt; el aprendizaje sólo lee copiado/abierto/variante/refinado;
      `avisosDe` valida el jsonb guardado (fuente sólo http(s)); freno propio para la revisión ortográfica; `revisarBien`
      con tope 20 y disponible cuando aún no hay juicio (video tras cambiar de herramienta); cercas en refinar/explicar/
      texto; ¿¡ en frases seguidas; diccionario sin ambiguos (leon/san) ni entradas nulas; `idiomaDe` con pesos (un "café"
      no vuelve español una frase inglesa); códigos reservados al guardar reglas; `useMemo` de las reglas; reset del último
      texto revisado; soltar la ref del personaje suelta el personaje; UUID en `explicar`.
- [x] **0068** `20260911120004_greenlight_0068_prisma_reglas_patron.sql`: el patrón de `texto_no_latino` con escapes \uXXXX
      (el crudo traía U+0600, un carácter de formato, y el filtro de lectura lo descartaba). test-db 441 · test-prisma 438.
- [x] **SHIP** — Pedro: "ship it" → `npm run migrate` 0068 aplicada y verificada en prod (patrón con escapes, en el ledger).
- [x] Commit 797d637 + push a `prisma`.
### Verificación F2 (Pedro, preview con login)
- Escribe "Envio gratis a todo mexico" en "¿Lleva texto la pieza?" y sal del campo → aparece «Envío gratis a todo México»
  con «Usar la sugerencia». En inglés: "Get you order deliver free" → corrección gramatical.
- Video con texto → aviso "Texto en pantalla en un video" → Arreglarlo quita el texto. Higgsfield con diálogo → "no genera
  voz" → Arreglarlo cambia a Veo.
- Generar un video → en el resultado aparecen los avisos del juicio de H.Ü.E (si hay algo que ver). Imagen → botón
  "Revísalo bien".
- Hub › Prisma: editar/crear una regla (p. ej. `hex_en_idea`) → recargar Prisma → el aviso cambia sin deploy.


## 🟢 2026-09-11 (4) — HÜE Prisma v1 · FASE 1: compilers al día + "Úsalo en…" (rama `prisma`, SIN migración)
Pedro: "start phase 1". Plan §6. Todo puro + probado; el writer y los compilers cambian, la BD no.
- [x] **De negativo a positivo** — `lib/prisma/positivo.ts` (`positivar` con mapa de 30 familias + `sinMapear`; `sustantivar`):
      Nano Banana / ChatGPT dicen "Keep the frame: …" y un "Avoid:" corto sólo con lo sin mapear; Kling mete hasta 2 positivos
      en la atmósfera; Veo recibe sustantivos + `negative_prompt` en una línea; el writer escribe negativos como sustantivos.
      La instrucción de foto de producto ya no dice "Avoid distortion…".
- [x] **Nano Banana 2/Pro** — slot `estilo` opcional (al final) en todos los jobs de imagen/edición ("Borrow only the visual
      style of [Imagen N]"); tipografía real cuando no hay estilo de texto; "2K resolution" sólo para impresión y banner.
- [x] **gpt-image-2.5** — `TAMANO_GPT` por aspect (múltiplos de 16, ratio ≤ 3:1, lado ≤ 1536); `texto-imagen.ts` `deletrear`
      (≤ 24 letras, conserva mayúsculas); ediciones "Change ONLY this: … Everything else … stays exactly as it is";
      `Quality: high|medium`; ordinales hasta "sixth".
- [x] **Veo 3.1** — duraciones [8, 6, 4] (8 default), `duracionVeo` fuerza 8 con referencias (chip + nota en el paso 3);
      `cortes` para 4 y 6 s; `duration_seconds` en el JSON; diálogo no inglés lleva `dialogue.note` de no traducir.
- [x] **Kling 3** — 60 palabras; `camara.ts` `movimientos()` → validador "Dos movimientos de cámara: elige uno" (Kling y
      Higgsfield, donde el cuerpo no puede contradecir el preset).
- [x] **"Úsalo en…"** — `lib/prisma/modelo.ts` `recomendarModelo` (NB2 vs Pro · flare vs sunburst · Veo vs Fast · Kling vs
      Turbo · Higgsfield) con etiqueta, porqué y cómo llegar; anticipo en el paso 3 y chip en el resultado (puro, cliente);
      el servidor lo guarda en `prisma_prompts.modelo_sug` y lo manda al writer como `TARGET MODEL`. `PromptSpec.destino`
      (filas viejas: fallback a `prisma_specs.destino` en `specDeFila`). `compilers/fusion.ts` listo para el arreglo de F2.
- [x] Tests: test-prisma 326 (+91) · test-db 439 · tsc · lint · build · isolation · actions. **Smoke real**
      `scripts/smoke-prisma.mjs` (3 specs, ≈ US$0.05): caché leído en la 2ª y 3ª llamada, 3 prompts válidos, negativos como
      sustantivos. Navegador: paso 3 muestra "Úsalo en · ChatGPT Images · sunburst" con texto y "Nano Banana Pro" al cambiar
      de herramienta; el resultado demo muestra "Kling 3.0 Turbo" + cómo llegar.
- [x] Reap (Opus seguridad + Sonnet salud) → arreglado: todo texto del cliente sale de `s0/sn` ya en UNA línea (`plano`) y
      DIALOGUE / LOOK / captions van cercados; idioma del diálogo en lista; roles de referencia validados contra el job; freno
      en `cambiarHerramienta`; `texto_en_imagen` del modelo con `plano` + tope; `esDestino` al leer + en `esSpec`; preset del
      Admin con `plano`; `modelo_sug` se calcula sobre el spec RESULTANTE (= lo que ve el diseñador); validador de Veo exige
      `duration_seconds` (8 con refs), `negative_prompt` y sustantivos; regex sin palabras sueltas (`dark`, `zoom`, `follows`,
      `hands`, `cuts`) + tests de falso positivo; Pro desde 3 refs; Higgsfield con tope duro; Kling sin coma colgante.
- [x] Gates finales: tsc · lint · build · test-prisma 336 · test-db 439 · isolation · actions. Commit + push a `prisma`.
- Pendientes menores (no bloquean): `modelo_sug` sin fallback si faltara la 0067 (hoy está aplicada; el ledger ordena);
  referencias subidas no ligadas a quien las subió (UUIDv4, riesgo bajo; namespacing por usuario cuando toque); nota de
  8 s sin `aria-describedby`; `duracion` manual se conserva al quitar la referencia (comportamiento defendible); el smoke
  no se tipa contra `EntradaWriter`.
### Verificación F1 (Pedro, preview con login)
- Generar una imagen con texto → el resultado dice "Úsalo en · ChatGPT Images · sunburst" (o "Nano Banana Pro" si eliges Nano)
  y el prompt de ChatGPT trae el texto deletreado y "Quality: high".
- Subir una referencia en "Darle movimiento a una foto" con Veo → el chip de duración sólo ofrece 8 s con la nota.
- Un prompt de Nano Banana ya no dice "Avoid: …" salvo lo que la marca pide evitar; dice "Keep the frame: …".


## 🟢 2026-09-11 (3) — HÜE Prisma v1 "el prompter perfecto" · FASE 0: Sora fuera, conocimiento dentro (rama `prisma`, commit 4bd71fa · 0067 APLICADA)
Plan aprobado: /Users/work/.claude/plans/ok-no-i-need-lexical-ocean.md (v1 = perfeccionar prompts; v2 generación in-app APARCADA).
Pedro: v1 sólo prompts · Sora se retira (OpenAI apaga la Videos API el 24-sep-2026) · entrevista ≤3 preguntas · Nano Banana 2
para iterar / Pro para la final · "sube lo que salió" en v1 · "perfecto" = ronda real con diseñadores.
- [x] **0067 `prisma_reglas`** (reglas + notas por herramienta, con fuente y fecha; seed ~40 filas) + `prisma_specs.respuestas` +
      `prisma_prompts.avisos` + `prisma_prompts.modelo_sug` + CHECK de `prisma_eventos.tipo` ampliado (una sola vez) + índice
      único parcial (copiado/abierto) + índice (client_id, tipo, created_at). RLS master + service_role.
- [x] **Sora fuera** sin migración de datos: `TOOLS` sin sora, `TOOLS_HISTORICAS` + `TOOL_SUCESORA` (filas viejas se leen
      como Veo), `VIDEO_TYPES` (los 11 tipos como vocabulario), `compilers/video-tipos.ts` (`estiloDeTipo`) usado por Veo y
      Kling, `sora.ts` borrado, validators/routing/copy/prompts/tests actualizados, chip "Tipo de video" para todo video.
- [x] **TOOL NOTES**: `cargarReglas` (data.ts, tolerante sin tabla) → `bloqueEstableCon(notas)` al final del bloque cacheado
      (topes 60 / 4,000 chars) → caché por `clave` en writer.ts → `prompt_version = PROMPT_VERSION+clave`.
- [x] **Hub › Prisma**: `prisma-reglas.tsx` (tabla, alta/edición, toggle, fuente obligatoria en notas, badge >90 días) +
      `hubPrismaReglas` / `guardarReglaPrisma` (regex validada, rechaza) / `activarReglaPrisma` en hue-actions.
- [x] Tests: test-db bloque 0067 · test-prisma (spec viejo con sora → veo; `estiloDeTipo` en Veo y Kling; `bloqueEstableCon`
      topes y posición). Gates: tsc · lint · test:prisma · test:db · isolation · actions · build. Reap + navegador.
### Verificación F0
- Reabrir desde el historial un spec guardado con `tool:'sora'` → se abre como Veo 3.1 con el aviso "Antes era Sora 2".
- Generar un video con tipo "Unboxing de producto" → el `style` de Veo y la capa de estilo de Kling lo llevan.
- Segunda generación seguida → `cache_read_input_tokens > 0` (TOOL NOTES no rompió el caché) — smoke con register-hooks.
- Pedro (sesión master): Hub › H.Ü.E › Prisma → editar una nota → la siguiente generación la refleja sin deploy.
- [x] Reap (Opus seguridad + Sonnet salud): 21 hallazgos → arreglados: upsert de eventos roto por el índice parcial (insert + 23505 +
      prueba en test-db), `clave` = huella del contenido (no max(updated_at)), override de TOOL NOTES acotado + `cercado` + rechazo de
      notas-instrucción, notas de herramienta retirada se descartan, CHECKs de clase en la BD, `fuente_tipo` oficial/comunidad,
      crear ≠ editar en el Hub (un código repetido no pisa), `abrirSpec` idempotente, `herramientaVigente` compartida, `versionCon`,
      errores planos + UUID en el Hub, confirmación inline al borrar, tope 6,000 chars con aviso "N notas no entran".
- [x] Verificado: tsc · lint · build · test:prisma 235 · test:db 439 · isolation · actions · navegador (sin Sora, chip "Tipo de video"
      en Veo y Kling, routing escena → Kling vertical / Veo YouTube) · smoke real: 2ª llamada `cache_read` 4,455 tokens.
- [x] **SHIP** — Pedro: "ship it" → `npm run migrate` 0067 aplicada y verificada en prod (26 filas: 7 notas + 19 reglas, 5 de
      comunidad; RLS + policy; 3 columnas nuevas; CHECK de eventos ampliado; índice único parcial; en el ledger).
- [ ] **LIVE-VERIFY de Pedro (preview, sesión master)**: Hub › H.Ü.E › Prisma → se ven las 26 filas → editar una nota → generar un
      prompt → la nota nueva ya viaja (sin deploy). Reabrir desde el historial un spec viejo de Sora → se abre como Veo 3.1 con
      el aviso "Antes era Sora 2".
- Pendientes que salieron del reap (van en su fase): F2 → re-validar `patron` al LEER (regexSegura + tope de 2,000 chars de entrada
  o worker con timeout) y tope por persona/prompt para los eventos no únicos; F5 → panel "vista previa de TOOL NOTES" en el Hub antes
  de guardar; alguna vez → `client_id/marca_id` en prisma_reglas si una nota debe ser por marca.

## 🟡 2026-09-11 — HÜE Prisma: presets de marca en Admin · personajes guardados · explicación por idioma (rama `prisma`, SIN push · migración 0065 PENDIENTE de "ship it")
Pedro: "1 yes · 3 yes · 4 yes · 2 (variantes) needs more thought · don't merge main yet". Tres builds acotados, cero cambios en main.
- [x] **A. Presets de marca (Admin › Marcas)** — `src/lib/prisma/preset.ts` = UNA sola normalización (la usan el lector `presetDe` en
      lib/prisma/data.ts y la acción de guardado: el que escribe y el que lee comparten la forma). Acción `guardarPrismaPreset`
      (canAdmin) en admin/actions.ts; editor inline por marca en marcas-tab.tsx (paleta hex, tono, evitar, formato por default).
      Sin migración: `marcas.prisma_presets` ya existe (0063).
- [x] **B. Personajes / productos guardados** — paso 3 del estudio: "Guardar uno nuevo" → nombre + foto (RefUploader) + notas en
      cualquier idioma → H.Ü.E propone la descripción EN INGLÉS (preview editable, 1 llamada barata, sin herramienta) → Guardar
      (`crearPersonaje`: valida cliente y forma exacta de la ruta de la foto, `created_by`). `retirarPersonaje` = active=false
      (el autor, o lead/admin/master — misma regla que `puedeTocar`). Al elegir un personaje con foto y slot `sujeto`/`producto`
      vacío, su foto entra como referencia. Sin migración (la descripción ya lleva lo que H.Ü.E vio en la foto).
- [x] **C. Explicación cacheada por idioma** — migración 0065: `prisma_prompts.explicacion` → `explicacion_es` + `explicacion_en`
      (backfill del prefijo "[es]\n" / "[en]\n"). `explicar()` lee/escribe la columna del idioma. Tolerante si la columna aún no
      existe en el preview (no cachea y avisa en el log del servidor; mismo patrón que `cargarMarcas` con prisma_presets).
- [x] Tests: test-prisma 161 (+41: normalizarPreset/validarPreset/presetDeMarca, foto↔slot, plano), test-db 407 (+7: 0065
      columnas + backfill). Gates: tsc 0 · lint 0 · isolation ✓ · actions ✓ · build ✓. Smoke REAL del modelo (loader nuevo
      `scripts/register-hooks.mjs`): describirPersonajeIA → 80 palabras en inglés, con el hex de la paleta, 3.9 s, ~$0.002.
- [x] Reap. Pass 0 (grep): UNA normalización del preset (lector y Admin), UNA regla de ruta de foto (RUTA_REF), UN gate de
      "¿puedo tocar?" (puedeTocar para specs y personajes), cero referencias a la columna vieja. Seguridad (Opus): 0 críticos,
      4 serios ARREGLADOS — (S1) ítems de la paleta del ADN sin tope → tope 40; (S2) la página mandaba a TODOS los internos los
      personajes + fotos firmadas de TODOS los clientes → ahora se piden al elegir la marca (`listarPersonajes`, gateada);
      (S3) inyección persistente vía descripción/notas/caption → `plano()` (una línea, sin controles) + cercas
      `<saved_subject>`/`<notes>`/`<photo_caption>` con la regla pegada; (S4) `crearPersonaje` confiaba en el client_id del
      navegador → ahora recibe marcaId y deriva el cliente en el servidor (patrón entradaDe). Menores arreglados: UUID en ids,
      errores crudos del proveedor/BD ya no llegan al diseñador (llamarSpec, explicarPrompt, guardarPrismaPreset), paleta
      SÓLO hex en servidor (= editor), `validarPreset` estricto en el write-path (rechaza, no recorta), flag prismaActivo en la
      acción y el botón de Admin, backfill de 0065 sin pérdida (sin prefijo → español). Salud (Sonnet): 1 serio ARREGLADO —
      guardar/retirar que termina DESPUÉS de cambiar de marca ya no toca la UI (generación `marcaGen` + cliente del
      personaje); aviso "cambiaste las notas después de la propuesta"; sangría del fragmento en marcas-tab.
      Navegador (local, sin sesión): estudio → paso 3 → bloque de personajes (vacío + "Guardar uno nuevo") → formulario →
      "Que HÜE lo describa" → toast "Inicia sesión para usar HÜE Prisma." (gate correcto, sin 500); `?demo=resultado` sigue;
      móvil sin desbordes; 0 errores de consola/servidor.
      Deuda anotada (no bloquea): sin throttle por identidad en las llamadas facturables (ya estaba pendiente); la ruta de
      la foto se valida por forma, no por dueño (acotado por UUID de 122 bits); 3 nombres para el preset
      (prisma_presets / prisma_preset / preset).
### Verificación
- Admin › Marcas: editar el preset de una marca → guardar → recargar y sigue → en Prisma, generar con esa marca mete la
  paleta/tono/evitar al bloque BRAND PRESET del writer.
- Prisma paso 3: crear personaje con foto → H.Ü.E propone la descripción en inglés → guardar → aparece en los chips ya
  seleccionado y su foto queda como referencia → generar → `sujeto` del spec = la descripción tal cual.
- Explicar en ES, luego EN, luego ES otra vez: 2 llamadas al modelo, no 3 (la 3ª sale de la columna).
- [ ] **SHIP** (necesita "ship it"): (1) ANTES de migrar, contar filas con explicación sin prefijo (el backfill las manda a
      español): `select count(*) from produccion.prisma_prompts where explicacion is not null` (hoy: 1 de 5); (2)
      `node scripts/migrate.mjs` (0065 al esquema produccion de Greenlight, ref ybbrpqzbedaxsmotgtkh); (3) `git add -A && git
      commit` + `git push origin prisma` (preview de Vercel). NO main. Si el código llega al preview ANTES que la 0065,
      "Explícame" sigue sirviendo (no cachea y avisa en el log).
- [ ] **LIVE-VERIFY de Pedro (preview, con login)** — no se puede en local (sin sesión las actions niegan):
      (a) Admin › Marcas › botón Prisma en DiDi Card → paleta (#ff6b1a), tono, evitar, formato → Guardar → recargar y sigue →
      en Prisma, generar con esa marca → el prompt refleja paleta/tono/evitar. Sin preset, la fila dice "usa el color de marca".
      (b) Prisma › paso 3 › marca DiDi Card → "Guardar uno nuevo" → nombre + foto de la tarjeta + notas en español → "Que HÜE
      lo describa" → propuesta en inglés → corregir → Guardar → aparece en los chips YA seleccionado y, en un trabajo con
      slot de persona/producto vacío, su foto entra como referencia (texto morado). Cambiar de marca lo suelta. Retirar
      (basura → confirmar) lo quita para todos. Un especialista NO ve el botón de retirar en uno ajeno; el lead sí.
      (c) Resultado › "Explícame este prompt" en ES → EN → ES: la 3ª sale al instante (sin llamada). En la BD:
      `explicacion_es` y `explicacion_en` llenas en esa fila.
- [x] **Decisión de Pedro — variantes**: "yes variants on demand plus just make sure hue does learn and improve automatic" (2026-09-11).

## 🟡 2026-09-11 (2) — HÜE Prisma: otra versión BAJO DEMANDA + H.Ü.E aprende solo (rama `prisma`, migración 0066 PENDIENTE de "ship it")
Pedro: variantes bajo demanda; que H.Ü.E aprenda y mejore automáticamente. Diseño: cero curaduría — la señal es lo que el
diseñador HACE (copiar, abrir en la herramienta, pedir otra versión, pedir un cambio, pulgar) y el writer la lee al generar.
- [x] **Migración 0066 `prisma_eventos`** (spec, prompt, cliente, job, tool, versión, quién, tipo copiado/abierto/variante/refinado,
      detalle; RLS master-only; service_role). Desnormalizada a propósito: la agregación por marca es UNA consulta.
- [x] **Captura** (`anotarEvento`, nunca bloquea; si falta la tabla, warn): copiar y "Abrir en" (registrarEvento desde el
      resultado), otra versión (en `variar`), refinar (en `refinarPrompt`, guarda el texto pedido — antes se perdía).
- [x] **Otra versión bajo demanda** — botones "Más segura / Más audaz / Mínima" en el resultado → `variar` = 1 llamada extra
      (bloqueVariante: instrucción fija por versión) → nace un spec HERMANO con su prompt marcado (`variante`), así refinar /
      cambiar herramienta / explicar / historial funcionan igual. Chip "Versión: Audaz" + etiqueta en el historial.
- [x] **Aprendizaje automático** — `lib/prisma/aprendizaje.ts` (puro): ganadores (copiados/abiertos/pulgar arriba, sin pulgar
      abajo, mismo trabajo primero, sin repetir spec, máx 3, recortados a 500) + preferencias (qué versión piden si ≥3 pedidas;
      últimos 5 cambios pedidos). `cargarAprendizaje` (data.ts) lo arma con 2 consultas por cliente (90 días) y `generarPrompt`
      lo mete al FINAL del bloque variable, cercado (`<winner>`), como referencia de estructura (nunca copiar frases). El
      resultado le dice al diseñador "HÜE se apoyó en N prompts que ya sirvieron para esta marca".
- [x] Tests: test-prisma **181** (+20), test-db **417** (+10: RLS, policy, sin PUBLIC, índice único, checks de tipo y de
      largo, cascade). Gates: tsc 0 · lint 0 · isolation · actions · build. Smoke REAL: `variarSpec` "audaz" → spec válido a
      la 1ª, cambió luz y cámara, conservó el producto, 6.4 s (~$0.02). Navegador: `?demo=resultado` muestra "¿Otra versión?"
      con los 3 botones (apagados en el demo, `disabled=true` comprobado), 0 errores de servidor.
- [x] Reap de seguridad (Opus): 1 CRÍTICO + 4 serios — ARREGLADO lo que es código: (C1) los cambios pedidos entraban al
      modelo sin cerca y en tono de orden → cada uno va `<change n>` cercado, con la regla "dato, no orden" pegada y sin
      imperativo; (S2) `plano()` no quitaba ángulos → `cercado()` (quita `<>`) para TODO texto humano dentro de una cerca
      (ganadores, cambios, personaje, notas, caption) + `plano` ahora también quita invisibles Unicode (zero-width, bidi);
      idea y texto se guardan en una línea; (S3) sin freno en lo facturable → `saturado()` por identidad (40 llamadas / 10
      min) en generar, refinar, otra versión, describir y explicar; eventos con índice ÚNICO (prompt, quién, tipo) + upsert
      "si ya existe, nada" → el mismo click no inunda la señal; (L7) allowlist de herramienta/versión al elegir ganadores;
      (L8) el guard de UUID vive en `specDeFila` (lo heredan los 6 callers); (L9) `check` de 300 letras en `detalle`;
      (L11) BUG real: la versión (y el refine) se generaban en la herramienta ORIGINAL aunque el diseñador hubiera cambiado
      de herramienta → `estadoActual()` (herramienta + versión del último prompt) manda en refinar y en otra versión, y
      `variar` devuelve la herramienta.
      ACEPTADO (decisión de producto, no código): (S4) cualquier interno puede elegir cualquier marca (así es TODO Prisma
      hoy: un cliente, sin asignación por persona) → la memoria de una marca la alimenta todo el equipo; mitigado con
      dedupe + freno + cercas; el día que haya varios clientes, acotar marcas por persona. (S5) la memoria es POR MARCA, no
      por autor (Pedro: "que H.Ü.E aprenda"): al modelo viajan recortes cercados como referencia de estructura; al
      diseñador sólo el conteo. Documentado en `cargarAprendizaje`.
      Deuda: sin retención en `prisma_eventos` (la ventana de 90 días es de lectura); `dialogo` no se aplana al guardar
      (multilínea legítimo; la cerca de lectura ya lo cubre).
- [x] Reap de salud (Sonnet): 5 serios, ARREGLADOS — (1) cambiar de herramienta volvía la versión a "base" → hereda la
      versión (`estadoActual`) y la devuelve al chip; (2) cambiar/refinar/otra versión/explicar podían cruzarse y pisar el
      resultado con un `vivo` viejo → un solo `ocupado` apaga todo mientras algo va al servidor; (3) la versión nueva no
      salía en el historial → `router.refresh()` cuando cambia el spec; (4) = C1 de seguridad (ya cercado); (5) aplanar
      los ganadores destruía la estructura que enseñan (tomas de Sora, JSON de Veo) → `cercadoMultilinea` conserva los
      saltos y quita ángulos/controles línea por línea. Mejoras: las 2 consultas del aprendizaje en paralelo; columna
      `prisma_specs.origen_spec_id` (0066) para saber de qué spec viene cada versión (tolerante si aún no existe); el demo
      apaga TODO lo que llama al servidor; `aria-busy` en todos los botones de acción; el chip de versión lleva su ícono.
      Gates finales: tsc 0 · lint 0 · test-prisma 183 · test-db 418 · lib 481 · import 81 · sync 44 · isolation · actions · build.
- [x] **SHIP de la 0066** — Pedro: "ship it" (2026-09-11). `npm run migrate` aplicó la 0066 al esquema `produccion` de
      Greenlight (ref ybbrpqzbedaxsmotgtkh): tabla con RLS + policy master + índice único + `prisma_specs.origen_spec_id`.
      Código ya en el preview (bff75ed): eventos y aprendizaje quedan ENCENDIDOS desde ahora.
- [ ] **LIVE-VERIFY de Pedro (preview)**: (d) resultado → "Más audaz" → nueva versión con chip "Versión: Audaz", herramienta
      igual a la que veías, historial con la etiqueta; refinar sobre ella sigue siendo audaz. (e) tras la 0066: copiar 2
      prompts de DiDi Card → generar otro de la misma marca → línea "HÜE se apoyó en N prompts…"; pedir 3 versiones → la
      siguiente generación trae la preferencia; en la BD `prisma_eventos` con copiado/abierto/variante/refinado.

## ✅ 2026-09-03 — LIVE REFRESH: la plataforma se refresca sola al cambiar estado/asignación (SHIPPEADO: main 62bb720 pusheado · migración 0062 APLICADA)
Pedro: "que nadie tenga que recargar para ver un cambio de estado o una tarea nueva asignada". Diseño: Realtime
**Broadcast desde la BD** (trigger por SENTENCIA en `ideas` + `idea_assignments` → `realtime.send` a un canal privado
POR PERSONA `greenlight:user:<profile_id>`), NO Postgres Changes (exigiría SELECT de `authenticated` sobre ideas y
reabriría el candado 0056). La policy de `realtime.messages` sólo compara `realtime.topic()` con `auth.uid()` — no toca
produccion. Navegador: `LiveRefresh` (layout) escucha su canal → debounce 400ms → `router.refresh()`; fallback al volver
a la pestaña (>15s) y al reconectar el socket. `Board` y la campana adoptan las props nuevas (antes `useState(initial)`
se quedaba viejo). Excepción ACOTADA en check-isolation para `realtime.send/topic` + policy `greenlight_*`.
Verificado: test-db 397/397 (fan-out real con `realtime.send` simulado: equipo activo + cuenta del cliente dueño; ajeno
y dados de baja NO; sin cambio real → 0 avisos; 2 asignaciones en 1 sentencia → 1 aviso), isolation, lint, tsc, build.
- [x] **SHIP** — `node scripts/migrate.mjs` (0062 ok) + `git push origin main` (6db13b3..62bb720). Pedro: "ship it" 2026-09-03.
- [x] **Post-ship**: Realtime del proyecto arrancado por primera vez (0 particiones → 5); smoke `realtime.send` inserta. Vercel Ready.
- [ ] **LIVE-VERIFY de Pedro** (el socket NO se puede probar en local: login apagado → sin sesión → sin suscripción):
      dos navegadores/personas; A mueve una tarea a "En revisión" o asigna a B → en B el tablero / mi-trabajo / la
      campana cambian solos en ~1s sin recargar; un texto a medio escribir en una tarea NO se pierde. Si no refresca:
      Supabase → Realtime → Settings → confirmar que el proyecto tiene Realtime encendido (default sí).

## 🟢 2026-09-03 — "Enviar a cliente" no desaparece al confirmar un cambio (código en main, SIN push · sin migración)
Pedro: confirmar un cambio del cliente borraba la barra "Enviar a cliente". Causa: la cancha del lead se medía por
cambios SIN RESOLVER; confirmar el último la vaciaba. Fix: se mide por cambios ENVIADOS esta ronda (resueltos o no),
en page.tsx (barra) y lib/cambios-pendientes (ocultar al especialista) — misma regla en ambas. Termina al enviar/reasignar.
- [ ] **SHIP** (necesita "ship it"; sólo `git push origin main`, sin migración).
- [ ] **LIVE-VERIFY de Pedro**: cliente pide cambios → como lead, confirmar TODOS los cambios en el panel → la barra
      "Enviar a cliente / Reasignar" SIGUE ahí → enviar cierra la ronda; y el especialista no ve la tarea hasta que se
      envíe/reasigne (no reaparece al confirmar el último).

## 🟢 2026-09-03 — Control de Cambios: el lead confirma desde el panel (código en main, SIN push · sin migración)
Pedro: confirmar sólo salía en el hover. Causa: `borrador`(=under_review) escondía el botón Confirmar Y compactaba
el cambio atendido. Fix: Confirmar visible para no-cerrados (salvo borrador OPEN); lo atendido sale expandido; header
y botón H.Ü.E usan `soloBorrador`. Render-check 6/6.
- [ ] **SHIP** (necesita "ship it"; sólo `git push origin main`, sin migración).
- [ ] **LIVE-VERIFY de Pedro**: en una tarea devuelta a revisión con un cambio "Atendido · por confirmar", el panel
      Control de Cambios muestra la tarjeta expandida con el botón "Confirmar" (sin pasar el ratón); confirmar la cierra;
      un borrador nuevo (sin enviar) sigue diciendo "sólo los ves tú" y sin Confirmar.

## 🟢 2026-09-03 — Portal Fase 2: drill-down por MARCA (código en main, SIN push · sin migración)
Marca→briefs→tarea. Marca=filtro (un brief abarca ambas; aparece bajo las dos con sus tareas de esa marca).
Auto-salto de niveles de 1 item. Back-nav. cargarPortal expone `marcas` + `marcaId` por tarea. Render-check 11/11.
- [ ] **SHIP** (necesita "ship it"; sólo `git push origin main`, sin migración).
- [ ] **LIVE-VERIFY de Pedro** (portal = cliente, no visible en local): entrar → grid de marcas (Card/Préstamos con
      #briefs); click marca → briefs de esa marca con conteos por estado + desplegable de tareas; click brief → la vista
      con las 3 pestañas filtrada a la marca; back-nav funciona; con 1 sola marca se salta directo a sus briefs; en móvil OK.

## 🟢 2026-09-03 — Portal: tarea sacada de Greenlit sale del portal (código en main, SIN push · sin migración)
Pedro: aprobada→Greenlit→admin la mueve a producción interna → reaparecía como "activa". Causa: el portal filtraba por
`published_at`, no por el estado ACTUAL. Fix: ESTADOS_PORTAL (published/in_corrections/delivered) en cargarPortal Y
cargarTareaPortal (link directo). Vuelve a producción interna → fuera del portal; re-publicada → reaparece.
- [ ] **SHIP** (necesita "ship it"; sólo `git push origin main`, sin migración).
- [ ] **LIVE-VERIFY de Pedro**: aprobar una tarea (Greenlit) → como admin/master moverla fuera de Greenlit a
      "En progreso" → en el portal del cliente DESAPARECE (no queda como activa); re-publicarla → reaparece por revisar.

## 🟢 2026-09-03 — H.Ü.E revisa ortografía en CADA envío a revisión + 3ª puerta gateada (código en main, SIN push · sin migración)
Pedro: al devolver a revisión tras corregir, H.Ü.E no revisaba. Causa: colgaba sólo del verbo submit_review; `devolver`
(in_corrections→under_review) se lo saltaba. Fix: ortografia + gate de cortinilla en submit_review Y devolver.
`faltaCortinilla` centralizado en lib/cortinilla → gatea las 3 puertas (submit, drag/moveTask, devolver).
- [ ] **SHIP** (necesita "ship it"; sólo `git push origin main`, sin migración).
- [ ] **LIVE-VERIFY de Pedro**: tarea devuelta por el lead → especialista corrige → "Devolver a revisión" → H.Ü.E
      abre el diálogo de ortografía si hay faltas (igual que en el 1er envío); sin cortinilla, "Devolver a revisión"
      también se bloquea.

## 🟢 2026-09-03 — Portal Fase 1: 3 pestañas + listas de tarjetas (código en main, SIN push · sin migración)
Acordado con Pedro: por fases, marca-como-filtro. Activas = flujo de revisión; En revisión / Aprobadas = tableros
de tarjetas (?vista=) que abren la tarea (?tarea=). Fuente única de cubetas en lib/portal-bucket. Render-check 13/13.
- [ ] **SHIP** (necesita "ship it"; sólo `git push origin main`, sin migración).
- [ ] **LIVE-VERIFY de Pedro** (portal = cliente, no visible en local): las 3 pestañas; En revisión / Aprobadas
      muestran tarjetas; clic en una card abre la tarea completa; volver con la pestaña; Activas sigue siendo el
      flujo de revisión con flechas; en móvil el nav no se rompe.
- [ ] **FASE 2** (acordada, pendiente): nivel de MARCA como entrada — cards por marca (Card/Préstamos) con conteo
      de briefs → briefs del brand (filtrados a las tareas de esa marca) → la tarea. Marca = FILTRO sobre tareas
      (los briefs abarcan ambas marcas, no son dueños de una). Auto-saltar niveles de un solo item.

## 🟢 2026-09-03 — Cortinilla de cierre (legales) obligatoria para mandar a revisión (código en main, SIN push · sin migración)
Pedro: no se puede mandar a revisión sin legales. `requiereCortinilla(plantilla)` (guion/estatico sí, copies no).
Gate en servidor + las DOS puertas a under_review (botón submitForReview + drag/moveTask) + bloqueo en la UI.
- [ ] **SHIP** (necesita "ship it"; sólo `git push origin main`, sin migración).
- [ ] **LIVE-VERIFY de Pedro**: en un video/estático SIN legal, "Mandar a revisión" → bloqueado con "Agrega la
      cortinilla de cierre (legales)…" (botón y arrastre al carril "En revisión"); con legal (snippet o texto libre)
      → pasa normal; una tarea de COPIES se manda sin legal (no lleva cortinilla).

## 🟢 2026-09-03 — Portal: pestañas Activas / Aprobadas (código en main, SIN push · sin migración)
Pedro: una tarea aprobada se quedaba en la lista abierta. El filtro "Aprobadas" YA existía pero escondido en un popover
con default "Todas". Fix: dos pestañas visibles (Activas / Aprobadas) en el nav del portal, default Activas → la aprobada
sale del flujo. Toast de aprobar lo dice. Un link a una tarea ya aprobada abre en Aprobadas.
- [ ] **SHIP** (necesita "ship it"; sólo `git push origin main`, sin migración).
- [ ] **LIVE-VERIFY de Pedro** (portal = rol cliente, no visible en local con login apagado): como cliente, aprobar una
      tarea → desaparece de "Activas" y aparece en "Aprobadas" (con toast); el contador de cada pestaña cuadra; un enlace
      directo a una tarea aprobada abre en la pestaña Aprobadas; en móvil el nav sigue sin romperse (scroll horizontal ok).

## 🟢 2026-09-02 (noche 4) — Portal: el cliente ve sus cambios "En proceso" (código en main, SIN push · sin migración)
Commit del feat(portal). Tercer bucket `enProceso` (ronda!=null, resolved_at null) en portal-data → contexto cliente →
PanelControlCambios (grupo "En proceso", gris neutro). El panel ahora sale durante in_corrections.
- [ ] **SHIP** (necesita "ship it"; sólo `git push origin main`, sin migración).
- [ ] **LIVE-VERIFY de Pedro** (portal = rol cliente, no visible en local con login apagado): como cliente, "Pedir cambios"
      → el Control de Cambios muestra "En proceso" con lo que pediste (read-only, sin Quitar); al cerrar el equipo la ronda,
      pasan a "Aplicado"; el conteo del panel los incluye.

## ✅ 2026-09-02 (noche 3) — 3 features del reap de funcionalidad — SHIPPEADO + LIVE (main f8e9767, Vercel Ready)
Commit 689dc93. Pedro pidió construir 1, 2 y 3b; 3 (auto-link a clientes) se deja como está; 3a ya existía.
- [x] **1. Crear cliente en la app**: `crearCliente` (Admin › Clientes, sección "Empresas cliente", alta inline);
      tarjeta "Nuevo cliente" de /clientes → `/admin?tab=clientes` (sólo admin); admin-shell honra `?tab=`.
- [x] **2. Buscador global**: `buscar()` acotado por identidad + `SearchBox` (debounce, dropdown, teclado);
      oculto para el cliente. `slugify` extraído a `lib/slug`.
- [x] **3b. Invitación manual al equipo**: `enviarInvitacion` + botón de sobre por persona en Equipo (sin envío
      automático al dar de alta, decisión de Pedro).
- [x] **3a. Aviso al admin en solicitud de acceso**: ya lo hacía `solicitarAcceso` (in-app + email a admin/master
      activos). Verificado por lectura de código; sin cambios.
- [x] **SHIP** (2026-09-02 noche, "ship it"): push a main → deploy Production `dpl_G6E7Ks…` Ready, alias runna-greenlight.
      Verificado por el commit status de Vercel en GitHub (f8e9767 → success → esa deployment). CI (test) verde. Sin migración.
- [ ] **LIVE-VERIFY de Pedro (sesión autenticada, no visible en local con login apagado)**: Admin › Clientes crea
      una empresa (aparece en la lista y en /clientes, su slug es la URL); el botón de sobre en Equipo manda el
      correo (deshabilitado sin email); el buscador como lead sólo trae sus tracks, como especialista sólo lo suyo;
      un cliente NO ve el buscador en su portal.

## ✅ 2026-09-02 (noche) — REAP PRE-LANZAMIENTO (deep, repo entero) — SHIPPEADO + LIVE (main 977d7cf · 0061 aplicada)
6 agentes (invariantes · seguridad · salud/perf · a11y/UX · funcionalidad · tech-scout) + verificación propia.
2 críticos + 11 serios + ~25 mejoras arreglados. Gates: tsc 0 · lint 0 · lib 473 · db 377 · import 81 · sync 44 · build OK.
Llave pública re-probada en prod: 401 en todas las tablas y en `brief_estado`.
- [x] C1 un solo pool de asignación (`puedeSerAsignado` en lib/roles) en builder, sync, crearBrief e import-lote.
- [x] C2 "Recibe emails" resuelto desde el roster también para avisos por rol (profiles.notify_email era huérfana).
- [x] Baja de equipo propaga `active` al profile · proxy cierra sesión sin perfil/inactiva · portal cierra cliente revocado.
- [x] provision sin comodines · extraerGuion con identidad + tope · knownRows/getSyncMode con gate · roster sólo a quien asigna.
- [x] notif-email verifica sus updates + reclama `sending` atascados · email del cliente apunta al portal (ready_for_review).
- [x] Bundle excluye al especialista las tareas con cambios del cliente (`lib/cambios-pendientes`, compartido con tablero y Mi Trabajo).
- [x] Sync: filas "actualizadas" ya no se ofrecen (no había camino de update y decía éxito) · aterrizaje por rol en `/`.
- [x] Cabeceras de seguridad · noindex/robots · topes de texto · cerca `<peticion>` en validarCambios · scope en aplicarOrtografia ·
      tarea 404 si no es del cliente de la URL · toast si H.Ü.E no revisó · Slack apagado · verde sólo Aprobado (`--status-completed` → teal) ·
      loading ×6 · error.tsx raíz · phosphor→lucide · shadcn a devDeps · listarEquipo acotado · PreviewSlide muerto fuera · a11y (teclado, labels, confirm, 44px).
- [x] **SHIP** (2026-09-02 noche, "ship it" de Pedro): push → 0061 aplicada y verificada → merge `reap/asignar-rpc` → hotfix
      `/robots.txt` público (977d7cf). Prod: 200, cabeceras, robots Disallow, llave pública 401.
- [ ] **LIVE-VERIFY de Pedro (sesión autenticada)**: como lead, asignarse a sí mismo → SIN aviso "se te asignó"; dar de baja a
      alguien en Equipo → ya no entra; apagar "Recibe emails" como lead → no llegan correos de revisión; el builder de briefs ofrece
      a un especialista multi-track en ambos tracks y a un admin como lead.
- [ ] **Decisiones de Pedro** (no se tocó): crear clientes en la app (el botón dice "desde Admin" y Admin no lo tiene) · sheet por cliente
      (fallback hardcodeado a DiDi si falta SHEETS_SCRIPT_URL; prod lo tiene) · buscador global (stub en todas las páginas, portal incluido) ·
      "reenviar mi link" para clientes / invitación por correo al equipo · Papelera sólo master (admin borra pero no deshace) · [HECHO 2026-09-02] el cliente ya ve su lista de cambios "En proceso" tras "Pedir cambios" · rate limit por identidad en acciones de H.Ü.E + tope de gasto en la consola de Anthropic ·
      camino de UPDATE para filas del sheet que cambiaron.
- [ ] Deuda menor anotada: hex duplicados (#2d2b55/#d9d2f0, #00e676 fuera de var) · empty states ad-hoc en board/briefs · setup-storage no
      reconcilia buckets existentes · AUTH_ENABLED assert atado a VERCEL_ENV · CSP de scripts (nonces) · copy del tablero vacío para especialista.

## ✅ 2026-08-31 → 09-01 — Reap pre-launch · CANDADO RLS · Papelera · flujo (SHIPPEADO + LIVE)
18 commits · migraciones 0056–0059 aplicadas · gates: actions 21 · isolation 58 · lib 458 · db 346 · lint 0 err · build OK.
- [x] Reap de invariantes (repo entero, 5 agentes): colapsado el fork de renderers de DIÁLOGO; los
      cambios del cliente refrescan las superficies internas; gates de correcciones derivados del
      allowlist; `setLeads` muerto eliminado; a11y (Cerrar/toasts/tooltip/emojis→Lucide).
- [x] **0056 candado RLS** + `AUTH_ENABLED` que ruge + `profiles.active` aplicado de verdad + test de CI.
- [x] **0057 Papelera 30d** (sellar la raíz, purga perezosa, UI master-only) + sync que la respeta.
- [x] Hotfix 500 `"use server"` + **guard `check-server-actions.mjs`** en `npm test`.
- [x] Admin/master pueden ser LEAD · **0058** brief Greenlit (7 días, derivado) · correo de tarea propia.
- [x] **0059** `lead_tracks`→`tracks`: multi-track para especialistas + Workload por persona con pastillas.
- [x] Avisos → a la TAREA, clic = leído, tarea congelada en revisión, vuelta al tablero al mandar.

### Review — lo que queda (NADA bloquea el lanzamiento salvo el punto 1)
- [ ] **1. Paso de pruebas de Pedro** (la única puerta): Fases 2/3/4 · borrador de correcciones ·
      congelado en revisión (**necesita cuenta `creative`**) · correo de tarea propia (**necesita una
      SEGUNDA persona**: todo camino de aviso excluye al actor) · brief Greenlit y su vuelta al reabrir ·
      avisos · formato del diálogo en el portal · cliente revocado.
- [x] **2. Paso B del Workload** (2026-09-01, código puro, SIN deploy): pastilla de carga clicable → despliega
      inline las tareas de la persona en ese estado, cada una enlaza a `/{slug}/tareas/{id}`. El scope por track
      de quien mira se aplica a la TAREA (`idea.track ∈ tracks`, espeja `visibleParaRol`) → conteos + lista + total
      + por-cliente heredan el filtro; `count` se DERIVA de la lista. Cerró una fuga de CONTEO pre-existente (los
      conteos NO estaban acotados por track, sólo la lista de miembros). Lógica pura en `src/lib/workload.ts`
      (partida de `performance/data.ts`, patrón bundle.ts) con 12 tests incl. falso-positivo multi-track. Quité el
      acumulador muerto `porTrack`. Gates VERDES: tsc·eslint·lib 470·db 346·sync 44·isolation 58·actions 21·build.
      ⏳ LIVE-VERIFY (Pedro, sesión autenticada): abrir Performance→Workload como lead de UN track → una pastilla
      abre sólo tareas de SU track (nada del otro equipo aunque la persona sea multi-track); como admin/master ve
      todo; el enlace abre la tarea correcta; teclado (Tab→Enter abre/cierra, foco visible).
- [~] **3. Perf** (deuda conocida, no bloquea):
      - [x] **N+1 de `sync/import.ts`** (2026-09-02 pm, commit ee673da, LIVE): lotes → 12 consultas fijas por
            run (5 filas = 40 filas). Write-path en `src/lib/import-lote.ts` + test con base falsa (70 casos, en `npm test`).
      - [x] **Cap de `bundle-data.ts`** (2026-09-02 pm, commits cc1a3c5+842fa70, LIVE): migración **0060** vista
            `brief_estado` + `cargarBundles` en 2 fases. Migración aplicada y mergeado a main el 2026-09-02.
      - [x] **`cargarWorkload`: lecturas completas ACOTADAS** (2026-09-02): `idea_assignments` y `briefs` ya no
            se traen enteras (crecían con el histórico → truncación silenciosa al tope de PostgREST). Ahora patrón
            de 2 fases acotado al working set activo, igual que `cargarEvaluacion`. Resultado IDÉNTICO (perf pura).
            Gates verdes, sin migración.
- [~] **4. Dependabot + a11y** (parcial):
      - [x] **3 PRs SEGUROS aplicados** (2026-09-02, commit 64f2e50, cerrados a favor del commit — bases rancias,
            no merge ciego): grupo npm minor/patch (11 paquetes) + actions checkout/setup-node v7. Lock regenerado
            sobre main (guard `check-server-actions` intacto). npm audit 7→4 vulns. Gates verdes, sin migración.
      - [x] **Majors resueltos** (2026-09-02 pm, commit 6424531, LIVE): TS 7 rompe `npm run lint` (typescript-eslint
            rechaza 7.0) → **TypeScript 6.0.3**; **@types/node 24** (el del runtime). dependabot.yml ignora esos majors.
            PRs #4/#5 cerrados.
      - [x] **`npm audit fix`** (2026-09-02): 4 vulns transitivas → **0** (sólo lock, no-major). Commit e717129.
      - [~] **pulido a11y** (2026-09-02, parcial):
            - [x] `CommandDialog`/`command.tsx` MUERTO eliminado + dep `cmdk` quitada (−1 dependencia).
            - [x] `autoFocus` en el primer campo del request-form del portal.
            - [x] tap targets SEGUROS a 44px: CTAs de PortalAcciones (Aprobar/Pedir cambios/confirm) + chips
                  «Ver campo»/«Quitar» del panel de cambios (estaban ~24px, borde de AA → ahora min-h-9).
            - [x] **PortalNav a 44px (AAA)** (2026-09-02 pm, commit 97c597a, LIVE): controles y filas de popover
                  ≥44px; offset sticky MEDIDO (`--portal-nav-h`) en vez de `top-[7.5rem]`. Verificado desktop + móvil 375.
                  Nota pre-existente: en móvil las flechas quedan fuera de pantalla (fila con scroll horizontal).
            - [ ] nota Paso B: las pastillas del Workload y su lista quedan <44px en desktop (superficie interna, AA ok).
            - [ ] nota: el panel de cambios INTERNO (agency, desktop) tiene los mismos chips — bump opcional si se usa en móvil.
- [ ] **5. Decisión abierta**: hoy "borrador" = sólo `under_review`. Si el lead fija un cambio con la
      tarea EN PROGRESO, el especialista lo ve al instante (feedback deliberado). Pedro puede querer que
      NADA se vea hasta "Mandar cambios" — es un cambio de una línea.
- [ ] **6. No construir** (recomendación explícita): ajustes de notificación dentro del portal del
      cliente. Tiene UN evento, default ON; una pantalla de ajustes sólo da un switch para romperlo.


## ✅ 2026-08-27 — Read-time REAL: contar sólo lo hablado + 200 pal/min (SHIPPEADO + LIVE)
Pedro: los videos salían CORTOS — un guión "de 32s" leído relajado dura ~20s. El modelo
read-time sobre-estimaba por 2 razones: contaba etiquetas "(Actriz 1)"/negrita "**" (~13%
de tokens en prod) y asumía 150 pal/min (muy lento). Con el objetivo ya bajo, el video salía corto.
- [x] `soloHablado()` + `PALABRAS_POR_MINUTO=200`; `readTimeS = ceil(palabras habladas × 3/10)` (plantilla.ts).
- [x] Migración **0055**: trigger `set_plano_read_time` replica EXACTO + recalcula filas existentes.
- [x] hue-writer: prompt/feedback a 200 pal/min y "sin contar (Quién)". Tests: contract TS↔SQL con casos de etiqueta.
- [x] Gates VERDES: tsc 0 · lib 427 · db 319 (PGlite aplica 0055 y verifica el contrato).
- [x] Validado con datos reales: guión de prod 30s→19s (== la queja); a futuro ~55% más palabras → llena el tiempo.
- [x] **SHIPPEADO 2026-08-27**: migración 0055 aplicada (verificado: trigger vivo, filas recalculadas 49→33s / 30→19s) + código push `d3f36f7..9ea8b02` (Vercel auto-deploy). Ref ybbrpqzbedaxsmotgtkh (S.P.A.M compartido).

## 🟡 2026-08-27 — HÜE apunta al MEDIO del rango de duración (no al borde)
Problema (Pedro): los guiones fallan por tiempo; HÜE los deja pegados al tope (30-40 → sale a ~40).
Objetivo: HÜE deja SIEMPRE colchón bajo el tope. Rango ancho → centro (30-40 → 35).
Valor único → 4s menos + el número es TOPE DURO (30 → apunta a 26, jamás pasa de 30).
Regla unificada: objetivo = tope − max(4, mitad del rango); budget = objetivo − 2s legal.
- [x] `presupuestoDialogoS` (src/lib/plantilla.ts) + const `COLCHON_MIN_S=4`.
- [x] Comentarios doc (plantilla.ts + hue-writer.ts) + tests (test-lib.mjs) a semántica de colchón.
- [x] Gates VERDES: tsc 0 · eslint 0 · lib 421 pass. (Cambio 100% código, sin migración.)
- [x] Log lesson. ⏳ Falta: OK de Pedro + deploy (push, sin migración).

## 🔒 2026-08-27 (tarde) — REAP pre-launch: 16 hallazgos de paridad ARREGLADOS + deploy
Gates VERDES: tsc·eslint(0)·lib 417·db 318·sync 44·build. Sin migración (todo código).
- **C1 escalada de privilegios**: `moveTask` + menú/arrastre del tablero dejaban a un creativo auto-aprobar/publicar/
  entregar (rpc_move_task sólo checa rol en transiciones ilegales). FIX: `transicionRequiereLead` (allowlist doer)
  compartida por server + UI (menú Mover + droppable).
- **C2/C3 fuga cross-tenant**: `/clientes` y `/{slug}/sync` sin guard. FIX: guard por página + **client tether en el
  middleware** (un cliente sólo su `/{slug}/portal`; cualquier otra ruta lo regresa). El guard portal-a-portal ya estaba vivo.
- **C4/S3/S4/I1 multi-track (mi feature, audit incompleto)**: Workload, lista Briefs (filtroBundle), Entregas (cargarArchivo),
  guardarBrief usaban el track HOME → un lead veía el otro equipo. FIX: todos usan el grant efectivo (member.tracks/tracksVisibles).
- **C5/C6 render**: rangosLocutor ahora también bolea cues con dos puntos; legal-lectura envuelve el pretty en TextoRico.
- **S1** importRows con gate lead-track (paridad con crearBrief). **S2** 5 loaders de admin con `canAdmin`. **I2** scope en
  marcarVeredictoIgnorado. **I4** setLeads valida rol. **S5/I3** Mi Trabajo: correcciones/revisión ABREN la tarea (no botón
  inline divergente; ya no se aprueba con correcciones abiertas desde la lista).
- Tests nuevos: transicionRequiereLead, filtroBundle (incl. falso-positivo lead multi-track ve AMBOS), rangosLocutor colon.
- ⏳ LIVE-VERIFY: creative NO puede arrastrar a completed/published; cliente sólo su portal (probar /clientes, /otro/portal,
  /slug/sync → redirige/deniega); lead multi-track ve ambos equipos en Workload/Briefs/Entregas; legal con `**` sale en negrita.
- Cosmético diferido: WorkloadBoard aún pinta el header del track vacío para un lead de un solo track (sin fuga de datos).


## 🔵 2026-08-27 (tarde) — fixes UI + workflow cambios-cliente
- ✅ Sidebar ya NO auto-colapsa la sección del cliente al ir a Mi Trabajo (queda desplegada; colapso manual respetado).
- ✅ Pill "Esperando revisión" → ámbar (status-warning) + dot, antes gris casi invisible.
- ✅ Verificado: la negrita del diálogo (marca `**` + locutor "(…)") sobrevive el flujo (render la recomputa; writers preservan el formato).
- ✅ **HECHO + TESTEADO (SIN deploy) — #1 workflow cambios-cliente + warning Sin lead.** Gates: tsc·eslint·lib 398·
  db 318 (mig 0054 aplica)·sync 44. Falta: revisión de Pedro + deploy (mig 0054 + push). Live-verify: cliente pide
  cambios → sólo el lead la ve; banner "Cambios del cliente" (Enviar a cliente / Reasignar); reasignar la manda al esp;
  reenviar publica directo; tablero muestra "Sin lead" en tareas con esp sin lead + banner agregado.
- 🔨 ~~EN CURSO~~ (detalle de diseño, ya construido) — #1 workflow: cambios del CLIENTE van SÓLO al lead (sin columna-flag):
  - Señal `clientChangesPending` = tarea en `in_corrections` CON client_change enviados sin resolver (ronda not null,
    resolved_at null). Se computa en app (query), NO en el view (sin migración de view).
  - VISIBILIDAD: el especialista NO ve tareas `in_corrections + clientChangesPending` en Mi Trabajo/tablero hasta que
    se reasigne (pasa a in_progress). Lead/admin sí las ve.
  - ACCIONES del lead en esa tarea (in_corrections ya es EDITABLE por el lead → "hacer los cambios yo" = editar inline):
    · "Enviar a cliente" → RPC nueva `rpc_lead_reenvia_cliente`: resuelve los client_change + mueve in_corrections→
      published (override de lead con motivo claro, NO "fuera de flujo" ciego). = lead hizo los cambios, reenvía directo.
    · "Reasignar a especialista" → server action: asignarTarea(lead+esp) + rpc_task_start (in_corrections→in_progress) →
      el especialista lo trabaja normal → revisión → lead aprueba/envía. (notify_on_assignment le avisa al esp.)
  - task-actions: in_corrections + clientChangesPending → LEAD [Enviar a cliente, Reasignar]; ESP []. Sin client_change
    (cambios del lead) → ESP [Retomar] (igual que hoy).
  - MIGRACIÓN 0054 = SÓLO `rpc_lead_reenvia_cliente` (chica). Resto es TS.
  - FOLDED-IN: warning "Sin lead" (no bloqueante) para leads/admin en el tablero — chip "Sin lead" en tarjetas con
    especialistas pero sin es_lead (board_tasks.leads vacío) + banner agregado "N tareas sin responsable de equipo".
  - Tests: PGlite (rpc_lead_reenvia_cliente resuelve+publica; reasignar mueve a in_progress) + lib (task-actions branch).
- ⏳ ~~PRÓXIMO~~ (diseño previo, reemplazado por lo de arriba): cambios del CLIENTE van SÓLO al lead responsable (Pedro confirmó):
  cliente pide cambios → tarea a "En correcciones" en la cancha del LEAD; el especialista NO la ve (fuera de su Mi
  Trabajo/tablero) hasta que se le reasigne. El lead decide: (a) "Hacer los cambios yo" → lead es el doer → in_progress
  → edita → envía al cliente DIRECTO (sin ronda de revisión); (b) "Reasignar a especialista" → el especialista la trabaja
  → loop normal de revisión. Necesita: migración (señal clientChangesPending / lead-es-doer), TaskContext nuevo,
  filtro de visibilidad en Mi Trabajo + tablero, UI de 2 botones del lead, ruta lead-doer→enviar-cliente, tests.
- 🟡 EVALUANDO (Pedro preguntó, NO construir aún): warning que recuerde a leads+ asignar un LEAD a tareas sin lead
  antes de que se trabajen (hoy sólo se checa "sin responsable"=sin nadie; no distingue "sin lead").

## 🔴 2026-08-27 — Tablero locks + H.Ü.E tiempo + multi-track de leads (Pedro, deploy juntos)
✅ LOS 3 CONSTRUIDOS + VERIFICADOS. Gates VERDES: tsc·eslint(0)·test:lib 388·test:db 310·test:sync 44. Mig 0052 SIN aplicar.
⏳ Falta: deploy junto (push main + aplicar mig 0052) — Pedro dijo "deploy everything together" (autorizado).
✅ FOLLOW-UP HECHO (mig 0053): `fan_out_task_notification` ahora empata `my_track` por track HOME **o** grant
   (`new.track = any(lead_tracks)`) → un lead multi-track recibe avisos de AMBOS tracks. (rebasado sobre 0051, no 0050.)
✅ 2026-08-27 fixes B: Mi Trabajo "Retomar" abre la tarea (router.push, gated enCorrecciones); portal del cliente
   pinta el locutor "(Actriz 1)" en negrita POR RANGO (rangosLocutor+unirRangos en CampoLectura) sin romper offsets.
⏳ LIVE-VERIFY post-ship: en el tablero, asignar Lead+Especialistas respeta rol+track; H.Ü.E de una tarea 30-40s cabe
   en tiempo (barra ≤ cap, legal=+2s); un lead con grant de ambos tracks ve/asigna en los dos.
- **[A] Tablero asignación = MISMAS locks que el task section** ✅ HECHO+VERIFICADO (tsc/eslint/tests verdes, sin deploy):
  el picker del tablero era lista plana por `setAssignees` (0 validación → todos Especialista). Ahora Lead(rol `lead`)
  + Especialistas(rol `creative`) del track de la tarea, vía `asignarTarea` (re-valida rol+track+activo en server).
  `setAssignees` ELIMINADO. Sólo lead+ asignan (canAssign, ambas capas). — board.tsx, tablero/page.tsx, tablero/actions.ts.
- **[B] H.Ü.E respeta la duración** (bug: cap 30-40s → generó 48s → +legales=60):
  - Legal = SIEMPRE 2s (regla dura). `LEGAL_SECONDS=2` en plantilla.ts; page.tsx cortinillaS = tiene-legal?2:0 (antes readTimeS del texto → 12s).
  - Presupuesto de diálogo del writer = targetSec − 2 (reserva la cortinilla). + GUARD determinista: mide read-time del guión generado; si excede, retry correctivo (máx 2) que le da el sobrante exacto y le pide recortar. (prompt-plus-deterministic-guard)
- **[C] Multi-track de leads** (sólo rol `lead`; Pedro eligió "selectable"): mig `track_members.lead_tracks track[]` (null=usa track home).
  Identity computa `member.tracks` (lead: lead_tracks ?? [track]; creative: [track]; admin/master: global). Consumers→`tracks`:
  assertCanActOnTask, visibleParaRol (tablero), tracksVisibles (roles), briefs/nuevo. + soy.tracks. + Equipo admin: multi-select de tracks por lead (setLeadTracks, guard canAdmin).
- Deploy: push main (Vercel) + aplicar migración al ref de Greenlight. Test local ANTES.



## 🔔 Fase 3b (cliente) + backlog 1-5 — CONSTRUIDO + TESTEADO, migración 0051 SIN aplicar
Gates VERDES: tsc·eslint(0 err)·test:lib 380·test:db 310·test:sync 44·build. 21 archivos + mig 0051.
- **Fase 3b — notificaciones al CLIENTE** (mig 0051, SIN aplicar): antes el cliente NO recibía NADA al mandarle
  una pieza. Ahora `ready_for_review` al publicar → avisa a los perfiles cliente del cliente, título de cara al
  cliente + URL del PORTAL (bloque aparte del loop interno). Pref sembrada (existentes + trigger nuevos). Tests:
  publicar avisa al cliente, URL al portal, el cliente NO recibe el task_published interno. **UI de toggle en el
  portal: DIFERIDA** (el cliente sólo tiene 1 evento, default ON razonable; falta superficie de settings en el portal).
- **[1] Perf editor**: `Campo`+`CampoDoc` memoizados (cascarón delgado lee contexto → cuerpo memo con props estables);
  teclear re-renderiza SÓLO el campo editado. + touch target del pin de corrección ≥24px.
- **[2] a11y**: `FaltantesDialog`→`<Dialog>` (focus trap/Esc/restore) + labels de email + tope bulk; skip-to-content;
  h1 del portal `sr-only` en móvil; touch targets (icon-xs, X de referencia); aria-expanded en DiffTarea; label del
  input file KB; confirmar borrado de doc KB.
- **[3] Func**: "Ver campo" del legal ya no no-op (data-campo-key en cortinilla + legal-lectura) + mueve el foco;
  empty state de KB docs; tope "Agregar varias" del brief.
- **[4] Perf minor**: `firmarLote` (page.tsx, N signed-URLs → 1 batch); admin tabs con next/dynamic; `moveTask` 1 query
  (board_tasks.client_slug). `/clientes` NO se tocó (el layout ya fuerza dynamic → revalidate sería config muerta).
- **[5] DB minors** (en mig 0051): política de lectura en notification_deliveries (era deny-all); trigger de limpieza
  + CHECK en field_edits. `SnippetKind` += selling_point (código). CHECK de scope en snippets: DEJADO FUERA (las
  pruebas insertan snippets no-conformes → algún camino de creación no cumple el invariante; normalizar primero).
- **⏳ LIVE-VERIFY post-ship**: publicar una tarea → el cliente recibe el aviso (email) con link al portal; typing
  fluido en el editor; "Ver campo" del legal salta+enfoca; el brief dialog atrapa el foco.
- **Follow-ups**: UI de prefs en el portal (cliente); mover `reseed` a su propio contexto (elimina hasta el cascarón);
  normalizar caminos de creación de snippets → luego el CHECK de scope; changes_resolved como evento cliente distinto.



## 🔔 Preferencias de notificación por persona (0050) — CONSTRUIDO + TESTEADO, migración SIN aplicar
Cada quien decide QUÉ le llega por correo (por evento) + con qué SCOPE. La campana (in-app) sigue amplia
dentro del scope; el email es el canal curado. Arregla el firehose (un lead recibía TODA la actividad de todos
los tracks) y añade el aviso "se te asignó una tarea" (no existía).
- **Migración 0050** (`..._0050_notification_prefs.sql`, SIN aplicar): `notification_prefs`(profile×evento→email/slack) +
  `profiles.notify_scope`/`notify_watch_all` + seed de defaults por rol (existentes) + trigger AFTER INSERT que siembra
  a los NUEVOS (una vez, sin clobber en re-login) + trigger `task_assigned` en idea_assignments + `fan_out` scope-aware
  (lead→su track) + pata `watch_all` (opt-in del firehose).
- **Capa de envío**: `decisionEmail` (puro) + `notif-email` leen la pref por-evento; MANDA sobre el default del catálogo.
- **UI**: matriz en Mi perfil (`perfil-tab`): selector de Alcance (lead/admin), toggle "avísame de cada movimiento",
  switches de email por evento. Actions: `cargarMisPrefs`/`guardarPrefEvento`/`guardarNotifScope`/`guardarWatchAll`.
- **Defaults email**: admin=off (opt-in; la campana ya le muestra todo) · lead=submitted/changes/approved/published/brief ·
  especialista=task_assigned+changes. Scope: admin=all, lead=my_track, especialista=only_mine.
- **Tests**: test:lib 379 (eventPref MANDA), test:db 305 (task_assigned dispara, scope excluye otro track, watch_all recibe).
  tsc·eslint·build VERDES. **Migración 0050 NO aplicada** → ship = `npm run migrate` (pin ybbrpqzbedaxsmotgtkh) + push.
- **⏳ LIVE-VERIFY post-ship** (Pedro, con sesión): abrir Mi perfil como lead/especialista, cambiar toggles, confirmar que
  el correo respeta la matriz y que el lead ya no ve otros tracks.
- **Fase 3b (siguiente)**: notificaciones al CLIENTE (hoy el cliente NO recibe nada cuando le mandan una tarea a revisar) +
  sus toggles en el portal. La tabla de prefs ya es genérica (soporta clientes sin rework).



## 🌾 DEEP REAP 2026-08-26 — 6-agent audit (security · correctness · DB · perf · a11y · funcionalidad)
Baseline y post-fix VERDES: tsc · eslint (0 errores) · test:lib 375 · test:db 298 · test:sync 44 · build.
Cambios sin commitear aún (working tree) — Pedro revisa antes de push.

### ✅ ARREGLADO (Critical + Serious + quick-wins de alto valor)
- **[CRITICAL] Read/scope IDOR**: `tareas/[id]/page.tsx` + `tablero/page.tsx loadBoard` cargaban por id/cliente
  con sólo `canSee` → cualquier rol interno leía tareas de otro cliente/marca por URL + firmaba URLs del bucket
  privado. FIX: `assertCanActOnTask(id)`→notFound() + `visibleParaRol()` (creative→asignado, lead→track). ⚠️ CAMBIO
  DE COMPORTAMIENTO: el tablero ahora se ACOTA por rol (Pedro=master ve todo; Nils=lead sólo su track).
- **[SERIOUS] Fuga cross-marca de legal**: `legales-actions` guardaba client_id en filas de marca → legal de Card
  llegaba a Préstamos vía el writer. FIX: client_id=NULL en marca + `hue-writer` usa marca_id+global para legal.
- **[SERIOUS] IDORs de acción**: `validarCambios`, `aplicarSugerencia`, `referencias-*` (subir/link/quitar) sin
  `assertCanActOnTask/Row` → un lead escribía texto arbitrario / adjuntaba refs en tarea de otro track. FIX: gate en las 6.
- **[SERIOUS] Winners auto-synth no-atómico**: dos estrellados rápidos → 2 llamadas pagadas a Anthropic + lecciones
  duplicadas. FIX: reclamo atómico compare-and-set antes del modelo (espeja el camino de ediciones).
- **[SERIOUS] Edits auto-synth**: watermark sobre `generated_at` en vez de `imported_at` → ediciones no se minaban. FIX.
- **[SERIOUS] revalidatePath faltante** en 8 mutaciones estructurales (agregar/borrar plano/tema/copy, vaciarGuion,
  guardarCuota) → "guardó pero revierte al recargar". FIX: revalidate en las 8.
- **[data] Sync dedup**: `Tamaño`/`Plataforma` no dedupeados (sí `Duración`) → celda sucia → idea con 0 assets. FIX.
- **[MINOR] `revisarOrtografia`** sin scope gate; **guardrail** `sinInventar` sin NFC; **emoji regex** matcheaba
  `:100:` en `1:100:1` (borraba dígitos). FIX en los 3.
- **[a11y/func] quick wins**: confirm "Aprobar" del portal auto-enfocaba "Sí" (→ Cancelar); "Validar con H.Ü.E" daba
  veredicto falso en correcciones de legal (→ oculto, como copies); `aria-live` en el indicador de guardado (única
  afordancia de guardado); `break-words` en lectura client-facing; `not-found.tsx` de marca; quité dep sin usar
  `@dnd-kit/utilities`.

### 🔵 ESPERA "ship it" de Pedro
- **Migración 0049** (`..._greenlight_0049_scope_invariants.sql`) — repara datos de legal en prod (client_id→NULL en
  filas de marca) + CHECK scope↔ids en hue_instructions/hue_kb_documents (DB reap S1). NO aplicada.
  Ship = `npm run migrate` (pin `ybbrpqzbedaxsmotgtkh`). **Sin esto la fuga de datos VIEJOS del legal sigue** (el
  código ya no la produce, pero las filas malas existentes sólo se limpian con la migración).
- **Pre-ship (read-only)**: confirmar en prod los 4 triggers before_delete (`select tgname from pg_trigger where
  tgname like 'before_delete_%_correcciones'` → planos/estaticos/copy/tema), por si un 0046 local viejo se aplicó sin ellos.

### 📋 MENÚ diferido (deep-reap findings, no bloquean — decidir cuáles tomar)
- **Perf (heavy)**: board sin memoización (React.memo/useCallback/useMemo — re-render total al arrastrar);
  `WorkspaceProvider` re-renderiza 8 componentes por tecla (partir contexto, como ya se hizo en `correcciones/contexto`);
  lazy-load de `PegarGuion` (tabla emoji 39KB gzip carga en CADA tarea); `page.tsx` reusar `firmarLote`/`cargarRefs*`;
  `admin-shell` tabs con next/dynamic; `moveTask` usar `board_tasks.client_slug` (1 query menos).
- **a11y (medio)**: teclado no entra a la tarjeta de corrección (`campo-lectura`: `role="tooltip"` con controles +
  marks sin focus); `FaltantesDialog` (brief-builder) sin focus-trap → usar `<Dialog>`; skip-to-content; targets 20px;
  aria-expanded en DiffTarea; label en input file del KB; h1 del portal `hidden`→`sr-only` en móvil; "Ver campo" no mueve
  foco; labels en inputs de email del brief; confirmar borrado de doc KB / copy (paridad con tema).
- **Funcionalidad**: Copies NO puede adjuntar legal (CortinillaCierre no monta en DocumentoCopies); "Ver campo" del legal
  no-op (cortinilla-cierre sin `data-campo-key`); empty-state de KB docs; tope en "Agregar varias" del brief; CRUD de
  cliente top-level no existe (¿intencional?).
- **Tech-scout**: **[HIGH] rate-limit** en `portal/login solicitarAcceso` (endpoint público sin throttle → spam a admins);
  CI (.github/workflows con `npm run test` + tsc + Dependabot); (M2) política/comentario en `notification_deliveries`;
  (M3) trigger de limpieza + CHECK tabla en `field_edits`; (M4) `SnippetKind` en database.types.ts sin `selling_point`.

### ✅ BATCH 2 (2026-08-26 cont.) — rate-limit + Copies legal + top-5 perf/a11y/CI (gates VERDES, SIN pushear aún)
- **Rate-limit del portal público** (`solicitarAcceso`): por-IP (memoria) + circuit-breaker global durable (cuenta
  pending_invites recientes) + NO re-avisar a admins en re-envío del mismo correo. Cierra el vector de spam a buzones.
- **Copies legal** (decisión Pedro: SÍ): `<BloqueLegal>` (extraído de documento-guion, idea-level, editor vs Vista
  cliente anclable) montado en la rama copies de page.tsx; sugerencia determinista ahora lee headlines/descripciones de copies.
- **Perf**: WorkspaceProvider partido en 2 contextos por frecuencia (`useWorkspaceView` para hero/pestañas/detalles/
  banner/copies/correcciones → no re-render al teclear); board memoizado (memo Column/TaskCard/CardBody + tasksByStatus
  Map + handleProps estable); `PegarGuion` difiere la tabla de emojis 39KB (`await import` en el handler).
- **a11y**: la tarjeta de corrección (campo-lectura) ahora es teclado/lector accesible (role=dialog con controles,
  onFocus/onBlur en chips+marks, Escape cierra y devuelve foco).
- **CI**: `.github/workflows/ci.yml` (tsc·lint·test en PR + push a main) + `.github/dependabot.yml`. ⚠️ `test-sync.mjs`
  hace un fetch a un Google Sheet público → CI podría ponerse rojo raramente por red (follow-up: gatearlo en CI).
- **Decisión Pedro**: **Portal se queda por-CLIENTE** (un Partner ve todo lo de su cliente — intencional, NO tocar).

### 📋 QUÉ QUEDA (backlog tras batch 2, por importancia)
1. **Perf profundo**: memoizar CampoDoc/Campo + estabilizar los `onCambio` → que teclear re-renderice SÓLO el campo
   editado, no todo el subárbol del documento (el split de contexto ya frenó a los HERMANOS; falta el subárbol).
2. **a11y (medio)**: `FaltantesDialog` (brief-builder) → `<Dialog>` (focus-trap); skip-to-content; targets <24px
   (icon-xs, pin de corrección, X de referencia); aria-expanded en DiffTarea; label en input file del KB; h1 del portal
   `hidden`→`sr-only` en móvil; "Ver campo" no mueve foco; labels en emails del brief; confirmar borrado de doc KB/copy.
3. **Funcionalidad**: "Ver campo" del LEGAL no-op (falta `data-campo-key` en cortinilla-cierre/legal-lectura); tope en
   "Agregar varias" del brief; empty-state de KB docs.
4. **Perf menor**: page.tsx reusar `firmarLote`/`cargarRefs*` (N round-trips de storage); admin tabs con next/dynamic;
   `moveTask` usar `board_tasks.client_slug`; `/clientes` force-dynamic → revalidate.
5. **DB minors (ship-gated)**: M2 policy/comentario en notification_deliveries; M3 trigger+CHECK en field_edits; M4
   `SnippetKind` sin `selling_point`; CHECK de scope en snippets (tras auditar el dominio).
6. **CI hardening**: gatear el fetch de red de test-sync en CI (evitar rojos por red).

---

## 🧠 H.Ü.E HUB — selector de scope (marca/cliente) en KB + Cerebro — CONSTRUIDO + REAPEADO, SIN pushear
**Por qué:** la subida al KB y "Añadir lección" hardcodeaban `scope:"global"` (sin picker), pero el schema (0045)
y el writer YA soportan scope/client_id/marca_id. Sin picker, docs de DiDi Card y DiDi Préstamos se mezclaban.
SIN migración (columnas ya existen). Gates VERDES: tsc·eslint·**test:db 284**·test:lib 359·build.
- [x] `hue-actions.ts`: `hubTraining()` +`clientes` (clients+marcas agrupados) · `subirKb`/`crearInstruccion`
      resuelven scope vía `resolverScope`. `hue-training.tsx`: `<ScopeSelect>` reusable (Global·cliente·marca vía
      optgroup) en KBDocs (subida + badge por doc) y creación de lección. Reusa el patrón de biblioteca-tab.
- [x] **Reap Opus — CRITICAL arreglado (fuga cross-marca)**: `resolverScope` DERIVABA client_id=DiDi en docs de
      marca → el OR plano del writer (`client_id.eq.DiDi`) lo pescaba para AMBAS marcas → un doc de Card se filtraba
      a un guión de Préstamos. FIX: docs de marca guardan **client_id=NULL** (como los snippets legales por marca) →
      sólo `marca_id.eq` los pesca. **Test PGlite de aislamiento** (Card no llega a Préstamos y viceversa, +2).
      **SERIOUS**: `resolverScope` con scope marca/cliente sin id degradaba a global → ahora fail-closed (Fail).
- **Deuda (minors, no bloquean)**: síntesis dedupe por título cruza scopes (una lección de cliente podría suprimir
      una auto global homónima — raro, auto-lecciones son global) · no se puede re-scopear en EDIT (borrar+recrear;
      por diseño). Follow-on: mismo selector para estrellar Ganadores por marca (hoy vienen de Entregas, ya scopeados).

## 📄 Plantilla "Copies" (temas con cuota) — CONSTRUIDA + CLIENT-FACING (portal) — SIN pushear
**DECISIÓN de Pedro (2026-08-24): Copies ES entregable al cliente → va al portal para revisión/aprobación.**
S1 resuelto opción (b). Forma acordada: temas con cuota → el lead define temas + cuántos; el copy llena
headline+descripción, con contador X/cuota. Migración **0046** (`copies_temas` + `copies`). Reusa el patrón de
estaticos + el round-trip de correcciones de guión/estático. Gates VERDES: tsc·eslint·**test:db 282**·test:lib 359·build.
- [x] **Migración 0046**: `copies_temas` (idea_id, tema, cuota, orden) + `copies` (tema_id, headline, descripcion,
      orden). RLS explícita (2 saltos en copies: tema_id→copies_temas→idea_id), trigger+grant explícitos. PGlite-probada.
- [x] **Actions** (actions.ts): `Tabla` angosto + `TablaGuardable` (guardarCampo tabla-aware para copies, 2 saltos
      al idea_id); CRUD agregarTema/borrarTema/guardarCuota/agregarCopy/borrarCopy (gate canMoveStatus +
      assertCanActOnTask/Row, 2 saltos en assertCanActOnRow). Autoría (field_edits) NO cubre copies (Evaluación
      no puntúa copies aún — gap intencional).
- [x] **UI**: `documento-copies.tsx` (DocumentoCopies + TemaCard + CampoCopy con useAutoguardado, sin correcciones);
      contador X/cuota (verde al cumplir), stepper de cuota, add/del tema+copy con confirm. page.tsx: quitado el
      early-return "no construido" + loader de copies + branch del documento (dentro del body compartido).
- [x] **Reap fixes**: **S2** verCliente = read-only (un revisor en Vista cliente ya no borra un copy de un clic);
      **M4** cuota revierte si el server rechaza; **M7** prop vestigial quitado.
- [x] **S1 RESUELTO (b) — render de copies en el portal + round-trip de correcciones**:
      · `CorreccionTarget.tabla` + `TABLAS_VALIDAS` + `CampoLectura.tabla` ampliados con copies_temas/copies.
      · `DocumentoCopies` ahora tiene modo **lectura** (`CopiesLectura` → `CampoLectura` anclable) derivado de
        `verCliente`; reusado por el PORTAL y por la Vista cliente INTERNA (el revisor ve/gestiona los pins del
        cliente inline). CampoCopy (editor) ganó `data-campo-key` para que "Ver campo" salte también en modo editor.
      · `cargarTareaPortal` carga temas+copies; `TareaPortal` +plantilla +temas; `CuerpoDoc` ramifica a DocumentoCopies.
      · SIN migración nueva de tablas: `comments.target_tabla` es texto libre (sin FK/whitelist); el trigger de
        published_at es plantilla-agnóstico; page.tsx interno ya cargaba correcciones de cualquier target_tabla.
- [x] **Reap Opus (2 agentes, portal client-facing) — fixes aplicados**:
      · **A1 SERIO (integridad DB)**: 0046 se saltaba el trigger `before_delete` de limpieza de correcciones
        huérfanas que 0039 añadió a planos/estáticos → borrar un copy/tema dejaba pins con resolved_at=null (ronda
        no cierra, badge miente). FIX: enmendé **0046** con los 2 triggers (reusa la función genérica de 0039);
        test PGlite del borrado directo Y en cascada (+3 asserts → test:db 282).
      · **B1 SERIO (client-facing)** + **B2/B3**: Hero/DetallesTab/BottomBar ramificaban por `esEstatico` binario →
        copies salía como "Animado Video / 0 s / notas de guión". FIX: enhebrar `plantilla: Plantilla` por esos
        componentes (media="Copies", sin variante/duraciones/notas/read-time). `esEstatico` sólo donde la
        distinción es binaria (DocumentoTarea).
      · **A2/B(ii)**: "Copy N" indexaba sobre la lista filtrada → número inconsistente vs editor. FIX: índice sobre
        la lista COMPLETA en ambos modos.
      · **B6**: "Validar con H.Ü.E" (lee sólo planos/estáticos) oculto para copies (daría "(campo vacío)").
      · a11y: nombre de tema como `<h3>`.
- **Deuda anotada (minors, no bloquean)**: M1 (structural actions sin check de tarea cerrada — espeja gap de
      agregarPlano) · M3 (ortografía no revisa copies, intencional) · M5 (stepper closure stale en clicks rápidos) ·
      M6 (race de unique(orden) en add concurrente) · M8 (recargar el schema cache de PostgREST post-deploy) ·
      **A3** (chip "aplicado" no se ve si el fix vació/borró el copy — paridad con guión, el borrado ya lo cubre el
      trigger A1; el cambio sigue en el panel). Follow-ons: "Crear copies con H.Ü.E" (escribirCopies) · Validar
      copies-aware · autoría (field_edits)/Evaluación para copies.
- **⏳ LIVE-VERIFY post-ship (necesita una tarea Copies real en prod)**: crear Copies → llenar temas/copies →
      Enviar a cliente → abrir el portal (cliente): ve los copies, ancla un cambio, "Pedir cambios" → el equipo lo
      ve en el panel + inline (Vista cliente) → arreglar → re-revisión muestra "aplicado".

## ✍️ H.Ü.E Fase 2 — el WRITER "Crear guión" — CONSTRUIDO + REAPEADO, SIN pushear
Plan: `/Users/work/.claude/plans/dynamic-wondering-flame.md`. H.Ü.E ESCRIBE el guión/copy desde el brief,
consumiendo el Cerebro/KB/Ganadores de Fase 1. Reusa la preview→import de "Pegar guión" (coexisten; Pegar
se retira sólo cuando Crear esté perfeccionado — Pedro). Gates VERDES: tsc·eslint·test:db 270·test:lib 359·build.
Reap Opus aplicado. NO migración → ship = commit + push (sin migrate/setup:storage).
- [x] **`src/lib/hue-writer.ts`** (server-only): `reunirContextoTarea(ideaId)` reúne inputs de la tarea
      (concepto/comunicación/tópico/selling_points/peloteo p_*/plataformas/duración/track+voz/marca/brief/familia)
      + reglas (`reglas_para_tarea` con p_texto proxy → dispara CASHBACK/MSI) + legal sugerido (`legalSugerido`)
      + Cerebro (hue_instructions activas) + KB (extracted_text) + Ganadores (`cargarWinners`), TODO scopeado
      global+cliente+marca. `escribirGuion`/`escribirCopy`: Anthropic sonnet-5, tool forzado, prompt cache-split
      (prefijo estable = instrucciones+Cerebro+KB+ganadores; variable = datos de la tarea+reglas+legal).
- [x] **`writer-actions.ts`** (use server): `crearGuion(ideaId)`→PlanoParsed[] · `crearCopy(ideaId)`→EstaticoParsed.
      Gates: hasSupabase · ANTHROPIC_API_KEY · canMoveStatus · **assertCanActOnTask** (lee la tarea).
- [x] **UI**: `pegar-guion.tsx` gana `intent:"pegar"|"crear"`; el banner muestra AMBOS CTAs. "Crear" genera →
      cae en la MISMA vista previa editable (Reemplazar/Agregar) → import. Loading "H.Ü.E está escribiendo…",
      nudge distinto ("revisá datos/precios/legales"), fallback a pegar si falla.
- [x] **maxDuration=60** en la ruta de tarea (una generación de 16k tokens revienta el default).
- [x] **"Descartar guión"** (2026-08-23, follow-on): botón 1-clic con confirm 2 pasos que borra TODOS los
      planos (`vaciarGuion(ideaId)`, gate canMoveStatus + assertCanActOnTask; trigger 0039 limpia correcciones
      ancladas; setPlanos([]) en memoria). Sólo video/editable/con-planos. No toca assets. `documento-guion.tsx`.
- [x] **Reap Opus (fixes aplicados)**: **C1** fuga cross-cliente — el filtro de ganadores comparaba slug de
      MARCA vs slug de CLIENTE (nunca matcheaba) y caía a TODOS los clientes → ahora filtra por slug de CLIENTE
      real, SIN fallback. **S1** las 4 sub-queries del gatherer chequean `.error` (no degradar en silencio a
      "sin reglas/legal"). Menores: winners "ignora sus precios/legales"; reset de `escritoPorIA`; radio-group
      único por intent; `.order`+caps del prompt; rechazo de guión/copy vacío; aria-live en loading.
- **Deuda/notas**: Copies (tipo_asset) sigue sin template · el writer trabaja day-1 con Cerebro/KB/Ganadores
      vacíos (mejora al sembrarlos) · modelo Sonnet 5 (subir a Opus si la calidad no alcanza) · si hace falta,
      partir en pipeline 2-calls (outline→desarrollo).
- **PENDIENTE**: "ship it" (commit + push) → live-test de generación en el deploy (Pedro, en una tarea real).

## 🧠 H.Ü.E HUB — Fase 1 (HANDOFF-hue-hub-phase1.md) — ETAPA 1 CONSTRUIDA, SIN pushear
Plan aprobado: `/Users/work/.claude/plans/dynamic-wondering-flame.md`. Estrategia: STAGE IT (Pedro:
"whatever you recommend"). Etapa 1 = esquema + captura (bajo riesgo, datos going-forward YA). Etapa 2
(pendiente, tras review de Pedro) = HUB tab (analítica + training inputs + KB upload) + loop de síntesis.
Gates VERDES: tsc · eslint · **test:db 267** · **test:lib 359** · build. Reap adversarial (Opus) → 0 CRITICAL,
0 SERIO-vivo; findings aplicados (abajo). ⛔ **Nada a prod sin "ship it"** (migración 0045 + bucket + push).

### ETAPA 1 — hecho
- [x] **A · Migración 0045** (`20260821120003_greenlight_0045_hue_hub.sql`): 5 tablas `produccion.hue_*`
      (`hue_suggestions` bitácora de adopción · `hue_instructions` Cerebro versionado · `hue_kb_documents`
      KB+texto extraído · `hue_top_performers` ganadores · `hue_adaptations` auditoría auto). RLS master-only
      (`auth_role()='master'`), trigger `set_updated_at` EXPLÍCITO en hue_instructions, unique
      `(idea_id,correccion_id)` p/ idempotencia de veredictos. Seam `indexed_at` (SIN pgvector). PGlite-probada
      (CHECKs, unique, trigger pisa updated_at viejo, RLS niega asiento no-master + permite master).
- [x] **A′ · Bucket `greenlight-kb`** (privado, pdf/docx/txt/md) en `setup-storage.mjs`. Config sólo — NO corrido.
- [x] **A″ · `canHue`** (`role==='master'`) en roles.ts — gate propio del HUB (canAdmin deja entrar admins).
- [x] **B · Bitácora de adopción** (`src/lib/hue-log.ts`): cableada en validarCambios/aplicarSugerencia +
      revisarOrtografia/aplicarOrtografia. Veredictos = upsert idempotente por corrección (re-validate no
      duplica ni pisa decisión). Señal ignored: al confirmar corrección (contexto.tsx) + cerrar/enviar
      ortografía (acciones-tarea.tsx). **Cache split de validarCambios INTACTO** (logging tras la llamada,
      vía `after()`). Escribe por service_role.
- [x] **C · Estrella "top performer"** en Entregas (`entregas/actions.ts` + entregas-board.tsx): master/admin
      togglea; lead ve indicador read-only. Copy honesto ("la estrella la pones tú", "patrones de tus
      ganadores"). Trigger de síntesis = seam de Etapa 2.
- [x] **Reap fixes aplicados**: (SERIO observabilidad) `console.error` en cada catch de hue-log (un fallo
      silencioso dejaba de capturar sin señal); (MINOR) logging diferido con `after()` (no acopla latencia);
      (MINOR) `offered_at` = primer ofrecimiento (fuera del payload del upsert).
- **Deuda anotada (no bloquea)**: tipar `supabaseAdmin()` con `Database` (payloads sin chequeo de compilador —
      app-wide, fuera de alcance) · `ignorarOrtografia` hace N updates secuenciales (≤50, vía void) → batch · enum
      `decision='dismissed'` sin escritor (reservado) · dedupe/manejo de decision=null en la analítica de adopción (Etapa 2).

### ETAPA 2 — CONSTRUIDA (gates verdes, reap Opus aplicado; SIN pushear)
Deps nuevas: `unpdf`@1.8 + `mammoth`@1.12 (server-only, 0 impacto en el bundle cliente). Migración 0045
extendida (misma migración sin aplicar): `hue_settings.last_synth_at` + RPC `hue_top_snippets()`.
- [x] **D-1 Analítica** (`src/lib/hue-data.ts` `cargarHubIntelligence`+`cargarWinners`; tab Inteligencia):
      adopción validador vs ortografía (offered/applied/ignored+rechazadas), tareas limpias, correcciones/tarea,
      bounce (status_events→in_corrections), ciclo mediano, selling points/legales más usados (RPC SQL, no JS).
      Nav por mes (reusa `resolverMes`). Empty-states honestos + "próximamente" para métricas de texto libre.
      Filtros marca/brief/especialista = refinamiento futuro (anotado).
- [x] **D-2 Training inputs** (tab Entrenamiento): Cerebro (`hue_instructions` — crear/editar/activar/borrar,
      badge auto/manual, versión, reason); Biblioteca de Ganadores (guiones estrellados + su contenido);
      KB upload a `greenlight-kb` con extracción `unpdf`/`mammoth`/txt-md (`hue-kb-extract.ts`), lista/preview/borrar.
- [x] **E Loop de auto-aprendizaje** (`src/lib/hue-sintesis.ts`): job de síntesis (lee ganadores → propone
      lecciones `source='auto'` con reason) + auditoría (`hue_adaptations`) + switch global `auto_learn` +
      "Correr síntesis ahora". Seam de estrella→síntesis (after()). Copy honesto: "patrones observados", nunca causas.
- [x] **UI**: `src/components/admin/hue-hub/{hue-hub-tab,hue-intelligence,hue-training}.tsx`; tab master-only en
      admin-shell (esMaster) + gate real `canHue` server-side en cada action (`hue-actions.ts`).
- [x] **Reap Opus (0 CRITICAL) — fixes aplicados**: (S1) queries de métricas ya no tragan `error` → un fallo
      no se muestra como "mes vacío" falso (helper `must`, loaders devuelven Fail). (S2) revert DURABLE: la síntesis
      dedupe vs TODAS las lecciones (activas+inactivas) → una revertida no resucita. (S3) lecciones auto entran
      INACTIVAS (propose→master activa) + debounce `last_synth_at` (no re-sintetizar sin ganador nuevo). (S4)
      snippets agregados en SQL (RPC), no toda `idea_snippets` en JS. Menores: dismissed en el denominador de
      adopción, ext de KB saneada, checks de filas afectadas en editar/setAutoLearn, log de errores de storage.
- **Deuda anotada**: filtros marca/brief/especialista en analítica · dedupe semántico de parafraseos (hoy inactivas
      + dedupe exacto) · lock de síntesis concurrente (baja prob) · admin (no-master) dispara síntesis al estrellar
      con auto_learn on (aceptado: master opt-in) · tipar `supabaseAdmin()` con Database (app-wide).
- **Pendiente**: review de Pedro → "ship it" (migrar 0045 + `npm run setup:storage` + push) → live-verify del HUB.

## 🔥 CURRENT BATCH (2026-08-21) — 4 asks de Pedro — ✅ SHIPPED & VERIFICADO
Push `main` 0abcede → deploy PRODUCTION Ready (runna-greenlight.vercel.app). Migración 0044 aplicada
a prod + VERIFICADA: track nullable=YES; admin(Hermann)/master(Runna Advertising)→null; lead(Nils)/
creative(Christian)→normal. Tests 359 lib + 250 db; tsc + eslint limpios. Falta: live-test en el
navegador (Pedro logueado como master) de B/A/C/D — checklist abajo.
Orden ejecutado: B → A → C → D.

- **B — split botones doer/reviewer.** `submit_review` (y `start`/"Empezar") SÓLO al especialista
  (`isAssignee && !isLead`); el lead/admin/master es REVISOR → sólo aprobar/mandar cambios + enviar
  a cliente. Nils (lead) ya no ve "Mandar a revisión" (no hay a quién). Toca `lib/task-actions.ts`
  (`actionsFor` + `in_corrections` "Retomar" a especialista) + `acciones-tarea.tsx` (`accionesDe`
  in_corrections "Devolver" a especialista) + `scripts/test-lib.mjs` (línea 125 "lead sí empieza"
  CAMBIA: ahora lead NO empieza). ✅ HECHO
- **A — legal estático desde biblioteca.** Hoy la Cortinilla (biblioteca + sugerencia Phase-B) sólo
  se renderiza para VIDEO (`documento-guion.tsx:89 !esEstatico`). El estático sólo tiene el texto
  libre `legales_extra`. A-SAFE (pura adición, cero regresión): ungate la Cortinilla para estáticos
  en la vista de edición interna. FORK RESUELTO (Pedro eligió "retirar"): estáticos usan SÓLO la
  biblioteca (mismo bloque que video, titulado "Legales"). Retirado el campo inline `legales_extra`
  del documento + del "Pegar copy" (CAMPOS_ESTATICO) + se anula al parsear (no escribe columna oculta).
  Columna DB queda vestigial (no se dropea; portal-data la lee → null → no se muestra). ✅ A COMPLETO.
- **C — master/admin borran tareas y/o briefs.** ✅ HECHO. `eliminarTarea(cliente,ideaId)` en tarea
  actions + `eliminarBrief(cliente,briefId)` en briefs/actions (nuevo), ambos gate `canAdmin`. Cascada
  de FKs verificada contra el catálogo (borra planos/estáticos/assets/asignaciones/comentarios/refs/
  snippets; brief → ideas → todo). UI: BundleCard (footer, confirm 2 pasos) + SubHeaderTarea (junto a
  Volver, confirm 2 pasos, navega al tablero). NOTA: objetos de storage de refs quedan huérfanos (inocuo).
- **D — track nullable para admin/master.** ✅ HECHO (código). Migración 0044 (drop NOT NULL + backfill
  role in admin/master → null). PK ya era `id` (0008), track sólo tenía unique(track,name) que con null
  deja de aplicar a globales (ok). Código: provision (track null p/ globales), equipo-tab (grupo "Vista
  global" + selector Track oculto p/ globales + invariante optimista), guardar/crearMiembro (invariante
  track↔rol server-side), performance/data (workload sólo doers), perfil-tab/mi-trabajo/identity/soy
  (track nullable). ⚠️ MIGRACIÓN NO APLICADA A PROD — gate "ship it" (`npm run migrate`). Datos actuales:
  4 personas, todas track=normal; backfill pondrá null a admin+master (Pedro).

## ⏭️ NEXT FOCUSED BUILD (2026-08-21) — split lead/especialista AT MANUAL CREATION
Contexto: asignación de 2 niveles ya funciona POST-creación (editor in-task, Rünna tools) y en el
SYNC (import matchLead → es_lead=true; staged-card ya muestra picker "Lead" single de rol=lead). FALTA:
el BRIEF BUILDER manual todavía tiene un picker plano `asignacion` (pool combinado). Para separar
lead+especialistas al CREAR a mano hay que tocar el **RPC de Postgres `rpc_crear_brief`** — ahí se
insertan las idea_assignments (no en el app code). Plan:
- Migración: `rpc_crear_brief` acepta `lead_member_id` por tarea → inserta ese con es_lead=true y el
  resto de member_ids con es_lead=false. Actualizar su contract test (test-db).
- `TaskDraft`: add `lead: string[]` (single). `tarjetaEnBlanco` add `lead:[]`. `TaskPayload` add
  `lead_member_id`. `construirTarea` resuelve `first(t.lead)` → lead_member_id (defensivo: `t.lead ?? []`
  por los tests .mjs). `draftToSheetRow`: Asignación = [lead, ...especialistas] para missingRequired.
- task-card: chip "Lead" (single, leadsPool por track) + "Especialistas" (multi, especialistasPool).
  ChipKey add "lead". (El pool YA trae `role` — filtrar por rol+track.)
- Tests test-lib: literales de TaskDraft add `lead`; caso construirTarea con lead → es_lead.
- RIESGO: es el path crítico de creación → hacerlo con la suite verde como gate (test-db + test-lib).


## 🟢 ACTIVE (2026-08-21) — TRACK A: live-test go-live Fases 2/3/4 en prod
Go-live LIVE; Pedro logged in as master. Verificar los flujos construidos+reapeados end-to-end
en producción (RLS aún abierta a propósito — el hardening es Track C, después). DONE = cada fase
observada funcionando en vivo + verificada en la DB; cualquier bug → fix + lección.

**Fase 4 — Marca CRUD (Admin → tab "Marcas") — ✅ PASÓ (2026-08-21):**
- [x] CREAR (happy): Test QA creada; VERIFY DB OK (client=DiDi, slug `test-qa`, 0 refs).
- [x] GUARD borrar (negativo): borrar **Card** (34 snippets) → refusado; Card intacta en DB. ✅
- [ ] UNIQUE (opcional, no corrido): crear "Card" duplicada → "Ya existe…". (skip, no crítico.)
- [x] BORRAR (happy): Test QA borrada; VERIFY DB: DiDi de vuelta a 2 (Card, Préstamos). ✅
- [x] Gate admin (`getViewAs`) lee master autenticado como admin — confirmado (crear/borrar pasaron).
- [x] BUG UX pescado+arreglado+shipped [257c3fe]: dos papeleras idénticas por fila (quitar-logo vs
      borrar-marca) → quitar-logo pasó a ✕ en la miniatura; 1 papelera = borrar marca. Lección logueada.
**Fase 4 — User mgmt (Admin → tab "Equipo") — ✅ PASÓ (2026-08-21):**
- [x] add/edit/delete happy path — Pedro lo verificó él mismo (Test Persona, sin problemas).
- [~] Guards cross-role ("sólo master edita/borra admin") + historial ("tiene trabajo → desactiva"):
      CODE-VERIFIED (leí ambos guards en la función, no sólo el botón). Live-verify en TRACK C
      ("verify from the user's seat") — necesita 2º asiento admin (Nils) o historial sembrado.
- Nota: roster real = Runna Advertising (master, Pedro) + Nils Vera (admin, nils@runna.com.mx) —
  Pedro añadió a Nils a propósito (no es gap del reset).
**Fase 3 — Brief fail-safe:** crear brief nombrando agency-person que no existe → prompt de alta + email.
**Fase 2 — Client onboarding (el grande):** /portal/login pide acceso → aprobar en Admin →
magic-link → clic → aterriza ligado al portal del cliente correcto. Usar cliente de PRUEBA.
Guardrail: NO invitar clientes reales hasta terminar Track C (RLS lockdown).

## 🔒 (2026-08-21) Portal cliente = master+admin only (Pedro) — EN CURSO
El item "Portal" del sidebar (`/{slug}/portal`) NO es preview — es el portal FUNCIONAL
del cliente (fijar/quitar/enviar cambios). Pedro no quiere que un usuario de agencia actúe
"como el cliente" por accidente. La preview ya existe (Vista cliente/editor en la tarea).
- Decisión Pedro: dejar acceso a **master + admin** (quitar a **lead**); gatear server-side.
- HALLAZGO: el write-path YA está a salvo — las 3 acciones del portal
  (`clienteFijar/Quitar/EnviarCambios`) exigen `esSesionDelCliente()` = `role==='client'`
  + clientId==slug → un rol de agencia (incl. master/admin) NO puede escribir como cliente.
  Y la PÁGINA ya gatea con `canSee(role,'portal')` (server component) → quitar 'portal' de
  lead cierra nav + ruta de una.
- [x] roles.ts: quitar 'portal' de `lead` (master/admin siguen por NAV_ALL; client intacto).
- [x] Vista de agencia READ-ONLY (Pedro: master queda TOTALMENTE abierto para reproducir quejas):
      `puedeActuar = master || (client && suyo)` calculado en page.tsx → pasa a PortalTarea →
      (a) provider `editable = puedeActuar && published` (apaga select→cambio), (b) PortalAcciones
      barra de sólo-lectura si `!puedeActuar`. Server: `esSesionDelCliente`→`puedeActuarComoCliente`
      (permite master) en las 4 acciones. Neto: lead/creative fuera · admin VE read-only · master +
      client actúan. tsc/lint OK. Falta live-verify: master full (Pedro), admin read-only (Nils).

## 📥 (2026-08-21) Notion → Legales (sync + reglas + H.Ü.E) — APROBADO, en PoC
Fuente: página Notion (NO database) "Legales DiDi Préstamos & Card"
(id `201724f6-221e-8045-ace4-db7b6e590863`), conexión "Greenlight" (read-only) ya la comparte.
Es TEXTO → pull = PARSEAR bloques, no query. Estructura (de screenshots de Pedro):
2 toggles de marca (DiDi Préstamos / DiDi Card) → cada legal es un label subrayado + su cuerpo.
Los 5 legales + su trigger:
  P1 Préstamos general (Consulta) · P2 Préstamos promoción (*Aplican; trigger: promo)
  C3 Card general (Consulta; trigger: ni CASHBACK ni MSI) · C4 Card CASHBACK (*Aplican; trigger: "CASHBACK")
  C5 Card MSI (Aplican SIN *; trigger: "MSI" sin CASHBACK)
⚠️ C3/C4/C5 idénticos salvo las últimas 2 palabras (Consulta/*Aplican/Aplican) + el ASTERISCO
es significativo → pull VERBATIM, preservar `*`, sin "limpieza" de IA (fact-shaped).
Insight: los triggers son DETERMINISTAS (keyword CASHBACK/MSI/promo) → encajan en el motor
`reglas` (cond_texto_contiene + cond_marca_slug); H.Ü.E = red de seguridad, no el decisor.
Fases: A) sync legales→snippets con marca_id. **YA EXISTE** (no construir): el PILL de marca en
Biblioteca (biblioteca-tab.tsx:89-93, hoy ya muestra "Card" en el legal actual), el SELECTOR de
marca en el editor, y el PICKER por-marca en la tarea (page.tsx:305). Lo ÚNICO que falta de A = el
SYNC de Notion (poblar los otros 4 legales con su marca). B) reglas keyword→legal (motor reglas ya
existe). C) H.Ü.E sugiere en casos borrosos, human-confirm. (Opcional: colorear los pills por marca.)
Sync: key estable = notion block/page id (edit→update, no duplica); borrado en Notion→desactivar.
- [x] PoC read-only + verify: parser corrido contra el doc EN VIVO (transpile de notion-legales-parse.ts)
      → 5 legales verbatim (asteriscos/Consulta/*Aplican/Aplican intactos) + 1 nota. Estructura del doc:
      Préstamos anida el cuerpo como HIJO del label subrayado; Card usa bulleted_list_item HERMANO.
- [x] FASE A construida + shippeada (mig 0043 `notion_block_id` aplicada; parser puro + fetch server-only;
      `sincronizarLegales()` upsert por block-id + desactiva removidos, no toca los manuales; botón
      "Sincronizar" en Integraciones; `notionConfigurado`=Boolean(NOTION_TOKEN)).
      PENDIENTE: (a) Pedro añade NOTION_TOKEN a Vercel; (b) click Sincronizar en prod → verificar 5
      legales en DB; (c) desactivar el manual dup "Legal CAT — Card"; (d) Fase B (reglas keyword→legal), Fase C (H.Ü.E).
      ✅ (a) NOTION_TOKEN en Vercel + sync corrido: 5 legales verbatim en DB (marca correcta, asteriscos intactos).
      ✅ (b) verificado en DB. (c) dup "Legal CAT — Card" desactivado.
- [x] FASE B construida + shippeada: `legalSugerido()` puro (clasifica por título Notion, orden msi→cashback,
      determinista) + banner "Sugerido · Adjuntar" en la Cortinilla (Card: CASHBACK/MSI/general; Préstamos:
      general + promo como alternativa humana). Suggest-not-auto (compliance). Verificado logic vs 5 títulos reales.
- [x] BIBLIOTECA: opción de BORRAR legal (hard delete) con guarda de uso (bloquea si está en N tareas) + confirm.
      Nota: un legal de Notion re-aparece en el próximo sync (borrar también en Notion para retirarlo).
- Pendiente Fase C (H.Ü.E red de seguridad para casos borrosos) — futuro.

## 👥 (2026-08-21) Asignación de 2 niveles (lead + especialista) — EN CURSO
Modelo (Pedro): el sheet trae el LEAD (a futuro sólo el lead). El lead luego elige
especialista(s) del pool DENTRO de la plataforma. Esquema YA lo soporta:
`idea_assignments.es_lead` (bool) + role + assigned_by; la página de tarea ya lee es_lead.
Bug de raíz: el picker de Asignación sale de `vocab.ts ASIGNACION` (lista HARDCODEADA de 14
nombres pre-reset) en vez del pool vivo (`track_members`) → nadie real hace match → "no asignado".
Decisiones Pedro: (1) leads NO se auto-crean — si el nombre del sheet NO hace match con un lead
del pool → tarea se crea IGUAL marcada "sin lead" (manual), NO bloquea. (2) matching INTELIGENTE:
"Nils" (sheet) = "Nils Vera" (plataforma); insensible a acento/caso; SÓLO si es inequívoco.
- [ ] FASE 1 (sync/import.ts, acotado): pool con role+es_lead; matchLead inteligente (exact/prefix/
      token, unambiguous); match→es_lead=true+assigned_by; sin match→crear igual sin lead; dejar de
      bloquear por Asignación (sólo en el path de sync; ALWAYS_REQUIRED queda igual + su contract test).
      ASUNCIÓN a confirmar en test: lead pool = role lead/admin/master o es_lead (Nils=admin califica).
- [ ] FASE 2: retirar vocab.ts ASIGNACION → picker in-task del pool vivo; el lead asigna especialistas (es_lead=false).




## 📊 CONSTRUIDO (2026-08-20, 2º) — Evaluación: desglose POR BRIEF [Pedro, mockup aprobado] — SIN pushear
Sobre la Evaluación v2: la nota mensual ahora se desglosa POR BRIEF. Persona → abre → una nota por
brief (Cal/Efi/Overall) → abre un brief → sus criterios + las TAREAS de las que salió (chip rojo=con
notas, verde=limpia) + proceso del brief. SIN migración, SIN captura nueva (la tarea ya sabe su brief).
- [x] evaluacion.ts: extraído `puntuar(ideaIds,...)` (reusa el modelo binario+Eficiencia); IdeaInput +=
      briefId/briefLabel/code; tipos Puntaje/BriefEval/TareaEval; EvalMiembro += `briefs` (mensual =
      promedio ponderado por nº de tareas de los briefs → RECONCILIA). La mensual reusa `puntuar`.
- [x] performance/data.ts: ideas query += brief_id/naming_base/code; carga etiquetas de briefs (helper
      briefLabelDe); IdeaInput con briefId/briefLabel/code.
- [x] evaluacion-board.tsx: detalle de persona = "Nota por brief" (BriefRow colapsable) → criterios +
      chips de tarea (TareaChip) + proceso. El header de persona sigue con Calidad/Eficiencia/Overall.
- [x] Tests: asserts de brief (Ana 2 briefs bfV 9.2 / bfP 10; Caro 1 brief == mensual; conNotas/code).
- Gates: tsc·eslint·build·lib 356. NO se verificó en browser (el board necesita datos reales del mes
  para el desglose; lógica cubierta por tests). PENDIENTE "ship it" (sin migración → sólo push).

## 📊 CONSTRUIDO (2026-08-20) — Evaluación v2: Resolución + Eficiencia [Pedro, diseño aprobado] — SHIPPED 5d30cba
Gates VERDES: tsc·eslint·build·lib 342·db 246 (migración 0040 aplica limpia en PGlite). Todos los
asserts nuevos pasan (Ana 9.6/Beto 9.2/Caro 7.4 recomputados a mano y verificados). Reap: edge cases
OK (sin-autor→no penaliza · aplicado-sobre-client_change→ignorado por el grade · aplicado-sin-atender→
no cuenta · curvas clamp sin negativos). PENDIENTE "ship it" (migrar 0040 ANTES del push).
Grade en DOS ejes: **Calidad** (avg de 9 criterios binarios = 8 de contenido + "Resolución") +
**Eficiencia** (de rondas + cambios/ronda). **Overall = 0.70·Calidad + 0.30·Eficiencia**.
Decisiones de Pedro: Resolución binaria · atribuida al autor de la nota · sólo cuenta cuando el lead
APLICA la sugerencia de H.Ü.E sobre una nota ya atendida (no el veredicto crudo) · peso 70/30.
- [ ] **Migración 0040**: `comments.hue_aplicado_at timestamptz` (aditiva, sin backfill). PGlite test.
- [ ] **aplicarSugerencia** (validar-actions): tras el write del campo, sella `hue_aplicado_at=now()` en
      la corrección (best-effort; no bloquea el apply).
- [ ] **evaluacion.ts**: CorreccionInput/Atribuida += `reworkFallido` (hue_aplicado_at && atendido_at);
      criterio sintético "Resolución" (grupo nuevo "proceso"): por tarea, si alguna nota del autor tuvo
      reworkFallido → 0, si no → 10. Calidad = avg de los 9. Eficiencia = avg(score_rondas, score_cambios)
      con curvas ajustables (1 ronda=10, -3/extra; ≤2 cambios/ronda=10, -2/extra). Overall = 70/30.
- [ ] **tipos-cambio.ts**: GrupoCriterio += "proceso" + GRUPO_LABEL/TONO. (Resolución NO es una categoria
      que el revisor elige — es sintética; ScoreCriterio.slug pasa a string.)
- [ ] **performance/data.ts**: cargar hue_aplicado_at + atendido_at en las corrs → reworkFallido.
- [ ] **evaluacion-board.tsx**: fila "Resolución" en su grupo + mostrar Calidad · Eficiencia junto al Overall.
- [ ] **database.types.ts**: comments += hue_aplicado_at.
- [ ] Tests: lib (Resolución 0/10, curvas de Eficiencia, blend 70/30) + db (columna). Gates tsc·eslint·build.
- Nota: captura going-forward — Resolución = 10 para todos hasta que se apliquen H.Ü.E fixes (no es bug).
- PENDIENTE "ship it" → aplicar 0040 (`npm run migrate`, pin ybbrpqzbedaxsmotgtkh) ANTES del push.


## 🎨 CONSTRUIDO (2026-08-20) — Rediseño nav del portal del cliente [Pedro, mockup confirmado] — SIN pushear
Pedro dio 3 screenshots como TARGET (el 4º es referencia del espacio desperdiciado). Consolidar la
navegación de briefs/tareas en un HEADER STICKY compacto y usar ANCHO COMPLETO. Gates tsc·eslint·build
verdes. Verificado LIVE en browser (/didi/portal): nav sticky renderiza, dropdown "Ver detalle de tareas"
abre y muestra la tabla Estado·Tarea navegable, pager 1/2 + flechas, ancho completo, 0 error de consola.
- [x] **PortalNav (nuevo `portal-nav.tsx`, sticky top-16 z-30, ancho completo, UNA fila con overflow-x)**:
      logo + "Portal de Revisión" + dropdown de Brief (agrupado por mes con brief_date) + dropdown "Ver
      detalle de tareas" (tabla Estado·Tarea del brief, navega, cierra al elegir) + dropdown Filtro (funnel:
      Todas/Por revisar/En cambios/Aprobadas con conteos) + flechas ← N/M → (prev/next por la lista
      FILTRADA del brief; "– / N" si la abierta no está en el filtro). Popovers (shadcn/radix) controlados.
- [x] **Ancho completo**: portal-shell `max-w-5xl mx-auto` → `w-full` + padding. El (app) layout main NO
      tiene max-w; el cliente NO tiene sidebar → ancho de viewport completo (el admin sí ve sidebar en el
      preview, por eso mide ~1048 ahí). La columna del guión queda ~930px → su 2-col interno la mantiene
      legible; sólo ultrawide querría un cap (follow-up opcional).
- [x] **Restack sticky**: PortalNav top-16 z-30; PortalAcciones (Barra) → top-[7.5rem] z-20; panel de la
      tarea (portal-tarea) → lg:top-[11.75rem]. Bleed -mx-4/6/8 iguala el padding full-width.
- [x] **portal-data.ts**: PortalBrief += `date` (brief_date) para agrupar por mes.
- [x] Quitado el bloque viejo (header + pills de brief + TareaLista) — la lista vive ahora en el dropdown.
- Sin migración, sin cambios de datos server (sólo +date en el mapeo). PENDIENTE "ship it".

### Review (rediseño portal)
- Deuda menor: nav en móvil usa overflow-x scroll (una fila) — las flechas pueden quedar tras scroll en
  pantallas muy angostas; el portal se revisa sobre todo en desktop. Cap de columna de lectura sólo si
  Pedro lo pide para ultrawide. La etiqueta del brief usa el label existente (no el "DD/MM for <mes>" del
  mockup) — enriquecer es follow-up si lo quiere. Offsets sticky verificados a 1400px; re-mirar en móvil.


## 🔧 CONSTRUIDO (2026-08-20) — H.Ü.E: persistencia de Aplicar + compactar cambios + caching [Pedro] — SIN pushear
Tres cosas de la sesión de Pedro sobre "Revisar cambios con H.Ü.E". Gates VERDES (tsc·eslint 0-err
en archivos tocados·build·tests 44 pass). Smoke-verificado live: la página de tarea hidrata con el
nuevo anidamiento (panel "Control de Cambios" + botón H.Ü.E renderizan, CERO error de useWorkspace)
→ el swap de providers funciona en runtime. Aceptación de Pedro pendiente en el deploy (click de
Aplicar + correr H.Ü.E: no drivables en localhost — sin ANTHROPIC_API_KEY + handlers React flaky).
- [x] **1. Aplicar NO reinicia los demás veredictos.** Root cause: `aplicarSugerencia` termina en
      `window.location.reload()` → borra el Map `veredictos` (estado React) → hay que re-correr H.Ü.E
      (llamada pagada) tras cada Aplicar. FIX: parchear el campo EN MEMORIA (no reload). El
      CorreccionesProvider hoy envuelve al WorkspaceProvider (no puede `useWorkspace`) → **invertir el
      anidamiento en page.tsx** (Workspace afuera, Correcciones adentro, key=idea.id en Workspace).
      Luego `aplicarSugerencia(correccion, textoNuevo)`: server write → `setPlanos/setEstatico` del
      campo (`[targetCampo]=textoNuevo`) + quitar SÓLO su `aplicar` del veredicto (los demás intactos).
      Sin reload. Esto además ELIMINA las re-corridas redundantes = el mayor ahorro real de costo.
- [x] **2. Compactar cambios en el panel interno (panel.tsx).** Resueltos (atendido/confirmado) →
      pastilla compacta (label + veredicto + badge, 1 fila, click para expandir). Abiertos (rojo) →
      expandidos, pero sólo los PRIMEROS 5; el resto también compacto. Toggle manual `alternados`
      (XOR con el default, patrón de `colapsadas`) + chevron para re-compactar. Componente
      `TarjetaCompacta`. Sólo panel interno (el portal ya colapsa rondas + el cliente ve su pedido).
- [x] **3. Prompt caching en validarCambios.** Mantiene Sonnet 5 (la calidad es el punto: detectar el
      error nuevo es-MX; Haiku degrada justo ahí; ~1-2¢/llamada). Split del user content en
      [instrucciones estables + cache_control][bloques variables] → cachea el prefijo estable (tools +
      instrucciones) sin cambiar NI un byte del prompt tuneado. thinking sigue disabled.
- Gates: tsc·eslint(0 err en tocados)·build·tests 44. Smoke live OK. NADA a prod sin "ship it".

### Review (2026-08-20)
- No migración, no secreto nuevo. Mismo modelo de auth (aplicarSugerencia ya gateaba canOverrideStatus).
- El swap de providers (Workspace afuera) espeja al portal (que ya lo tenía así) → estructura probada.
  Beneficio extra: Correcciones ahora vive en el subtree con key=idea.id → sus veredictos se resetean
  por tarea (antes el provider exterior persistía entre tareas por nav client-side).
- Caching: si el prefijo estable no llega al mínimo cacheable del modelo, es no-op silencioso (sin error)
  — nunca empeora. El mayor ahorro real es el fix #1 (mata las re-corridas por reload).
- Deuda menor (opcional): misma técnica de caching en ortografia-actions y extraerGuion (mismo patrón),
  no tocadas — bajo volumen. Compactación del panel del PORTAL: follow-up si Pedro lo pide.

## 🔎 REAP full del flujo H.Ü.E (2026-08-20 pm) — Pedro: "Aplicar no mostró el cambio" [FIX-FIRST, SIN pushear]
Pedro probó Aplicar en prod: los demás veredictos SÍ sobrevivieron (fix #1 previo OK) pero el texto NO
apareció en el campo. Reap adversarial (Opus, subagente) sobre TODO el flujo validar→aplicar→display.
Root cause del reporte + 1 CRITICAL + varios SERIOS. Gates: tsc·eslint(0 err en tocados)·build verdes.
Smoke live: la página de tarea hidrata sin error (panel + botón H.Ü.E + toggle Vista; 0 error de hook/
useWorkspace en consola). Aceptación de Aplicar/H.Ü.E = Pedro en el deploy (sin API key local + clicks flaky).
- [x] **S1 (root cause del reporte) — el editor no repintaba.** `Campo` es uncontrolled (siembra su
      textarea una vez con `useState(valorInicial)`); parchear `ws.planos` no lo repinta, y como el tecleo
      reescribe `ws.planos`, un keystroke posterior lo revertía. FIX: nonce `reseed` por campo en el
      workspace (`bumpReseed`) → al aplicar sube y fuerza el REMOUNT sólo de ese `<Campo>` (key=nonce) →
      re-siembra `valorInicial` con el texto nuevo. La Vista cliente (CampoLectura) ya lo reflejaba sola.
      Esto TAMBIÉN mata el **falso auto-conflicto** que halló el reap (el remount deja `guardado`=texto
      nuevo = DB, así el compare-and-set del autosave ya no dispara "alguien más cambió este campo").
- [x] **CRITICAL — `aplicar` era un overwrite de TODO el campo, a ciegas y sin guarda.** El lead sólo veía
      la sugerencia de UNA línea, no el texto completo que se escribía → podía normalizar `$999`, tirar un
      legal `*` o reescribir cláusulas intactas de un clic. FIX (prompt + guarda determinista + humano):
      (a) el panel ahora MUESTRA el texto completo ("El campo quedaría así:") antes de Aplicar; (b) guardas
      en el parse: negrita perdida→null, contiene "(campo vacío)"→null, longitud >8000→null; (c) el prompt
      pide conservar `**` exactos. (Números/legales legítimamente cambian → no se pueden hard-guardar; los
      cubre el preview humano.) [[prompt-plus-deterministic-guard]]
- [x] **S2 — negrita borrada.** `aplicar` se generaba desde `sinNegrita` → perdía `**`. FIX: H.Ü.E ve el
      texto CON `**`, instrucción de conservarlos + guarda (a) de arriba.
- [x] **SERIO — write de 0 filas reportaba ok.** `aplicarSugerencia` (action) no tenía `.select()` ni check
      de filas → si el plano se borró, update tocaba 0 filas, error=null, "aplicado" en falso. FIX:
      `.select("id")` + error si `!escritos.length`.
- [x] **SERIO — compactación XOR posicional.** `alternados` (XOR contra un default que depende de la
      posición entre los 5) colapsaba sola una tarjeta expandida a mano al confirmar otra. FIX:
      `expandidoManual: Map<id,bool>` = intención ABSOLUTA (no XOR).
- [x] **MENOR — chip veredicto stale**: al aplicar se marca `hecho:'si'` (no sólo `aplicar:null`) → el chip
      no queda en "no parece hecho" contradiciendo. **MENOR — round bucketing**: null-ronda internas van a
      la ronda ACTUAL (no la 1). **MENOR — respuesta no parseable** → error (no "no hay pendientes"). **MENOR
      — revalidatePath** por patrón. **MENOR — estático**: patch en memoria sólo si `id` coincide.
- Deuda anotada (no arreglada, baja prob): de-dupe de ids de veredicto duplicados (el Map se queda con el
  último) — el subagente lo marcó baja probabilidad; si algún día pega, de-dupe/rechaza ids repetidos.
- PENDIENTE "ship it".



## 🔒 LAUNCH-HARDENING SET (activar cuando entre AUTH_ENABLED) — de la revisión de roles 2026-08-19
El modelo de roles es coherente A NIVEL rol, pero dos intenciones son sólo FILTROS de vista,
no permisos — hoy no muerde (app abierta a propósito), pero hay que volverlas reales al encender auth.
- [ ] **Gap 1 — Especialista = sólo sus tareas asignadas** es hoy sólo filtro de LO QUE VE. Las acciones
      de escritura (guardarCampo/borrarPlano/importar, start/submit_review, marcar atendido) gatean por
      `canMoveStatus` (cualquier interno), NO por `isAssignee`. Un especialista puede editar/mover una
      tarea que NO es suya si llega por URL. → hacerlas assignee-aware.
- [ ] **Gap 2 — Lead = DEPARTAMENTAL** [DECISIÓN Pedro 2026-08-19]: un lead sólo es dueño del trabajo de
      SU track; los aprobadores agency-wide son los ADMINS. Hoy aprobar/mandar-cambios/enviar-cliente y
      el tablero/briefs son agency-wide (isLead/canOverrideStatus sin scope). → scopear por track, igual
      que ya lo hace `tracksVisibles` en Evaluación. Admin/master siguen agency-wide. (Ver lessons.md.)
- [ ] **Security batch (diferido de la reap)** — server actions que confían sólo en el gate de página:
      sync/*, importRows, crearBrief (¡manda emails!), snippets de admin (texto legal global), lecturas de
      admin. Re-chequear rol server-side. Priorizar crearBrief + snippet legal (efectos reales ya hoy).
- Nota: estas 3 se construyen JUNTO con el login, no antes (añadirían fricción a una app abierta a propósito).



## 📋 PLAN (2026-08-19 noche, 4º) — Reap fixes: Quick wins + Perf + Integrity [Pedro] — SIN pushear
De la reap full-platform (tasks/reap-2026-08-19.md). Pedro eligió 3 de 4 batches (Seguridad diferida).
Orden: código primero (gate+ship), migración al final (PGlite → "ship it"). import.ts se toca UNA vez
(el fix de error tragado se absorbe en el rewrite batched de perf).

### Batch A — Quick wins (sin migración) — ✅ 5/6 (emoji diferido)
- [x] panel-revisiones-cliente.tsx: botón "Ver" (teclado) añadido.
- [x] Confirmación 2 pasos en las 3 acciones destructivas: borrar plano (BotonBorrarPlano),
      Aprobar del cliente (portal-acciones), quitar referencia (RefThumb + group-focus-within a11y).
- [x] topbar.tsx: avatar deriva iniciales de `soy` (ícono neutro sin soy) + aria-label; no más "PV".
- [~] emoji-map: DIFERIDO — parseGuion/parseEstatico/contarPlanos (que el cliente corre en preview)
      llaman a limpiarPegado→emojificar→EMOJI, así que se necesita en cliente; lazy = cascada async en
      funciones puras con test de contrato → no es "quick win", va como tarea propia.
- [x] (app)/error.tsx + global-error.tsx: pantallas de error en español + reintentar.

### Batch B — Perf pass (sin migración) — ✅ (rewrite de import diferido)
- [~] import.ts: rewrite completo del N+1 DIFERIDO (asignación de family/variant es stateful y el
      archivo NO tiene tests → riesgo alto en prod). HECHO en su lugar: `maxDuration=60` en sync/page
      (mitiga el timeout) + CHECK del error del upsert staged_rows (P1b: evita duplicados silenciosos).
- [x] entregas/page.tsx: briefs/idea_assignments scopeados con .in(...) a las ideas cargadas.
- [x] performance/data.ts: filtro ESTADOS_ACTIVOS en SQL (verificado == complemento de TERMINALES).
- [x] referencias-data.ts: createSignedUrls batched (1 llamada) — firmarLote + aVista.
- [x] contexto.tsx: useMemo del value + useCallback en run/validar del CorreccionesProvider.

### Batch C — Correctness/integrity — ✅ S1 + email (migración 0039 + PGlite); S2/S3 diferidos
- [x] S1: migración 0039 — trigger BEFORE DELETE en planos/estaticos borra correcciones ancladas
      huérfanas (desbloquea el cierre de ronda). PGlite test añadido (test-db 245 pass).
- [x] Email double-send: claim atómico en dispatchPendingEmails (pending→sending con .eq/.in/.select).
- [~] S2: DIFERIDO — es decisión de PRODUCTO (¿las "pedir cambios" de board cuentan en la rúbrica y bajo
      qué categoría?). No cambiar scoring sin decisión de Pedro.
- [~] S3: DIFERIDO — advisory lock exige recrear VERBATIM 3 RPCs de lifecycle (0010/0034/0038) para
      añadir 1 línea; race de baja probabilidad (equipo interno). Va como migración propia con test de
      concurrencia, no apurada dentro de 0039.
- Gates: tsc·eslint·build·lib 328·db 245·isolation 38. PENDIENTE "ship it": aplicar 0039
      (`npm run migrate`, pin ybbrpqzbedaxsmotgtkh) ANTES del push del código.


## 🔧 CONSTRUIDO (2026-08-19 noche, 3º) — Vuelta al cliente: "cambios listos + dónde se hicieron" [Pedro] — SIN pushear
Pedro: hizo el flujo, envió los cambios de vuelta al cliente, pero en el portal se ve SIN distinción
— debería decir "cambios listos para revisar" y mostrar CLARAMENTE dónde se hicieron. Hoy: la tarea vuelve
como `published` (idéntica a una nueva), y el portal sólo carga/pinta los pins BORRADOR (ronda null) →
los cambios ya atendidos (ronda!=null, closed) desaparecen. El cliente queda adivinando. Scope elegido:
FULL MIRROR (estado + banner + resaltado a nivel campo + panel read-only). SIN migración (los datos existen).
- [x] portal-data.ts: PortalTarea += `reReview` (lista); cargarPortal cuenta client_change aplicados por idea.
      TareaPortal += `revisiones: Correccion[]` (ronda!=null, closed, con target); cargarTareaPortal carga+mapea.
- [x] Ctx (contexto.tsx): += `revisiones?` + `revisionesDeCampo?` (opcionales; provider interno los omite).
- [x] correcciones-cliente-provider.tsx: acepta+expone revisiones/revisionesDeCampo.
- [x] campo-lectura.tsx: fila con revisiones → acento verde + chips "Cambio(s) que pediste — aplicado(s)"
      (reusa patrón chipHuerfana + tarjeta flotante); tarjeta variante read-only "Aplicado" (estado closed, cliente).
- [x] panel-revisiones-cliente.tsx (NUEVO): panel read-only colapsable, agrupado por ronda, Ver→salto+flash.
- [x] portal-acciones.tsx: prop `reReview`+`nRevisados` → copy "El equipo aplicó los N cambios que pediste…".
- [x] portal-shell.tsx: estado "Cambios listos" (verde CheckCheck) para published+reReview (vs "Por revisar").
- [x] portal-tarea.tsx: pasa revisiones al provider + renderiza panel (gated published) + reReview a la barra.
- [x] Reap (Opus) FIX-FIRST: **S1 divergencia de filtros** — el badge `conRonda` (lista) era MÁS LAXO que
      `revisiones` (vista): sin `resolved_at`/`target_campo` → un client_change legacy sin target (0036) en una
      idea published encendía "Cambios listos" pero la tarea abría VACÍA. Arreglado: mismo predicado exacto en
      ambas queries. (Set de fuga en prod hoy = 0 filas, pero la divergencia era real.) Resto del reap: limpio.
- [x] Gates: tsc·eslint·build verdes. Verificado LIVE en la tarea real DiDi/SPAPVOYSHOPPINGFUT (Plano 3·SFX):
      badge "Cambios listos", banner, panel Ronda 1 «canción chida»→Aplicado, chip verde en el campo. 0 errores consola.
- PENDIENTE: "ship it" para pushear (sin migración).

## Review (2026-08-19, 3º)
- Deuda: el badge de la lista ("Cambios listos") deja las tareas en el filtro "Por revisar" (bucketDe no
  distingue reReview). Aceptable — igual necesitan revisión. Si se quiere un filtro propio, es follow-up.
- Deuda arrastrada: page.tsx (tareas internas) aún tiene firma de refs inline → migrar a lib/referencias-data.ts.
- El banner de la barra de acción es `hidden sm:block` (móvil lo oculta); el panel carga el mismo mensaje y NO
  se oculta en móvil, así que el cliente móvil igual lo ve. Intencional.

## ✅ SHIPPED (2026-08-19 noche, 2º) — H.Ü.E analiza cambios del cliente + badge color de marca [Pedro] — commit d5bfb2c
Pedro corrigió mi decisión de "sin veredicto para cliente" (ver lesson). Sin migración.
- [x] validar-actions.ts: `.or(correction_request OR (client_change AND ronda not null))` → H.Ü.E analiza
      también los cambios del cliente. Verificado live: la query trae el client_change + las 2 internas.
- [x] VeredictoChip se muestra para cliente también (panel/campo/campo-lectura; antes gateado a !cliente).
- [x] BadgeCliente usa `color` = clients.brand_color del cliente (DiDi #ff6b1a naranja); threaded via
      CorreccionesProvider.marcaColor (page.tsx carga brand_color por slug). Fallback a --primary si null.
- [x] Gates: tsc·eslint·build. .or verificado contra prod (3 filas: 2 correction_request + 1 client_change con ronda).
- [x] SHIPPED: commit d5bfb2c, deploy Vercel success (sin migración).

## ✅ SHIPPED (2026-08-19 noche) — Cambios cliente first-class + lista colapsable + refs en portal [Pedro] — commit d70c73f (mig 0038 en prod)
Construido + reap (Opus) FIX-FIRST (3 SERIOS + 3 MINOR) + gates verdes. NO commiteado; migración 0038 SÓLO PGlite (falta "ship it" para aplicarla a prod).
- [x] Task 1 lista colapsable (portal-shell).
- [x] Task 2 client_change first-class: migración 0038 (ronda=marcador enviado; correction_next_round/
      rpc_task_approve/rpc_task_send_corrections/rpc_task_return_review cuentan client_change enviados;
      submit asigna ronda no resuelve; data-migration SCOPEADA a tareas activas). Código: revert aislamiento,
      client_change en `correcciones`, BadgeCliente, descartar/confirmarCampo incluyen client_change.
- [x] Reap FIX-FIRST: **S1** send_corrections/return_review no contaban client_change → botón "Pedir cambios"
      del lead reventaba (arreglado + test PGlite). **S2** clienteQuitarCambio usaba resolved_at→ronda.
      **S3** data-migration resucitaba tareas terminadas → scopeada a in_corrections/under_review. M4 doc,
      M5 notif, M6 drafts fantasma (portal query .not target_campo is null).
- [x] **Referencias en el portal** (Pedro): portal-data.ts carga+firma refs (helper nuevo `lib/referencias-data.ts`);
      portal-tarea.tsx las pasa (antes `{}`/`[]`). El cliente ve imágenes/videos de referencia.
- [x] Gates: tsc·eslint·lib 328·db 239·build. cliente-feedback.tsx borrado (muerto).
- PENDIENTE: (a) "ship it" → aplicar 0038 (`npm run migrate`, pin ybbrpqzbedaxsmotgtkh) ANTES del push; (b) verificar live.
- DEUDA: page.tsx aún tiene su copia inline de firma de refs → migrar al helper `referencias-data.ts` (post-reap).

## (histórico) plan — Cambios del cliente = correcciones de PRIMERA CLASE + lista colapsable [Pedro OVERRIDE]
Ver PEDRO_OVERRIDE en lessons.md. Pedro: los client_change deben tener el MISMO lifecycle interno
(atendido→confirmar→gate→rondas), única diferencia = badge "Cliente". Decisión: **lifecycle sí, Evaluación NO**
(sin categoría, no puntúa). Y la lista de tareas del portal COLAPSABLE.
- [x] **Task 1 — lista colapsable** (portal-shell.tsx TareaLista): toggle de colapso, muestra "revisando X"
      al plegar. tsc+lint ok.
- [ ] **Task 2 — client_change first-class**:
  - CLAVE: `ronda` = marcador draft/enviado (null=borrador, asignada=enviado) → libera `resolved_at` para el
    lifecycle (antes rpc_client_submit_changes ponía resolved_at=enviado → chocaba con "confirmado").
  - **Migración 0038** (PGlite ANTES de prod): (1) correction_next_round cuenta `correction_request OR
    (client_change AND ronda is not null)`; (2) rpc_task_approve resuelve ambos; (3) rpc_client_submit_changes:
    seleccionar drafts por `ronda is null`, asignar `ronda=correction_next_round` (una vez), NO tocar resolved_at,
    mover published→in_corrections; (4) data-migrate: client_change existentes con resolved_at set → asignar ronda
    + limpiar resolved_at (re-entran OPEN).
  - **Portal** (portal-data.ts): query de drafts `resolved_at is null` → `ronda is null`.
  - **Revertir mi aislamiento** (code): client_change vuelve al array `correcciones` (cliente:true), estado por
    timestamps; QUITAR cambiosClienteCorr/max-resolved-at + la tarjeta ClienteFeedback (ahora en el panel).
    contexto.tsx quita cambiosCliente/merge. campo.tsx quita csRev (vuelve a cs; badge "Cliente" en hover).
    campo-lectura.tsx quita exclusión de huerfanas + la rama read-only → acciones completas + badge. panel.tsx
    badge "Cliente" donde va la categoría. correcciones-actions.ts: descartar/confirmarCampo incluyen client_change.
  - VERIFY: PGlite (round-calc+approve+submit con client_change) + tsc/lint/build + reap adversarial + live.
  - Reglas: migrar SÓLO tras "ship it"; `npm run migrate` (pin ybbrpqzbedaxsmotgtkh); drop firma vieja si cambia args.


## ✅ CONSTRUIDO (2026-08-19 pm) — Correcciones a la derecha + cambios cliente resaltados + fixes [Pedro] — SIN pushear
Construido + reap adversarial (Opus) FIX-FIRST + gates verdes. NO commiteado/pusheado (falta "ship it").
- [x] #4 Panel de correcciones en columna DERECHA fija (2-col, `mostrarPanel ? grid : ""`, aside
      `lg:sticky lg:top-32`, stack en móvil). page.tsx.
- [x] #1 Cambios del cliente RESALTADOS en el plano (rojo): `cambiosCliente` aparte → `deCampo` los
      mezcla sólo para display; flag `cliente:true`; FUERA del gate/lifecycle (`csRev`). ClienteFeedback
      reubicado a la derecha + clicable (salta al campo). campo.tsx / campo-lectura.tsx / cliente-feedback.tsx /
      contexto.tsx / correcciones.ts / page.tsx.
- [x] #2 Bug scroll portal: PortalAcciones `top-0 z-30` → `top-16 z-20` (chocaba con el Topbar de la app).
- [x] #3 Mock del riel denso (15+ tareas): artifact **8d889afb** (Opción A grid / Opción B lista+filtros).
- [x] Reap (Opus) → FIX-FIRST: **S1 (serio)** cambios de cliente de rondas pasadas reaparecían como rojos
      permanentes (query sin scope de ronda) → filtrado a `max(resolved_at)` = ronda actual. **M2** non-inline
      CampoCorrecciones cs→csRev. **M3** pin badge/aria cs.length→csRev.length. **M4** excluir cliente de
      huerfanas + comentario. Todo verificado limpio: gate de aprobación NO incluye cliente; única acción
      destructiva (setEstado) inalcanzable sobre cliente; portal client sin regresión; layout sin clip.
- [x] Gates: tsc · eslint 0-err · lib 328 · db 234 · build.
- [x] SHIPPED #4/#1/#2 (commit e43b29e → main, sin migración). Pedro "ship it".
- [x] #3 riel: Pedro eligió **Opción B** (lista/tabla) → CONSTRUIDO en portal-shell.tsx (TareaRail→TareaLista:
      una fila por tarea estado·nombre·acción, encabezado fijo, filtro por estado, sin scroll horizontal).
      Gates tsc·eslint·build. Se pushea con "ship it and option B".

## (histórico) plan — Correcciones al lado del guión + fixes de UX
Pedro (feedback en live + aprobó un mockup: artifact 541fe65d). Cuatro cosas:
- **#4 Panel de correcciones a la DERECHA** (no al fondo): la página de tarea interna
  pasa a 2 columnas — documento (izq) + `PanelCorrecciones` FIJO (der, sticky), stack
  en móvil (desktop-first). Clic en corrección → salta+flash del campo (ya existe verCampo).
- **#1 Cambios del cliente RESALTADOS en el plano**: hoy `client_change` sólo sale como
  tarjeta arriba (ClienteFeedback) SIN ubicación. Fix: cargar los target_* del client_change,
  mapearlos a Correccion (kind='client_change', estado rojo), y ALIMENTAR `deCampo` con un
  ARRAY SEPARADO (no el de reviewer) → resaltan inline GRATIS. NO entran al gate/conteo de
  aprobación (que sólo cuenta reviewer correction_request). Panel: sección "Del cliente"
  (coral, sin acciones de lifecycle). Hover card: rama cliente (sin confirmar/descartar/categoría).
- **#2 Bug de scroll en el portal**: la barra sticky (PortalAcciones) se encima del contenido
  al hacer scroll. Fix CSS (z-index/width/bg). Archivo: portal-acciones.tsx / portal-tarea.tsx.
- **#3 Mock del riel denso** (15+ tareas): subagente en paralelo → HTML → publico artifact.

Piezas #1/#4: `correcciones.ts` (Correccion += kind; color cliente) · `contexto.tsx`
(cambiosCliente + merge en deCampo) · `page.tsx` (cargar target_* de client_change + 2-col
+ quitar ClienteFeedback redundante) · `panel.tsx` (sección cliente) · `campo-lectura.tsx`
(hover card rama cliente) · `campo.tsx` (verificar overlay pinta marcas cliente).
Reglas: key={idea.id} en providers (lección route-param) · NO tocar el gate de aprobación ·
reap adversarial antes de shippear · NADA a prod sin "ship it".
Verificación: tsc·eslint·lib·db·build + render-proof + navegación (route-param).



## ✅ SHIPPED (2026-08-19 pm) — Negrita en el guión pegado (bold detection) [Pedro "ship it"]
Commit **1750def** → push a main (auto-deploy Vercel). SIN migración. Verificado
antes de pushear (tsc · eslint · lib 328 · db 234 · build · 2 render-proofs react-dom/server).
Aceptación real PENDIENTE de Pedro en el deploy live: pegar un guión con `**…**` →
negrita en Vista cliente + portal; y confirmar que el editor muestra los `**` literales.
- [x] `src/lib/negrita.ts`: `partirNegrita` (runs por marcadores) · `sinNegrita` · `desmarcarNegrita`
      (texto limpio + rangos de negrita en coords limpias — base del fix S1).
- [x] `guion.ts` `limpiarPegado`: conserva negrita a mitad de línea, des-negrita el andamiaje
      inicio-de-línea, `__x__`→`**x**`. HEADER sin cambio (el andamiaje llega des-negritado).
- [x] `linkify.tsx`: `linkificarTexto()` + `<TextoRico>` (negrita+links) + `<Negrita>` (sólo negrita).
- [x] `documento-tarea.tsx`: pretty→`<TextoRico>`, DialogoContenido→`<Negrita>`, header→`sinNegrita`.
- [x] `campo-lectura.tsx`: TODO el modo interactivo en espacio LIMPIO (desmarcarNegrita) + negrita
      por RANGO (pintarNegrita) → resaltados de corrección NUNCA parten un par `**` (fix S1).
- [x] `ortografia-actions.ts` + `validar-actions.ts`: `sinNegrita()` antes del prompt (texto y cita).
- [x] `actions.ts` `extraerGuion`: prompt conserva `**`; `sinInventar(sinNegrita(limpio), sinNegrita(extraido))` (fix M2).
- [x] Tests: fixtures de negrita en guión + partirNegrita/sinNegrita/desmarcarNegrita.

### Review — reap adversarial (Opus) sobre el diff → FIX-FIRST
- **S1 (SERIO, arreglado + probado)**: correcciones ancladas por offset partían el par `**` en el
  portal del cliente (dejaban `**` literales + perdían la negrita en precios/ofertas). Fix: anclar el
  modo interactivo en espacio limpio + negrita por rango. Probado: `<mark><strong>$46,800</strong></mark>`,
  cero `**` en 3 escenarios (frase completa / subset / adyacente).
- **M2 (menor, arreglado)**: el `*`-budget de `sinInventar` se aflojaba con los `**` → contar sobre
  `sinNegrita`. **M3 (menor, NO arreglado)**: `__x__`→`**x**` false-positive en `foo__bar` literal —
  raro en copy es-MX y NO es regresión nueva (el código viejo también lo maltrataba). Aceptado.
- Verificación prod-safe (sin tocar prod, sin preview): componentes reales renderizados con
  `typescript` + `react-dom/server`. Patrón nuevo para verificar render cuando el preview falla.
- **Limitación conocida v1 (aceptada)**: (a) una línea de CONTENIDO que empieza con palabra en negrita
  pierde esa negrita inicial (heurística inicio-de-línea); (b) si el revisor selecciona en el EDITOR
  (textarea crudo) una frase INCLUYENDO los `**`, esa corrección no resalta en Vista cliente (degrada
  sin fugar `**`). Casos raros; el humano revisa la vista previa/campo.
- PENDIENTE de Pedro: **"ship it"** (migración: ninguna). Aceptación real = pegar un guión con
  `**…**` en el deploy live → negrita en Vista cliente + portal. Y confirmar en el editor que los `**`
  se ven literales (por diseño).

## (histórico) plan original — Negrita en el guión pegado
Pedro: al pegar el guión en "Pegar guión", parte del texto viene con marcadores
literales `**…**` (p. ej. `**$46,800 m.n.**`). Hoy `limpiarPegado` los BORRA
(guion.ts:82). Objetivo: conservarlos como markdown, y renderizarlos en **negrita**
en las vistas de lectura/cliente. Decisiones de Pedro (esta sesión):
- FUENTE: los `**` ya vienen como caracteres literales en el pegado (NO es formato
  rico de Google Docs) → se DESCARTA la captura de `text/html` en onPaste.
- SCOPE: TODOS los campos de texto del documento (planos + estático).
- MODELO: `**…**` viven DENTRO de los campos de texto existentes (SIN migración).
  Negrita real en vistas de lectura/cliente; las cajas de edición muestran los `**`
  literales (un textarea no puede pintar media-negrita — límite del navegador).
  H.Ü.E ve el texto con los `**` quitados para no descuadrar sus guardarraíles.

**Piezas:**
- [ ] `src/lib/negrita.ts` (NUEVO, puro): `partirNegrita(texto)` → runs {texto,fuerte};
      `sinNegrita(s)` → quita `**`. Sin deps (test node + bundle-safe).
- [ ] `src/lib/guion.ts` · `limpiarPegado`: dejar de borrar `**`; normalizar `__x__`→`**x**`.
      HEADER tolera `**` inicial (un "Plano N" en negrita NO debe perder el plano).
- [ ] `src/components/ui/linkify.tsx`: extraer `linkificarTexto()`; `<TextoRico>` (negrita+links)
      y `<Negrita>` (sólo negrita). Server-safe.
- [ ] `documento-tarea.tsx`: pretty → `<TextoRico>`; DialogoContenido → negrita;
      encabezado del plano → `sinNegrita` (display only).
- [ ] `campo-lectura.tsx`: cada segmento → `<Negrita>` (cliente/revisor ven negrita real).
- [ ] `ortografia-actions.ts` + `validar-actions.ts`: `sinNegrita()` al texto ANTES del prompt
      (evita que el `*`-counting de fixSeguro y la IA se confundan — lección brain-recall).
- [ ] `actions.ts` `extraerGuion`: instruir al extractor que CONSERVE `**bold**`
      (limpio ya trae `**`; `sinInventar` sigue OK por submultiset).
- [ ] `scripts/test-lib.mjs`: actualizar el test que esperaba borrar `**`; añadir fixture con
      negrita real (partirNegrita, parseGuion conserva `**`, `__`→`**`, sinNegrita).

**Verificación:** tsc + eslint + `npm run build` + `npm test`. DOM: pegar fixture con
`**$46,800 m.n.**` → cajas de edición muestran `**` → importar → `<strong>` en Vista
cliente + portal (querySelector, no innerText — preview flaky). Reap adversarial del diff.
**Limitación conocida (v1, aceptada):** si una ETIQUETA o un CUE de locutor viene TODO
en negrita (`**Copy in:**`, `**Actor:**`), la detección estructural puede fallar — lo caza
la vista previa humana. El caso real de Pedro es negrita en VALORES (mitad de línea), OK.

## ✅ SHIPPED (2026-08-19) — Portal v2 + H.Ü.E v2 + perf [Pedro]
Commits c90b17b, 6903b48, a6237f5, 8282125, fd25f99 → main. Migración **0037** en prod.
- Perf loader de tarea (batch queries + parallel signed URLs) + H.Ü.E en barra sticky.
- H.Ü.E v2: aparece al revisar (no atado a "sin cerrar"), valida la ronda completa,
  chips verde/ámbar/rojo con razón+**sugerencia** al hover, detecta cambio-hecho +
  problema-nuevo-introducido. Huérfanas confirmadas = "✓ Ya confirmado".
- Portal: cambios LOCALIZADOS del cliente (select→escribe, sin tipo) + botón sticky
  Aprobar⇄Pedir cambios + fallback emoji + **riel visual** de tareas + efectos.
- CampoLectura compartido con rama `esCliente` (ruta revisor byte-preservada, re-verificada).
- **CONFIRMADO en live (2026-08-19)** — las dos pendientes:
  (1) H.Ü.E «elementos»: da `parcial` (ámbar) + razón + sugerencia exacta "usa el elemento importante"
      (bug viejo 'no' resuelto). Pedro ACEPTÓ ámbar ("keep it") — NO tunear a 'si' (ver lección 08-19).
  (2) round-trip cliente: PROBADO en prod con txn rolled-back (DO+raise) → published→in_corrections
      + client_change creado+resuelto, 0 persistido. UI DOM-verificado la sesión pasada; puppeteo de
      clicks no fiable (limitación de herramienta, logueada) → se probó el DATA path en prod.
- Siguiente si Pedro quiere: empujar más el riel (tarjetas más grandes / thumbnails /
  más motion). Login sigue siendo el bloqueador para LIVE (binding cliente↔sesión).


## ✅ SHIPPED (2026-08-17 pm) — Workspace WYSIWYG unificado (Fase 1) [Pedro]
Commits 0004dbb→eb99971 (4), pusheados a main → deploy 54ih2ey18 **Ready** en prod.
Verificado en prod (curl): "Documento de la tarea" + "Ver como cliente" + "Diálogos"
×14 sirviéndose. UN documento que se ve como el slide del cliente pero editable EN SU
LUGAR (agencia); toggle "Editar / Ver como cliente" (lectura oculta vacíos, formatea
diálogo) reemplaza el preview lateral chico. `documento-tarea.tsx` nuevo + `Campo`
variante `inline` (conserva autoguardado/conflicto/correcciones). Iconos por sección:
motion AZUL / diálogos NARANJA. El resto de la página (Reglas/Nota/Pegar/Cortinilla/
cabecera/runna-details) quedó IGUAL.
- Reap adversarial (FIX-FIRST → resuelto): HIGH legales_extra sin onCambio (arreglado);
  LOW focus tapaba resaltado + scrollbar-gutter (arreglados); pin NO se recorta (confirmado).
- PENDIENTE (scope Fase 1, para el portal/Fase 2): "ver como cliente" NO muestra aún
  la Cortinilla en formato cliente ni oculta la Nota interna — es preview parcial; la
  vista cliente 100% aislada es el portal. Dead code para limpiar luego: `voz()` sin
  llamadas, `PreviewSlide` component sin render (sólo tipos), `referencia_url` legacy.

## ✅ SHIPPED (2026-08-17 pm) — H.Ü.E chequeo ortografía/gramática es-MX [Pedro]
Commits fb81ff8/edaf383/b25792f → main → deploy kc8aguhjt **Ready** en prod. Al clic en
"Mandar a revisión": H.Ü.E revisa los campos (es-MX, Sonnet tool-use), si hay errores
abre un diálogo con cada error + fix; "Aplicar" hace find-replace anclado + guardarCampo;
SIEMPRE hay "Enviar de todos modos" (surface + override, nunca bloquea). Sin clave/DB →
degrada a enviar directo. `src/lib/ortografia.ts` (guard `fixSeguro`, 15 tests) +
`ortografia-actions.ts` (revisar/aplicar) + `dialogo-ortografia.tsx` + intercept en
acciones-tarea.tsx.
- Verificado contra API real: 5 fixes es-MX correctos, "6% de CASHBACK*" intacto.
- Reap (FIX-FIRST → resuelto): HIGH fixSeguro comparaba dígitos pelados → aceptaba
  mover el punto decimal (1.5%→15%, $60,000→$60.000); ahora compara tokens numéricos
  CON separadores (+3 tests). LOW auth: aplicarOrtografia ya gatea rol + valida tabla.
- Guardarraíl: números (con separadores) + legales (* % $) intactos; legales_extra y
  cortinilla EXCLUIDOS del chequeo; el humano hace clic para aplicar.
- PENDIENTE menor (aceptado por diseño): reemplazo de 1ª ocurrencia (self-heal para
  typos repetidos); cross-instance del botón top+bottom = 2× llamada posible (envío
  idempotente server-side). Campo aplicado no se refleja en el editor hasta recargar
  (Campo es uncontrolled) — el fix SÍ se guardó; el envío se lleva la tarea igual.

## 🔜 CANDIDATOS (post estas 2 features, sin comprometer)
- Portal del cliente (Fase 2): "ver como cliente" 100% aislado (render de cortinilla en
  formato cliente + ocultar Nota interna) → ruta del portal + login + client_change.
- Limpieza: `voz()` sin uso, `PreviewSlide` component muerto (sólo tipos), `referencia_url`
  legacy no se muestra en el doc.
- (viejos) Slack notif · Notion sync · prefs notif por-usuario · legal de Préstamos.

## ✅ HECHO — H.Ü.E como EXTRACTOR format-agnostic (Opción 1) (2026-08-17)
Construido y verificado (tsc + build + 236 tests limpios). Pedro lo prueba en prod.
- `extraerGuion(texto)` (server action) reemplaza a `normalizarGuion`: usa Sonnet 5
  con tool-use forzado (`emitir_planos`, schema de 7 campos) → devuelve `PlanoParsed[]`
  ESTRUCTURADO (no texto con saltos). Lee CUALQUIER formato (tabla, bullets, screenplay,
  labels distintas, deck sin saltos) y lo mapea a los campos del plano.
- Guardarraíl `sinInventar(entrada, extraído)` en guion.ts: cada letra/dígito/marca
  (* % $) del extraído debe existir en la entrada (SUBMULTISET, no igualdad — el
  extractor descarta rótulos, así que el contenido es subconjunto). Caza inventar/
  cambiar/expandir; OMITIR lo caza la vista previa humana. (Distinto de `mismoContenido`,
  que exige IGUALDAD para el normalizador structure-only, ya retirado.)
- Cliente: el botón "Deja que H.Ü.E lo lea" ahora aparece también cuando el parser
  determinista saca 0 planos (formato desconocido), no sólo cuando perdió saltos. La
  vista previa que viene de H.Ü.E muestra una nota persistente: "revisá que no haya
  omitido nada". Determinista-primero sigue: el parser plano maneja el deck sin IA.
- PENDIENTE (Pedro): probar en prod contra varios formatos reales. Requiere
  ANTHROPIC_API_KEY (ya en Vercel; falta en .env.local para probar en localhost).



## 🚀 CAMINO A LIVE (aclarado con Pedro 2026-08-13)
Modelo: TODO es pre-launch salvo el **portal del cliente**, que es lo ÚLTIMO que se
construye antes de lanzar (depende de que el lado-agencia esté 100% listo). Luego
**login**, luego go-live. Orden agencia-side → portal → login → live.
- [x] **Workload** (antes "Carga"): tablero de capacidad por persona (estado+cliente).
      SHIPPED 4203559. (Pedro pidió el label en inglés "Workload".)
- [x] **Entregas** (agency-side v1): SHIPPED 5abbe88. Tablero global que consolida los
      2 stubs → una sección `/entregas` (GENERAL). Rastrea lo `published` (Con el
      cliente / En cambios / Entregado) por cliente. FALTA (con el portal): subdividir
      "Con el cliente" en revisando/aceptó — los estados finos los produce el portal.
- [x] **Portal del cliente** (ÚLTIMO pre-launch): el cliente ve lo `published`, pide
      Revisión/Cambios/Aprobado; alimenta el tablero de Entregas. SHIPPED.
- [x] **Login** — ✅ **SHIPPED + LIVE 2026-08-20** (commit 3918960 go-live + 3dd1b13
      copy). Google OAuth (equipo @runna.com.mx) + magic-link aprobado para clientes;
      identidad real (profiles→track_member) reemplazó los shims soy/view-as;
      AUTH_ENABLED=true en Vercel; migs 0041/0042 aplicadas; reset blank-slate corrido.
      Pedro entró como master (unique@runna.com.mx) y verificó login end-to-end.
      **PENDIENTE próxima sesión: correr el test en vivo de las Fases 2/3/4**
      (aprobar cliente→magic-link→binding portal · brief fail-safe · marca/user CRUD).
- [ ] Dato: **legal de Préstamos** (sólo Card sembrado; lo da Pedro, no inventar).
- POST-LAUNCH (no bloquean): **Copies** template (Pedro: post-launch) · Slack notif ·
  prefs notif por-usuario · F6 Notion (bloqueado en token) · API/MCP tokens.



## 🎨 IN PROGRESS (2026-08-12) — Design God Mode pass (Pedro: full pass = A+B+D)
4-dimension audit done via parallel agents (color/contrast, consistency, motion, typography).
Scope chosen: contrast fixes + unified <Pill> + motion. Dark-mode (C) deferred.

**Phase A+B — color/pill layer — ✅ SHIPPED (ff20540, live p69irdwen):**
- [x] globals.css: `--status-warning` (light+dark) + `--deck-blue/--deck-orange`
- [x] `src/components/ui/pill.tsx` — un componente: soft (tinte+tinta+punto) | solid (parSolido, AA garantizado, maneja hex Y var()) | status (darkened+blanco)
- [x] Convert name pills (ChipPersona), channels, avatars (perfil/actividad), equipo chip, notif count, asset-type panel gradients, deck bands (oscurecidas), status badges (bundle-card + board), amber-*→--status-warning
- [x] VERIFICADO en vivo: page de tarea 16→0 fails medibles; tablero AA; tsc+build
**Phase D — motion — ✅ CASI COMPLETO (e96902f, 57e8648):**
- [x] Keyframes gl-rise-in/gl-pop/gl-enter · autosave indicator (fade+auto-dismiss+✓) · pin de corrección pop · planos nuevos gl-enter
- [x] Tooltip delay 0→200ms · board drag pickup scale-1.03 · chevron rotante en rondas
- [ ] PENDIENTE (único): kill 2× reload()→optimistic insert (state plumbing, riesgo medio — el reload igual funciona con gl-enter). Board "landing confirm" opcional.
**Mobile nav — ✅ SHIPPED (57e8648):** <SidebarNav> reusable + <MobileNav> (hamburguesa + Sheet lateral) en la Topbar. Verificado a 375px.
**Type — ✅ COMPLETO:** [x] textarea 13→14px · [x] 8px→10px floor · [x] `.gl-eyebrow` en los 2 close-matches (los ~58 restantes tienen tamaños variados a propósito)
**Color menor — ✅:** [x] botones de corrección (Confirmar/Pedir cambio/Fijar) oscurecidos a AA. Pendiente opcional: unify DRY de los color-maps de correcciones (ya pasan AA).
**Headings — ✅:** [x] cada página con <h1> real (h2→h1); [x] h3/h4 mal usados como micro-labels → <p>.

### 🎨 DESIGN PASS COMPLETO (2026-08-12/13, live). Commits: 09b60f4→e3f3d10.
Contraste (Pill unificado, 0 AA fails en workspace) · motion (indicador, pin pop, enter,
tooltip, drag, chevron, reload→optimista) · mobile nav (hamburguesa+Sheet) · tipografía/
headings. Único opcional restante: DRY de color-maps de correcciones (cosmético).

## 🚧 IN PROGRESS (2026-08-11 pm) — "Pegar guión" importer (Feature 2)
Deck-script paste → parse → editable preview → confirm → atomic write. Both video
(N planos) y estático (fila única). Diseño: parser DETERMINISTA (verbatim) +
normalizador con IA guardado (structure-only) para el caso sin saltos de línea.
Respeta el PEDRO_OVERRIDE del parser: formato DEFINIDO + preview-then-confirm, no
adivina; campo no encontrado → blank.
- [x] **Paso 1 — parser** `src/lib/guion.ts` (parseGuion/parseEstatico/contarPlanos/
      mismoContenido). Gold test contra la muestra REAL de Pedro (6 planos DiDi).
      Mapeo: CTA→copy_in, Copy in múltiples unidos, dialogo→"(Quien) texto". Commit 4c0b068.
- [x] **Paso 2 — RPC + actions** mig 0030 `rpc_import_planos` (replace/append, atómico,
      read_time por trigger) + importarGuion/importarEstatico. 11 db tests. Commit e787157.
- [x] **Paso 3 — UI** `pegar-guion.tsx` (diálogo + preview editable + radio replace/append)
      montado en editor-tarea.tsx. Aviso de pegado-sin-saltos. Commit 21ac7e4.
- [x] ✅ **SHIPPED** (Pedro "apply + ship"): mig 0030 aplicada a prod — **S.P.A.M
      byte-idéntico 42/31/6**, GL ledger 28→29, RPC + grants live. Push a main →
      deploy Ready. RPC verificado en prod end-to-end (txn con rollback, 0 residuo).
- [x] **Paso 4 — normalizador con IA** (commit 8c113cf): botón "Arreglar con IA" →
      normalizarGuion (claude-sonnet-5, thinking off) re-inserta SÓLO saltos de línea +
      guardarraíl `mismoContenido` (rechaza si cambió cualquier carácter no-espacio) →
      re-parseo determinista. Dep `@anthropic-ai/sdk`; `ANTHROPIC_API_KEY` en .env.local.
      Verificado en vivo contra la API real (guard PASA, 6 planos, copy intacto).
      ⚠️ FALTA: (a) el "ship it" de Pedro para pushear; (b) agregar ANTHROPIC_API_KEY al
      env de Vercel (sin ella el path de IA en prod degrada a "no configurado").
- [ ] **Estático**: parser PROVISIONAL — falta la muestra real de estático de Pedro
      para fijar el gold test.



## ✅ DONE (2026-08-11 pm) — Descartar una corrección fijada (revisor cambió de opinión)
Feature 1 del next-session-prompt. Design locked with Pedro: **hard delete**, **anytime**,
behind a **two-step inline confirm**. NOT deployed yet — awaiting Pedro's "ship it".
- [x] Server action `descartarCorreccion(ideaId, commentId)` en `correcciones-actions.ts`
      — reviewer-only (`canOverrideStatus`), hard delete scoped by id+idea_id+kind (mirror `borrarPlano`).
- [x] `descartar(id)` wired into `CorreccionesProvider` context (toast "Corrección descartada").
- [x] Panel: reviewer-only **Descartar** (Trash2, `ml-auto`, destructive-ghost) → two-step
      confirm "¿Descartar? · Sí, descartar (danger) · Cancelar (autoFocus = safe default)".
      Added `tone="danger"` + `autoFocus` to `BtnAccion`.
- [x] DB test (test-db.mjs): delete self-heals — deleting one of two open keeps the round
      (no spurious bump); deleting the last open leaves 0 unresolved (button reverts, no strand).
- [x] Reap (5-pass): 1 a11y fix applied (autofocus the safe option). No other findings.
- [x] Gates: tsc clean · eslint clean (only pre-existing line-86 ternary warning) ·
      `npm test` 183+191+44 pass (incl. 4 new) · `npm run build` OK.
- [x] Live render check on task A12 (seeded 1 correction, panel + Descartar trigger render for
      reviewer, then cleaned up → A12 back to 0). ⚠️ Click-through NOT drivable: browser MCP can't
      reach React handlers this session (even the pre-existing round-collapse toggle didn't respond;
      read_page/screenshot blank). Interaction is trivial useState; logged the tooling limit in lessons.md.
### Review / follow-ups
- No migration (hard delete). No new secret surface. Same auth model as siblings (service-role + role gate).
- Descartar shows for the reviewer on ALL states (open/done/closed) per the "anytime" decision.
- Discard doesn't notify or move state (by design). Round math + morphing button self-heal on refresh.

## 🔨 IN PROGRESS (2026-08-10) — Correcciones localizadas + rol specialist_lead
Design locked with Pedro via clickable mockup (scratchpad/correcciones-mockup.html).
Building to a PREVIEW deploy (frontend on Vercel preview URL). DB migrations are
ADDITIVE to `produccion` only (S.P.A.M `public` untouched) but hit the shared LIVE
project → apply ONLY after Pedro's explicit "apply it".

DONE means: a Dept Head/Lead can pin a change to an exact field (plano/estático/
cabecera); the specialist sees it in-context (pin + hover/tap tooltip) and in a
grouped "Correcciones" panel with red/amber/green state; specialist marks
atendido → "Devolver a revisión" (notifies the lead); lead confirms each green;
button morphs Mandar-a-correcciones → Aprobar → Enviar a cliente (two-step);
`specialist_lead` role can assign but not review. Verified live, S.P.A.M 42/31/6.

- [x] **Mig 0027** (own file): `app_role += 'specialist_lead'` (written, PGlite-tested)
- [x] **Mig 0028**: comments target cols, `in_corrections→under_review` transition,
      `is_team()` += specialist_lead, rpc_add_correction (round calc),
      rpc_task_send_corrections, rpc_task_return_review, grants (PGlite-tested)
- [x] PGlite tests (round calc, two-sided state, new transition, notify, is_team) — 178 db pass
- [x] database.types.ts (manual): specialist_lead + master + comment cols
- [x] roles.ts: specialist_lead → VIEW_ROLES/labels/hint/NAV(=creative)/canAssign ONLY
- [x] brand.ts ALLOWED_TRANSITIONS += in_corrections→under_review (contract test caught the drift)
- [x] Server actions: agregarCorreccion, setEstadoCorreccion, confirmarCampo,
      mandarCorrecciones, devolverARevision
- [x] UI: lib/correcciones.ts + CorreccionesProvider + CampoCorrecciones (pin/tooltip/
      composer/confirmar) + PanelCorrecciones + morphing AccionesTarea + Devolver
- [x] tsc clean, build clean, 176 lib + 178 db pass, page smoke-tested (renders + UI mounts,
      graceful pre-migration)
- [x] Adversarial reap (subagent) — found 5 real + 1 pre-existing win, ALL fixed + regression-tested:
      (1) correction_next_round could return NULL via legacy board path → coalesce+scope+stamp ronda;
      (2) Aprobar left amber corrections unresolved forever → rpc_task_approve now closes the round;
      (3) no reopen for a confirmed correction → panel Reabrir for revisor on closed;
      (4) client_change latent desync → round calc scoped to correction_request + TODO;
      (5) master excluded from isLead (no "Enviar a cliente") → fixed. 182 db pass.
- [x] ✅ Applied Mig 0027+0028 to live `produccion` (Pedro "apply it" 2026-08-10). S.P.A.M
      byte-identical 42/31/6; GL ledger 25→27; enum + 4 comment cols verified live.
- [x] Live verification: inserted 3 test corrections (red/amber/green) on a real task,
      confirmed render + measured contrast in-browser, then DELETED them (comments back to 0).
- [x] CONTRAST PASS (Pedro flagged readability): amber aligned to --status-progress token;
      fixed a white-on-white hover (Confirmar btn); switched status badges to solid darkened
      pills + white text (colored-text-on-same-hue-tint failed AA — chips lesson); measured
      every element — all corrections elements now 4.5–13.2 (only the app's own muted eyebrow
      text is <4.5, app-wide & pre-existing).
- [x] Frontend PREVIEW deployed: https://runna-command-center-89pq973fn-pedros-projects-c43384db.vercel.app
      (Vercel SSO-protected — opens for Pedro). Prod untouched (no git push).
- [x] ✅ SHIPPED (Pedro "ship it" 2026-08-10): committed dfad2aa + pushed origin/main →
      Vercel auto-deployed prod. New code LIVE (prod SSR serves the panel + field anchors);
      no secret leak (service key + gmail pw both 0 in served HTML). Full flow verified live
      via PostgREST (14/14: mandar→devolver→pin→atendido→confirmar→aprobar).
- [x] Demo seeded on task SPAPFISHFILTER (31a14ee5, set to under_review, 3 [DEMO] corrections
      red/amber/green) so Pedro can SEE it in prod. REVERT PENDING: on "revert the demo" →
      delete [DEMO] corrections + restore status to in_progress (its original).
- [ ] Fill team emails in /admin ▸ Equipo so correction notifications actually send (today empty → skipped).
- [x] ✅ SHIPPED (a1c2fdc): Greenlight-branded NEON notification email (email-template.ts):
      navy wordmark header, per-type neon chip+accent (aprobada = logo green #00e676 on a dark
      pill so it glows like the wordmark — Pedro's pick "A"), chip text auto-picked by measured
      contrast, UTF-8, message box. Smart CTA: task emails → the specific task; brief → /mi-trabajo.
      Full send path verified live end-to-end (gate → routing → send → marked sent → cleaned up).
- [ ] Fill team emails in /admin ▸ Equipo so notifications actually send (today empty → skipped).

## 🔨 IN PROGRESS (2026-08-11) — Correcciones ancladas a SELECCIÓN de texto
Plan aprobado: /Users/work/.claude/plans/question-for-the-changes-glowing-hopper.md
Fidelidad "B" (Pedro): ancla = quote snapshot + resaltado en vivo best-effort (mirror
overlay) que se apaga al editar. Aditivo sobre las correcciones por-campo.
- [x] Mig 0029: comments += target_quote/target_start/target_end; rpc_add_correction extendido
      (DROP firma vieja de 9 args primero) + grants. PGlite test (187 db pass).
- [x] Tipos: CorreccionTarget/Correccion/database.types/page.tsx select/agregarCorreccion +
      helper puro resaltadosEnTexto (best-effort re-find). 183 lib pass.
- [x] UI: captura de selección (onSelect/mouseup/keyup) + popover "Pedir cambio aquí" +
      compositor con el quote; mirror overlay <mark> por estado detrás del textarea
      transparente (scroll-sync); quote en tooltip/panel. Desktop-first; botón de campo se queda.
- [x] tsc + build clean; page render smoke (graceful pre-migration, sin crash).
- [x] Reap adversarial — limpio en lo grande; 4 fixes aplicados: (1) mandar los params del
      quote SÓLO si hay quote (desacopla el path de campo-entero de la migración → no rompe si
      se despliega antes); (2) tinte read-only sólo si !hayResaltado (twMerge lo tapaba); (3)
      scrollbar-gutter:stable en textarea+mirror (alinea el <mark> con scrollbar); (4) botón de
      selección movido a top-left z-30 (no choca con la barra de campo). Todo verde.
- [x] ✅ SHIPPED (Pedro "apply it" + "ship it" 2026-08-11): Mig 0029 aplicada a live ANTES del
      push (S.P.A.M 42/31/6; GL 28; 1 sola rpc_add_correction, sin overload). Commit 1e2fb7d
      pusheado. Verificado END-TO-END EN PROD (runna-command-center.vercel.app): el <mark>
      resalta «6% de CASHBACK*», panel muestra el quote, best-effort drop al editar. Datos de
      prueba limpiados (copy_in restaurado, 0 correcciones). Feature LIVE.
- [ ] (follow-on, Pedro also asked) nicer Runna/Greenlight-branded notification
      email w/ CTA button to /mi-trabajo — AFTER corrections flow


Full plan: /Users/work/.claude/plans/flickering-plotting-brook.md (approved 2026-07-30)
Pipeline: lead intake → execution workspace (script editor) → lead review + Gary check → client portal (publish/approve) → delivery.
DB: S.P.A.M Supabase project `ybbrpqzbedaxsmotgtkh`, dedicated schema `produccion`. Migrations schema-scoped, tested locally first. NEVER touch `public` (live S.P.A.M).

## P0 — Scaffold ✅ DONE (2026-07-30)
- [x] Next 16.2 + TS + Tailwind v4 + shadcn/ui (radix base, lyra preset) at /Users/work/Projects/runna-command-center
- [x] @theme tokens in globals.css (Poppins/Inter/Geist Mono; status colors; pleca TT black/FB blue/GG green; type static light purple/normal dark purple/real DiDi orange; dark-ready)
- [x] Supabase client/server/proxy helpers scoped to `produccion` schema; middleware→proxy (Next 16 convention); dev-degrade when no env
- [x] Shell: deep-navy sidebar (dynamic client-section nav) + topbar; /clientes selector; /[cliente]/tablero placeholder (5-status colors verified); /login placeholder
- [x] Runna logos in public/brand; build clean; verified in browser (desktop + mobile)
- [ ] DESIGN.md file (tokens are in globals.css; formal DESIGN.md deferred to start of P1)
- [ ] Google OAuth wiring (needs Supabase env + auth.users verification) → P1
- [ ] Mobile nav toggle (Sheet) — sidebar hidden on mobile, no opener yet → P3
- [ ] .env.local not created (only .example) — needs real anon/service keys before any query

## P1 — Schema ✅ DONE (2026-07-30)
- [x] Migration 0001_init.sql: schema `produccion`, 9 enums, 25 tables (clients/marcas/briefs/waves/families/ideas/planos/assets/asset_versions/idea_assignments/snippets/references/vocab/size_platform_validity/comments/gary_reviews/status_events/activity/notifications+deliveries), indexes, per-table updated_at triggers, idea.code trigger, filename builder + trigger
- [x] 3 naming formulas (Real/Normal/Static) as build_filename(): NA-genero omission, static-no-duration, colon→x, version→filename, validated override, fixed RN
- [x] Migration 0002_rls_and_rpcs.sql: auth helpers (JWT-claim based), RLS on all 25 tables (team read + guarded write, client hard-scoped to published+own client), RPCs (rpc_generate_assets w/ validity matrix, rpc_submit_version, rpc_request_correction), status transition guard + status_events/activity logging, planos read-time trigger
- [x] Size↔platform validity as its own table (not vocab meta — sizes carry ':' which vocab CHECK forbids)
- [x] Roles: admin/lead/creative/delivery/client
- [x] seed.sql: 5 pods, 25 vocab, 17 validity combos, 3 snippets (anti-copy-paste), demo team + brief/family/idea/3 assets across statuses
- [x] TESTED: scripts/test-db.mjs via PGlite (no Docker) — 29 assertions pass (naming contract, RPCs, transitions, RLS enforcement). `npm run test:db`
- [x] src/lib/database.types.ts (hand-maintained until real gen)
- [ ] NOT DONE (needs live DB / Pedro): push migrations to remote (gated by "ship it"); verify S.P.A.M auth.users; real `supabase gen types`; seed real auth.users for team; delivery lock UI + notification enqueue (deferred to P4/P5 where those flows live)

## P2 — Lead intake ✅ DONE (2026-07-30)
- [x] 4-step intake wizard (src/components/intake/intake-wizard.tsx): Brief → Familia → Variante → Entregables, with stepper + draft state
- [x] Peloteo paste-parser (src/lib/peloteo.ts + peloteo-paste.tsx): live split into 7 fields, accent-insensitive headers, keeps inner ':'; raw always preserved. HERO moment verified in browser (7/7 detected)
- [x] Asset generator matrix (src/components/intake/asset-matrix.tsx): size×platform grid constrained by validity matrix (invalid combos blocked w/ Ban icon), respects idea's chosen platforms, live filename list. Verified: 3 correct filenames generated
- [x] TS filename builder (src/lib/filename.ts) — CONTRACT-tested vs DB build_filename across 75 combos (0 mismatch) + 16 lib assertions. `npm run test:lib`
- [x] Snippet picker (checkboxes from mock), briefs list page
- [x] Verified full flow in browser (desktop): all 4 steps, both hero moments, success toast, no console errors
- [ ] STUBBED until Supabase: persistence (Crear→toast, will call rpc_generate_assets); reference picker (URL dedupe) deferred to when references table is live; real vocab/marca options (currently MOCK_VOCAB)
- [ ] NOTE: form_input (browser tool) doesn't fire React onChange — use click+type for controlled inputs (logged)

## P3 — Kanban + execution workspace (3d)
- [ ] Kanban 5 states, filters, Realtime, grouped-by-idea cards
- [ ] Script editor: Plano blocks (Acción/Copy/GFX-SFX | Diálogo), hooks, SFX/GFX/EDICIÓN fields
- [ ] Live read-time per plano + total; contextual guideline chips + disappearing placeholders
- [ ] Auto-rendered slide-style preview (pleca view)

## P4 — Review loop (2d)
- [ ] Pre-submit checklist; Gary grammar check (Claude API es-MX, flags, override+log)
- [ ] Lead approve/corrections; V bump; threaded comments/@mentions; Storage uploads

## P5 — Notifications (1d)
- [ ] Outbox + dispatcher (Resend + Slack), cron reminders, client-action notifications

## P6 — Delivery + ops (1.5d)
- [ ] Auto ENTREGA FINAL on upload; delivery verification queue (/entrega-check)
- [ ] /entregas calendar; /carga workload; /admin (clientes/equipo/vocab/snippets)
- [ ] NOTA: los 4 enlaces (/carga, /entrega-check, /[cliente]/entregas, /admin) están marcados `soon: true` en `sidebar.tsx` — se ven "Pronto" y no navegan. Al construir cada página, quitar su `soon: true`.

## P7 — Client portal (2d)
- [ ] Magic-link auth (client role); published-only idea cards; Revisión/Cambios/Aprobado; threaded change requests; per-wave view

## P7.5 — Polish (0.5d)
- [ ] emil-design-eng motion pass; empty states; skeletons

## P8 — Gates + ship (1d)
- [ ] web-design-guidelines audit; huashu 5-dim ≥8/10; pre-delivery checklist; Playwright screenshots; code-reaper 5-pass
- [ ] Verification per plan: contract tests (filenames), RLS tests, RPC tests, 3 Playwright golden paths

## P2 revisions (2026-07-30, Pedro feedback)
- [x] Peloteo: replaced auto-detect parser with DEFINED labeled fields; Peloteo now = free Notas field (PEDRO_OVERRIDE logged)
- [x] Added missing sheet fields: Marca, Brief Name, Drive link, Concepto, Comunicacion, Selling points, Referencias, Duracion, Origen, Comentarios por rol
- [x] Clarified "letra de familia" with inline explainer + auto code
- [x] Tablero responsive: stacks vertically below lg
- [x] Removed dead parser code + tests
- [x] Deployed public prototype to Vercel for team testing
- [ ] Reference picker (URL dedupe) deferred until references table is live

## P2 rebuild — sheet fidelity (2026-07-30, round 2)
- [x] OFFICIAL NAME: Greenlight · by Rünna (renamed across app)
- [x] Extracted REAL dropdown lists from the xlsx data-validation rules (openpyxl) — no guessing
- [x] Real vs Normal track switch as the FIRST choice; drives Asignación / Tipo de Asset / Formato pools
- [x] All 21 sheet columns present with VERBATIM names
- [x] Asignación multi-select w/ sheet colors (Real: 10 people, Normal: 4)
- [x] New vocab discovered: EC platform, "2736 x 1260" size, AIGC video, GIF
- [x] Migration 0003: track_scope vocab, track_members, sheet-accurate vocab, norm_token fix, empty-token guard
- [x] Fixed: Género "N/A" now omitted correctly; hyphenated durations survive; no double underscores
- [x] Fixed: multi-select stale-closure bug (functional updaters)
- [x] Tests: 15 lib + 31 db (incl. 75-combo TS↔DB contract) all green; deployed

## P2 round 3 — answered by Pedro (2026-07-30)
- [x] EC + "2736 x 1260" = special cases, kept OPEN (no size↔platform restriction); rules only enforced for GG/FB/TT
- [x] Two Tipo de Asset validations CONFIRMED in file (rows 2-6 vs 7-22) — Sheets only shows the rule for the clicked cell. Using the full superset.
- [x] "Otro" free-text option added to ALL 8 dropdowns (custom chips, removable, flow into filenames)
- [x] Comentarios Leads stays as 3 fields (Creativo/Producción/Diseño) — confirmed
- [ ] UNVERIFIED: Enter-to-commit on the Otro input (browser tool can't dispatch key events). "Agregar" button IS verified. Test Enter manually in a real browser.

## Sheets sync (2026-07-30)
- [x] Parser + header guard (Google silently serves tab 1 on a bad name — blocked)
- [x] Semantic dedup (natural key + content hash); verified 0 dupes on re-sync
- [x] PROJECT = one tab (track + date). Migration 0005: briefs.track/source_tab/brief_date
- [x] Tab classification: project | template | control | unrecognized (shown, not skipped)
- [x] Apps Script connector (scripts/apps-script/Code.gs), secret via Script Properties
- [x] Project-based sync UI, newest first, verified live: 21 REAL + 11 NORMAL
- [x] Tests: scripts/test-sync.mjs — 40 assertions incl. live fetch
- [ ] PEDRO TO DO: deploy Code.gs on the sheet, set GREENLIGHT_SECRET, give me URL+secret
- [ ] Then: set SHEETS_SCRIPT_URL / SHEETS_SCRIPT_SECRET env, sync lists ALL projects
- [ ] Wire "Crear" to rpc_stage_row + idea creation (needs Supabase env)

## Deploy + security (2026-07-30)
- [x] Vercel prod env: SHEETS_SCRIPT_URL / SHEETS_SCRIPT_SECRET (encrypted, server-only)
- [x] Deployed sync + redesigned editable review cards to prod
- [x] FIXED prod secret leak (config passed as client-component prop → RSC payload)
- [x] Added `npm run check:leak [url]` regression guard; run after every env-touching deploy
- [ ] ROTATE SHEETS_SCRIPT_SECRET — it was publicly readable for ~4 min (Propiedades del script → update → tell me new value)
- [ ] Decide: app is PUBLIC (no auth). Add shared-password gate before wider sharing?

## Supabase LIVE (2026-07-31)
- [x] Migrations pushed to S.P.A.M project, schema `produccion` (29 tables) — S.P.A.M public/auth/history byte-identical before & after
- [x] scripts/migrate.mjs — own ledger `produccion._migrations` (db push unusable in a shared project)
- [x] scripts/check-isolation.mjs — fails build on cross-schema DDL or colliding versions; verified it catches all 4 violation types
- [x] Migration 0006: schema exposed via Management API + GRANTs to API roles
- [x] Seeded: 5 pods, DiDi + marcas, 37 vocab, 14 people, admin profile (bound to Pedro's existing auth account)
- [x] Sync "Crear" writes for real → 2 briefs, 9 familias, 32 ideas, 227 entregables from Brief 24/07
- [x] Dedup PROVEN across sessions: re-sync → "0 nuevas · 32 sin cambios · Todo al día"
- [x] Tablero reads live data — CORREGIDO: 32 tareas (una por fila), no 227; archivos como conteo dentro de la tarjeta (migración 0007)
- [ ] Assignment + drag-to-change-status (next)
- [ ] Client portal + "ver como cliente" for admin
- [ ] Auth stays OFF until pre-launch (Pedro's call; AUTH_ENABLED flag ready)

## Git (2026-08-04) ✅
- [x] `git init` en la carpeta del proyecto — antes todo vivía sin versionar dentro del repo de /Users/work
- [x] .gitignore: `.env*` fuera salvo `*.example`; también `.vercel`, `.next`, `supabase/.temp`
- [x] Verificado que ningún valor de .env.local aparece en los archivos versionados
- [x] 3 commits: init (99 archivos) · migración 0008 · tablero interactivo
- [ ] Crear repo remoto (GitHub) y push — pendiente de decidir cuenta/visibilidad

## Respuestas de Pedro (2026-08-04) — plantillas de trabajo
- **Copies** = temas con cuota. El lead define los temas y cuántos van por tema;
  el copy llena headline + descripción bajo cada uno, con contador por tema y total.
  Sale del Concepto real del sheet: "15 Headlines + descripción (5 por tema: …)".
- **Estáticos** = sólo COPY IN | REFERENCIA/IMAGEN. Los legales y el CTA viven en
  los chips de reglas contextuales, no como campos.
- **Preview** = ambos, en vivo. La persona asignada ve el slide actualizarse
  mientras escribe (panel al lado); el lead también al revisar.

## P3 — Tablero interactivo (2026-08-04)
- [x] Migración 0008: identidad de asignación (track_members.id), multi-persona
      sin rol, vista board_tasks, rescate de Asignación y Marca desde staged_rows
- [x] Asignar personas por tarjeta, pool acotado al track, chips con color del sheet
- [x] Arrastrar entre estados (@dnd-kit — NO estaba instalado, se instaló ahora)
- [x] Columnas ilegales se atenúan al arrastrar; canMove() en TS fijado contra
      transition_allowed() con contract test de 42 pares
- [x] Menú "Mover" además del arrastre (móvil + teclado)
- [x] Filtros: persona, brief, plataforma, marca
- [x] Import arreglado: ya escribe Asignación y Marca
- [x] 0008 aplicada a la base viva (2026-08-04, "deploy it"). Resultado idéntico
      al ensayo: 52 asignaciones en 30 filas, 32 marca_id, 0 sin match.
      S.P.A.M sin cambios: 42 public / 31 migraciones / 6 usuarios auth.
- [x] Verificado en navegador con datos reales y desplegado a producción:
      32 tarjetas (no 227) · A1 = "Flor, Mony" igual que el sheet · mover y
      asignar persisten (probado también CONTRA producción) · pool acotado al
      track · filtros 32 → TT 26 → TT+Card 13 idéntico a SQL · móvil sin scroll
      horizontal · sin secretos en el HTML servido
- [x] Corregidos 2 bugs que sólo se vieron en el navegador: hidratación de
      dnd-kit (id estable) y contraste de los chips (4/10 fallaban AA)
- [ ] **Sin login nadie es lead → ningún movimiento hacia atrás es posible.**
      A1 quedó en "En progreso" de una prueba y no hay forma de devolverlo.
      Cerrar antes de que el equipo lo use (¿"deshacer" explícito, o una
      identidad de lead que no exija login completo?).
- [ ] SIN filtro por pod: 0/32 tareas tienen pod_id y el sheet no trae esa columna.
      Decidir cómo se asigna un pod a una tarea antes de construir ese filtro.

## Flujo por botones + obligatorios (2026-08-04) — construido, SIN aplicar
Plan: /Users/work/.claude/plans/ahora-pregunta-q-opinas-drifting-wolf.md

- [x] `src/lib/required.ts` — obligatorios POR Tipo de Asset (video / images / copies)
- [x] Gate real en `import.ts` (server), checkbox deshabilitado y contador de
      bloqueadas en el panel. Nada se salta en silencio.
- [x] BUG: el importador inventaba entregables (`sizes.length ? sizes : ["9:16"]`)
      → 2 archivos fantasma `SINNAMING_9X16_TEXTO_STATIC_IDEAX1_...`. Copies
      ahora genera 0 archivos y el fallback desapareció.
- [x] Migración 0010: 4 verbos del flujo, fan-out de notificaciones por trigger,
      recipient_member_id, missing_required() espejo, board_tasks.member_ids
- [x] Identidad "Soy X" (cookie servidor, pool del sheet)
- [x] Botones por estado × rol × si es tu tarea; "Mandar cambios" exige texto
- [x] Tarjeta en correcciones: contorno rojo + tag, en SU columna
- [x] `/mi-trabajo` (antes 404) — correcciones primero
- [x] Campanita con contador del servidor
- [x] Tests: 46 lib + 81 db + 44 sync, 0 fallos
- [ ] **BLOQUEADO — faltan aplicar 0009 y 0010 a la base viva.** Hasta entonces
      la app no funciona contra producción (rpc_move_task no existe allá) y no
      se puede verificar en navegador.
- [ ] Después de aplicar: asignar responsable a las 2 tareas de Copies y
      limpiar sus 2 archivos fantasma.
- [ ] Trigger DEFERRED de obligatorios en la BD (migración futura), después de
      limpiar las filas legacy — hoy la puerta está en import.ts.

## Pendiente conocido: crear desde briefs
`intake-form.tsx` NO persiste nada — su onClick sólo hace
`toast.success("… (demo)")`. Pedro pidió obligatorios "desde sincronizar o desde
briefs"; la mitad de briefs no se puede cumplir hasta conectar ese formulario.
Es el momento natural para mover la creación a una RPC atómica (`rpc_create_task`),
que además resolvería el hueco del constraint de Asignación.

## Plantilla de trabajo (2026-08-05) — DESPLEGADO
Plan: /Users/work/.claude/plans/ahora-pregunta-q-opinas-drifting-wolf.md
Deck del cliente (leído entero, 45 slides): docs.google.com/presentation/d/1A65dKEPqURqoXpnNdcCMcpEtrMqBOio0KpHI5Sr1XxU

- [x] Ruta `/[cliente]/tareas/[id]` — la tarjeta del tablero por fin enlaza a algo
- [x] Plantilla de GUIÓN: Plano / Acción / Copy in / SFX / GFX / Edición | Diálogo
- [x] Plantilla de ESTÁTICO: Copy in (Título/Subtítulo/Botón CTA/Legales) | Referencia
- [x] Autoguardado por CAMPO con compare-and-set + resolución de conflicto
- [x] Reglas contextuales agrupadas POR PLATAFORMA (las 7, evaluables)
- [x] Read-time en vivo contra la Duración, con 3 estados
- [x] Preview tipo slide en vivo, pleca de degradado si es multiplataforma
- [x] Migraciones 0011 + 0012 aplicadas. S.P.A.M idéntico (42/31/6)
- [x] Rescatadas 15 referencias que el import venía tirando
- [x] Tests: 70 lib + 111 db + 44 sync
- [ ] **Copies sigue pendiente** — la página lo dice en vez de fingir. No existe
      en el deck (ese slide enlaza a otra hoja), así que sería UI inventada.
      Acordado: temas con cuota, headline + descripción, contador por tema.
- [ ] Curar los 33 selling points sembrados del deck — hay casi-duplicados a
      propósito ("Hasta 6% de CASHBACK*" vs sin asterisco son dos claims).
- [ ] Legales: sólo está el de Card. Falta el de Préstamos.
- [ ] El selector de legales/selling points desde la biblioteca todavía no se
      cablea a la UI (la tabla y las acciones ya existen).
- [ ] `src/lib/vocab.ts` sigue siendo copia hardcodeada de `vocab_terms` — dos
      fuentes de verdad para el mismo vocabulario.

## Parking lot
- Final product name (placeholder: Rünna On Deck)
- Blueprint v2 for team review (Pedro said "not yet" — revisit before launch)
- Dark mode v1.5; Pro upgrade decision when platform grows

## ✅ (2026-08-19 cont2) — Greenlit + Mi perfil al avatar [Pedro] — SHIPPED
- [x] Entregas: "Entregado" → "Greenlit" (Pill neón #00e676 + ✨) + fila con pleca/tinte verde; copys
      de conteo/descripción. (entregas-board.tsx, entregas/page.tsx)
- [x] Mi perfil FUERA del sidebar → menú del avatar top-right (DropdownMenu). canSee(mi-perfil) se
      mantiene para el guard de la página. (sidebar.tsx: quitado item + import UserRound; roles.ts comment;
      topbar.tsx: avatar → DropdownMenu con "Mi perfil").
- [x] Gates tsc·eslint·build·lib 328. Verificado LIVE (Greenlit en Entregas; Mi perfil abre desde avatar).
      PEDRO_OVERRIDE logueado (perfil/cuenta van en avatar, no en nav lateral).

## 📋 PLAN (2026-08-20) — Board lifecycle completo + Entregas archivo [Pedro]
Decisión: keep "Completado"→renombrar "Listo para enviar" (interno, teal, NO verde) + añadir
"Con Cliente" (published, azul #2563a8, drag-lock) + "Greenlit" (delivered ≤7 días, verde neón).
delivered_at YA existe (auto-stamp) → sin migración (verificar que el trigger vigente aún lo estampa).

### Fase 1 — Board (Tablero) ✅ CONSTRUIDO + verificado live (SIN pushear)
- [x] "Completado" → "Listo para enviar" (label del board), TEAL #0d9488 (no verde). boardLabel() helper.
- [x] Columna "Con Cliente" (published), azul #2563a8, drag-lock (useDraggable disabled + sin grip; el
      drop-in sigue = enviar a cliente; menú "Mover" del lead sigue). KANBAN_STATUSES += published,delivered.
- [x] Columna "Greenlit" (delivered), verde neón #00e676, filtro delivered_at ≤7 días (esGreenlitReciente).
      Loader trae delivered_at (query chica, sin migración — la vista board_tasks no lo exponía).
- [x] Auto-colapso de columnas vacías → tira vertical (writing-mode) cuando !dragging; expande al arrastrar.
- [x] Trigger delivered_at: verificado vigente (0009 lo estampa) + prod (1 delivered con fecha, ≤7d).
- [x] Verificado live: 7 columnas, colores exactos, Con Cliente=2 / Greenlit=1, colapso OK. Gates verdes.
- PENDIENTE: "ship it" (sin migración).

### Fase 2 — Entregas como ARCHIVO ✅ CONSTRUIDO + verificado live (SIN pushear)
- [x] Loader (entregas/page.tsx): delivered con delivered_at < hace 7 días, agrupado por BRIEF.
      Ya NO muestra con_cliente/en_cambios (eso vive en el tablero ahora).
- [x] Componente (entregas-board.tsx, reescrito, "use client"): brief cards expandibles (useState) →
      tareas dentro con code, naming, asignados, fecha de Greenlit, link para abrir/reabrir/consultar.
      Empty state cuando no hay >7d. Header "Archivo".
- [x] Verificado live (ventana ampliada temporalmente, revertida): brief card "Voyager Recreation Local
      - August" · DiDi · ✨1 Greenlit → expande a SPAPVOYSHOPPINGFUT · Greenlit 19 ago · link a la tarea.
- [x] Gates tsc·eslint·build. Sin migración. PENDIENTE "ship it".
- [x] DECISIÓN Pedro: archivo = REGISTRO COMPLETO de todos los delivered (no sólo >7d). Quitado el filtro
      de 7 días; ordenado por delivered_at desc, limit 1000 (deuda: paginar si crece). Recientes en board Y archivo.

## ✅ (2026-08-20) — "Control de Cambios" en el portal (formato interno) [Pedro] — SIN pushear
- [x] Rename ambos paneles → "Control de Cambios" (panel.tsx interno + panel del portal).
- [x] Portal: panel a la DERECHA (2-col sticky en desktop, mismo formato que el interno) + COLAPSABLE
      arriba en móvil (colapsado por defecto). portal-shell max-w-3xl→5xl; portal-tarea CuerpoTarea 2-col.
- [x] panel-control-cambios.tsx (nuevo): muestra los cambios del cliente — SIN ENVIAR (coral + Quitar) y
      APLICADOS (morado read-only, por ronda) + Ver campo (salto+flash). Sin H.Ü.E (esRevisor=false).
- [x] Borrado panel-revisiones-cliente.tsx (reemplazado). Gates tsc·eslint·build. Verificado live desktop+móvil.
- PENDIENTE: "ship it".

## 📋 PLAN (2026-08-20) — "Aplicar sugerencia" de H.Ü.E [Pedro]
Que el lead pueda aplicar la sugerencia de H.Ü.E directo al campo con un botón "Aplicar".
- [x] validar-actions + aplicarSugerencia action + contexto + panel: HECHO.
      aplicada; null si no hay algo concreto). schema + prompt + parse.
- [ ] Nueva server action aplicarSugerencia(ideaId, clienteSlug, correccionId, textoNuevo): role-check
      canOverrideStatus, resuelve el campo (target_tabla/fila/campo del comment, whitelist), escribe, revalida.
- [ ] contexto.tsx: Ctx += aplicarSugerencia; provider lo llama → window.location.reload() (re-siembra el campo).
- [ ] panel.tsx: cuando el veredicto trae `aplicar` (y esRevisor), muestra la sugerencia inline + botón "Aplicar".
- [ ] Gates + verificar. Nota: reload por simplicidad (el estado del workspace no re-siembra solo); follow-up sin reload.

## ✅ (2026-08-20) — "Aplicar sugerencia" de H.Ü.E — SIN pushear
- [x] H.Ü.E devuelve `aplicar` (texto completo del campo con la sugerencia). schema+prompt+parse.
- [x] aplicarSugerencia(ideaId, clienteSlug, correccionId, textoNuevo): role-check, resuelve campo (whitelist), escribe, revalida.
- [x] contexto: ctx.aplicarSugerencia → llama la action → window.location.reload() (re-siembra el campo).
- [x] panel: cuando el veredicto trae `aplicar` (esRevisor), muestra "H.Ü.E sugiere: …" + botón "Aplicar".
- [x] Verificado LIVE: corrí H.Ü.E en SPAPVOYTOURISM → veredicto + "H.Ü.E sugiere: …" + botón "Aplicar" renderizó.
      (NO cliqué Aplicar = escritura en prod; el write+reload es código gateado.) Gates tsc·eslint·build.
- Refinamiento posible: H.Ü.E a veces llena `aplicar` en sugerencias de "verificar" (no un cambio de texto);
  tunear el prompt para dejar aplicar='' salvo cambio concreto. Y follow-up: aplicar sin reload completo.
- PENDIENTE: "ship it".

## ✅ (2026-08-20) — Portal: panel junto a planos + no se corta + semáforo de cambios [Pedro] — SIN pushear
- [x] Sticky del panel: (1) ya no se corta → sticky top-32 (bajo la barra de acción) + max-h[calc(100vh-9rem)]
      + overflow-y-auto (scroll interno para paneles altos). (2) vive JUNTO A LOS PLANOS: Hero+Tabs a todo el
      ancho arriba; 2-col sólo alrededor del documento (portal-tarea CuerpoTarea reorganizado).
- [x] Color del flujo de cambios (semáforo): HECHO/APLICADO morado→AMARILLO (--status-progress) en el panel
      Control de Cambios y en los chips "aplicado" del campo. Solicitado=rojo (ya), aprobado=verde (ya).
      Sólo los ITEMS de cambio; badges de tarea y demás quedan igual (Pedro). Ver lessons.md.
- [x] Fix: wrapper del panel desktop era <aside> anidado sobre otro <aside> → <div>.
- [x] Verificado live (JS): Aplicado=amber rgb(148,95,6); panel sticky top-133 junto a planos; móvil oculto en desktop.
- [x] Gates tsc·eslint·build. PENDIENTE "ship it".

## 🟢 (2026-09-03) — HÜE Prisma: estudio de prompts (rama `prisma`, flag NEXT_PUBLIC_PRISMA_ENABLED) — COMMIT 98ad6dc + 0063 APLICADA
Plan aprobado: /Users/work/.claude/plans/ok-so-1st-having-radiant-jellyfish.md
Origen: teardown de rocoprompt.com (14 bots Gemini). Una idea → un prompt para cada herramienta.
Herramientas v1: Nano Banana · Veo 3.1 · Kling · Sora 2 · Higgsfield. Sólo prompt (generación in-app = v2, flag).
- [x] 1. NavKey `prisma` + sidebar (icono Sparkles, `soon` si el flag está apagado) + RESERVED + flags.ts; /prisma visible a creative+.
- [x] 2. lib/prisma: spec.ts (PromptSpec) + 5 compilers + validators + routing + tools + scripts/test-prisma.mjs (78 checks, en `npm test`).
- [x] 3. Migración `0063_prisma` APLICADA al esquema producción de Greenlight (proyecto ybbrpqzbedaxsmotgtkh) el 2026-09-04
      con `npm run migrate` tras el "ship it" de Pedro. Verificado: 5 tablas prisma_* con RLS, marcas.prisma_presets existe.
- [x] 4. writer.ts (Claude Sonnet 5, bloque estable cacheado, tool_use → PromptSpec, reparación 1 vez) + vision.ts (caption + ADN).
      Verificado VIVO desde scratchpad: spec válido a la 1ª, refine cambia sólo la luz, cache_read=3811 en la 2ª llamada.
- [x] 5. UI: 3 puertas → trabajo → 3 pasos → resultado (copiar, abrir en la herramienta, cambiar herramienta, explicar, refinar,
      pulgar) + historial + swatches con "sugerido desde tus referencias". Subida+visión verificadas en preview (caption + ADN).
- [x] 6. copy.ts ES/EN (ES default, toggle en localStorage vía useSyncExternalStore).
- [~] 7. Reap: tsc · eslint · build · test-lib · test-db · test-prisma en verde. Agentes de review (seguridad Opus + salud Sonnet)
      corriendo; pendiente aplicar hallazgos. Pantalla de RESULTADO no vista en vivo (necesita las tablas).
- [x] 8. Design pass (design-god-mode, 2026-09-04): identidad propia — espectro (un tono por herramienta), haz de prisma como
      firma (idle → escribiendo → listo en el color de la herramienta), Unbounded en títulos, puertas con tono, muestras del ADN,
      entradas escalonadas, "copiado" con anillo, mensajes rotativos al generar. Todo CSS (prisma.css), reduced-motion respetado.
      Demo dev-only `?demo=resultado` para ver el resultado sin sesión.
## Review
- Hecho 2026-09-04: commit 98ad6dc en `prisma` + push (preview de Vercel) + 0063 aplicada. main NO tocado (merge = deploy a prod,
  decisión de Pedro).
- Pendiente de Pedro: (1) `NEXT_PUBLIC_PRISMA_ENABLED=true` en el env de Preview de Vercel (sin él la nav dice "Pronto");
  (2) probar la pantalla de RESULTADO en el preview con login real; (3) probar con un diseñador dos trabajos reales; (4) decidir
  cuándo mergear a main.
- Deuda: personajes (prisma_characters) sin UI de alta (sólo lectura); variantes segura/audaz/mínima no construidas (la columna
  `variante` ya existe); `explicacion` cachea por idioma con prefijo "[es]"; presets de marca se editan a mano en la BD (falta UI en Admin).

## 2026-09-17 — Precios reales de Higgsfield + 0075
- [x] Precios leídos del botón Generate (sin sesión y con la cuenta de Rünna): Kling 3.0/Turbo, Seedance 2.0/Fast/Mini/2.5, Omni, Veo, DoP, Motion Control, Nano Banana Pro (ilimitado sólo con el interruptor, 1K/2K) → tasks/higgsfield-costos-2026-09-16.md
- [x] Seedance 2.0 Fast agregado; a igual precio gana el fino (PEDRO_OVERRIDE)
- [x] SHIP 0075 (DoP = Standard/Turbo/Lite; Kling Turbo con su página) — aplicada y verificada 2026-09-17: catálogo vivo = código 8/8
- [ ] Pedro: ¿qué modelo convertir en "365 Ilimitado"? (el plan permite uno más; Seedance 2.0 = 59 % del gasto)
- [ ] Pedro: quedan 15/1,200 créditos del mes

- [~] B29. Comentarios de los diseñadores (2026-10-28, con su PSD «SPGFAPPLE1PLATA- s7 s8.psd»). Hecho en `prisma`:
      · 1. Su PSD se rechazaba: la tarjeta del HERO tapa 15.2 % del recuadro semitransparente del SUBTITULO y el tope era
        2 %. Ahora lo tapado por una pieza de más arriba se RELLENA con su color de alrededor (`rellenoPct`, como en las
        partes) y sólo se rechaza arriba de `RELLENO_MAX_PCT` = 50 %; la sombra de otra pieza sigue con el tope de 2 %
        (`tapadaPct`). Con su PSD: usable, rearmado 0.00 %, el recuadro sale limpio. No aplica a imagen plana (ahí no hay
        piezas tapadas).
      · 2. 1080×1080 en la lista con la que arranca la pantalla (`MEDIDAS_INICIO`; `MEDIDAS_EQUIPO` siguen siendo las 12
        del script del equipo). «Subir otro archivo» también en la barra pegajosa de resultados (y así se llama el botón
        en las dos puertas, PSD e imagen plana). La guía de qué archivo sirve, plegada en «¿Qué archivo sirve?».
      Falta (esperando las respuestas de los diseñadores, mandadas por Pedro):
      · 3. Modo ratios (1:1, 4:5, 9:16, 16:9, 1.91:1) con nombre por ratio (`_9x16_`). Bug: `nombreSalida` cambia el
        `4x5` del nombre por píxeles. Falta: a qué medida en px sale cada ratio.
      · 4. Zonas seguras automáticas por red (hoy sólo 9:16, sólo con canal elegido, y en la forma del maestro no mueve
        nada). Falta: qué redes.
      · 5. Mover / escalar el FONDO en el editor (hoy `Edicion` no lo tiene).
      · 6. Medidas muy horizontales: el legal sólo puede bajar de renglones (`conRenglones`: n < los del PSD) y necesita la
        tipografía del cliente; su captura decía «Sin cliente». Tamaño del legal a partir de un ejemplo. Falta: un
        ejemplo terminado de 1.91:1 y 320×50, y si eligieron DiDi.
- [~] B30. Imagen plana, más arreglos del 2026-10-28 (en `prisma`, probados en la preview con la imagen real de DiDi, beige):
      · El texto escrito en la revisión es un cambio de verdad (a6982d2); si va como imagen, la fila lo dice.
      · Un fondo que no se puede limpiar ya no rechaza la imagen (PEDRO_OVERRIDE): lo de ahí se queda fijo en el fondo
        (`medirPlanoFijo`, 5089a9e). Probado con la imagen gris de Pedro (pasó la lectura).
      · Precio blanco sobre la pastilla naranja/blanca: ya sale nítido, sin rectángulo (e15181f, ad13308, 6f27bf0):
        fondo = color más común DENTRO de la caja, tinta = más común de lo lejano, filas/columnas sin fondo no son tinta,
        y lo que contiene al texto cuenta como su fondo. Va como imagen (dos tamaños de letra), como en un PSD.
      · Sin mancha rosa al cambiar «3 pagos de» (cada texto se borra con su propio fondo); visto sólo en la vista
        chica del editor (236×295), no a tamaño real.
      Falta:
      · Los textos cambiados de una imagen plana se guardan con el id que inventa la IA, y cada lectura da ids
        distintos: al volver a subir la misma imagen, lo cambiado no vuelve (se vio con «12 pagos de / $9,000»).
        Guardarlos por las letras leídas + posición, no por el id.
      · Lo de «Aplica ahora» pálido en la captura de Pedro no salió en estas lecturas (salió nítido); sin reproducir.
      · RESPUESTAS de los diseñadores (2026-10-28, vía Pedro):
        - Dos entregas que NUNCA se mezclan: (a) RATIO = masters, artes nuevos o iteraciones en canales directos;
          el nombre lleva el ratio (1x1, 4x5, 9x16, 191x1). (b) PÍXELES = EC (external channel); el nombre lleva
          AnchoxAlto (1200x1200). La lista EC es la de `MEDIDAS_EQUIPO` (las 12).
        - Ratios por red (estáticos, Loans y Card igual): GG 1:1 = 1200×1200, 1.91:1 = 1200×628 · FB 9:16 =
          1080×1920, 4:5 = 1080×1350 · TT: vacío en su tabla. (Ojo: 1.91:1 es 1200×628 en ratio; la lista EC trae
          1200×627.) 16:9 lo mencionaron antes pero no está en la tabla: preguntar.
        - Zonas seguras: en 9:16 es OBLIGATORIO que toda la info quede dentro (botones de la red tapan). En las demás
          medidas es recomendación estética: unos px fuera no importa, sólo alejarse de los bordes del lienzo.
          Mandan un doc con las zonas seguras.
        - Falta aún: ejemplo terminado de 1.91:1 y 320×50; si eligieron DiDi como cliente; el doc de zonas seguras.
