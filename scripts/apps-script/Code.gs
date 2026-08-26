/**
 * Greenlight · by Rünna — conector de Google Sheets  (SOLO LECTURA)
 *
 * Recupera las LIGAS DE REFERENCIA escondidas de la columna "Referencias": un link
 * de Drive pegado como hipervínculo O como "chip de archivo" (@) viaja a Greenlight
 * (la exportación CSV sólo veía la etiqueta y perdía la liga). Ver readTab.
 *
 * ⚠️ Para los CHIPS DE ARCHIVO de Drive hay que ACTIVAR un servicio (una sola vez):
 *   Editor de Apps Script ▸ Servicios (＋ en el panel izquierdo) ▸ "Google Sheets
 *   API" ▸ Agregar. Sin él, los hipervínculos de texto sí funcionan pero los chips no.
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

  // getDisplayValues() (igual que CSV) SÓLO ve el texto visible: un link de Drive
  // pegado como hipervínculo O como "chip de archivo" pierde su URL. La recuperamos
  // de DOS fuentes y la anexamos para que el import la vuelva "Ver referencia":
  //  (a) getRichTextValues().getLinkUrl() → hipervínculos de texto / auto-links.
  //  (b) el servicio avanzado "Sheets" (chipRuns.chip.richLinkProperties.uri) → los
  //      CHIPS DE ARCHIVO de Drive, que getLinkUrl() NO expone. Requiere activar el
  //      servicio (Servicios ▸ + ▸ Google Sheets API); sin él se usa sólo (a).
  const linkCols = columnsToAugment(header);
  const linksByCol = {};
  if (linkCols.length) {
    const rich = tryRichText(range);
    for (let li = 0; li < linkCols.length; li++) {
      const col = linkCols[li];
      linksByCol[col] = linksForColumn(sheet, col, lastRow, rich);
    }
  }

  return {
    tab: name,
    gid: sheet.getSheetId(),
    header: header,
    rows: values.slice(1).map(function (row, r) {
      return row.map(function (cell, c) {
        const text = trim(cell);
        // r es 0-based sobre las filas de datos; +1 para el índice de fila COMPLETO
        // (0 = encabezado), que es como linksByCol indexa.
        if (linksByCol[c]) return withLinks(text, linksByCol[c][r + 1] || []);
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
 * Las URL escondidas de una columna, por fila (índice 0 = encabezado). Junta DOS
 * fuentes: los hipervínculos de texto (rich text) y los CHIPS de archivo de Drive
 * (servicio avanzado Sheets). Devuelve un arreglo por fila de arreglos de URL.
 */
function linksForColumn(sheet, colIndex, lastRow, rich) {
  const out = [];
  for (let r = 0; r < lastRow; r++) {
    out.push(rich && rich[r] && rich[r][colIndex] ? richLinkUrls(rich[r][colIndex]) : []);
  }
  const chip = chipUrisForColumn(sheet, colIndex, lastRow);
  if (chip) {
    for (let r2 = 0; r2 < lastRow && r2 < chip.length; r2++) {
      for (let k = 0; k < chip[r2].length; k++) {
        if (out[r2].indexOf(chip[r2][k]) === -1) out[r2].push(chip[r2][k]);
      }
    }
  }
  return out;
}

/** URL de una celda con rich text: getLinkUrl() de toda la celda, o de cada "run". */
function richLinkUrls(rtv) {
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

/**
 * Las URL de los CHIPS de archivo de Drive de una columna, vía el servicio avanzado
 * "Sheets" (chipRuns.chip.richLinkProperties.uri) — que getLinkUrl() NO expone. Es
 * lo que hace que un chip de Drive ("@archivo") se vuelva "Ver referencia".
 * Devuelve null si el servicio no está activado → fallback silencioso a rich text.
 */
function chipUrisForColumn(sheet, colIndex, lastRow) {
  if (typeof Sheets === 'undefined') return null; // servicio avanzado no activado
  try {
    const col = colA1(colIndex + 1);
    const a1 = "'" + sheet.getName().replace(/'/g, "''") + "'!" + col + '1:' + col + lastRow;
    const resp = Sheets.Spreadsheets.get(getSpreadsheet().getId(), {
      ranges: [a1],
      fields: 'sheets(data(rowData(values(chipRuns(chip(richLinkProperties(uri)))))))',
    });
    const data = (((resp.sheets || [])[0] || {}).data || [])[0] || {};
    const rows = data.rowData || [];
    return rows.map(function (rd) {
      const runs = (((rd && rd.values) || [])[0] || {}).chipRuns || [];
      const uris = [];
      for (let i = 0; i < runs.length; i++) {
        const rlp = ((runs[i].chip || {}).richLinkProperties) || {};
        if (rlp.uri) uris.push(rlp.uri);
      }
      return uris;
    });
  } catch (err) {
    return null; // servicio no habilitado o error → seguimos con rich text
  }
}

/** Número de columna → letra A1 (1→A, 27→AA). */
function colA1(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Texto visible + las URL escondidas, cada una en su propia línea (para que el
 * parser las numere). Conserva la etiqueta y sólo añade las URL que falten.
 */
function withLinks(text, urls) {
  if (!urls || !urls.length) return text;
  const extra = urls.filter(function (u) { return u && text.indexOf(u) === -1; });
  if (!extra.length) return text;
  return text ? text + '\n' + extra.join('\n') : extra.join('\n');
}

function trim(v) {
  return String(v == null ? '' : v).trim();
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
