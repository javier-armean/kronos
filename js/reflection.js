// js/reflection.js — Reflexión diaria y cierre de día

import { CONFIG } from './config.js';
import { state, saveState, escapeHtml } from './state.js';
import { addXP, spawnParticles, playCompletionSound, getRank } from './character.js';
import { pushCurrentState, pushDayToHistory, markSynced, isConnected } from './sheets.js';

// ── ACTUALIZAR SLIDER DE PUNTUACIÓN ──
export function updateDayScore(val) {
  state.reflection.score = parseInt(val);
  const scoreVal = document.getElementById("day-score-val");
  const scoreLabel = document.getElementById("day-score-label");
  if (scoreVal) scoreVal.textContent = val;
  if (scoreLabel) scoreLabel.textContent = val;
  saveState();
}

// ── SELECCIONAR OBJETIVO ──
export function selectObj(type) {
  state.reflection.objective = type;
  saveState();
  document.querySelectorAll(".obj-btn").forEach(btn => btn.classList.remove("sel"));
  const btn = document.querySelector(`.obj-btn.${type}`);
  if (btn) btn.classList.add("sel");
}

// ── CERRAR EL DÍA ──
export async function closeDay() {
  if (state.reflection.closed) {
    alert("Ya cerraste el día de hoy. ¡Hasta mañana, guerrero!");
    return;
  }

  // Guardar textos de reflexión
  const todayInput = document.getElementById("reflection-today");
  const tomorrowInput = document.getElementById("reflection-tomorrow");
  state.reflection.today = todayInput ? todayInput.value : "";
  state.reflection.tomorrow = tomorrowInput ? tomorrowInput.value : "";
  state.reflection.closed = true;

  // XP según puntuación
  const score = state.reflection.score;
  const bonusXp = score >= 8 ? 30 : score >= 5 ? 15 : 5;
  addXP(bonusXp, `· Día cerrado (${score}/10) 🌙`);

  // Calcular datos del día para el historial
  const habitsDone = CONFIG.FIXED_HABITS.filter(h => state.fixedHabits[h.id]).length;
  const tasksDone = state.tasks.filter(t => t.done).length;
  const nutrDone = CONFIG.NUTRITION_ITEMS.filter(i => state.nutrition[i.id]).length;
  const xpGained = _calcXpGainedToday();

  const dayEntry = {
    date: state.today,
    level: state.character.level,
    xpGained,
    habitsDone,
    totalHabits: CONFIG.FIXED_HABITS.length,
    pomodoros: state.pomodoro.count,
    score,
    objective: state.reflection.objective || "—",
    reflection: state.reflection.today,
    tomorrow: state.reflection.tomorrow,
    stats: { ...state.character.stats },
    nutrDone,
    totalNutr: CONFIG.NUTRITION_ITEMS.length,
    tasksDone,
    totalTasks: state.tasks.length,
  };

  // Añadir al historial local
  if (!Array.isArray(state.history)) state.history = [];
  state.history.push(dayEntry);

  saveState();
  showDaySummary();
  spawnParticles();
  playCompletionSound();

  // Sincronizar con Sheets si está conectado
  if (isConnected()) {
    const syncIndicator = document.getElementById("sync-indicator");
    if (syncIndicator) syncIndicator.textContent = "🔄";

    const dayData = {
      fecha: dayEntry.date,
      nivel: dayEntry.level,
      xp_ganado_hoy: xpGained,
      habitos_completados: `${habitsDone}/${CONFIG.FIXED_HABITS.length}`,
      pomodoros: state.pomodoro.count,
      score_dia: score,
      objetivo_principal: dayEntry.objective,
      reflexion_hoy: dayEntry.reflection,
      proposito_manana: dayEntry.tomorrow,
      fuerza: state.character.stats.fuerza || 0,
      mente: state.character.stats.mente || 0,
      espiritu: state.character.stats.espiritu || 0,
      destreza: state.character.stats.destreza || 0,
      vitalidad: state.character.stats.vitalidad || 0,
      resistencia: state.character.stats.resistencia || 0,
      nutricion_pct: `${Math.round((nutrDone / CONFIG.NUTRITION_ITEMS.length) * 100)}%`,
      tareas_str: `${tasksDone}/${state.tasks.length}`,
    };

    try {
      await pushDayToHistory(dayData);
      await pushCurrentState();
      markSynced();
    } catch (e) {
      console.warn("KRONOS: error sincronizando cierre de día", e);
    }
  }
}

