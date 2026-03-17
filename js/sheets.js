// js/sheets.js — Google Sheets API v4 con OAuth2

import { state, saveState, setSyncStatus } from './state.js';
import { CONFIG } from './config.js';

// ── CREDENCIALES ──
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
let _gapiReady   = false;
let _gisReady    = false;

export function isConfigured() { return !!getCreds(); }
export function isConnected()  { return !!_accessToken; }

// ── INICIALIZACIÓN ──
export async function initSheetsAPI() {
  const creds = getCreds();
  if (!creds) { setSyncStatus("none"); return false; }
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
    if (typeof gapi === "undefined") { reject(new Error("gapi no disponible")); return; }
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
      reject(new Error("Google Identity Services no disponible")); return;
    }
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      callback: (resp) => {
        if (resp.error) { setSyncStatus("error"); return; }
        _accessToken = resp.access_token;
        gapi.client.setToken({ access_token: _accessToken });
        setSyncStatus("synced");
        pullFromSheets().catch(() => {});
      },
    });
    _gisReady = true;
    resolve();
  });
}

// ── AUTH ──
export function requestAuth() {
  if (!_tokenClient) { alert("Sheets no está inicializado. Introduce primero las credenciales."); return; }
  _tokenClient.requestAccessToken({ prompt: "consent" });
}

export async function setupSheets(clientId, spreadsheetId) {
  saveCreds(clientId, spreadsheetId);
  const ok = await initSheetsAPI();
  if (ok) requestAuth();
}

// ── PULL ──
// Layout: fila 1=banner, 2=subtítulo, 3=separador, 4=cabeceras, 5=datos
export async function pullFromSheets() {
  if (!isConnected()) return null;
  const creds = getCreds();
  if (!creds) return null;
  setSyncStatus("syncing");
  try {
    const resp = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: creds.spreadsheetId,
      range: "estado_actual!A5:K5",
    });
    const rows = resp.result.values;
    if (!rows || !rows[0] || rows[0].length < 10) { setSyncStatus("synced"); return null; }
    const [nivel, xp_total, streak, fuerza, mente, espiritu, destreza, vitalidad, resistencia, ultima] = rows[0];
    const sheetsTimestamp = ultima ? new Date(ultima).getTime() : 0;
    const localTimestamp  = state.character.lastActiveDate ? new Date(state.character.lastActiveDate).getTime() : 0;
    setSyncStatus("synced");
    return {
      nivel: parseInt(nivel) || 1, xp_total: parseInt(xp_total) || 0, streak: parseInt(streak) || 0,
      stats: {
        fuerza: parseInt(fuerza) || 0, mente: parseInt(mente) || 0, espiritu: parseInt(espiritu) || 0,
        destreza: parseInt(destreza) || 0, vitalidad: parseInt(vitalidad) || 0, resistencia: parseInt(resistencia) || 0,
      },
      ultima_actualizacion: ultima, sheetsTimestamp, localTimestamp,
    };
  } catch (e) {
    console.warn("KRONOS Sheets pull error:", e);
    setSyncStatus("error");
    return null;
  }
}

