/**
 * BPS Calculator - Google Sheets Webhook
 *
 * Este script recibe POSTs desde la BPS Calculator y los escribe en el Sheet activo.
 * Acepta dos acciones:
 *   - "create": agrega una nueva fila con un log de cotización
 *   - "update": actualiza una fila existente (busca por columna ID)
 *
 * Columnas del sheet (en este orden):
 *   Fecha | Hora | Cliente | Dirección | Recibimos | Enviamos | TC | BPS total | Estado | ID
 */

// Headers exactos que se escriben en la fila 1 si el sheet está vacío
const HEADERS = ['Fecha', 'Hora', 'Cliente', 'Dirección', 'Recibimos', 'Enviamos', 'TC', 'BPS total', 'Estado', 'ID'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // Asegurar headers en la fila 1
    ensureHeaders(sheet);

    if (data.action === 'create') {
      appendRow(sheet, data);
    } else if (data.action === 'update') {
      updateRow(sheet, data);
    } else {
      return jsonResponse({ ok: false, error: 'Unknown action: ' + data.action });
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

function ensureHeaders(sheet) {
  const firstCell = sheet.getRange(1, 1).getValue();
  // Si la primera celda está vacía o no coincide con nuestro primer header, escribir headers
  if (!firstCell || firstCell !== HEADERS[0]) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
}

function rowFromPayload(data) {
  return [
    data.fecha || '',
    data.hora || '',
    data.cliente || '',
    data.direccion || '',
    data.recibimos || '',
    data.enviamos || '',
    data.tc || '',
    data.bps || '',
    data.estado || 'Pendiente',
    String(data.id || '') // Forzar string para evitar pérdida de precisión
  ];
}

function appendRow(sheet, data) {
  sheet.appendRow(rowFromPayload(data));
}

function updateRow(sheet, data) {
  if (!data.id) throw new Error('update requires id');
  const idStr = String(data.id);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    // No hay datos aún, crear la fila
    appendRow(sheet, data);
    return;
  }
  // Leer columna ID (columna 10) para buscar el match
  const idColumn = sheet.getRange(2, 10, lastRow - 1, 1).getValues();
  let targetRow = -1;
  for (let i = 0; i < idColumn.length; i++) {
    if (String(idColumn[i][0]) === idStr) {
      targetRow = i + 2; // +2 porque empieza en fila 2 (después de headers) y i es 0-indexed
      break;
    }
  }

  if (targetRow === -1) {
    // No encontrado, crearlo como nueva fila
    appendRow(sheet, data);
  } else {
    // Actualizar la fila encontrada
    sheet.getRange(targetRow, 1, 1, HEADERS.length).setValues([rowFromPayload(data)]);
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Función de prueba manual (ejecutable desde el editor de Apps Script)
function testAppend() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  ensureHeaders(sheet);
  appendRow(sheet, {
    id: Date.now(),
    fecha: '17/04',
    hora: '14:32',
    cliente: 'Cliente de prueba',
    direccion: 'Compra USD',
    recibimos: '100000.00 MXN',
    enviamos: '5118.52 USD',
    tc: '19.5360',
    bps: '20.00',
    estado: 'Pendiente'
  });
  Logger.log('Fila de prueba agregada');
}