// ── RESUMEN DEL DÍA ──
export function showDaySummary() {
  const summary = document.getElementById("day-summary");
  const content = document.getElementById("day-summary-content");
  if (!summary || !content) return;

  const { totalXp, level, streak } = state.character;
  const habitsDone = CONFIG.FIXED_HABITS.filter(h => state.fixedHabits[h.id]).length;
  const tasksDone = state.tasks.filter(t => t.done).length;

  content.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div style="text-align:center;background:rgba(0,0,0,.3);border-radius:8px;padding:10px">
        <div style="font-family:Georgia,serif;font-size:1.5rem;color:var(--gold2)">${totalXp.toLocaleString()}</div>
        <div style="font-size:.7rem;color:var(--dim)">XP TOTAL</div>
      </div>
      <div style="text-align:center;background:rgba(0,0,0,.3);border-radius:8px;padding:10px">
        <div style="font-family:Georgia,serif;font-size:1.5rem;color:var(--blue2)">${habitsDone}/${CONFIG.FIXED_HABITS.length}</div>
        <div style="font-size:.7rem;color:var(--dim)">HÁBITOS</div>
      </div>
      <div style="text-align:center;background:rgba(0,0,0,.3);border-radius:8px;padding:10px">
        <div style="font-family:Georgia,serif;font-size:1.5rem;color:var(--green)">${state.pomodoro.count}</div>
        <div style="font-size:.7rem;color:var(--dim)">POMODOROS</div>
      </div>
      <div style="text-align:center;background:rgba(0,0,0,.3);border-radius:8px;padding:10px">
        <div style="font-family:Georgia,serif;font-size:1.5rem;color:var(--red)">🔥 ${streak}</div>
        <div style="font-size:.7rem;color:var(--dim)">RACHA</div>
      </div>
    </div>
    ${state.reflection.today
      ? `<div style="font-size:.82rem;color:var(--dim);margin-bottom:4px">Reflexión:</div>
         <div style="font-size:.85rem;font-style:italic;color:var(--text);margin-bottom:10px">"${escapeHtml(state.reflection.today)}"</div>`
      : ""}
  `;

  summary.style.display = "block";
}

// ── RESTAURAR UI DE REFLEXIÓN ──
export function restoreReflectionUI() {
  const slider = document.getElementById("day-score-slider");
  if (slider) {
    slider.value = state.reflection.score || 5;
    const scoreVal = document.getElementById("day-score-val");
    const scoreLabel = document.getElementById("day-score-label");
    if (scoreVal) scoreVal.textContent = slider.value;
    if (scoreLabel) scoreLabel.textContent = slider.value;
  }

  if (state.reflection.objective) {
    const btn = document.querySelector(`.obj-btn.${state.reflection.objective}`);
    if (btn) btn.classList.add("sel");
  }

  const todayInput = document.getElementById("reflection-today");
  const tomorrowInput = document.getElementById("reflection-tomorrow");
  if (todayInput) todayInput.value = state.reflection.today || "";
  if (tomorrowInput) tomorrowInput.value = state.reflection.tomorrow || "";

  if (state.reflection.closed) showDaySummary();
}

// ── EXPORTAR A OBSIDIAN ──
export function exportToObsidian() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const fmt = d => d.toISOString().slice(0, 10);
  const { totalXp, level, stats, streak } = state.character;

  const habitsDone = CONFIG.FIXED_HABITS.filter(h => state.fixedHabits[h.id]).length;
  const nutrDone = CONFIG.NUTRITION_ITEMS.filter(i => state.nutrition[i.id]).length;
  const tasksDone = state.tasks.filter(t => t.done).length;

  const statsStr = CONFIG.STATS_CONFIG.map(sc =>
    `| ${sc.icon} ${sc.label} | ${stats[sc.key] || 0} |`
  ).join("\n");

  const habitsStr = CONFIG.FIXED_HABITS.map(h =>
    `- [${state.fixedHabits[h.id] ? "x" : " "}] ${h.label}`
  ).join("\n");

  const md = `---
fecha: ${fmt(now)}
semana: ${fmt(weekStart)} / ${fmt(weekEnd)}
nivel: ${level}
xp_total: ${totalXp}
racha: ${streak}
puntuacion_dia: ${state.reflection.score || 0}
---

# ⚔️ KRONOS — Semana ${fmt(weekStart)}

## 🧙 Estado del Guerrero

| Stat | Valor |
|------|-------|
| **Nivel** | ${level} — ${getRank(level)} |
| **XP Total** | ${totalXp.toLocaleString()} |
| **Racha** | 🔥 ${streak} días |
${statsStr}

## 📋 Hábitos del Día

${habitsStr}

**Completados:** ${habitsDone}/${CONFIG.FIXED_HABITS.length}

## 🍅 La Forja (Pomodoros)

- Pomodoros completados: **${state.pomodoro.count}**
- XP de la Forja: **${state.pomodoro.forgeXp}**

## 🌿 El Alquimista (Nutrición)

- Ítems completados: **${nutrDone}/${CONFIG.NUTRITION_ITEMS.length}**

## ✅ Misiones del Día

- Tareas completadas: **${tasksDone}/${state.tasks.length}**
${state.tasks.map(t => `- [${t.done ? "x" : " "}] ${t.text}`).join("\n")}

## 📖 Reflexión

- **Puntuación:** ${state.reflection.score || "—"}/10
- **Objetivo principal:** ${
    state.reflection.objective === "si" ? "✅ Sí"
    : state.reflection.objective === "par" ? "⚡ Parcialmente"
    : state.reflection.objective === "no" ? "❌ No"
    : "—"}
- **Reflexión de hoy:** ${state.reflection.today || "—"}
- **Propósito de mañana:** ${state.reflection.tomorrow || "—"}

---
*Exportado desde KRONOS — ${new Date().toLocaleString("es-ES")}*
`;

  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `KRONOS_${fmt(weekStart)}_${fmt(weekEnd)}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── HELPERS ──
function _calcXpGainedToday() {
  let xp = 0;
  CONFIG.FIXED_HABITS.forEach(h => { if (state.fixedHabits[h.id]) xp += h.xp; });
  CONFIG.NUTRITION_ITEMS.forEach(i => { if (state.nutrition[i.id]) xp += i.xp; });
  state.tasks.forEach(t => { if (t.done) xp += 10; });
  xp += state.pomodoro.forgeXp || 0;
  const score = state.reflection.score;
  xp += score >= 8 ? 30 : score >= 5 ? 15 : 5;
  return xp;
}

// ── EXPONER PARA ONCLICK INLINE ──
export function bindReflectionGlobals() {
  window.updateDayScore = updateDayScore;
  window.selectObj = selectObj;
  window.closeDay = closeDay;
  window.exportToObsidian = exportToObsidian;
}

// ── AUTO-SAVE TEXTOS DE REFLEXIÓN ──
export function setupReflectionListeners() {
  const ids = ["reflection-today", "reflection-tomorrow"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => {
        state.reflection[id === "reflection-today" ? "today" : "tomorrow"] = el.value;
        saveState();
      });
    }
  });
}