// ── PUSH ESTADO ACTUAL ──
export async function pushCurrentState() {
  if (!isConnected()) { setSyncStatus("pending"); return false; }
  const creds = getCreds();
  if (!creds) return false;
  setSyncStatus("syncing");
  const { totalXp, level, streak, stats } = state.character;
  const now = new Date().toISOString();
  const values = [[level, totalXp, streak, stats.fuerza, stats.mente, stats.espiritu, stats.destreza, stats.vitalidad, stats.resistencia, now]];
  try {
    await ensureSheetHeaders(creds.spreadsheetId);
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: creds.spreadsheetId,
      range: "estado_actual!A5",
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

// ── PUSH HISTORIAL ──
// Layout: fila 1=banner, 2=cabeceras, 3+=datos
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
  const row = [fecha, nivel, xp_ganado_hoy, habitos_completados, pomodoros, score_dia, objetivo_principal, reflexion_hoy, proposito_manana, fuerza, mente, espiritu, destreza, vitalidad, resistencia, nutricion_pct, tareas_str];
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

// ── PUSH HABILIDAD ──
export async function pushSkill(nombre, descripcion) {
  if (!isConnected()) return false;
  const creds = getCreds();
  if (!creds) return false;
  const row = [new Date().toISOString().slice(0, 10), state.character.level, nombre, descripcion];
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

// ── LEER HISTORIAL ──
export async function fetchHistory() {
  if (!isConnected()) return null;
  const creds = getCreds();
  if (!creds) return null;
  try {
    const resp = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: creds.spreadsheetId,
      range: "historial_diario!A3:Q",
    });
    return resp.result.values || [];
  } catch { return null; }
}

// ── CABECERAS ──
async function ensureSheetHeaders(spreadsheetId) {
  const sheetsMeta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
  const sheets = sheetsMeta.result.sheets.map(s => s.properties.title);

  const needed = {
    "estado_actual":   [["nivel","xp_total","streak","fuerza","mente","espiritu","destreza","vitalidad","resistencia","ultima_actualizacion"]],
    "historial_diario":[["fecha","nivel","xp_ganado_hoy","habitos_completados","pomodoros","score_dia","objetivo_principal","reflexion_hoy","proposito_manana","fuerza","mente","espiritu","destreza","vitalidad","resistencia","nutricion_pct","tareas_completadas"]],
    "habilidades":     [["fecha","nivel","nombre_habilidad","descripcion"]],
    "sprites_config":  [["nivel_min","nivel_max","sprite_url","label"]],
  };

  // Filas de cabecera por hoja (1-indexed en A1 notation)
  const headerRow = {
    "estado_actual":   "estado_actual!A4",
    "historial_diario":"historial_diario!A2",
    "habilidades":     "habilidades!A2",
    "sprites_config":  "sprites_config!A1",
  };

  const missing = Object.keys(needed).filter(n => !sheets.includes(n));
  if (missing.length > 0) {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: { requests: missing.map(title => ({ addSheet: { properties: { title } } })) },
    });
  }

  for (const [sheetName, headers] of Object.entries(needed)) {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: headerRow[sheetName],
      valueInputOption: "USER_ENTERED",
      resource: { values: headers },
    });
  }
}

// ── SYNC ON OPEN ──
export async function syncOnOpen(onNewerData) {
  const remoteData = await pullFromSheets();
  if (!remoteData) return;
  if (remoteData.sheetsTimestamp > remoteData.localTimestamp && remoteData.xp_total > state.character.totalXp) {
    if (onNewerData) onNewerData(remoteData);
  }
}

export function applyRemoteState(remoteData) {
  state.character.level    = remoteData.nivel;
  state.character.totalXp  = remoteData.xp_total;
  state.character.streak   = remoteData.streak;
  state.character.stats    = { ...remoteData.stats };
  saveState();
}

export function setupOfflineRecovery() {
  window.addEventListener("online", async () => {
    if (state.syncPending && isConfigured()) {
      const ok = await initSheetsAPI();
      if (ok) setSyncStatus("pending");
    }
  });
  window.addEventListener("offline", () => { if (isConfigured()) setSyncStatus("pending"); });
}

