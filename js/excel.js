// js/excel.js — Generación de estadísticas Excel (.xlsx) con SheetJS

import { CONFIG } from './config.js';
import { state } from './state.js';
import { getRank } from './character.js';
import { fetchHistory, isConnected } from './sheets.js';

// SheetJS se carga desde CDN en index.html como XLSX global

export async function exportExcel() {
  if (typeof XLSX === "undefined") {
    alert("La librería SheetJS no está disponible. Comprueba tu conexión a internet.");
    return;
  }

  const btn = document.getElementById("btn-export-excel");
  if (btn) { btn.textContent = "⏳ Generando..."; btn.disabled = true; }

  try {
    const wb = XLSX.utils.book_new();

    // ── HOJA 1: Resumen del Guerrero ──
    const sheet1 = _buildSummarySheet();
    XLSX.utils.book_append_sheet(wb, sheet1, "Resumen del Guerrero");

    // ── HOJA 2: Historial Diario ──
    const history = await _getHistory();
    const sheet2 = _buildHistorySheet(history);
    XLSX.utils.book_append_sheet(wb, sheet2, "Historial Diario");

    // ── HOJA 3: Evolución de Stats ──
    const sheet3 = _buildStatsEvolutionSheet(history);
    XLSX.utils.book_append_sheet(wb, sheet3, "Evolución de Stats");

    // Descargar
    const filename = `KRONOS_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename);

  } catch (e) {
    console.error("KRONOS Excel export error:", e);
    alert("Error generando el Excel: " + e.message);
  } finally {
    if (btn) { btn.textContent = "📊 Exportar Excel (.xlsx)"; btn.disabled = false; }
  }
}

// ── HOJA 1: RESUMEN ──
function _buildSummarySheet() {
  const { totalXp, level, stats, streak } = state.character;
  const rank = getRank(level);
  const today = new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const historyCount = Array.isArray(state.history) ? state.history.length : 0;

  const rows = [
    ["⚔️ KRONOS — Guerrero de Luz"],
    [],
    ["Exportado el:", today],
    ["Nivel:", level],
    ["Rango:", rank],
    ["XP Total:", totalXp],
    ["Racha actual:", `🔥 ${streak} días`],
    ["Días jugados:", historyCount],
    [],
    ["═══════════ ESTADÍSTICAS ═══════════"],
    ["Stat", "Valor", "Barra de progreso"],
  ];

  CONFIG.STATS_CONFIG.forEach(sc => {
    const val = stats[sc.key] || 0;
    const bar = "█".repeat(Math.min(20, Math.round(val / 5))) + "░".repeat(Math.max(0, 20 - Math.min(20, Math.round(val / 5))));
    rows.push([`${sc.icon} ${sc.label}`, val, bar]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Estilos básicos (ancho de columnas)
  ws["!cols"] = [{ wch: 30 }, { wch: 15 }, { wch: 25 }];

  return ws;
}

// ── HOJA 2: HISTORIAL DIARIO ──
function _buildHistorySheet(history) {
  if (!history || !history.length) {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Sin historial disponible"],
      ["Cierra tu primer día para empezar a registrar datos."],
    ]);
    ws["!cols"] = [{ wch: 45 }];
    return ws;
  }

  const headers = [
    "Fecha", "Nivel", "XP Ganado", "Hábitos", "Pomodoros",
    "Score", "Objetivo", "Reflexión", "Propósito de Mañana",
    "Fuerza", "Mente", "Espíritu", "Destreza", "Vitalidad", "Resistencia",
    "Nutrición %", "Tareas",
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
    (day.stats?.fuerza ?? day.fuerza ?? 0),
    (day.stats?.mente ?? day.mente ?? 0),
    (day.stats?.espiritu ?? day.espiritu ?? 0),
    (day.stats?.destreza ?? day.destreza ?? 0),
    (day.stats?.vitalidad ?? day.vitalidad ?? 0),
    (day.stats?.resistencia ?? day.resistencia ?? 0),
    typeof day.nutrDone !== "undefined"
      ? `${Math.round((day.nutrDone / day.totalNutr) * 100)}%`
      : (day.nutricion_pct || "0%"),
    typeof day.tasksDone !== "undefined"
      ? `${day.tasksDone}/${day.totalTasks}`
      : (day.tareas_str || ""),
  ]);

  // Fila de totales/medias
  const scores = dataRows.map(r => r[5]).filter(s => typeof s === "number" && s > 0);
  const avgScore = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
  const totalXpAll = dataRows.reduce((sum, r) => sum + (r[2] || 0), 0);
  const totalPomos = dataRows.reduce((sum, r) => sum + (r[4] || 0), 0);

  const totalRow = [
    "TOTALES/MEDIAS", "", totalXpAll, "", totalPomos,
    avgScore, "", "", "", "", "", "", "", "", "", "", "",
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows, [], totalRow]);

  // Ancho de columnas
  ws["!cols"] = [
    { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 11 },
    { wch: 7 }, { wch: 12 }, { wch: 35 }, { wch: 35 },
    { wch: 8 }, { wch: 8 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
    { wch: 11 }, { wch: 10 },
  ];

  return ws;
}

// ── HOJA 3: EVOLUCIÓN DE STATS ──
function _buildStatsEvolutionSheet(history) {
  if (!history || history.length < 2) {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Evolución de Stats"],
      [],
      ["Necesitas al menos 2 días de historial para ver la evolución."],
      [],
      ["Estado actual:"],
      ...CONFIG.STATS_CONFIG.map(sc => [sc.label, state.character.stats[sc.key] || 0]),
    ]);
    ws["!cols"] = [{ wch: 20 }, { wch: 10 }];
    return ws;
  }

  // Agrupar por semana (ISO week)
  const weeks = {};
  history.forEach(day => {
    const date = new Date(day.date || day.fecha || "");
    if (isNaN(date)) return;
    const weekKey = _getWeekLabel(date);
    if (!weeks[weekKey]) weeks[weekKey] = [];
    weeks[weekKey].push(day);
  });

  const headers = ["Semana", "Fuerza", "Mente", "Espíritu", "Destreza", "Vitalidad", "Resistencia"];
  const dataRows = [];

  for (const [week, days] of Object.entries(weeks)) {
    // Tomar el último día de la semana (acumulado)
    const last = days[days.length - 1];
    const stats = last.stats || {};
    dataRows.push([
      week,
      stats.fuerza ?? last.fuerza ?? 0,
      stats.mente ?? last.mente ?? 0,
      stats.espiritu ?? last.espiritu ?? 0,
      stats.destreza ?? last.destreza ?? 0,
      stats.vitalidad ?? last.vitalidad ?? 0,
      stats.resistencia ?? last.resistencia ?? 0,
    ]);
  }

  // Estado actual como última fila
  const cur = state.character.stats;
  dataRows.push([
    "HOY (actual)",
    cur.fuerza || 0, cur.mente || 0, cur.espiritu || 0,
    cur.destreza || 0, cur.vitalidad || 0, cur.resistencia || 0,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  ws["!cols"] = [{ wch: 14 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];

  return ws;
}

// ── OBTENER HISTORIAL (Sheets o local) ──
async function _getHistory() {
  // Intentar obtener de Sheets si está conectado
  if (isConnected()) {
    try {
      const sheetsHistory = await fetchHistory();
      if (sheetsHistory && sheetsHistory.length > 0) {
        // Convertir array de Sheets a formato interno
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
    } catch (e) { /* fallback a local */ }
  }
  // Fallback: historial local
  return Array.isArray(state.history) ? state.history : [];
}

// ── HELPER: Etiqueta de semana ──
function _getWeekLabel(date) {
  const year = date.getFullYear();
  const oneJan = new Date(year, 0, 1);
  const weekNum = Math.ceil(((date - oneJan) / 86400000 + oneJan.getDay() + 1) / 7);
  return `${year} Sem.${weekNum}`;
}
