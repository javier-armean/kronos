// js/sprites.js — Sistema de avatar por nivel con sprites PNG

import { CONFIG } from './config.js';

let _currentSpriteSrc = null;

// ── AVATAR FALLBACK (SVG generado en código) ──
// Se usa cuando la imagen PNG no está disponible todavía.
function buildWarriorSVG() {
  const P = 9, W = 14 * P, H = 22 * P;
  const G = "#ffd700", g = "#a87830", S = "#f4c896", E = "#1a3a8a",
        A = "#4a9eff", a = "#1a4a8a", B = "#c9a84c", L = "#1a2a6a",
        b = "#0a1a3a", w = "#d0d8e8", X = "#e8f0ff", m = "#c04040",
        _ = null;

  const rows = [
    [_,_,_,G,G,G,G,G,G,G,G,_,_,_],
    [_,_,g,G,G,G,G,G,G,G,G,g,_,_],
    [_,_,g,G,S,S,S,S,S,S,G,g,_,_],
    [_,_,g,G,S,E,S,S,S,E,G,g,_,_],
    [_,_,g,G,S,S,S,S,S,S,G,g,_,_],
    [_,_,g,G,S,S,m,S,m,S,G,g,_,_],
    [_,_,_,g,G,S,S,S,S,G,g,_,_,_],
    [_,_,_,X,A,A,A,A,A,A,X,_,_,_],
    [_,w,X,A,A,A,A,A,A,A,A,X,w,_],
    [_,w,A,A,A,A,A,A,A,A,A,A,w,_],
    [_,w,A,a,A,A,A,A,A,A,a,A,w,_],
    [_,w,A,a,B,B,B,B,B,B,a,A,w,_],
    [_,_,w,A,a,A,A,A,A,a,A,w,_,_],
    [_,_,w,L,L,L,_,_,L,L,L,w,_,_],
    [_,_,w,L,L,L,_,_,L,L,L,w,_,_],
    [_,_,w,L,L,L,_,_,L,L,L,w,_,_],
    [_,_,w,L,L,L,_,_,L,L,L,w,_,_],
    [_,_,w,b,b,b,_,_,b,b,b,w,_,_],
    [_,_,w,b,b,b,_,_,b,b,b,w,_,_],
    [_,_,_,b,b,b,_,_,b,b,b,_,_,_],
    [_,_,_,b,b,b,_,_,b,b,b,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ];

  let rects = "";
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const c = rows[y][x];
      if (c) rects += `<rect x="${x * P}" y="${y * P}" width="${P}" height="${P}" fill="${c}"/>`;
    }
  }

  // Espada
  const swordPixels = [
    [13,7,X],[13,8,X],[13,9,X],[13,10,X],[13,11,X],
    [13,12,X],[13,13,X],[13,14,w],[13,15,g],[13,16,g],
    [12,11,w],[12,12,w],
  ];
  for (const [px, py, c] of swordPixels) {
    rects += `<rect x="${px * P}" y="${py * P}" width="${P}" height="${P}" fill="${c}"/>`;
  }

  rects += `<ellipse cx="${W / 2}" cy="${H * 0.6}" rx="${W * 0.45}" ry="${H * 0.15}" fill="rgba(74,158,255,0.08)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W + P}" height="${H}" viewBox="0 0 ${W + P} ${H}" style="image-rendering:pixelated">${rects}</svg>`;
}

// ── RENDER PRINCIPAL ──
// Actualiza el DOM del avatar según el nivel.
// Si hay PNG, lo usa; si no carga, cae al SVG generado.
export function renderAvatar(level) {
  const container = document.getElementById("char-svg-container");
  if (!container) return;

  const sprite = CONFIG.getSpriteForLevel(level);
  const newSrc = sprite.src;
  const spriteChanged = _currentSpriteSrc !== null && _currentSpriteSrc !== newSrc;

  if (_currentSpriteSrc === null) {
    // Primera carga
    _initAvatar(container, newSrc);
  } else if (spriteChanged) {
    // Evolución: animación fade+scale antes de cambiar sprite
    _playEvolutionAnimation(container, newSrc);
  }

  _currentSpriteSrc = newSrc;
}

function _initAvatar(container, src) {
  // Intentar cargar PNG; si falla, usar SVG fallback
  const img = new Image();
  img.className = "avatar-img";
  img.alt = "Avatar del guerrero";
  img.style.cssText = "max-width:126px;max-height:198px;image-rendering:pixelated;";

  img.onload = () => {
    container.innerHTML = "";
    container.appendChild(img);
  };

  img.onerror = () => {
    // PNG no disponible aún → usar SVG generado en código
    container.innerHTML = buildWarriorSVG();
  };

  img.src = src;
}

function _playEvolutionAnimation(container, newSrc) {
  const existing = container.firstChild;
  if (!existing) { _initAvatar(container, newSrc); return; }

  // Fade out + scale up (evolución visual)
  existing.style.transition = "opacity 0.4s ease, transform 0.4s ease";
  existing.style.opacity = "0";
  existing.style.transform = "scale(1.4)";

  setTimeout(() => {
    // Probar nuevo PNG
    const img = new Image();
    img.className = "avatar-img";
    img.alt = "Avatar del guerrero";
    img.style.cssText = "max-width:126px;max-height:198px;image-rendering:pixelated;opacity:0;transform:scale(0.7);transition:opacity 0.4s ease,transform 0.4s ease;";

    img.onload = () => {
      container.innerHTML = "";
      container.appendChild(img);
      // Force reflow
      void img.offsetHeight;
      img.style.opacity = "1";
      img.style.transform = "scale(1)";
    };

    img.onerror = () => {
      container.innerHTML = buildWarriorSVG();
    };

    img.src = newSrc;
  }, 420);
}

