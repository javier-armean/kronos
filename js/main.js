// js/main.js — Inicialización, navegación y eventos globales de KRONOS

import { CONFIG } from './config.js';
import { state, loadState, saveState, todayStr, handleNewDay, setSyncStatus } from './state.js';
import { updateCharacterUI, closeLevelUp, resumeAudio } from './character.js';
import { updateHabitsUI, renderTasks, addTask, bindHabitsGlobals } from './habits.js';
import { updatePomoUI, renderPomoTime, bindPomodoroGlobals } from './pomodoro.js';
import { updateNutritionUI, bindNutritionGlobals } from './nutrition.js';
import {
  restoreReflectionUI, setupReflectionListeners,
  bindReflectionGlobals,
} from './reflection.js';
import {
  initSheetsAPI, isConfigured, isConnected, clearCreds,
  requestAuth, syncOnOpen, applyRemoteState, setupOfflineRecovery,
  getLastSyncLabel, pushCurrentState, markSynced,
} from './sheets.js';
import { renderMigrationPanel } from './migration.js';
import { renderSpriteManager } from './sprites.js';
import { exportExcel } from './excel.js';
import { exportToObsidian } from './reflection.js';

// ── INICIALIZACIÓN ──
async function init() {
  loadState();

  // Renderizar UI inicial
  updateCharacterUI();
  updateHabitsUI();
  updateNutritionUI();
  updatePomoUI();
  renderPomoTime();
  updateHeaderDate();
  restoreReflectionUI();

  // Eventos de los inputs de reflexión
  setupReflectionListeners();

  // Exponer funciones para onclick inline del HTML
  bindHabitsGlobals();
  bindPomodoroGlobals();
  bindNutritionGlobals();
  bindReflectionGlobals();
  _bindGlobalActions();

  // Atajos de teclado
  _setupKeyboard();

  // Actualizar fecha cada minuto
  setInterval(updateHeaderDate, 60000);

  // Comprobación de medianoche
  setInterval(_checkMidnight, 60000);

  // Modo offline recovery
  setupOfflineRecovery();

  // Inicializar Sheets si está configurado
  if (isConfigured()) {
    setSyncStatus("syncing");
    const ok = await initSheetsAPI();
    if (ok) {
      syncOnOpen((remoteData) => {
        if (confirm(
          `Se encontró un estado más reciente en Google Sheets (Nivel ${remoteData.nivel}, ${remoteData.xp_total.toLocaleString()} XP).\n\n¿Cargar ese estado?`
        )) {
          applyRemoteState(remoteData);
          updateCharacterUI();
        }
      });
    }
  } else {
    setSyncStatus("none");
  }

  // Registrar service worker
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

// ── NAVEGACIÓN DE TABS ──
export function switchTab(tabId, btn) {
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("tab-" + tabId)?.classList.add("active");
  if (btn) btn.classList.add("active");
  resumeAudio();

  // Renderizado lazy de tabs que lo necesitan
  if (tabId === "settings") _renderSettingsTab();
}

// ── PESTAÑA AJUSTES ──
function _renderSettingsTab() {
  _renderSheetsSection();
  renderMigrationPanel("settings-migration");
  renderSpriteManager("settings-sprite-manager");
}

function _renderSheetsSection() {
  const statusEl = document.getElementById("sheets-status-text");
  const lastSyncEl = document.getElementById("sheets-last-sync");
  const connectBtn = document.getElementById("sheets-connect-btn");
  const disconnectBtn = document.getElementById("sheets-disconnect-btn");

  if (!statusEl) return;

  if (isConnected()) {
    statusEl.innerHTML = `<span style="color:var(--green)">🟢 Conectado</span>`;
    if (connectBtn) connectBtn.style.display = "none";
    if (disconnectBtn) disconnectBtn.style.display = "inline-block";
  } else if (isConfigured()) {
    statusEl.innerHTML = `<span style="color:var(--gold)">🟡 Configurado (sin token activo)</span>`;
    if (connectBtn) { connectBtn.style.display = "inline-block"; connectBtn.textContent = "🔑 Re-autenticar"; }
    if (disconnectBtn) disconnectBtn.style.display = "inline-block";
  } else {
    statusEl.innerHTML = `<span style="color:var(--dim)">⚫ Sin configurar</span>`;
    if (connectBtn) { connectBtn.style.display = "inline-block"; connectBtn.textContent = "🔗 Configurar Sheets"; }
    if (disconnectBtn) disconnectBtn.style.display = "none";
  }

  if (lastSyncEl) lastSyncEl.textContent = getLastSyncLabel();
}

// ── FECHA EN HEADER ──
function updateHeaderDate() {
  const now = new Date();
  const days = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
  const months = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const el = document.getElementById("header-date");
  if (el) el.innerHTML = `<span>${days[now.getDay()]}</span>${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

// ── COMPROBACIÓN DE MEDIANOCHE ──
function _checkMidnight() {
  if (state.today !== todayStr()) {
    handleNewDay();
    updateCharacterUI();
    updateHabitsUI();
    updateNutritionUI();
    updatePomoUI();
    restoreReflectionUI();
  }
}

// ── KEYBOARD SHORTCUTS ──
function _setupKeyboard() {
  const taskInput = document.getElementById("task-input");
  if (taskInput) {
    taskInput.addEventListener("keydown", e => { if (e.key === "Enter") addTask(); });
  }
}

// ── FUNCIONES GLOBALES PARA EL HTML ──
function _bindGlobalActions() {
  // Navegación
  window.switchTab = switchTab;

  // Level up overlay
  window.closeLevelUp = closeLevelUp;

  // Ajustes: Google Sheets
  window._sheetsConnect = async () => {
    if (isConfigured()) {
      // Ya configurado → sólo pedir token
      const ok = await initSheetsAPI();
      if (ok) requestAuth();
    } else {
      // Mostrar formulario de configuración inline
      _showSheetsSetupForm();
    }
    setTimeout(_renderSheetsSection, 3000);
  };

  window._sheetsDisconnect = () => {
    if (confirm("¿Desconectar Google Sheets? Se borrarán las credenciales guardadas.")) {
      clearCreds();
      setSyncStatus("none");
      _renderSheetsSection();
    }
  };

  window._sheetsSync = async () => {
    if (!isConnected()) { alert("No hay conexión activa con Google Sheets."); return; }
    const ok = await pushCurrentState();
    if (ok) { markSynced(); _renderSheetsSection(); }
  };

  // Exportar
  window.exportExcel = exportExcel;
  window.exportToObsidian = exportToObsidian;

  // Zona de peligro
  window._resetDay = () => {
    if (confirm("¿Resetear el día actual? Se borrarán hábitos, tareas y nutrición de hoy (no el XP ni el historial).")) {
      state.fixedHabits = {};
      state.tasks = [];
      state.nutrition = {};
      state.pomodoro = { count: 0, consecutive: 0, forgeXp: 0 };
      state.reflection = { score: 5, objective: null, today: "", tomorrow: "", closed: false };
      saveState();
      updateHabitsUI();
      updateNutritionUI();
      updatePomoUI();
      restoreReflectionUI();
      alert("Día reseteado. ¡A por ello, guerrero!");
    }
  };

  window._deleteAllData = () => {
    const first = confirm("⚠️ ¿Borrar TODOS los datos de KRONOS?\n\nEsto eliminará tu personaje, XP, historial y todo el progreso. Esta acción NO se puede deshacer.");
    if (!first) return;
    const second = confirm("¿Estás completamente seguro? Se perderá todo el progreso permanentemente.");
    if (!second) return;
    localStorage.removeItem("kronos_state");
    localStorage.removeItem("kronos_sprite_overrides");
    localStorage.removeItem("kronos_sheets_creds");
    localStorage.removeItem("kronos_last_sync");
    location.reload();
  };
}

// ── FORMULARIO DE CONFIGURACIÓN DE SHEETS (modal inline) ──
function _showSheetsSetupForm() {
  const existing = document.getElementById("sheets-setup-modal");
  if (existing) { existing.style.display = "flex"; return; }

  const modal = document.createElement("div");
  modal.id = "sheets-setup-modal";
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:800;
    display:flex;align-items:center;justify-content:center;padding:20px;
  `;
  modal.innerHTML = `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r);
      padding:20px;max-width:400px;width:100%">
      <div style="font-family:Georgia,serif;font-size:1rem;color:var(--gold);
        letter-spacing:2px;margin-bottom:16px">⚙️ CONECTAR GOOGLE SHEETS</div>

      <div style="font-size:.72rem;color:var(--dim);margin-bottom:4px">Client ID de OAuth2</div>
      <input type="text" id="setup-client-id" class="task-input" style="margin-bottom:12px;font-size:.78rem"
        placeholder="XXXXXXXXXX.apps.googleusercontent.com">

      <div style="font-size:.72rem;color:var(--dim);margin-bottom:4px">ID de la Hoja de Cálculo</div>
      <input type="text" id="setup-sheet-id" class="task-input" style="margin-bottom:16px;font-size:.78rem"
        placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms">

      <div style="font-size:.72rem;color:var(--dim);margin-bottom:16px;line-height:1.6">
        Necesitas un proyecto en Google Cloud Console con la API de Sheets habilitada
        y un Client ID OAuth2 de tipo "Aplicación web".
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn" onclick="window._setupSheetsSubmit()">🔗 Conectar con Google</button>
        <button class="btn-ghost" onclick="document.getElementById('sheets-setup-modal').style.display='none'">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  window._setupSheetsSubmit = async () => {
    const clientId = document.getElementById("setup-client-id").value.trim();
    const sheetId = document.getElementById("setup-sheet-id").value.trim();
    if (!clientId || !sheetId) { alert("Rellena ambos campos."); return; }

    modal.style.display = "none";
    const { setupSheets } = await import('./sheets.js');
    await setupSheets(clientId, sheetId);
    setTimeout(_renderSheetsSection, 2000);
  };
}

// ── ARRANQUE ──
document.addEventListener("DOMContentLoaded", init);
