// js/sheets.js — Google Sheets API v4 con OAuth2

import { state, saveState, setSyncStatus } from './state.js';
import { CONFIG } from './config.js';

// ── CREDENCIALES (guardadas en localStorage) ──
function getCreds() {
  try {
    const raw = localStorage.getItem("kronos_sheets_creds");
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveCreds(clientId, spreadsheetId) {
  localStorage.setItem("kronos_sheets_creds", JSON.stringify({ clientId, spreadsheetId }));
}

export function clearCreds() {
  localStorage.removeItem("kronos_sheets_creds");
  _tokenClient = null;
  _accessToken = null;
  setSyncStatus("none");
}

// ── ESTADO INTERNO ──
let _tokenClient = null;
let _accessToken = null;
let _gapiReady = false;
let _gisReady = false;

export function isConfigured() {
  return !!getCreds();
}

export function isConnected() {
  return !!_accessToken;
}

// ── INICIALIZACIÓN ──
// Carga las librerías de Google y establece la conexión si ya hay credenciales.
export async function initSheetsAPI() {
  const creds = getCreds();
  if (!creds) {
    setSyncStatus("none");
    return false;
  }

  setSyncStatus("syncing");

  try {
    await loadGapiClient();
    await loadGISClient(creds.clientId);
    setSyncStatus("pending");
    return true;
  } catch (e) {
    console.warn("KRONOS Sheets: error de inicialización", e);
    setSyncStatus("error");
    return false;
  }
}

function loadGapiClient() {
  return new Promise((resolve, reject) => {
    if (_gapiReady) { resolve(); return; }
    if (typeof gapi === "undefined") {
      reject(new Error("Google API (gapi) no disponible"));
      return;
    }
    gapi.load("client", async () => {
      try {
        await gapi.client.init({
          discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
        });
        _gapiReady = true;
        resolve();
      } catch (e) { reject(e); }
    });
  });
}

function loadGISClient(clientId) {
  return new Promise((resolve, reject) => {
    if (_gisReady) { resolve(); return; }
    if (typeof google === "undefined" || !google.accounts) {
      reject(new Error("Google Identity Services no disponible"));
      return;
    }
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      callback: (resp) => {
        if (resp.error) {
          setSyncStatus("error");
          return;
        }
        _accessToken = resp.access_token;
        gapi.client.setToken({ access_token: _accessToken });
        setSyncStatus("synced");
        // Trigger pull after auth
        pullFromSheets().catch(() => {});
      },
    });
    _gisReady = true;
    resolve();
  });
}

// ── SOLICITAR TOKEN (abre popup OAuth) ──
export function requestAuth() {
  if (!_tokenClient) {
    alert("Sheets no está inicializado. Introduce primero las credenciales.");
    return;
  }
  _tokenClient.requestAccessToken({ prompt: "consent" });
}

// ── PRIMERA CONFIGURACIÓN ──
export async function setupSheets(clientId, spreadsheetId) {
  saveCreds(clientId, spreadsheetId);
  const ok = await initSheetsAPI();
  if (ok) requestAuth();
}

// ── PULL: leer estado desde Sheets ──
export async function pullFromSheets() {
  if (!isConnected()) return null;
  const creds = getCreds();
  if (!creds) return null;

  setSyncStatus("syncing");
  try {
    const resp = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: creds.spreadsheetId,
      range: "estado_actual!A2:K2",
    });

    const rows = resp.result.values;
    if (!rows || !rows[0] || rows[0].length < 10) {
      setSyncStatus("synced");
      return null;
    }

    const [nivel, xp_total, streak, fuerza, mente, espiritu, destreza, vitalidad, resistencia, ultima] = rows[0];

    const sheetsTimestamp = ultima ? new Date(ultima).getTime() : 0;
    const localTimestamp = state.character.lastActiveDate
      ? new Date(state.character.lastActiveDate).getTime()
      : 0;

    setSyncStatus("synced");
    return {
      nivel: parseInt(nivel) || 1,
      xp_total: parseInt(xp_total) || 0,
      streak: parseInt(streak) || 0,
      stats: {
        fuerza: parseInt(fuerza) || 0,
        mente: parseInt(mente) || 0,
        espiritu: parseInt(espiritu) || 0,
        destreza: parseInt(destreza) || 0,
        vitalidad: parseInt(vitalidad) || 0,
        resistencia: parseInt(resistencia) || 0,
      },
      ultima_actualizacion: ultima,
      sheetsTimestamp,
      localTimestamp,
    };
  } catch (e) {
    console.warn("KRONOS Sheets pull error:", e);
    setSyncStatus("error");
    return null;
  }
}

