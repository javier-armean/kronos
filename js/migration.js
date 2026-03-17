// js/migration.js — Herramienta de migración localStorage → Google Sheets

import { state, saveState } from './state.js';
import { CONFIG } from './config.js';
import {
  isConfigured, isConnected, setupSheets, requestAuth,
  pushCurrentState, pushDayToHistory, markSynced,
} from './sheets.js';

// ── RENDERIZAR PANEL DE MIGRACIÓN ──
export function renderMigrationPanel(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const historyCount = Array.isArray(state.history) ? state.history.length : 0;
  const { level, totalXp, streak } = state.character;
  const configured = isConfigured();
  const connected = isConnected();

  container.innerHTML = `
    <!-- PASO 1: Detectar datos -->
    <div class="migration-step" id="mig-step-1">
      <div class="migration-step-header">
        <span class="migration-step-num">1</span>
        <span>Datos encontrados en localStorage</span>
      </div>
      <div class="migration-data-summary">
        <div class="mig-data-row">
          <span>📊 Días en el historial</span>
          <span class="mig-data-val">${historyCount}</span>
        </div>
        <div class="mig-data-row">
          <span>⚔️ Nivel actual</span>
          <span class="mig-data-val">${level}</span>
        </div>
        <div class="mig-data-row">
          <span>✨ XP total</span>
          <span class="mig-data-val">${totalXp.toLocaleString()}</span>
        </div>
        <div class="mig-data-row">
          <span>🔥 Racha</span>
          <span class="mig-data-val">${streak} días</span>
        </div>
      </div>
    </div>

    <!-- PASO 2: Conectar Sheets -->
    <div class="migration-step" id="mig-step-2">
      <div class="migration-step-header">
        <span class="migration-step-num">2</span>
        <span>Conectar Google Sheets</span>
        ${configured ? '<span class="mig-badge-ok">✓ Configurado</span>' : ''}
      </div>
      ${configured && connected
        ? `<div class="mig-connected-msg">🟢 Conectado con Google Sheets</div>`
        : `
        <div style="margin-bottom:10px">
          <div style="font-size:.75rem;color:var(--dim);margin-bottom:5px">Client ID de Google OAuth2</div>
          <input type="text" class="task-input" id="mig-client-id"
            placeholder="XXXXXXXX.apps.googleusercontent.com"
            value="${_getSavedClientId()}"
            style="font-size:.75rem">
        </div>
        <div style="margin-bottom:10px">
          <div style="font-size:.75rem;color:var(--dim);margin-bottom:5px">ID de la Hoja de cálculo</div>
          <input type="text" class="task-input" id="mig-sheet-id"
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            value="${_getSavedSheetId()}">
        </div>
        <button class="btn" id="mig-connect-btn" onclick="window._migConnect()">
          🔗 Conectar con Google
        </button>
      `}
    </div>

    <!-- PASO 3: Migrar -->
    <div class="migration-step" id="mig-step-3" ${!connected ? 'style="opacity:.5;pointer-events:none"' : ''}>
      <div class="migration-step-header">
        <span class="migration-step-num">3</span>
        <span>Migrar datos a Google Sheets</span>
      </div>
      <div style="font-size:.78rem;color:var(--dim);margin-bottom:12px">
        Se subirá el estado actual y ${historyCount} días del historial.
      </div>
      <div id="mig-progress-wrap" style="display:none;margin-bottom:10px">
        <div style="font-size:.72rem;color:var(--dim);margin-bottom:5px" id="mig-progress-label">Preparando...</div>
        <div class="migration-progress-bg">
          <div class="migration-progress-fill" id="mig-progress-bar" style="width:0%"></div>
        </div>
      </div>
      <div id="mig-result" style="display:none;font-size:.8rem;margin-bottom:10px"></div>
      <button class="btn" id="mig-start-btn" onclick="window._migStart()" ${!connected ? 'disabled' : ''}>
        🚀 Migrar datos
      </button>
      <button class="btn-ghost" id="mig-clean-btn" onclick="window._migClean()"
        style="margin-left:8px;display:none">
        🗑️ Limpiar localStorage
      </button>
    </div>
  `;

  // Exponer funciones globales para los onclick inline
  window._migConnect = async () => {
    const clientId = document.getElementById("mig-client-id")?.value.trim();
    const sheetId = document.getElementById("mig-sheet-id")?.value.trim();
    if (!clientId || !sheetId) {
      alert("Introduce el Client ID y el ID de la hoja.");
      return;
    }
    await setupSheets(clientId, sheetId);
    // Volver a renderizar tras conectar
    setTimeout(() => renderMigrationPanel(containerId), 2000);
  };

  window._migStart = async () => {
    await runMigration(containerId);
  };

  window._migClean = () => {
    if (confirm("¿Seguro que quieres borrar los datos del historial local? El personaje se mantendrá.")) {
      state.history = [];
      saveState();
      const btn = document.getElementById("mig-clean-btn");
      if (btn) { btn.textContent = "✓ Limpiado"; btn.disabled = true; }
    }
  };
}

