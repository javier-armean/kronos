// js/habits.js — Hábitos fijos, tareas libres y mantenimiento semanal

import { CONFIG } from './config.js';
import { state, saveState, escapeHtml } from './state.js';
import { addXP, spawnParticles } from './character.js';

// ── UI DE HÁBITOS ──
export function updateHabitsUI() {
  _renderFixedHabits();
  _renderMaintenance();
  renderTasks();
}

function _renderFixedHabits() {
  const list = document.getElementById("fixed-habits-list");
  if (!list) return;

  let done = 0;
  list.innerHTML = CONFIG.FIXED_HABITS.map(h => {
    const checked = !!state.fixedHabits[h.id];
    if (checked) done++;
    return `<div class="habit-item${checked ? " done" : ""}" onclick="window._toggleHabit('${h.id}')">
      <div class="habit-cb"></div>
      <span class="habit-label">${h.label}</span>
      <span class="habit-xp">+${h.xp} XP</span>
    </div>`;
  }).join("");

  const prog = document.getElementById("habits-progress");
  if (prog) prog.textContent = `${done}/${CONFIG.FIXED_HABITS.length}`;
}

function _renderMaintenance() {
  const mList = document.getElementById("maintenance-list");
  if (!mList) return;

  let mDone = 0;
  mList.innerHTML = CONFIG.MAINTENANCE_TASKS.map(t => {
    const checked = !!state.maintenance[t.id];
    if (checked) mDone++;
    return `<div class="habit-item${checked ? " done" : ""}" onclick="window._toggleMaintenance('${t.id}')">
      <div class="habit-cb" style="border-color:#a855f7"></div>
      <span class="habit-label">${t.label}</span>
      <span class="habit-xp">+25 XP</span>
    </div>`;
  }).join("");

  const prog = document.getElementById("maint-progress");
  if (prog) prog.textContent = `${mDone}/${CONFIG.MAINTENANCE_TASKS.length}`;
}

export function renderTasks() {
  const ul = document.getElementById("task-list");
  if (!ul) return;

  if (!state.tasks.length) {
    ul.innerHTML = `<li class="empty-state">No hay misiones activas</li>`;
    return;
  }

  ul.innerHTML = state.tasks.map((t, i) =>
    `<li class="task-list-item${t.done ? " done" : ""}">
      <div class="habit-cb" style="width:18px;height:18px;border-color:var(--blue);${t.done ? "background:var(--blue)" : ""}"
        onclick="window._toggleTask(${i})">
        ${t.done ? '<span style="color:#000;font-size:.65rem;font-weight:bold">✓</span>' : ""}
      </div>
      <span class="task-text" style="font-size:.82rem;flex:1" onclick="window._toggleTask(${i})">${escapeHtml(t.text)}</span>
      <button class="task-del" onclick="window._deleteTask(${i})">✕</button>
    </li>`
  ).join("");
}

// ── INTERACCIONES ──
export function toggleHabit(id) {
  const habit = CONFIG.FIXED_HABITS.find(h => h.id === id);
  if (!habit) return;

  if (state.fixedHabits[id]) {
    state.fixedHabits[id] = false;
  } else {
    state.fixedHabits[id] = true;
    state.character.stats[habit.stat] = (state.character.stats[habit.stat] || 0) + 1;
    addXP(habit.xp, `· ${habit.label.split(" ")[1] || habit.label}`);
    spawnParticles();

    const allDone = CONFIG.FIXED_HABITS.every(h => state.fixedHabits[h.id]);
    if (allDone) {
      setTimeout(() => addXP(50, "· ¡Todos los hábitos! 🎉"), 500);
    }
  }
  saveState();
  updateHabitsUI();
}

export function toggleMaintenance(id) {
  if (state.maintenance[id]) {
    state.maintenance[id] = false;
  } else {
    state.maintenance[id] = true;
    addXP(25, "· Mantenimiento ✓");
    spawnParticles();
  }
  saveState();
  updateHabitsUI();
}

export function addTask() {
  const input = document.getElementById("task-input");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  state.tasks.push({ text, done: false });
  input.value = "";
  saveState();
  renderTasks();
}

export function toggleTask(i) {
  const task = state.tasks[i];
  if (!task) return;
  if (!task.done) {
    task.done = true;
    addXP(10, "· Misión completada ✓");
    spawnParticles();
  } else {
    task.done = false;
  }
  saveState();
  renderTasks();
}

export function deleteTask(i) {
  state.tasks.splice(i, 1);
  saveState();
  renderTasks();
}

export function clearCompletedTasks() {
  state.tasks = state.tasks.filter(t => !t.done);
  saveState();
  renderTasks();
}

export function resetMaintenance() {
  if (confirm("¿Resetear las tareas de mantenimiento?")) {
    state.maintenance = {};
    state.maintLastReset = new Date().toISOString().slice(0, 10);
    saveState();
    updateHabitsUI();
  }
}

// ── EXPONER PARA ONCLICK INLINE ──
export function bindHabitsGlobals() {
  window._toggleHabit = toggleHabit;
  window._toggleMaintenance = toggleMaintenance;
  window._toggleTask = toggleTask;
  window._deleteTask = deleteTask;
  window.addTask = addTask;
  window.clearCompletedTasks = clearCompletedTasks;
  window.resetMaintenance = resetMaintenance;
}
