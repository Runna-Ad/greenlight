/**
 * Greenlight · by Rünna — conector de Google Sheets  (SOLO LECTURA)
 *
 * Recupera las LIGAS DE REFERENCIA escondidas: si en la columna "Referencias"
 * pegas un link de Drive como hipervínculo o "chip", su URL viaja a Greenlight
 * (la exportación CSV sólo veía la etiqueta y perdía la liga). Ver readTab.
 *
 * CÓMO INSTALARLO (una sola vez, ~4 minutos)
 * ------------------------------------------------------------------
 * 1. Abre el Google Sheet de producción.
 * 2. Menú  Extensiones ▸ Apps Script.
 * 3. Borra lo que haya y pega TODO este archivo. Guarda (💾).
 *
 * 4. GUARDA LA CONTRASEÑA (no va escrita en el código):
 *      ⚙️ Configuración del proyecto  ▸  Propiedades del script
 *      ▸ Añadir propiedad
 *          Propiedad:  GREENLIGHT_SECRET
 *          Valor:      (inventa una contraseña larga)
 *      ▸ Guardar propiedades
 *
 * 5. Botón azul  Implementar ▸ Nueva implementación
 *      - Tipo:                Aplicación web
 *      - Ejecutar como:       Yo
 *      - Quién tiene acceso:  Cualquier usuario
 * 6. Copia la URL que termina en /exec.
 * 7. Pégala en Greenlight ▸ Configuración ▸ Sincronización,
 *    junto con la misma contraseña.
 *
 * Para actualizar este código después:
 *   Implementar ▸ Gestionar implementaciones ▸ ✏️ ▸ Versión: Nueva ▸ Implementar
 *   (la URL no cambia)
 *
 * SEGURIDAD
 *   · Solo LEE. No escribe nada en la hoja, nunca.
 *   · Sin la contraseña correcta no devuelve información.
 *   · La contraseña vive en las Propiedades del script, no en este archivo,
 *     para que puedas compartir/versionar el código sin filtrarla.
 */

/** Filas máximas por pestaña (evita timeouts en hojas grandes). */
const MAX_ROWS = 500;

/**
 * Devuelve la hoja de cálculo, funcione el script como sea:
 *  · Vinculado (Extensiones ▸ Apps Script desde la hoja) → la hoja activa.
 *  · Independiente (script.google.com) → se abre por ID, tomado de la
 *    propiedad SHEET_ID.
 */
function getSpreadsheet() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;

  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) {
    throw new Error(
      'Falta la propiedad SHEET_ID (el ID de la hoja) en Configuración del proyecto ▸ Propiedades del script.',
    );
  }
  return SpreadsheetApp.openById(id);
}

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    const expected = PropertiesService.getScriptProperties().getProperty(
      'GREENLIGHT_SECRET',
    );

    if (!expected) {
      return json({
        error: 'setup_incomplete',
        hint:
          'Falta la propiedad GREENLIGHT_SECRET en Configuración del proyecto ▸ Propiedades del script.',
      });
    }
    if (params.secret !== expected) {
      return json({ error: 'unauthorized' });
    }

    // ?tab=NOMBRE → filas de esa pestaña.  Sin parámetro → lista de pestañas.
    return json(params.tab ? readTab(params.tab) : { tabs: listTabs() });
  } catch (err) {
    return json({ error: String((err && err.message) || err) });
  }
}

/** Todas las pestañas, con su nombre COMPLETO (sin truncar) y su tamaño. */
function listTabs() {
  return getSpreadsheet()
    .getSheets()
    .map(function (sheet, i) {
      return {
        name: sheet.getName(),
        gid: sheet.getSheetId(),
        position: i,
        rows: Math.max(0, sheet.getLastRow() - 1), // sin contar el encabezado
        hidden: sheet.isSheetHidden(),
      };
    });
}

/**
 * Columnas cuyo HIPERVÍNCULO/CHIP *es* el dato (la liga de referencia). Sólo en
 * ellas recuperamos la URL escondida: en el resto un enlace decorativo NO debe
 * ensuciar el valor (p. ej. una celda de Naming con un link rompería el nombre
 * de archivo). Normalizado (sin acentos, minúsculas). Extensible a futuro.
 */