// ── PUSH: subir estado actual a Sheets ──
export async function pushCurrentState() {
  if (!isConnected()) { setSyncStatus("pending"); return false; }
  const creds = getCreds();
  if (!creds) return false;

  setSyncStatus("syncing");
  const { totalXp, level, streak, stats } = state.character;
  const now = new Date().toISOString();

  const values = [[
    level, totalXp, streak,
    stats.fuerza, stats.mente, stats.espiritu,
    stats.destreza, stats.vitalidad, stats.resistencia,
    now,
  ]];

  try {
    // Asegura que la hoja tiene cabecera
    await ensureSheetHeaders(creds.spreadsheetId);

    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: creds.spreadsheetId,
      range: "estado_actual!A2",
      valueInputOption: "USER_ENTERED",
      resource: { values },
    });

    state.syncPending = false;
    saveState();
    setSyncStatus("synced");
    await applySheetFormatting(creds.spreadsheetId);
    return true;
  } catch (e) {
    console.warn("KRONOS Sheets push error:", e);
    setSyncStatus("error");
    return false;
  }
}

// ── PUSH DÍA: añadir fila al historial diario ──
export async function pushDayToHistory(dayData) {
  if (!isConnected()) { setSyncStatus("pending"); return false; }
  const creds = getCreds();
  if (!creds) return false;

  const {
    fecha, nivel, xp_ganado_hoy, habitos_completados, pomodoros,
    score_dia, objetivo_principal, reflexion_hoy, proposito_manana,
    fuerza, mente, espiritu, destreza, vitalidad, resistencia,
    nutricion_pct, tareas_str,
  } = dayData;

  const row = [
    fecha, nivel, xp_ganado_hoy, habitos_completados, pomodoros,
    score_dia, objetivo_principal, reflexion_hoy, proposito_manana,
    fuerza, mente, espiritu, destreza, vitalidad, resistencia,
    nutricion_pct, tareas_str,
  ];

  try {
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: creds.spreadsheetId,
      range: "historial_diario!A:Q",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      resource: { values: [row] },
    });
    await applySheetFormatting(creds.spreadsheetId);
    return true;
  } catch (e) {
    console.warn("KRONOS Sheets historial error:", e);
    setSyncStatus("error");
    return false;
  }
}

// ── PUSH HABILIDAD/LOGRO ──
export async function pushSkill(nombre, descripcion) {
  if (!isConnected()) return false;
  const creds = getCreds();
  if (!creds) return false;

  const row = [
    new Date().toISOString().slice(0, 10),
    state.character.level,
    nombre,
    descripcion,
  ];

  try {
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: creds.spreadsheetId,
      range: "habilidades!A:D",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      resource: { values: [row] },
    });
    return true;
  } catch { return false; }
}

// ── LEER HISTORIAL COMPLETO ──
export async function fetchHistory() {
  if (!isConnected()) return null;
  const creds = getCreds();
  if (!creds) return null;

  try {
    const resp = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: creds.spreadsheetId,
      range: "historial_diario!A2:Q",
    });
    return resp.result.values || [];
  } catch { return null; }
}

// ── ASEGURAR CABECERAS EN LAS HOJAS ──
async function ensureSheetHeaders(spreadsheetId) {
  const sheetsMeta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
  const sheets = sheetsMeta.result.sheets.map(s => s.properties.title);

  const needed = {
    "estado_actual": [["nivel","xp_total","streak","fuerza","mente","espiritu","destreza","vitalidad","resistencia","ultima_actualizacion"]],
    "historial_diario": [["fecha","nivel","xp_ganado_hoy","habitos_completados","pomodoros","score_dia","objetivo_principal","reflexion_hoy","proposito_manana","fuerza","mente","espiritu","destreza","vitalidad","resistencia","nutricion_pct","tareas_completadas"]],
    "habilidades": [["fecha","nivel","nombre_habilidad","descripcion"]],
    "sprites_config": [["nivel_min","nivel_max","sprite_url","label"]],
  };

  // Crear hojas que no existen
  const missing = Object.keys(needed).filter(n => !sheets.includes(n));
  if (missing.length > 0) {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: missing.map(title => ({
          addSheet: { properties: { title } },
        })),
      },
    });
  }

  // Escribir cabeceras
  for (const [sheetName, headers] of Object.entries(needed)) {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: "USER_ENTERED",
      resource: { values: headers },
    });
  }
}

// ── SINCRONIZACIÓN COMPLETA (pull + comparar + notificar) ──
export async function syncOnOpen(onNewerData) {
  const remoteData = await pullFromSheets();
  if (!remoteData) return;

  if (remoteData.sheetsTimestamp > remoteData.localTimestamp &&
      remoteData.xp_total > state.character.totalXp) {
    if (onNewerData) onNewerData(remoteData);
  }
}

// ── APLICAR DATOS DE SHEETS AL ESTADO LOCAL ──
export function applyRemoteState(remoteData) {
  state.character.level = remoteData.nivel;
  state.character.totalXp = remoteData.xp_total;
  state.character.streak = remoteData.streak;
  state.character.stats = { ...remoteData.stats };
  saveState();
}