// ── PROCESO DE MIGRACIÓN ──
async function runMigration(containerId) {
  const progressWrap = document.getElementById("mig-progress-wrap");
  const progressBar = document.getElementById("mig-progress-bar");
  const progressLabel = document.getElementById("mig-progress-label");
  const resultEl = document.getElementById("mig-result");
  const startBtn = document.getElementById("mig-start-btn");
  const cleanBtn = document.getElementById("mig-clean-btn");

  progressWrap.style.display = "block";
  if (startBtn) startBtn.disabled = true;

  const history = Array.isArray(state.history) ? state.history : [];
  const total = 1 + history.length; // estado + días
  let done = 0;
  let errors = 0;

  const setProgress = (label) => {
    const pct = Math.round((done / total) * 100);
    progressBar.style.width = pct + "%";
    progressLabel.textContent = label;
  };

  // Subir estado actual
  setProgress("Subiendo estado del personaje...");
  const stateOk = await pushCurrentState();
  if (stateOk) { done++; markSynced(); } else { errors++; done++; }
  setProgress(`Estado ${stateOk ? "✓" : "✗"} — procesando historial...`);

  // Subir historial día a día
  for (let i = 0; i < history.length; i++) {
    const day = history[i];
    const dayData = buildDayData(day);
    const ok = await pushDayToHistory(dayData);
    if (!ok) errors++;
    done++;
    setProgress(`Día ${i + 1}/${history.length} ${ok ? "✓" : "✗"}`);
    // Pequeña pausa para no saturar la API
    await new Promise(r => setTimeout(r, 200));
  }

  progressBar.style.width = "100%";

  if (errors === 0) {
    resultEl.innerHTML = `<span style="color:var(--green)">✅ Migración completada. ${total} registros subidos.</span>`;
    if (cleanBtn) cleanBtn.style.display = "inline-block";
  } else {
    resultEl.innerHTML = `<span style="color:var(--gold)">⚠️ Completado con ${errors} errores. Revisa la consola.</span>`;
  }
  resultEl.style.display = "block";
}

// ── CONSTRUIR OBJETO DE DÍA PARA SHEETS ──
function buildDayData(day) {
  const stats = day.stats || {};
  const habitsDone = day.habitsDone || 0;
  const totalHabits = CONFIG.FIXED_HABITS.length;
  const tasksDone = day.tasksDone || 0;
  const totalTasks = day.totalTasks || 0;
  const nutrDone = day.nutrDone || 0;
  const totalNutr = CONFIG.NUTRITION_ITEMS.length;
  const nutrPct = totalNutr > 0 ? Math.round((nutrDone / totalNutr) * 100) : 0;

  return {
    fecha: day.date || "",
    nivel: day.level || 1,
    xp_ganado_hoy: day.xpGained || 0,
    habitos_completados: `${habitsDone}/${totalHabits}`,
    pomodoros: day.pomodoros || 0,
    score_dia: day.score || 0,
    objetivo_principal: day.objective || "—",
    reflexion_hoy: day.reflection || "",
    proposito_manana: day.tomorrow || "",
    fuerza: stats.fuerza || 0,
    mente: stats.mente || 0,
    espiritu: stats.espiritu || 0,
    destreza: stats.destreza || 0,
    vitalidad: stats.vitalidad || 0,
    resistencia: stats.resistencia || 0,
    nutricion_pct: `${nutrPct}%`,
    tareas_str: `${tasksDone}/${totalTasks}`,
  };
}

// ── HELPERS ──
function _getSavedClientId() {
  try {
    const raw = localStorage.getItem("kronos_sheets_creds");
    return raw ? JSON.parse(raw).clientId : "";
  } catch { return ""; }
}

function _getSavedSheetId() {
  try {
    const raw = localStorage.getItem("kronos_sheets_creds");
    return raw ? JSON.parse(raw).spreadsheetId : "";
  } catch { return ""; }
}