// ── PANEL DE GESTIÓN DE SPRITES (pestaña Ajustes) ──
export function renderSpriteManager(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const overrides = CONFIG._getSpriteOverrides();
  const allSprites = [...CONFIG.SPRITES];

  let html = `<div class="sprite-manager">`;

  // Sprites base (no editables desde UI, sólo visualización)
  html += `<div style="font-size:.72rem;color:var(--dim);margin-bottom:8px">Sprites definidos en config.js:</div>`;
  html += `<div class="sprite-grid">`;
  allSprites.forEach(s => {
    html += `
      <div class="sprite-card">
        <div class="sprite-preview-wrap">
          <img src="${s.src}" alt="${s.label}"
            class="sprite-thumb"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
            style="max-width:48px;max-height:64px;image-rendering:pixelated">
          <div class="sprite-thumb-fallback" style="display:none">⚔️</div>
        </div>
        <div class="sprite-card-info">
          <div style="font-size:.72rem;color:var(--gold)">Nv. ${s.levelMin}–${s.levelMax === 9999 ? "∞" : s.levelMax}</div>
          <div style="font-size:.65rem;color:var(--dim)">${s.label}</div>
        </div>
      </div>`;
  });
  html += `</div>`;

  // Overrides en tiempo de ejecución
  if (overrides.length > 0) {
    html += `<div style="font-size:.72rem;color:var(--blue2);margin:12px 0 6px">Overrides guardados:</div>`;
    html += `<div class="sprite-grid">`;
    overrides.forEach((s, i) => {
      html += `
        <div class="sprite-card">
          <div class="sprite-preview-wrap">
            <img src="${s.src}" alt="${s.label}"
              class="sprite-thumb"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
              style="max-width:48px;max-height:64px;image-rendering:pixelated">
            <div class="sprite-thumb-fallback" style="display:none">⚔️</div>
          </div>
          <div class="sprite-card-info">
            <div style="font-size:.72rem;color:var(--blue2)">Nv. ${s.levelMin}–${s.levelMax === 9999 ? "∞" : s.levelMax}</div>
            <div style="font-size:.65rem;color:var(--dim)">${s.label}</div>
            <button class="btn-danger" style="margin-top:4px;padding:2px 6px;font-size:.6rem"
              onclick="window._removeSprite(${i})">Eliminar</button>
          </div>
        </div>`;
    });
    html += `</div>`;
  }

  // Formulario para añadir nuevo
  html += `
    <div id="sprite-add-form" style="display:none;margin-top:12px;background:rgba(0,0,0,.3);
      border:1px solid var(--border2);border-radius:8px;padding:12px">
      <div style="font-size:.78rem;color:var(--blue2);margin-bottom:10px">Nuevo rango de sprite</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div>
          <div style="font-size:.65rem;color:var(--dim);margin-bottom:4px">Nivel mínimo</div>
          <input type="number" class="task-input" id="sprite-min" placeholder="51" style="font-size:.8rem">
        </div>
        <div>
          <div style="font-size:.65rem;color:var(--dim);margin-bottom:4px">Nivel máximo</div>
          <input type="number" class="task-input" id="sprite-max" placeholder="100" style="font-size:.8rem">
        </div>
      </div>
      <div style="margin-bottom:8px">
        <div style="font-size:.65rem;color:var(--dim);margin-bottom:4px">URL / ruta del sprite</div>
        <input type="text" class="task-input" id="sprite-src" placeholder="assets/sprites/tier6.png">
      </div>
      <div style="margin-bottom:10px">
        <div style="font-size:.65rem;color:var(--dim);margin-bottom:4px">Etiqueta</div>
        <input type="text" class="task-input" id="sprite-label" placeholder="Arcángel Guerrero">
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" onclick="window._saveSprite()">Guardar</button>
        <button class="btn-ghost" onclick="document.getElementById('sprite-add-form').style.display='none'">Cancelar</button>
      </div>
    </div>

    <button class="btn-ghost" style="margin-top:10px;width:100%"
      onclick="document.getElementById('sprite-add-form').style.display='block'">
      + Añadir nuevo rango de sprite
    </button>
  </div>`;

  container.innerHTML = html;

  // Exponer funciones globales
  window._removeSprite = (index) => {
    CONFIG.removeSpriteOverride(index);
    renderSpriteManager(containerId);
  };

  window._saveSprite = () => {
    const min = parseInt(document.getElementById("sprite-min").value);
    const max = parseInt(document.getElementById("sprite-max").value);
    const src = document.getElementById("sprite-src").value.trim();
    const label = document.getElementById("sprite-label").value.trim();

    if (!min || !max || !src || !label) { alert("Rellena todos los campos."); return; }
    if (min > max) { alert("El nivel mínimo no puede ser mayor que el máximo."); return; }

    CONFIG.addSpriteOverride({ levelMin: min, levelMax: max, src, label });
    renderSpriteManager(containerId);
  };
}
