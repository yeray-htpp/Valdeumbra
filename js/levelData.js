// =====================================================================
//  levelData.js  -  Configuración del nivel (todo editable aquí)
//  El mapa avanza hacia -Z. Inicio en z ≈ 0, extracción en z ≈ -205.
// =====================================================================

// Punto donde aparece el jugador después de la intro (fuera de la casa)
export const START = { x: 0, z: 1 };

// Zona segura de extracción (carruaje de los cazadores)
export const EXTRACTION = { x: 0, z: -201, radius: 3.2 };

// Munición inicial (limitada) de cada arma
export const START_AMMO = { pistol: 12, shotgun: 6 };

// ---------------------------------------------------------------------
//  Tipos de zombi. TODOS tienen 2 puntos de resistencia (regla RF07).
//  speed: m/s   range: distancia de detección (m)   scale: tamaño
// ---------------------------------------------------------------------
//  model: archivo GLB (models/zombie_<model>.glb)   move: animación al perseguir
export const ZOMBIE_TYPES = {
  errante:    { name: 'Errante',    model: 'basic',   move: 'Walk',  speed: 1.6, range: 12, scale: 1.0,  tint: 0xffffff },
  corredor:   { name: 'Corredor',   model: 'arm',     move: 'Run',   speed: 4.0, range: 9,  scale: 0.95, tint: 0xffe0d0 },
  arrastrado: { name: 'Arrastrado', model: 'basic',   move: 'Crawl', speed: 0.9, range: 6,  scale: 0.95, tint: 0xc0d0b0, crawl: true },
  aullador:   { name: 'Aullador',   model: 'ribcage', move: 'Walk',  speed: 2.4, range: 14, scale: 1.05, tint: 0xd8d0ff, howl: 15 },
  guardian:   { name: 'Guardián',   model: 'chubby',  move: 'Walk',  speed: 3.0, range: 16, scale: 1.8,  tint: 0xffb0a0 },
  // Onryō: fantasma de pelo negro. SOLO avanza cuando NO lo estás mirando.
  onryo:      { name: 'Onryō',      model: 'basic',   move: 'Walk',  speed: 4.2, range: 15, scale: 0.9,  tint: 0xffffff, ghost: true },
  // Sale arrastrándose del pozo cuando te acercas
  pozo:       { name: 'Del pozo',   model: 'basic',   move: 'Crawl', speed: 1.3, range: 8,  scale: 0.95, tint: 0xb0c0d0, crawl: true, emerge: true },
};

export const ZOMBIE_MODELS = ['basic', 'arm', 'chubby', 'ribcage'];

export const ZOMBIE_HP = 2;

// ---------------------------------------------------------------------
//  Posición de cada zombi en el mapa
// ---------------------------------------------------------------------
export const ZOMBIES = [
  // Zona 1 - Inicio (uno solo, para aprender)
  { type: 'arrastrado', x: 9,   z: -14 },

  // Zona 2 - Calles de la aldea
  { type: 'errante',    x: -6,  z: -30 },
  { type: 'errante',    x: 7,   z: -38 },
  { type: 'errante',    x: -9,  z: -52 },
  { type: 'corredor',   x: 12,  z: -58 },
  { type: 'errante',    x: 2,   z: -66 },
  { type: 'corredor',   x: -8,  z: -80 },
  { type: 'arrastrado', x: 6,   z: -85 },
  { type: 'onryo',      x: -12, z: -70 },

  // Zona 3 - Cementerio
  { type: 'aullador',   x: -12, z: -104 },
  { type: 'errante',    x: -4,  z: -115 },
  { type: 'errante',    x: 3,   z: -118 },
  { type: 'errante',    x: 9,   z: -111 },
  { type: 'arrastrado', x: -19, z: -126 },
  { type: 'aullador',   x: 13,  z: -132 },
  { type: 'corredor',   x: 1,   z: -141 },
  { type: 'onryo',      x: 17,  z: -141 },
  { type: 'pozo',       x: 18,  z: -124 },   // dentro del pozo

  // Zona 4 - Río, puente y guardián
  { type: 'errante',    x: -7,  z: -155 },
  { type: 'errante',    x: 6,   z: -157 },
  { type: 'guardian',   x: 0,   z: -188 },
];

// ---------------------------------------------------------------------
//  Objetos coleccionables
//   ammo_pistol / ammo_shotgun : recuperan munición SOLO de esa arma
//   potion : velocidad +50% por 8 segundos
//   note   : nota del diario (historia)
// ---------------------------------------------------------------------
export const PICKUPS = [
  { kind: 'ammo_pistol',  x: -27, z: -42, amount: 8 },   // escondida tras las casas
  { kind: 'ammo_shotgun', x: -3,  z: -60, amount: 4 },
  { kind: 'potion',       x: 20,  z: -58 },
  { kind: 'ammo_pistol',  x: 21,  z: -101, amount: 8 },
  { kind: 'ammo_shotgun', x: -23, z: -141, amount: 4 },
  { kind: 'ammo_pistol',  x: -21, z: -156, amount: 8 },
  { kind: 'ammo_shotgun', x: 19,  z: -154, amount: 4 },
  { kind: 'potion',       x: -24, z: -112 },
  { kind: 'ammo_pistol',  x: 8,   z: -64, amount: 6 },
];

export const NOTES = [
  { x: -3, z: -6, title: 'Diario — día 1',
    text: 'La luna se volvió roja. El sacerdote dijo que era una señal. Esa misma noche los muertos del cementerio comenzaron a caminar.' },
  { x: 10, z: -31, title: 'Diario — día 3',
    text: 'Los que tienen la piel pálida corren como lobos. Los que se arrastran son lentos, pero no los pierdas de vista.' },
  { x: -15, z: -121, title: 'Diario — día 6',
    text: 'Hay unos que aúllan. Cuando te ven, todos los muertos cercanos despiertan. Mátalos primero o huye.' },
  { x: 5, z: -194, title: 'Diario — último día',
    text: 'Los cazadores prometieron esperar con su carruaje pasando el puente. Algo enorme vigila el paso. Dos balas bastan, dicen…' },
];
