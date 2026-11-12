// =====================================================================
//  levelData.js  -  Configuración del nivel (todo editable aquí)
//  El mapa avanza hacia -Z. Inicio en z ≈ 0, extracción en z ≈ -205.
// =====================================================================

// Punto donde aparece el jugador después de la intro (fuera de la casa)
export const START = { x: 0, z: 1 };

// Zona segura de extracción (carruaje de los cazadores)
export const EXTRACTION = { x: 0, z: -201, radius: 3.2 };

// Munición inicial (limitada) de cada arma
export const START_AMMO = { pistol: 15, shotgun: 8 };

// ---------------------------------------------------------------------
//  Tipos de zombi. TODOS tienen 2 puntos de resistencia (regla RF07).
//  speed: m/s   range: distancia de detección (m)   scale: tamaño
// ---------------------------------------------------------------------
//  model: clave de ZOMBIE_MODELS   move: animación al perseguir
//  height: altura en metros (si no, 1.8 × scale)
export const ZOMBIE_TYPES = {
  // --- Zombis del Zombie Apocalypse Kit (Quaternius) ---
  errante:    { name: 'Errante',    model: 'basic',   move: 'Walk',  speed: 1.6, range: 12, scale: 1.0,  tint: 0xffffff },
  corredor:   { name: 'Corredor',   model: 'arm',     move: 'Run',   speed: 4.0, range: 9,  scale: 0.95, tint: 0xffe0d0 },
  arrastrado: { name: 'Arrastrado', model: 'basic',   move: 'Crawl', speed: 0.9, range: 6,  scale: 0.95, tint: 0xc0d0b0, crawl: true },
  aullador:   { name: 'Aullador',   model: 'ribcage', move: 'Walk',  speed: 2.4, range: 14, scale: 1.05, tint: 0xd8d0ff, howl: 15 },

  // --- Personajes j-horror creados en tools/forge.js ---
  // Onryō: fantasma de kimono blanco. SOLO avanza cuando NO lo estás mirando.
  onryo:      { name: 'Onryō',      model: 'onryo',      move: 'Walk',  speed: 4.2, range: 15, scale: 0.95, tint: 0xffffff, ghost: true },
  // Sale arrastrándose del pozo (como en Ringu)
  pozo:       { name: 'La del pozo', model: 'onryo',     move: 'Crawl', speed: 1.4, range: 8,  scale: 0.95, tint: 0xd0d8e0, crawl: true, emerge: true },
  monje:      { name: 'Monje',      model: 'monk',       move: 'Walk',  speed: 1.3, range: 12, scale: 1.0,  tint: 0xffffff },
  colegiala:  { name: 'Colegiala',  model: 'schoolgirl', move: 'Walk',  speed: 2.1, range: 11, scale: 0.9,  tint: 0xffffff },
  kuchisake:  { name: 'Kuchisake-onna', model: 'kuchisake', move: 'Run', speed: 4.4, range: 11, scale: 1.0, tint: 0xffffff },
  teketeke:   { name: 'Teke-teke',  model: 'teketeke',   move: 'Run',   speed: 3.6, range: 10, scale: 1.0,  tint: 0xffffff, crawl: true, height: 0.75 },
  gordo:      { name: 'Gordo',      model: 'chubby',     move: 'Walk',  speed: 1.2, range: 10, scale: 1.25, tint: 0xd0c0b0 },
  // Guardián del puente: un samurái caído gigante
  guardian:   { name: 'Ochimusha',  model: 'ochimusha',  move: 'Walk',  speed: 2.8, range: 16, scale: 1.7,  tint: 0xffffff },
};

// Archivo GLB de cada modelo (carpeta models/)
export const ZOMBIE_MODELS = {
  basic: 'zombie_basic', arm: 'zombie_arm', ribcage: 'zombie_ribcage', chubby: 'zombie_chubby',
  onryo: 'jz_onryo', monk: 'jz_monk', schoolgirl: 'jz_schoolgirl',
  kuchisake: 'jz_kuchisake', teketeke: 'jz_teketeke', ochimusha: 'jz_ochimusha',
};

export const ZOMBIE_HP = 2;

// ---------------------------------------------------------------------
//  Posición de cada zombi en el mapa
// ---------------------------------------------------------------------
export const ZOMBIES = [
  // Zona 1 - Inicio (uno solo, para aprender)
  { type: 'arrastrado', x: 9,   z: -14 },

  // Zona 2 - Calles de la aldea
  { type: 'monje',      x: -6,  z: -30 },
  { type: 'colegiala',  x: 7,   z: -38 },
  { type: 'errante',    x: -9,  z: -52 },
  { type: 'corredor',   x: 12,  z: -58 },
  { type: 'colegiala',  x: 2,   z: -66 },
  { type: 'corredor',   x: -8,  z: -80 },
  { type: 'arrastrado', x: 6,   z: -85 },
  { type: 'onryo',      x: -12, z: -70 },
  { type: 'monje',      x: 22,  z: -38 },

  // Zona 3 - Cementerio
  { type: 'aullador',   x: -12, z: -104 },
  { type: 'monje',      x: -4,  z: -115 },
  { type: 'errante',    x: 3,   z: -118 },
  { type: 'colegiala',  x: 9,   z: -111 },
  { type: 'arrastrado', x: -19, z: -126 },
  { type: 'aullador',   x: 13,  z: -132 },
  { type: 'corredor',   x: 1,   z: -141 },
  { type: 'onryo',      x: 17,  z: -141 },
  { type: 'pozo',       x: 18,  z: -124 },   // dentro del pozo

  // Zona 4 - Río, puente y guardián
  { type: 'gordo',      x: -7,  z: -155 },
  { type: 'colegiala',  x: 6,   z: -157 },
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
  { kind: 'ammo_shotgun', x: 12,  z: -23, amount: 4 },
  { kind: 'ammo_pistol',  x: -21, z: -104, amount: 8 },
  { kind: 'ammo_pistol',  x: 10,  z: -153, amount: 8 },
  { kind: 'ammo_shotgun', x: -10, z: -186, amount: 4 },
  // Ofuda: 3 talismanes que rompen el sello del puente
  { kind: 'ofuda', x: -27, z: -54 },
  { kind: 'ofuda', x: -2,  z: -121.4 },
  { kind: 'ofuda', x: 21,  z: -127 },
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

// Vidas: cada vez que te atrapan sale GAME OVER y puedes continuar
// desde el último punto de control mientras te queden vidas.
export const LIVES = 3;

// Puntos de control: al pasar por `z` se guarda (x, z) como reaparición
export const CHECKPOINTS = [
  { z: -22,  x: 0,   sz: -22,  name: 'Entrada de la aldea' },
  { z: -92,  x: -14, sz: -92,  name: 'Cementerio' },
  { z: -152, x: 10,  sz: -152, name: 'Río' },
];

// Talismanes necesarios para romper el sello del puente
export const OFUDA_NEEDED = 3;

// Probabilidad de que un zombi suelte una caja pequeña de munición al morir
export const DROP_CHANCE = 0.4;
