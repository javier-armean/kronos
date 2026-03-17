// js/config.js — Única fuente de verdad para toda la configuración de KRONOS

export const CONFIG = {

  // ── RANGOS ──
  RANKS: [
    {min:1,   max:5,   title:"Peregrino de la Luz"},
    {min:6,   max:10,  title:"Escudero del Señor"},
    {min:11,  max:20,  title:"Caballero de la Fe"},
    {min:21,  max:30,  title:"Heraldo Celestial"},
    {min:31,  max:50,  title:"Maestro de la Luz"},
    {min:51,  max:75,  title:"Guardián del Verbo"},
    {min:76,  max:99,  title:"Santo Guerrero"},
    {min:100, max:9999,title:"Paladín del Reino"},
  ],

  // ── HÁBITOS FIJOS ──
  FIXED_HABITS: [
    {id:"oracion",     label:"🙏 Oración o lectura espiritual",    stat:"espiritu",    xp:20},
    {id:"pomodoro1",   label:"🍅 Pomodoro x1 mínimo",             stat:"mente",       xp:20},
    {id:"suplementos", label:"💊 Suplementos de mañana",          stat:"vitalidad",   xp:20},
    {id:"movimiento",  label:"🏃 Movimiento físico",              stat:"fuerza",      xp:20},
    {id:"crear",       label:"🎨 Crear algo (foto/diseño/vídeo)", stat:"destreza",    xp:20},
    {id:"leer",        label:"📚 Leer o aprender algo",           stat:"mente",       xp:20},
    {id:"naturaleza",  label:"🌿 Contacto con naturaleza",        stat:"espiritu",    xp:20},
    {id:"dormir",      label:"😴 Dormir +7 horas",                stat:"resistencia", xp:20},
  ],

  // ── TAREAS DE MANTENIMIENTO SEMANAL ──
  MAINTENANCE_TASKS: [
    {id:"org_archivos", label:"🗂️ Organizar archivos del ordenador"},
    {id:"fotos_dup",    label:"📸 Eliminar fotos duplicadas o descartadas"},
    {id:"fotos_nube",   label:"☁️ Limpiar fotos de la nube (Google Photos / iCloud)"},
    {id:"fotos_movil",  label:"📱 Limpiar fotos del teléfono"},
    {id:"tarjetas",     label:"💾 Vaciar tarjetas de memoria (formatear tras backup)"},
    {id:"papelera",     label:"🗑️ Vaciar papelera y limpiar descargas"},
  ],

  // ── NUTRICIÓN ──
  NUTRITION_ITEMS: [
    {id:"man_fruta",    time:"🌅 Mañana (8:00)",       label:"🍎 Fruta entera",                    xp:2},
    {id:"man_frutos",   time:"🌅 Mañana (8:00)",       label:"🥜 Frutos secos",                    xp:2},
    {id:"man_multi",    time:"🌅 Mañana (8:00)",       label:"💊 Multicentrum Hombre",             xp:3},
    {id:"man_lambdapil",time:"🌅 Mañana (8:00)",       label:"💊 ISDIN Lambdapil",                 xp:3},
    {id:"man_probio",   time:"🌅 Mañana (8:00)",       label:"💊 Probiótico",                      xp:3},
    {id:"man_treo",     time:"🌅 Mañana (8:00)",       label:"💊 Treonato de magnesio (opc.)",     xp:2},
    {id:"mm_fruta",     time:"🌤 Media mañana (10:00)",label:"🍌 Fruta + frutos secos",            xp:2},
    {id:"med_fnuts",    time:"☀️ Mediodía (12:00)",    label:"🥤 Frutos secos o batido proteína",  xp:2},
    {id:"com_omega",    time:"🍽 Comida (14:00)",       label:"💊 Omega-3",                         xp:3},
    {id:"com_agua",     time:"🍽 Comida (14:00)",       label:"💧 2 vasos de agua",                 xp:1},
    {id:"tar_proteina", time:"🌇 Tarde (17:00)",        label:"🥤 Proteína en polvo",               xp:2},
    {id:"tar_creatina", time:"🌇 Tarde (17:00)",        label:"💪 Creatina",                        xp:2},
    {id:"noc_magnesio", time:"🌙 Noche (22:30)",        label:"💊 Bisglicinato de magnesio",        xp:3},
    {id:"noc_minoxidil",time:"🌙 Noche (22:30)",        label:"🌙 Minoxidil",                       xp:2},
  ],

  // ── STATS ──
  STATS_CONFIG: [
    {key:"fuerza",     icon:"⚔️",  label:"Fuerza",      cls:"s-fuerza"},
    {key:"mente",      icon:"🧠",  label:"Mente",       cls:"s-mente"},
    {key:"espiritu",   icon:"✨",  label:"Espíritu",    cls:"s-espiritu"},
    {key:"destreza",   icon:"🎨",  label:"Destreza",    cls:"s-destreza"},
    {key:"vitalidad",  icon:"🌿",  label:"Vitalidad",   cls:"s-vitalidad"},
    {key:"resistencia",icon:"❤️",  label:"Resistencia", cls:"s-resistencia"},
  ],

  // ── XP TABLE ──
  // XP necesario para subir del nivel N al N+1
  xpToNextLevel(lvl) {
    return lvl * 100;
  },

  // XP total acumulado para ALCANZAR el nivel lvl desde nivel 1
  xpForLevel(lvl) {
    let total = 0;
    for (let i = 1; i < lvl; i++) total += i * 100;
    return total;
  },

  // ── SPRITES POR NIVEL ──
  SPRITES: [
    { levelMin: 1,  levelMax: 10,   src: "assets/sprites/tier1.png",           label: "Peregrino" },
    { levelMin: 11, levelMax: 20,   src: "assets/sprites/tier2.png",           label: "Escudero" },
    { levelMin: 21, levelMax: 30,   src: "assets/sprites/tier3.png",           label: "Caballero" },
    { levelMin: 31, levelMax: 40,   src: "assets/sprites/tier4.png",           label: "Paladín" },
    { levelMin: 41, levelMax: 50,   src: "assets/sprites/tier5.png",           label: "Maestro de la Luz" },
    { levelMin: 51, levelMax: 9999, src: "assets/sprites/tier_placeholder.png",label: "???" },
  ],

  // Devuelve el sprite correcto para un nivel dado.
  // Prioriza overrides guardados en localStorage.
  // Si no hay match, devuelve el último sprite disponible como fallback.
  getSpriteForLevel(level) {
    const overrides = this._getSpriteOverrides();
    const all = [...this.SPRITES, ...overrides].sort((a, b) => a.levelMin - b.levelMin);
    for (const s of all) {
      if (level >= s.levelMin && level <= s.levelMax) return s;
    }
    return all[all.length - 1] || this.SPRITES[this.SPRITES.length - 1];
  },

  _getSpriteOverrides() {
    try {
      const raw = localStorage.getItem("kronos_sprite_overrides");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  addSpriteOverride(entry) {
    const list = this._getSpriteOverrides();
    list.push(entry);
    localStorage.setItem("kronos_sprite_overrides", JSON.stringify(list));
  },

  removeSpriteOverride(index) {
    const list = this._getSpriteOverrides();
    list.splice(index, 1);
    localStorage.setItem("kronos_sprite_overrides", JSON.stringify(list));
  },
};