const LINK_COLUMNS = ['referencias'];

/** Encabezado + filas de una pestaña, como texto plano. */
function readTab(name) {
  const sheet = getSpreadsheet().getSheetByName(name);

  // Si la pestaña no existe devolvemos un error EXPLÍCITO.
  // (La exportación CSV de Google devuelve la PRIMERA pestaña en silencio;
  //  ese comportamiento es justo el que queremos evitar aquí.)
  if (!sheet) return { error: 'tab_not_found', tab: name };

  const lastRow = Math.min(sheet.getLastRow(), MAX_ROWS + 1);
  const lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return { tab: name, header: [], rows: [] };

  const range = sheet.getRange(1, 1, lastRow, lastCol);
  // getDisplayValues() conserva lo que se VE en la celda (fechas ya formateadas,
  // etc.), que es lo que la líder escribió — no la representación interna.
  const values = range.getDisplayValues();
  const header = values[0].map(trim);

  // getDisplayValues() (igual que la exportación CSV) SÓLO ve el texto visible:
  // un link de Drive pegado como hipervínculo o "chip" pierde su URL — la celda
  // se ve como una etiqueta y la liga real se cae. getRichTextValues() sí trae la
  // URL escondida (getLinkUrl), así que en las columnas de referencia la
  // recuperamos y la anexamos para que el import la vuelva "Ver referencia".
  const linkCols = columnsToAugment(header);
  const rich = linkCols.length ? tryRichText(range) : null;

  return {
    tab: name,
    gid: sheet.getSheetId(),
    header: header,
    rows: values.slice(1).map(function (row, r) {
      return row.map(function (cell, c) {
        const text = trim(cell);
        if (rich && linkCols.indexOf(c) !== -1) return withLinks(text, rich[r + 1][c]);
        return text;
      });
    }),
  };
}

/** Índices de columnas de referencia (por su encabezado normalizado). */
function columnsToAugment(header) {
  const out = [];
  for (let c = 0; c < header.length; c++) {
    if (LINK_COLUMNS.indexOf(normHeader(header[c])) !== -1) out.push(c);
  }
  return out;
}

function normHeader(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

/** getRichTextValues() puede fallar en hojas raras; si truena, seguimos sin él. */
function tryRichText(range) {
  try {
    return range.getRichTextValues();
  } catch (err) {
    return null;
  }
}

/**
 * Texto visible + las URL escondidas de la celda, cada una en su propia línea
 * (para que el parser de referencias las numere). Conserva la etiqueta visible y
 * sólo añade las URL que aún no estén en el texto — nunca borra lo que ya se ve.
 */
function withLinks(text, rtv) {
  const urls = linkUrls(rtv);
  if (!urls.length) return text;
  const extra = urls.filter(function (u) { return text.indexOf(u) === -1; });
  if (!extra.length) return text;
  return text ? text + '\n' + extra.join('\n') : extra.join('\n');
}

/**
 * Las URL de una celda con formato enriquecido. getLinkUrl() sobre TODA la celda
 * cubre el caso común (la celda entera es un link / un chip de Drive); si es null
 * (texto con varios tramos), se recorren los "runs" y se junta el link de cada
 * uno. Nota: para chips de archivo de Drive suele venir la URL; algún tipo de
 * chip podría no exponerla — en ese caso queda el plan B de pegar la URL como
 * texto plano.
 */
function linkUrls(rtv) {
  if (!rtv) return [];
  const out = [];
  const whole = rtv.getLinkUrl();
  if (whole) out.push(whole);
  else {
    const runs = rtv.getRuns();
    for (let i = 0; i < runs.length; i++) {
      const u = runs[i].getLinkUrl();
      if (u) out.push(u);
    }
  }
  return out.filter(function (u, i) { return u && out.indexOf(u) === i; }); // dedupe
}

function trim(v) {
  return String(v == null ? '' : v).trim();
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
