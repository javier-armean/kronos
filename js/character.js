// js/character.js — Lógica de personaje, XP, niveles, stats, audio, partículas

import { CONFIG } from './config.js';
import { state, saveState, setSyncStatus } from './state.js';
import { renderAvatar } from './sprites.js';

// ── SISTEMA DE NIVELES ──
export function xpForLevel(lvl) { return CONFIG.xpForLevel(lvl); }
export function xpToNextLevel(lvl) { return CONFIG.xpToNextLevel(lvl); }

export function calcLevel(totalXp) {
  let lvl = 1;
  while (xpForLevel(lvl + 1) <= totalXp) lvl++;
  return lvl;
}

export function getRank(lvl) {
  for (const r of CONFIG.RANKS) {
    if (lvl >= r.min && lvl <= r.max) return r.title;
  }
  return CONFIG.RANKS[CONFIG.RANKS.length - 1].title;
}

// ── AÑADIR XP ──
export function addXP(amount, label) {
  const oldLevel = calcLevel(state.character.totalXp);
  state.character.totalXp += amount;
  const newLevel = calcLevel(state.character.totalXp);
  state.character.level = newLevel;

  // Marcar cambios pendientes de subir
  state.syncPending = true;
  saveState();

  showXpPopup(`+${amount} XP ${label || ""}`);
  updateCharacterUI();

  if (newLevel > oldLevel) {
    setTimeout(() => showLevelUp(newLevel), 800);
  }
}

// ── UI DEL PERSONAJE ──
export function updateCharacterUI() {
  const { totalXp, level, stats, streak } = state.character;
  const rank = getRank(level);
  const xpThisLevel = totalXp - xpForLevel(level);
  const xpNeeded = xpToNextLevel(level);
  const pct = Math.min(100, (xpThisLevel / xpNeeded) * 100);

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setStyle = (id, prop, val) => { const el = document.getElementById(id); if (el) el.style[prop] = val; };

  setText("char-title-text", rank);
  setText("level-badge", `NIVEL ${level}`);
  setText("xp-info", `${xpThisLevel} / ${xpNeeded} XP`);
  setStyle("xp-bar", "width", pct + "%");
  setText("xp-numbers", `${totalXp.toLocaleString()} XP totales acumulados`);
  setText("streak-val", streak);

  // Stats grid
  const grid = document.getElementById("stats-grid");
  if (grid) {
    grid.innerHTML = CONFIG.STATS_CONFIG.map(sc => {
      const val = stats[sc.key] || 0;
      const barPct = Math.min(100, val);
      return `<div class="stat-card">
        <div class="stat-top">
          <div style="display:flex;align-items:center;gap:5px">
            <span class="stat-icon">${sc.icon}</span>
            <span class="stat-label">${sc.label}</span>
          </div>
          <span class="stat-value">${val}</span>
        </div>
        <div class="stat-bar-bg">
          <div class="stat-bar-fg ${sc.cls}" style="width:${barPct}%"></div>
        </div>
      </div>`;
    }).join("");
  }

  // Avatar
  renderAvatar(level);
}

// ── XP POPUP ──
let _popupTimeout = null;
export function showXpPopup(text) {
  const el = document.getElementById("xp-popup");
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(_popupTimeout);
  _popupTimeout = setTimeout(() => el.classList.remove("show"), 2200);
}

// ── LEVEL UP OVERLAY ──
export function showLevelUp(level) {
  playSound("levelup");
  const numEl = document.getElementById("lu-level-num");
  const rankEl = document.getElementById("lu-rank-text");
  const overlay = document.getElementById("levelup-overlay");
  if (numEl) numEl.textContent = level;
  if (rankEl) rankEl.textContent = getRank(level);
  if (overlay) overlay.classList.add("show");
  for (let i = 0; i < 20; i++) setTimeout(() => spawnParticles(), i * 80);
}

export function closeLevelUp() {
  const overlay = document.getElementById("levelup-overlay");
  if (overlay) overlay.classList.remove("show");
}

// ── PARTÍCULAS ──
const PARTS = ["✨", "⭐", "💫", "🌟", "✦", "◆", "▲"];
export function spawnParticles() {
  for (let i = 0; i < 6; i++) {
    const el = document.createElement("div");
    el.className = "particle";
    el.textContent = PARTS[Math.floor(Math.random() * PARTS.length)];
    el.style.left = (20 + Math.random() * 60) + "%";
    el.style.top = (30 + Math.random() * 40) + "%";
    el.style.animationDelay = (Math.random() * 0.5) + "s";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }
}

// ── AUDIO (Web Audio API) ──
let _audioCtx = null;

export function getAudio() {
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }
  return _audioCtx;
}

export function resumeAudio() {
  const ctx = getAudio();
  if (ctx && ctx.state === "suspended") ctx.resume();
}

export function playTone(freq, duration, type = "sine", vol = 0.15) {
  const ctx = getAudio();
  if (!ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + duration);
  } catch (e) {}
}

export function playSound(type) {
  if (type === "complete") {
    [440, 550, 660, 880].forEach((f, i) => setTimeout(() => playTone(f, 0.3, "triangle"), i * 100));
  } else if (type === "rest") {
    [660, 550, 440].forEach((f, i) => setTimeout(() => playTone(f, 0.3, "sine"), i * 120));
  } else if (type === "levelup") {
    [262, 330, 392, 523, 659, 784].forEach((f, i) => setTimeout(() => playTone(f, 0.4, "triangle", 0.2), i * 80));
  } else if (type === "xp") {
    playTone(880, 0.1, "sine", 0.08);
  }
}

export function playCompletionSound() {
  [330, 440, 550, 660, 880, 1100].forEach((f, i) => setTimeout(() => playTone(f, 0.5, "triangle", 0.15), i * 100));
}
