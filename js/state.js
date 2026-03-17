// js/state.js — Gestión de estado (localStorage + señal de sincronización)

export const state = {};

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function defaultState() {
  return {
    character: {
      totalXp: 0,
      level: 1,
      stats: { fuerza: 0, mente: 0, espiritu: 0, destreza: 0, vitalidad: 0, resistencia: 0 },
      streak: 0,
      lastActiveDate: null,
      lastClosedDate: null,
    },
    today: todayStr(),
    fixedHabits: {},
    tasks: [],
    maintenance: {},
    maintLastReset: null,
    nutrition: {},
    pomodoro: { count: 0, consecutive: 0, forgeXp: 0 },
    reflection: { score: 5, objective: null, today: "", tomorrow: "", closed: false },
    history: [],           // Array de días cerrados
    syncPending: false,    // Hay cambios sin subir a Sheets
  };
}

export function loadState() {
  try {
    const saved = localStorage.getItem("kronos_state");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge: asegurar que campos nuevos existen
      Object.assign(state, {
        ...defaultState(),
        ...parsed,
        character: { ...defaultState().character, ...parsed.character },
        pomodoro: { ...defaultState().pomodoro, ...parsed.pomodoro },
        reflection: { ...defaultState().reflection, ...parsed.reflection },
      });
      if (!Array.isArray(state.history)) state.history = [];
      if (state.today !== todayStr()) handleNewDay();
    } else {
      Object.assign(state, defaultState());
    }
  } catch (e) {
    console.warn("KRONOS: error cargando estado, usando default", e);
    Object.assign(state, defaultState());
  }
}

export function saveState() {
  try {
    localStorage.setItem("kronos_state", JSON.stringify(state));
  } catch (e) {
    console.warn("KRONOS: error guardando estado", e);
  }
}

export function handleNewDay() {
  const prev = state.today;
  const today = todayStr();

  const prevDate = new Date(prev);
  const todayDate = new Date(today);
  const diffDays = Math.round((todayDate - prevDate) / 86400000);

  if (state.reflection && state.reflection.closed) {
    if (diffDays === 1) {
      state.character.streak = (state.character.streak || 0) + 1;
    } else if (diffDays > 1) {
      state.character.streak = 0;
    }
  } else {
    if (diffDays > 1) state.character.streak = 0;
  }

  state.character.lastActiveDate = prev;

  // Reset diario
  state.today = today;
  state.fixedHabits = {};
  state.tasks = [];
  state.nutrition = {};
  state.pomodoro = { count: 0, consecutive: 0, forgeXp: 0 };
  state.reflection = { score: 5, objective: null, today: "", tomorrow: "", closed: false };

  // Reset mantenimiento los lunes
  const dayOfWeek = todayDate.getDay(); // 0=Dom, 1=Lun
  if (dayOfWeek === 1) {
    state.maintenance = {};
    state.maintLastReset = today;
  }

  saveState();
}

// ── INDICADOR DE SYNC ──
// Estados: 'none' | 'synced' | 'pending' | 'error' | 'syncing'
export function setSyncStatus(status) {
  const el = document.getElementById("sync-indicator");
  if (!el) return;
  const map = {
    none:    { icon: "⚫", title: "Sin configurar" },
    synced:  { icon: "🟢", title: "Sincronizado" },
    pending: { icon: "🟡", title: "Cambios pendientes" },
    error:   { icon: "🔴", title: "Error de sincronización" },
    syncing: { icon: "🔄", title: "Sincronizando..." },
  };
  const item = map[status] || map.none;
  el.textContent = item.icon;
  el.title = item.title;
  el.dataset.status = status;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
