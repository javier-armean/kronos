// js/nutrition.js — El Alquimista / Módulo de nutrición

import { CONFIG } from './config.js';
import { state, saveState } from './state.js';
import { addXP, spawnParticles } from './character.js';

// ── UI ──
export function updateNutritionUI() {
  const container = document.getElementById("nutrition-list");
  if (!container) return;

  // Agrupar por tiempo de comida
  const groups = {};
  for (const item of CONFIG.NUTRITION_ITEMS) {
    if (!groups[item.time]) groups[item.time] = [];
    groups[item.time].push(item);
  }

  const total = CONFIG.NUTRITION_ITEMS.length;
  const done = CONFIG.NUTRITION_ITEMS.filter(i => state.nutrition[i.id]).length;

  const progEl = document.getElementById("nutr-progress");
  if (progEl) progEl.textContent = `${done}/${total}`;

  const barEl = document.getElementById("nutr-bar");
  if (barEl) barEl.style.width = Math.round((done / total) * 100) + "%";

  let html = "";
  for (const [time, items] of Object.entries(groups)) {
    html += `<div class="meal-block">
      <div class="meal-time-header">
        <span class="meal-time-badge">${time}</span>
      </div>`;
    html += items.map(item => {
      const isDone = !!state.nutrition[item.id];
      return `<div class="nutr-habit${isDone ? " done" : ""}" onclick="window._toggleNutrition('${item.id}')">
        <div class="nutr-cb"></div>
        <span class="nutr-label">${item.label}</span>
        <span class="nutr-xp">+${item.xp}</span>
      </div>`;
    }).join("");
    html += `</div>`;
  }

  container.innerHTML = html;
}

// ── INTERACCIÓN ──
export function toggleNutrition(id) {
  const item = CONFIG.NUTRITION_ITEMS.find(i => i.id === id);
  if (!item) return;

  if (state.nutrition[id]) {
    state.nutrition[id] = false;
  } else {
    state.nutrition[id] = true;
    state.character.stats.vitalidad = (state.character.stats.vitalidad || 0) + 1;
    addXP(item.xp, "· Alquimia ✓");
    spawnParticles();

    // Bonus si se completan todos los suplementos (💊)
    const supplements = CONFIG.NUTRITION_ITEMS.filter(i => i.label.includes("💊"));
    const allSupps = supplements.every(i => state.nutrition[i.id]);
    if (allSupps && supplements.length > 0) {
      setTimeout(() => addXP(30, "· ¡Todos los suplementos! ⚗️"), 500);
    }
  }

  saveState();
  updateNutritionUI();
}

// ── EXPONER PARA ONCLICK INLINE ──
export function bindNutritionGlobals() {
  window._toggleNutrition = toggleNutrition;
}
