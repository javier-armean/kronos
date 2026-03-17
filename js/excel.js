// js/excel.js — Exportación .xlsx con diseño premium dark RPG
// Requiere xlsx-js-style (fork de SheetJS con soporte de cell styles).
// Si se usa la versión community estándar, los datos se exportan igual
// pero sin estilos de color.

import { CONFIG } from './config.js';
import { state }  from './state.js';
import { getRank } from './character.js';
import { fetchHistory, isConnected } from './sheets.js';

// ── PALETA (hex sin #, para SheetJS fgColor.rgb) ──
const P = {
  bgMain:     "05050F", bgCard:     "0E0E22", bgAlt:      "12122A",
  bgHdr:      "1A1A3E", goldPri:    "C9A84C", goldBri:    "FFD700",
  bluePri:    "4A9EFF", blueSoft:   "B8D9FF", textPri:    "E8E8F5",
  textDim:    "6A6A8A", green:      "22C55E", greenBg:    "052010",
  red:        "EF4444", redBg:      "200505", orange:     "F97316",
  purple:     "A855F7", black:      "000000",
  scoreOrgBg: "1A1200", scoreOrgT:  "F97316",
  scoreHiBg:  "073020", scoreHiT:   "4ADE80",
  totalsBg:   "2A1F00",
  fuerza:     "FF6B35", mente:      "4A9EFF", espiritu:   "FFD700",
  destreza:   "A855F7", vitalidad:  "22C55E", resistencia:"EF4444",
};

const STAT_COLOR = {
  fuerza: P.fuerza, mente: P.mente, espiritu: P.espiritu,
  destreza: P.destreza, vitalidad: P.vitalidad, resistencia: P.resistencia,
};

// ── HELPERS ──

// Construye un objeto de estilo SheetJS
function xs(bg, fg, bold = false, sz = 10, ha = "center", wrap = false) {
  return {
    fill: { fgColor: { rgb: bg }, patternType: "solid" },
    font: { color: { rgb: fg }, bold, sz, name: "Calibri" },
    alignment: { horizontal: ha, vertical: "center", wrapText: wrap },
  };
}

// Aplica estilo a una celda (la crea si no existe)
function sc(ws, r, c, style) {
  const addr = XLSX.utils.encode_cell({ r, c });
  if (!ws[addr]) ws[addr] = { t: "z", v: "" };
  ws[addr].s = style;
}

// Aplica un estilo a toda una fila
function styleRow(ws, r, cols, style) {
  for (let c = 0; c < cols; c++) sc(ws, r, c, style);
}

