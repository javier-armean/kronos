// js/pomodoro.js — Timer Pomodoro / La Forja del Guerrero

import { state, saveState } from './state.js';
import { addXP, playSound, spawnParticles } from './character.js';

// ── ESTADO DEL TIMER ──
let _timer = null;
const pomoState = {
  running: false,
  mode: "work",       // "work" | "break"
  remaining: 25 * 60,
  total: 25 * 60,
};

// ── CONTROLES ──
export function togglePomodoro() {
  if (pomoState.running) {
    pausePomodoro();
  } else {
    startPomodoro();
  }
}

export function startPomodoro() {
  pomoState.running = true;
  const btn = document.getElementById("pomo-start-btn");
  if (btn) { btn.textContent = "⏸ Pausar"; btn.classList.add("primary"); }
  _timer = setInterval(_tickPomodoro, 1000);
}

export function pausePomodoro() {
  pomoState.running = false;
  clearInterval(_timer);
  _timer = null;
  const btn = document.getElementById("pomo-start-btn");
  if (btn) btn.textContent = "▶ Reanudar";
}

export function resetPomodoro() {
  pausePomodoro();
  pomoState.mode = "work";
  pomoState.remaining = 25 * 60;
  pomoState.total = 25 * 60;
  const btn = document.getElementById("pomo-start-btn");
  if (btn) btn.textContent = "▶ Iniciar";
  _setDomText("pomo-mode-label", "Concentración");
  _setRingStroke("var(--blue)");
  renderPomoTime();
  _updatePomoRing();
}

export function skipPomodoro() {
  if (pomoState.mode === "work") {
    _completePomodoroWork();
  } else {
    _completePomodoroBreak();
  }
}

export function closeBonusOverlay() {
  const el = document.getElementById("bonus-overlay");
  if (el) el.classList.remove("show");
  startPomodoro();
}

// ── TICK ──
function _tickPomodoro() {
  if (pomoState.remaining <= 0) {
    if (pomoState.mode === "work") {
      _completePomodoroWork();
    } else {
      _completePomodoroBreak();
    }
    return;
  }
  pomoState.remaining--;
  renderPomoTime();
  _updatePomoRing();

  // Barra de energía
  const elapsed = pomoState.total - pomoState.remaining;
  const pct = Math.round((elapsed / pomoState.total) * 100);
  _setStyle("energy-bar", "width", pct + "%");
  _setDomText("energy-pct", pct + "%");
}

// ── COMPLETAR CICLO DE TRABAJO ──
function _completePomodoroWork() {
  clearInterval(_timer);
  _timer = null;
  pomoState.running = false;
  playSound("complete");

  state.pomodoro.count++;
  state.pomodoro.consecutive++;
  state.character.stats.mente = (state.character.stats.mente || 0) + 2;

  let xpGain = 15;

  if (state.pomodoro.consecutive % 4 === 0) {
    xpGain *= 2;
    state.pomodoro.forgeXp += xpGain;
    addXP(xpGain, "· Pomodoro (×2 Bonus!) 🍅");
    saveState();
    updatePomoUI();
    setTimeout(() => {
      const overlay = document.getElementById("bonus-overlay");
      if (overlay) overlay.classList.add("show");
    }, 500);
  } else {
    state.pomodoro.forgeXp += xpGain;
    addXP(xpGain, "· Pomodoro completado 🍅");
    saveState();
    updatePomoUI();
  }

  spawnParticles();

  // Pasar a descanso
  pomoState.mode = "break";
  pomoState.remaining = 5 * 60;
  pomoState.total = 5 * 60;
  _setDomText("pomo-mode-label", "Descanso Sagrado");
  _setRingStroke("var(--green)");
  const btn = document.getElementById("pomo-start-btn");
  if (btn) { btn.textContent = "▶ Iniciar Descanso"; btn.classList.remove("primary"); }
  _setStyle("energy-bar", "width", "0%");
  _setDomText("energy-pct", "0%");
  renderPomoTime();
  _updatePomoRing();
}

// ── COMPLETAR DESCANSO ──
function _completePomodoroBreak() {
  clearInterval(_timer);
  _timer = null;
  pomoState.running = false;
  playSound("rest");

  addXP(5, "· Descanso completado 🛡");
  saveState();

  pomoState.mode = "work";
  pomoState.remaining = 25 * 60;
  pomoState.total = 25 * 60;
  _setDomText("pomo-mode-label", "Concentración");
  _setRingStroke("var(--blue)");
  const btn = document.getElementById("pomo-start-btn");
  if (btn) { btn.textContent = "▶ Nueva Batalla"; btn.classList.remove("primary"); }
  renderPomoTime();
  _updatePomoRing();
}

// ── RENDER ──
export function renderPomoTime() {
  const m = Math.floor(pomoState.remaining / 60);
  const s = pomoState.remaining % 60;
  _setDomText("pomo-time-display", String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0"));
}

export function updatePomoUI() {
  _setDomText("pomo-today-count", state.pomodoro.count);
  _setDomText("pomo-consec", state.pomodoro.consecutive);
  _setDomText("pomo-total-xp", state.pomodoro.forgeXp);

  const dots = document.querySelectorAll(".pomo-dot");
  const consec = state.pomodoro.consecutive % 4;
  const bonusActive = state.pomodoro.consecutive > 0 && state.pomodoro.consecutive % 4 === 0;
  dots.forEach((d, i) => {
    d.className = "pomo-dot";
    if (bonusActive) {
      d.classList.add("bonus");
    } else if (i < consec) {
      d.classList.add("active");
    }
  });
}

function _updatePomoRing() {
  const pct = pomoState.remaining / pomoState.total;
  const circumference = 2 * Math.PI * 90; // ~565
  const offset = circumference * pct;
  const ring = document.getElementById("pomo-ring-progress");
  if (ring) ring.style.strokeDashoffset = offset;
}

// ── HELPERS DOM ──
function _setDomText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function _setStyle(id, prop, val) {
  const el = document.getElementById(id);
  if (el) el.style[prop] = val;
}

function _setRingStroke(color) {
  const ring = document.getElementById("pomo-ring-progress");
  if (ring) ring.style.stroke = color;
}

// ── EXPONER PARA ONCLICK INLINE ──
export function bindPomodoroGlobals() {
  window.togglePomodoro = togglePomodoro;
  window.resetPomodoro = resetPomodoro;
  window.skipPomodoro = skipPomodoro;
  window.closeBonusOverlay = closeBonusOverlay;
}