// ── MODO OFFLINE: detectar y recuperar ──
export function setupOfflineRecovery() {
  window.addEventListener("online", async () => {
    if (state.syncPending && isConfigured()) {
      const ok = await initSheetsAPI();
      if (ok) {
        // Auto-request auth no es posible sin interacción de usuario,
        // marcamos pending y dejamos que el usuario lo resuelva.
        setSyncStatus("pending");
      }
    }
  });
  window.addEventListener("offline", () => {
    if (isConfigured()) setSyncStatus("pending");
  });
}

// ── APLICAR FORMATO ESTÉTICO A LAS HOJAS ──
export async function applySheetFormatting(spreadsheetId) {
  if (!isConnected()) return;

  try {
    const meta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
    const sheetMap = {};
    const sheetData = {};
    meta.result.sheets.forEach(s => {
      sheetMap[s.properties.title] = s.properties.sheetId;
      sheetData[s.properties.sheetId] = s;
    });

    const hex = (h) => ({
      red: parseInt(h.slice(1, 3), 16) / 255,
      green: parseInt(h.slice(3, 5), 16) / 255,
      blue: parseInt(h.slice(5, 7), 16) / 255,
    });

    const C = {
      headerBg:     hex("05050f"),
      gold:         hex("FFD700"),
      dataBg:       hex("0e0e22"),
      dataBg2:      hex("12122a"),
      white:        { red: 1, green: 1, blue: 1 },
      scoreLowBg:   hex("3d0000"),
      scoreLowTxt:  hex("ff6b6b"),
      scoreMidBg:   hex("1a1a2e"),
      scoreHighBg:  hex("003d1a"),
      scoreHighTxt: hex("4ade80"),
      totalsBg:     hex("3d2e00"),
      redTxt:       { red: 1, green: 0.2, blue: 0.2 },
    };

    const requests = [];

    // ── Limpiar banding y reglas condicionales existentes (idempotencia) ──
    const hdId  = sheetMap["historial_diario"];
    const eaId  = sheetMap["estado_actual"];
    const habId = sheetMap["habilidades"];

    [eaId, hdId, habId].forEach(sid => {
      if (sid === undefined) return;
      const s = sheetData[sid];
      (s?.bandedRanges || []).forEach(br => {
        requests.push({ deleteBanding: { bandedRangeId: br.bandedRangeId } });
      });
      const rules = s?.conditionalFormats || [];
      for (let i = rules.length - 1; i >= 0; i--) {
        requests.push({ deleteConditionalFormatRule: { sheetId: sid, index: i } });
      }
    });

    // ── ESTADO_ACTUAL ──
    if (eaId !== undefined) {
      const COLS = 10;
      const goldBorder = { style: "SOLID", color: C.gold };

      requests.push({
        repeatCell: {
          range: { sheetId: eaId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: COLS },
          cell: {
            userEnteredFormat: {
              backgroundColor: C.headerBg,
              textFormat: { foregroundColor: C.gold, bold: true },
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
        },
      });

      requests.push({
        updateDimensionProperties: {
          range: { sheetId: eaId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 30 },
          fields: "pixelSize",
        },
      });

      requests.push({
        repeatCell: {
          range: { sheetId: eaId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: COLS },
          cell: {
            userEnteredFormat: {
              backgroundColor: C.dataBg,
              textFormat: { foregroundColor: C.white },
              horizontalAlignment: "CENTER",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
        },
      });

      requests.push({
        updateBorders: {
          range: { sheetId: eaId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: COLS },
          top: goldBorder, bottom: goldBorder, left: goldBorder, right: goldBorder,
          innerHorizontal: goldBorder, innerVertical: goldBorder,
        },
      });

      requests.push({
        autoResizeDimensions: {
          dimensions: { sheetId: eaId, dimension: "COLUMNS", startIndex: 0, endIndex: COLS },
        },
      });
    }

    // ── HISTORIAL_DIARIO ──
    if (hdId !== undefined) {
      const COLS = 17;
      const DATA_ROWS = 1000;

      requests.push({
        repeatCell: {
          range: { sheetId: hdId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: COLS },
          cell: {
            userEnteredFormat: {
              backgroundColor: C.headerBg,
              textFormat: { foregroundColor: C.gold, bold: true },
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
        },
      });

      requests.push({
        updateDimensionProperties: {
          range: { sheetId: hdId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 30 },
          fields: "pixelSize",
        },
      });

      // Texto blanco + centrado para todas las filas de datos
      requests.push({
        repeatCell: {
          range: { sheetId: hdId, startRowIndex: 1, endRowIndex: DATA_ROWS, startColumnIndex: 0, endColumnIndex: COLS },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: C.white },
              horizontalAlignment: "CENTER",
            },
          },
          fields: "userEnteredFormat(textFormat,horizontalAlignment)",
        },
      });

      // Fondo alternado por filas
      requests.push({
        addBanding: {
          bandedRange: {
            range: { sheetId: hdId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: COLS },
            rowProperties: {
              firstBandColor: C.dataBg,
              secondBandColor: C.dataBg2,
            },
          },
        },
      });

      // score_dia (col F, índice 5): formato condicional
      const scoreRange = [{ sheetId: hdId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 }];
      [
        { vals: ["1", "4"], bg: C.scoreLowBg,  txt: C.scoreLowTxt  },
        { vals: ["5", "7"], bg: C.scoreMidBg,  txt: C.white        },
        { vals: ["8", "10"], bg: C.scoreHighBg, txt: C.scoreHighTxt },
      ].forEach(({ vals, bg, txt }, i) => {
        requests.push({
          addConditionalFormatRule: {
            rule: {
              ranges: scoreRange,
              booleanRule: {
                condition: {
                  type: "NUMBER_BETWEEN",
                  values: vals.map(v => ({ userEnteredValue: v })),
                },
                format: {
                  backgroundColor: bg,
                  textFormat: { foregroundColor: txt },
                },
              },
            },
            index: i,
          },
        });
      });

      // objetivo_principal (col G, índice 6): si / par / no
      const objRange = [{ sheetId: hdId, startRowIndex: 1, startColumnIndex: 6, endColumnIndex: 7 }];
      [
        { val: "si",  txt: C.scoreHighTxt },
        { val: "par", txt: C.gold         },
        { val: "no",  txt: C.redTxt       },
      ].forEach(({ val, txt }, i) => {
        requests.push({
          addConditionalFormatRule: {
            rule: {
              ranges: objRange,
              booleanRule: {
                condition: { type: "TEXT_EQ", values: [{ userEnteredValue: val }] },
                format: { textFormat: { foregroundColor: txt } },
              },
            },
            index: 3 + i,
          },
        });
      });

      // Fila TOTALES: cualquier fila donde columna A = "TOTALES"
      requests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId: hdId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: COLS }],
            booleanRule: {
              condition: {
                type: "CUSTOM_FORMULA",
                values: [{ userEnteredValue: '=$A2="TOTALES"' }],
              },
              format: {
                backgroundColor: C.totalsBg,
                textFormat: { foregroundColor: C.gold, bold: true },
              },
            },
          },
          index: 6,
        },
      });

      requests.push({
        autoResizeDimensions: {
          dimensions: { sheetId: hdId, dimension: "COLUMNS", startIndex: 0, endIndex: COLS },
        },
      });
    }

    // ── HABILIDADES ──
    if (habId !== undefined) {
      const COLS = 4;
      const DATA_ROWS = 1000;

      requests.push({
        repeatCell: {
          range: { sheetId: habId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: COLS },
          cell: {
            userEnteredFormat: {
              backgroundColor: C.headerBg,
              textFormat: { foregroundColor: C.gold, bold: true },
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
        },
      });

      requests.push({
        updateDimensionProperties: {
          range: { sheetId: habId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 30 },
          fields: "pixelSize",
        },
      });

      requests.push({
        repeatCell: {
          range: { sheetId: habId, startRowIndex: 1, endRowIndex: DATA_ROWS, startColumnIndex: 0, endColumnIndex: COLS },
          cell: {
            userEnteredFormat: {
              backgroundColor: C.dataBg,
              textFormat: { foregroundColor: C.white },
              horizontalAlignment: "CENTER",
            },
          },
          fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
        },
      });

      // nombre_habilidad (col C, índice 2) en dorado
      requests.push({
        repeatCell: {
          range: { sheetId: habId, startRowIndex: 1, endRowIndex: DATA_ROWS, startColumnIndex: 2, endColumnIndex: 3 },
          cell: {
            userEnteredFormat: {
              textFormat: { foregroundColor: C.gold },
            },
          },
          fields: "userEnteredFormat.textFormat.foregroundColor",
        },
      });

      requests.push({
        autoResizeDimensions: {
          dimensions: { sheetId: habId, dimension: "COLUMNS", startIndex: 0, endIndex: COLS },
        },
      });
    }

    if (requests.length > 0) {
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: { requests },
      });
    }
  } catch (e) {
    console.warn("KRONOS Sheets formatting error:", e);
  }
}

// ── OBTENER ÚLTIMA SINCRONIZACIÓN ──
export function getLastSyncLabel() {
  const raw = localStorage.getItem("kronos_last_sync");
  if (!raw) return "Nunca";
  try {
    return new Date(raw).toLocaleString("es-ES");
  } catch { return "—"; }
}

export function markSynced() {
  localStorage.setItem("kronos_last_sync", new Date().toISOString());
}