// ── FORMATO PREMIUM DARK RPG ──
export async function applySheetFormatting(spreadsheetId) {
  if (!isConnected()) return;
  try {
    const meta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
    const sheetMap  = {};
    const sheetInfo = {};
    meta.result.sheets.forEach(s => {
      sheetMap[s.properties.title]        = s.properties.sheetId;
      sheetInfo[s.properties.sheetId]     = s;
    });

    // ── Paleta ──
    const h = (hex) => ({
      red:   parseInt(hex.slice(0,2), 16) / 255,
      green: parseInt(hex.slice(2,4), 16) / 255,
      blue:  parseInt(hex.slice(4,6), 16) / 255,
    });
    const C = {
      bgMain:     h("05050F"), bgCard:     h("0E0E22"), bgAlt:      h("12122A"),
      bgHdr:      h("1A1A3E"), goldPri:    h("C9A84C"), goldBri:    h("FFD700"),
      bluePri:    h("4A9EFF"), blueSoft:   h("B8D9FF"), textPri:    h("E8E8F5"),
      textDim:    h("6A6A8A"), green:      h("22C55E"), greenBg:    h("052010"),
      red:        h("EF4444"), redBg:      h("200505"), orange:     h("F97316"),
      purple:     h("A855F7"), black:      h("000000"), dimBorder:  h("2A2A4A"),
      scoreOrgBg: h("1A1200"), scoreOrgT:  h("F97316"),
      scoreHiBg:  h("073020"), scoreHiT:   h("4ADE80"),
      totalsBg:   h("2A1F00"),
      fuerza:     h("FF6B35"), mente:      h("4A9EFF"), espiritu:   h("FFD700"),
      destreza:   h("A855F7"), vitalidad:  h("22C55E"), resistencia:h("EF4444"),
    };

    const bord = (color, style = "SOLID") => ({ style, color });
    const bordGold  = bord(C.goldPri, "SOLID_MEDIUM");
    const bordThin  = bord(C.dimBorder, "SOLID");

    const eaId  = sheetMap["estado_actual"];
    const hdId  = sheetMap["historial_diario"];
    const habId = sheetMap["habilidades"];

    const requests = [];

    // ── LIMPIEZA (idempotencia) ──
    [eaId, hdId, habId].forEach(sid => {
      if (sid === undefined) return;
      const s = sheetInfo[sid];
      (s?.merges || []).forEach(m => {
        requests.push({ unmergeCells: { range: { sheetId: sid, startRowIndex: m.startRowIndex, endRowIndex: m.endRowIndex, startColumnIndex: m.startColumnIndex, endColumnIndex: m.endColumnIndex } } });
      });
      (s?.bandedRanges || []).forEach(br => requests.push({ deleteBanding: { bandedRangeId: br.bandedRangeId } }));
      const rules = s?.conditionalFormats || [];
      for (let i = rules.length - 1; i >= 0; i--) {
        requests.push({ deleteConditionalFormatRule: { sheetId: sid, index: i } });
      }
    });

    // ════════════════════════════════════════
    // ESTADO_ACTUAL
    // Fila 1=banner(idx0), 2=subtítulo(idx1), 3=sep(idx2), 4=cabeceras(idx3), 5=datos(idx4)
    // ════════════════════════════════════════
    if (eaId !== undefined) {
      const EA = 10;

      // Alturas de fila
      [[0,1,40],[1,2,24],[2,3,8],[3,4,28],[4,5,26]].forEach(([si,ei,px]) => {
        requests.push({ updateDimensionProperties: { range: { sheetId: eaId, dimension: "ROWS", startIndex: si, endIndex: ei }, properties: { pixelSize: px }, fields: "pixelSize" } });
      });

      // Merges
      requests.push({ mergeCells: { range: { sheetId: eaId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: EA }, mergeType: "MERGE_ALL" } });
      requests.push({ mergeCells: { range: { sheetId: eaId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: EA }, mergeType: "MERGE_ALL" } });

      // Fila 0: Banner
      requests.push({ updateCells: {
        range: { sheetId: eaId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
        rows: [{ values: [{ userEnteredValue: { stringValue: "⚔  KRONOS — ESTADO DEL GUERRERO DE LA LUZ" }, userEnteredFormat: { backgroundColor: C.bgHdr, textFormat: { foregroundColor: C.goldBri, bold: true, fontSize: 14, fontFamily: "Georgia" }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } }] }],
        fields: "userEnteredValue,userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
      }});

      // Fila 1: Subtítulo dinámico (formula)
      requests.push({ updateCells: {
        range: { sheetId: eaId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 },
        rows: [{ values: [{ userEnteredValue: { formulaValue: '=IF(J5="","Pendiente de sincronización","Última actualización: "&TEXT(J5,"dd/mmm/yyyy HH:mm"))' }, userEnteredFormat: { backgroundColor: C.bgCard, textFormat: { foregroundColor: C.textDim, fontSize: 9 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } }] }],
        fields: "userEnteredValue,userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
      }});

      // Fila 2: Separador
      requests.push({ repeatCell: { range: { sheetId: eaId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: EA }, cell: { userEnteredFormat: { backgroundColor: C.bgMain } }, fields: "userEnteredFormat.backgroundColor" } });

      // Fila 3: Cabeceras
      requests.push({ repeatCell: { range: { sheetId: eaId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: EA }, cell: { userEnteredFormat: { backgroundColor: C.goldPri, textFormat: { foregroundColor: C.black, bold: true, fontSize: 8 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)" } });

      // Fila 4: Datos base
      requests.push({ repeatCell: { range: { sheetId: eaId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: EA }, cell: { userEnteredFormat: { backgroundColor: C.bgCard, textFormat: { foregroundColor: C.textPri, fontSize: 10 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)" } });

      // Colores por columna en fila de datos
      // [colIdx, color, bold, fontSize]
      [
        [0, C.goldBri,    true,  13], // nivel
        [1, C.bluePri,    true,  10], // xp_total
        [2, C.orange,     false, 10], // streak
        [3, C.fuerza,     false, 10], // fuerza
        [4, C.mente,      false, 10], // mente
        [5, C.espiritu,   false, 10], // espiritu
        [6, C.destreza,   false, 10], // destreza
        [7, C.vitalidad,  false, 10], // vitalidad
        [8, C.resistencia,false, 10], // resistencia
        [9, C.textDim,    false,  8], // ultima_actualizacion
      ].forEach(([ci, color, bold, fontSize]) => {
        requests.push({ repeatCell: { range: { sheetId: eaId, startRowIndex: 4, endRowIndex: 5, startColumnIndex: ci, endColumnIndex: ci + 1 }, cell: { userEnteredFormat: { textFormat: { foregroundColor: color, bold, fontSize } } }, fields: "userEnteredFormat.textFormat" } });
      });

      // Bordes: exterior grueso dorado, interior fino
      requests.push({ updateBorders: { range: { sheetId: eaId, startRowIndex: 0, endRowIndex: 5, startColumnIndex: 0, endColumnIndex: EA }, top: bordGold, bottom: bordGold, left: bordGold, right: bordGold, innerHorizontal: bordThin, innerVertical: bordThin } });

      // Anchos de columna fijos
      // nivel=80, xp_total=100, streak=80, stats=70x6, ultima=160
      [80, 100, 80, 70, 70, 70, 70, 70, 70, 160].forEach((px, ci) => {
        requests.push({ updateDimensionProperties: { range: { sheetId: eaId, dimension: "COLUMNS", startIndex: ci, endIndex: ci + 1 }, properties: { pixelSize: px }, fields: "pixelSize" } });
      });
    }

    // ════════════════════════════════════════
    // HISTORIAL_DIARIO
    // Fila 1=banner(idx0), 2=cabeceras(idx1), 3+=datos(idx2+)
    // ════════════════════════════════════════
    if (hdId !== undefined) {
      const HD       = 17;
      const DATA_MAX = 1000;

      // Alturas
      requests.push({ updateDimensionProperties: { range: { sheetId: hdId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: "pixelSize" } });
      requests.push({ updateDimensionProperties: { range: { sheetId: hdId, dimension: "ROWS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 28 }, fields: "pixelSize" } });

      // Merge banner
      requests.push({ mergeCells: { range: { sheetId: hdId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: HD }, mergeType: "MERGE_ALL" } });

      // Fila 0: Banner
      requests.push({ updateCells: {
        range: { sheetId: hdId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
        rows: [{ values: [{ userEnteredValue: { stringValue: "📖  CRÓNICAS DEL GUERRERO — HISTORIAL DIARIO" }, userEnteredFormat: { backgroundColor: C.bgHdr, textFormat: { foregroundColor: C.goldBri, bold: true, fontSize: 13, fontFamily: "Georgia" }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } }] }],
        fields: "userEnteredValue,userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
      }});

      // Fila 1: Cabeceras
      requests.push({ repeatCell: { range: { sheetId: hdId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: HD }, cell: { userEnteredFormat: { backgroundColor: C.bgCard, textFormat: { foregroundColor: C.goldPri, bold: true, fontSize: 8 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)" } });

      // Borde inferior dorado en cabecera
      requests.push({ updateBorders: { range: { sheetId: hdId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: HD }, bottom: bordGold } });

      // Freeze filas 1-2 (banner + cabeceras)
      requests.push({ updateSheetProperties: { properties: { sheetId: hdId, gridProperties: { frozenRowCount: 2 } }, fields: "gridProperties.frozenRowCount" } });

      // Datos: texto base
      requests.push({ repeatCell: { range: { sheetId: hdId, startRowIndex: 2, endRowIndex: DATA_MAX, startColumnIndex: 0, endColumnIndex: HD }, cell: { userEnteredFormat: { textFormat: { foregroundColor: C.textPri, fontSize: 9 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)" } });

      // Banding alternado
      requests.push({ addBanding: { bandedRange: { range: { sheetId: hdId, startRowIndex: 2, startColumnIndex: 0, endColumnIndex: HD }, rowProperties: { firstBandColor: C.bgCard, secondBandColor: C.bgAlt } } } });

      // Colores por columna en datos
      // A(0)=fecha, B(1)=nivel, C(2)=xp, J(9)=fuerza, K(10)=mente, L(11)=espiritu, M(12)=destreza, N(13)=vitalidad, O(14)=resistencia
      [
        [0,  C.blueSoft,   false],
        [1,  C.goldBri,    true ],
        [2,  C.bluePri,    false],
        [9,  C.fuerza,     false],
        [10, C.mente,      false],
        [11, C.espiritu,   false],
        [12, C.destreza,   false],
        [13, C.vitalidad,  false],
        [14, C.resistencia,false],
      ].forEach(([ci, color, bold]) => {
        requests.push({ repeatCell: { range: { sheetId: hdId, startRowIndex: 2, endRowIndex: DATA_MAX, startColumnIndex: ci, endColumnIndex: ci + 1 }, cell: { userEnteredFormat: { textFormat: { foregroundColor: color, bold } } }, fields: "userEnteredFormat.textFormat" } });
      });

      // Condicional: score_dia (col F, idx 5) — semáforo 5 niveles
      const scoreRange = [{ sheetId: hdId, startRowIndex: 2, startColumnIndex: 5, endColumnIndex: 6 }];
      [
        { type: "NUMBER_BETWEEN", vals: ["1","3"],  bg: C.redBg,     txt: C.red,       bold: false },
        { type: "NUMBER_BETWEEN", vals: ["4","5"],  bg: C.scoreOrgBg,txt: C.scoreOrgT, bold: false },
        { type: "NUMBER_BETWEEN", vals: ["6","7"],  bg: C.bgCard,    txt: C.textPri,   bold: false },
        { type: "NUMBER_BETWEEN", vals: ["8","9"],  bg: C.greenBg,   txt: C.green,     bold: false },
        { type: "NUMBER_EQ",      vals: ["10"],     bg: C.scoreHiBg, txt: C.scoreHiT,  bold: true  },
      ].forEach(({ type, vals, bg, txt, bold }, i) => {
        requests.push({ addConditionalFormatRule: { rule: { ranges: scoreRange, booleanRule: { condition: { type, values: vals.map(v => ({ userEnteredValue: v })) }, format: { backgroundColor: bg, textFormat: { foregroundColor: txt, bold } } } }, index: i } });
      });

      // Condicional: objetivo_principal (col G, idx 6)
      const objRange = [{ sheetId: hdId, startRowIndex: 2, startColumnIndex: 6, endColumnIndex: 7 }];
      [
        { val: "si",  bg: C.greenBg,    txt: C.green  },
        { val: "par", bg: C.scoreOrgBg, txt: C.orange },
        { val: "no",  bg: C.redBg,      txt: C.red    },
      ].forEach(({ val, bg, txt }, i) => {
        requests.push({ addConditionalFormatRule: { rule: { ranges: objRange, booleanRule: { condition: { type: "TEXT_EQ", values: [{ userEnteredValue: val }] }, format: { backgroundColor: bg, textFormat: { foregroundColor: txt, bold: true } } } }, index: 5 + i } });
      });

      // Condicional: fila TOTALES (cuando A = "TOTALES")
      requests.push({ addConditionalFormatRule: { rule: {
        ranges: [{ sheetId: hdId, startRowIndex: 2, startColumnIndex: 0, endColumnIndex: HD }],
        booleanRule: {
          condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: '=$A3="TOTALES"' }] },
          format: { backgroundColor: C.totalsBg, textFormat: { foregroundColor: C.goldBri, bold: true } },
        },
      }, index: 8 } });

      // Auto-resize columnas
      requests.push({ autoResizeDimensions: { dimensions: { sheetId: hdId, dimension: "COLUMNS", startIndex: 0, endIndex: HD } } });
    }

    // ════════════════════════════════════════
    // HABILIDADES
    // Fila 1=banner(idx0), 2=cabeceras(idx1), 3+=datos(idx2+)
    // ════════════════════════════════════════
    if (habId !== undefined) {
      const HAB      = 4;
      const DATA_MAX = 1000;

      // Alturas
      requests.push({ updateDimensionProperties: { range: { sheetId: habId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: "pixelSize" } });
      requests.push({ updateDimensionProperties: { range: { sheetId: habId, dimension: "ROWS", startIndex: 1, endIndex: 2 }, properties: { pixelSize: 28 }, fields: "pixelSize" } });

      // Merge banner
      requests.push({ mergeCells: { range: { sheetId: habId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: HAB }, mergeType: "MERGE_ALL" } });

      // Fila 0: Banner
      requests.push({ updateCells: {
        range: { sheetId: habId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
        rows: [{ values: [{ userEnteredValue: { stringValue: "🏆  HABILIDADES Y LOGROS DESBLOQUEADOS" }, userEnteredFormat: { backgroundColor: C.bgHdr, textFormat: { foregroundColor: C.goldBri, bold: true, fontSize: 13, fontFamily: "Georgia" }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } }] }],
        fields: "userEnteredValue,userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)",
      }});

      // Fila 1: Cabeceras
      requests.push({ repeatCell: { range: { sheetId: habId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: HAB }, cell: { userEnteredFormat: { backgroundColor: C.bgCard, textFormat: { foregroundColor: C.goldPri, bold: true, fontSize: 8 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)" } });

      // Borde inferior cabecera
      requests.push({ updateBorders: { range: { sheetId: habId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: HAB }, bottom: bordGold } });

      // Datos: base
      requests.push({ repeatCell: { range: { sheetId: habId, startRowIndex: 2, endRowIndex: DATA_MAX, startColumnIndex: 0, endColumnIndex: HAB }, cell: { userEnteredFormat: { textFormat: { foregroundColor: C.textPri, fontSize: 9 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } }, fields: "userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)" } });

      // Banding
      requests.push({ addBanding: { bandedRange: { range: { sheetId: habId, startRowIndex: 2, startColumnIndex: 0, endColumnIndex: HAB }, rowProperties: { firstBandColor: C.bgCard, secondBandColor: C.bgAlt } } } });

      // fecha (A) → azul suave
      requests.push({ repeatCell: { range: { sheetId: habId, startRowIndex: 2, endRowIndex: DATA_MAX, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { foregroundColor: C.blueSoft } } }, fields: "userEnteredFormat.textFormat.foregroundColor" } });

      // nivel (B) → dorado negrita
      requests.push({ repeatCell: { range: { sheetId: habId, startRowIndex: 2, endRowIndex: DATA_MAX, startColumnIndex: 1, endColumnIndex: 2 }, cell: { userEnteredFormat: { textFormat: { foregroundColor: C.goldBri, bold: true } } }, fields: "userEnteredFormat.textFormat" } });

      // nombre_habilidad (C) → dorado negrita
      requests.push({ repeatCell: { range: { sheetId: habId, startRowIndex: 2, endRowIndex: DATA_MAX, startColumnIndex: 2, endColumnIndex: 3 }, cell: { userEnteredFormat: { textFormat: { foregroundColor: C.goldBri, bold: true } } }, fields: "userEnteredFormat.textFormat" } });

      // descripcion (D) → texto suave, wrap, alineado izquierda
      requests.push({ repeatCell: { range: { sheetId: habId, startRowIndex: 2, endRowIndex: DATA_MAX, startColumnIndex: 3, endColumnIndex: 4 }, cell: { userEnteredFormat: { textFormat: { foregroundColor: C.textPri }, wrapStrategy: "WRAP", horizontalAlignment: "LEFT" } }, fields: "userEnteredFormat(textFormat,wrapStrategy,horizontalAlignment)" } });

      // Auto-resize
      requests.push({ autoResizeDimensions: { dimensions: { sheetId: habId, dimension: "COLUMNS", startIndex: 0, endIndex: HAB } } });
    }

    if (requests.length > 0) {
      await gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests } });
    }
  } catch (e) {
    console.warn("KRONOS Sheets formatting error:", e);
  }
}

// ── ÚLTIMA SINCRONIZACIÓN ──
export function getLastSyncLabel() {
  const raw = localStorage.getItem("kronos_last_sync");
  if (!raw) return "Nunca";
  try { return new Date(raw).toLocaleString("es-ES"); } catch { return "—"; }
}

export function markSynced() {
  localStorage.setItem("kronos_last_sync", new Date().toISOString());
}