// ── EXPORTACIÓN PRINCIPAL ──
export async function exportExcel() {
  if (typeof XLSX === "undefined") {
    alert("La librería SheetJS no está disponible. Comprueba tu conexión a internet.");
    return;
  }
  const btn = document.getElementById("btn-export-excel");
  if (btn) { btn.textContent = "⏳ Generando..."; btn.disabled = true; }
  try {
    const wb = XLSX.utils.book_new();
    const history = await _getHistory();

    XLSX.utils.book_append_sheet(wb, _buildSummarySheet(),          "Resumen del Guerrero");
    XLSX.utils.book_append_sheet(wb, _buildHistorySheet(history),   "Historial Diario");
    XLSX.utils.book_append_sheet(wb, _buildStatsEvolutionSheet(history), "Evolución de Stats");

    const filename = `KRONOS_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);
  } catch (e) {
    console.error("KRONOS Excel export error:", e);
    alert("Error generando el Excel: " + e.message);
  } finally {
    if (btn) { btn.textContent = "📊 Exportar Excel (.xlsx)"; btn.disabled = false; }
  }
}

// ════════════════════════════════════════════════════════
// HOJA 1 — RESUMEN DEL GUERRERO
// ════════════════════════════════════════════════════════
function _buildSummarySheet() {
  const { totalXp, level, stats, streak } = state.character;
  const rank  = getRank(level);
  const today = new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const days  = Array.isArray(state.history) ? state.history.length : 0;

  const rows = [
    ["⚔  KRONOS — GUERRERO DE LA LUZ", "", ""],  // 0  banner
    ["", "", ""],                                  // 1  spacer
    ["Exportado el:",    today,    ""],             // 2
    ["Nivel:",          level,    ""],             // 3
    ["Rango:",          rank,     ""],             // 4
    ["XP Total:",       totalXp,  ""],             // 5
    ["Racha activa:",   `🔥 ${streak} días`, ""],  // 6
    ["Días registrados:", days,   ""],             // 7
    ["", "", ""],                                  // 8  spacer
    ["ESTADÍSTICAS", "", ""],                      // 9  sección
    ["STAT", "VALOR", "PROGRESO"],                 // 10 cabeceras
  ];

  CONFIG.STATS_CONFIG.forEach(sc => {
    const val   = stats[sc.key] || 0;
    const fill  = Math.min(20, Math.round(val / 5));
    const bar   = "█".repeat(fill) + "░".repeat(20 - fill);
    rows.push([`${sc.icon}  ${sc.label}`, val, bar]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }, // banner
    { s: { r: 9, c: 0 }, e: { r: 9, c: 2 } }, // sección
  ];
  ws["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 24 }];
  ws["!rows"] = [
    { hpt: 30 }, { hpt: 5 },
    ...Array(6).fill({ hpt: 18 }),
    { hpt: 5 }, { hpt: 22 }, { hpt: 20 },
    ...CONFIG.STATS_CONFIG.map(() => ({ hpt: 22 })),
  ];

  try {
    // Banner
    styleRow(ws, 0, 3, xs(P.bgHdr,   P.goldBri, true, 14, "center"));
    // Spacers
    styleRow(ws, 1, 3, xs(P.bgMain,  P.bgMain));
    styleRow(ws, 8, 3, xs(P.bgMain,  P.bgMain));
    // Metadata
    [2,3,4,5,6,7].forEach(r => {
      sc(ws, r, 0, xs(P.bgCard, P.goldPri, false, 10, "left"));
      sc(ws, r, 1, xs(P.bgCard, P.bluePri, false, 10, "left"));
      sc(ws, r, 2, xs(P.bgCard, P.bgCard));
    });
    // Sección
    styleRow(ws, 9, 3, xs(P.bgCard,  P.goldPri, true, 11, "center"));
    // Cabeceras
    styleRow(ws, 10, 3, xs(P.bgCard, P.goldPri, true,  9, "center"));

    // Filas de stats
    CONFIG.STATS_CONFIG.forEach((statCfg, i) => {
      const r = 11 + i;
      const col = STAT_COLOR[statCfg.key] || P.textPri;
      const bg  = i % 2 === 0 ? P.bgCard : P.bgAlt;
      sc(ws, r, 0, xs(bg, col,     false, 10, "left"));
      sc(ws, r, 1, xs(bg, col,     true,  12, "center"));
      sc(ws, r, 2, xs(bg, col,     false,  9, "left"));
    });
  } catch { /* styles not supported by this XLSX build */ }

  return ws;
}

// ════════════════════════════════════════════════════════
// HOJA 2 — HISTORIAL DIARIO
// ════════════════════════════════════════════════════════
function _buildHistorySheet(history) {
  const COLS = 17;

  if (!history || !history.length) {
    const ws = XLSX.utils.aoa_to_sheet([
      ["📖  HISTORIAL DIARIO — KRONOS"],
      [],
      ["Sin historial disponible. Cierra tu primer día para empezar a registrar."],
    ]);
    ws["!cols"] = [{ wch: 55 }];
    try {
      ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
      sc(ws, 0, 0, xs(P.bgHdr, P.goldBri, true, 13, "center"));
      sc(ws, 2, 0, xs(P.bgCard, P.textDim, false, 10, "left"));
    } catch {}
    return ws;
  }

  const headers = [
    "Fecha","Nivel","XP Ganado","Hábitos","Pomodoros",
    "Score","Objetivo","Reflexión","Propósito de Mañana",
    "Fuerza","Mente","Espíritu","Destreza","Vitalidad","Resistencia",
    "Nutrición %","Tareas",
  ];

  const dataRows = history.map(day => [
    day.date || day.fecha || "",
    day.level || day.nivel || 0,
    day.xpGained || day.xp_ganado_hoy || 0,
    typeof day.habitsDone !== "undefined" ? `${day.habitsDone}/${day.totalHabits}` : (day.habitos_completados || ""),
    day.pomodoros || 0,
    day.score || day.score_dia || 0,
    day.objective || day.objetivo_principal || "—",
    day.reflection || day.reflexion_hoy || "",
    day.tomorrow || day.proposito_manana || "",
    (day.stats?.fuerza      ?? day.fuerza      ?? 0),
    (day.stats?.mente       ?? day.mente       ?? 0),
    (day.stats?.espiritu    ?? day.espiritu    ?? 0),
    (day.stats?.destreza    ?? day.destreza    ?? 0),
    (day.stats?.vitalidad   ?? day.vitalidad   ?? 0),
    (day.stats?.resistencia ?? day.resistencia ?? 0),
    typeof day.nutrDone !== "undefined"
      ? `${Math.round((day.nutrDone / day.totalNutr) * 100)}%`
      : (day.nutricion_pct || "0%"),
    typeof day.tasksDone !== "undefined"
      ? `${day.tasksDone}/${day.totalTasks}`
      : (day.tareas_str || ""),
  ]);

  const scores    = dataRows.map(r => r[5]).filter(s => typeof s === "number" && s > 0);
  const avgScore  = scores.length ? (scores.reduce((a,b) => a+b,0) / scores.length).toFixed(1) : "—";
  const totalXpAll= dataRows.reduce((s,r) => s + (r[2] || 0), 0);
  const totalPomos= dataRows.reduce((s,r) => s + (r[4] || 0), 0);
  const totalRow  = ["TOTALES", "", totalXpAll, "", totalPomos, avgScore, ...Array(11).fill("")];

  // Row 0 = banner, Row 1 = headers, Rows 2..N+1 = data, Row N+2 = spacer, Row N+3 = totals
  const bannerRow = ["📖  HISTORIAL DIARIO — KRONOS", ...Array(COLS-1).fill("")];
  const ws = XLSX.utils.aoa_to_sheet([bannerRow, headers, ...dataRows, Array(COLS).fill(""), totalRow]);

  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: COLS-1 } }];
  ws["!cols"]   = [
    { wch: 12 }, { wch: 7  }, { wch: 10 }, { wch: 10 }, { wch: 11 },
    { wch: 7  }, { wch: 10 }, { wch: 32 }, { wch: 32 },
    { wch: 8  }, { wch: 8  }, { wch: 9  }, { wch: 10 }, { wch: 10 }, { wch: 12 },
    { wch: 11 }, { wch: 10 },
  ];
  ws["!rows"] = [
    { hpt: 28 }, // banner
    { hpt: 20 }, // headers
    ...dataRows.map(() => ({ hpt: 18 })),
    { hpt: 5  }, // spacer
    { hpt: 22 }, // totals
  ];

  try {
    // Banner
    styleRow(ws, 0, COLS, xs(P.bgHdr, P.goldBri, true, 13, "center"));
    // Cabeceras
    styleRow(ws, 1, COLS, xs(P.bgCard, P.goldPri, true, 8, "center"));

    // Filas de datos
    dataRows.forEach((row, i) => {
      const r  = i + 2;
      const bg = i % 2 === 0 ? P.bgCard : P.bgAlt;

      // Columnas con color fijo
      const colStyle = [
        xs(bg, P.blueSoft, false, 9), // fecha
        xs(bg, P.goldBri,  true,  9), // nivel
        xs(bg, P.bluePri,  false, 9), // xp
        xs(bg, P.textPri,  false, 9), // habitos
        xs(bg, P.textPri,  false, 9), // pomodoros
        _scoreStyle(bg, row[5]),       // score (semáforo)
        _objStyle(bg, row[6]),         // objetivo
        xs(bg, P.textDim,  false, 8, "left", true), // reflexion
        xs(bg, P.textDim,  false, 8, "left", true), // proposito
        xs(bg, P.fuerza,     false, 9), // fuerza
        xs(bg, P.mente,      false, 9), // mente
        xs(bg, P.espiritu,   false, 9), // espiritu
        xs(bg, P.destreza,   false, 9), // destreza
        xs(bg, P.vitalidad,  false, 9), // vitalidad
        xs(bg, P.resistencia,false, 9), // resistencia
        xs(bg, P.textPri,    false, 9), // nutricion
        xs(bg, P.textPri,    false, 9), // tareas
      ];
      colStyle.forEach((sty, c) => sc(ws, r, c, sty));
    });

    // Spacer
    styleRow(ws, dataRows.length + 2, COLS, xs(P.bgMain, P.bgMain));

    // Totals
    styleRow(ws, dataRows.length + 3, COLS, xs(P.totalsBg, P.goldBri, true, 10, "center"));
  } catch {}

  return ws;
}

function _scoreStyle(bg, score) {
  const v = Number(score);
  if (v <= 3)  return xs(P.redBg,     P.red,      false, 10);
  if (v <= 5)  return xs(P.scoreOrgBg,P.scoreOrgT,false, 10);
  if (v <= 7)  return xs(bg,          P.textPri,  false, 10);
  if (v <= 9)  return xs(P.greenBg,   P.green,    false, 10);
  if (v === 10)return xs(P.scoreHiBg, P.scoreHiT, true,  11);
  return xs(bg, P.textPri, false, 10);
}

function _objStyle(bg, val) {
  const v = String(val).toLowerCase();
  if (v === "si")  return xs(P.greenBg,    P.green,      true, 9);
  if (v === "par") return xs(P.scoreOrgBg, P.scoreOrgT,  true, 9);
  if (v === "no")  return xs(P.redBg,      P.red,        true, 9);
  return xs(bg, P.textPri, false, 9);
}

// ════════════════════════════════════════════════════════
// HOJA 3 — EVOLUCIÓN DE STATS (stats como filas, semanas como columnas)
// ════════════════════════════════════════════════════════
function _buildStatsEvolutionSheet(history) {
  const cur = state.character.stats;

  if (!history || history.length < 2) {
    const ws = XLSX.utils.aoa_to_sheet([
      ["📈  EVOLUCIÓN DE STATS — KRONOS"],
      [],
      ["Necesitas al menos 2 días de historial para ver la evolución."],
      [],
      ["ESTADO ACTUAL:"],
      ...CONFIG.STATS_CONFIG.map(sc => [`${sc.icon} ${sc.label}`, cur[sc.key] || 0]),
    ]);
    ws["!cols"] = [{ wch: 24 }, { wch: 10 }];
    try {
      ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
      sc(ws, 0, 0, xs(P.bgHdr, P.goldBri, true, 13, "center"));
      sc(ws, 2, 0, xs(P.bgCard, P.textDim, false, 10, "left"));
      sc(ws, 4, 0, xs(P.bgCard, P.goldPri, true, 10, "left"));
      CONFIG.STATS_CONFIG.forEach((statCfg, i) => {
        const col = STAT_COLOR[statCfg.key] || P.textPri;
        sc(ws, 5 + i, 0, xs(P.bgCard, col, false, 10, "left"));
        sc(ws, 5 + i, 1, xs(P.bgCard, col, true,  11, "center"));
      });
    } catch {}
    return ws;
  }

  // Agrupar por semana
  const weeks = {};
  history.forEach(day => {
    const date = new Date(day.date || day.fecha || "");
    if (isNaN(date)) return;
    const wk = _weekLabel(date);
    if (!weeks[wk]) weeks[wk] = [];
    weeks[wk].push(day);
  });
  const weekKeys = Object.keys(weeks);

  // Headers: ["STAT", semana1, semana2, ..., "HOY"]
  const headers = ["STAT", ...weekKeys, "HOY"];
  const COLS    = headers.length;

  // Una fila por stat
  const dataRows = CONFIG.STATS_CONFIG.map(statCfg => {
    const key = statCfg.key;
    const weekVals = weekKeys.map(wk => {
      const last  = weeks[wk][weeks[wk].length - 1];
      return last.stats?.[key] ?? last[key] ?? 0;
    });
    return [`${statCfg.icon}  ${statCfg.label}`, ...weekVals, cur[key] || 0];
  });

  const bannerRow = ["📈  EVOLUCIÓN DE STATS — KRONOS", ...Array(COLS-1).fill("")];
  const ws = XLSX.utils.aoa_to_sheet([bannerRow, headers, ...dataRows]);

  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: COLS-1 } }];
  ws["!cols"]   = [{ wch: 18 }, ...Array(COLS-1).fill({ wch: 10 })];
  ws["!rows"]   = [{ hpt: 28 }, { hpt: 22 }, ...dataRows.map(() => ({ hpt: 20 }))];

  try {
    // Banner
    styleRow(ws, 0, COLS, xs(P.bgHdr, P.goldBri, true, 13, "center"));
    // Cabeceras de semanas
    styleRow(ws, 1, COLS, xs(P.bgCard, P.goldPri, true, 8, "center"));
    // Columna HOY (última) en color especial
    sc(ws, 1, COLS - 1, xs(P.bgHdr, P.goldBri, true, 9, "center"));

    // Filas de stats
    CONFIG.STATS_CONFIG.forEach((statCfg, i) => {
      const r   = i + 2;
      const col = STAT_COLOR[statCfg.key] || P.textPri;
      const bg  = i % 2 === 0 ? P.bgCard : P.bgAlt;
      // Label
      sc(ws, r, 0, xs(bg, col, true, 10, "left"));
      // Valores semanales
      for (let c = 1; c < COLS - 1; c++) sc(ws, r, c, xs(bg, P.textPri, false, 10, "center"));
      // Valor HOY (resaltado)
      sc(ws, r, COLS - 1, xs(P.bgHdr, col, true, 11, "center"));
    });
  } catch {}

  return ws;
}

// ── HISTORIAL (Sheets o local) ──
async function _getHistory() {
  if (isConnected()) {
    try {
      const sheetsHistory = await fetchHistory();
      if (sheetsHistory && sheetsHistory.length > 0) {
        return sheetsHistory.map(row => ({
          fecha: row[0], nivel: row[1], xp_ganado_hoy: row[2],
          habitos_completados: row[3], pomodoros: row[4],
          score_dia: row[5], objetivo_principal: row[6],
          reflexion_hoy: row[7], proposito_manana: row[8],
          fuerza: row[9], mente: row[10], espiritu: row[11],
          destreza: row[12], vitalidad: row[13], resistencia: row[14],
          nutricion_pct: row[15], tareas_str: row[16],
        }));
      }
    } catch {}
  }
  return Array.isArray(state.history) ? state.history : [];
}

function _weekLabel(date) {
  const year   = date.getFullYear();
  const oneJan = new Date(year, 0, 1);
  const weekNum= Math.ceil(((date - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
  return `${year} S${weekNum}`;
}
