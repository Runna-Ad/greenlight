/**
 * Greenlight · by Rünna — conector de Google Sheets  (SOLO LECTURA)
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

  // getDisplayValues() conserva lo que se VE en la celda (fechas ya formateadas,
  // etc.), que es lo que la líder escribió — no la representación interna.
  const values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();

  return {
    tab: name,
    gid: sheet.getSheetId(),
    header: values[0].map(trim),
    rows: values.slice(1).map(function (row) {
      return row.map(trim);
    }),
  };
}

function trim(v) {
  return String(v == null ? '' : v).trim();
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
