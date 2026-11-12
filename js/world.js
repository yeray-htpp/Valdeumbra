// =====================================================================
//  world.js  -  Construcción del escenario 3D (geometría programada)
//
//  Zonas (el jugador avanza hacia -Z):
//   1. Inicio      z  12 .. -20   casa en ruinas + fogata
//   2. Aldea       z -20 .. -90   casas, callejones y barricadas
//   3. Cementerio  z -90 .. -150  lápidas, árboles secos
//   4. Río         z -150 .. -185 puente vigilado por el guardián
//   5. Extracción  z -185 .. -212 carruaje de los cazadores
//
//  Cada objeto sólido guarda un Box3 en `colliders` (colisiones AABB)
//  y su mesh en `solidMeshes` (para que las balas choquen con paredes).
// =====================================================================
import * as THREE from 'three';
import { EXTRACTION } from './levelData.js';

// ---------- Texturas procedurales (dibujadas en un canvas) ----------
function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

function speckle(g, s, base, vari, n) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    const v = Math.floor(Math.random() * vari);
    g.fillStyle = `rgba(${v},${v},${v},0.18)`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
}

const TEX = {
  ground: () => canvasTexture(64, (g, s) => speckle(g, s, '#2a2620', 255, 500), 60, 240),
  stone: () => canvasTexture(64, (g, s) => {
    speckle(g, s, '#4a4844', 255, 200);
    g.strokeStyle = '#2a2826'; g.lineWidth = 2;
    for (let y = 0; y < s; y += 16) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
      for (let x = (y / 16) % 2 ? 8 : 0; x < s; x += 24) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke(); }
    }
  }),
  wood: () => canvasTexture(64, (g, s) => {
    speckle(g, s, '#4b3423', 120, 150);
    g.fillStyle = '#2b1d12';
    for (let x = 0; x < s; x += 16) g.fillRect(x, 0, 2, s);
  }),
  roof: () => canvasTexture(64, (g, s) => {
    speckle(g, s, '#3a1f1c', 120, 150);
    g.fillStyle = '#1e0f0d';
    for (let y = 0; y < s; y += 8) g.fillRect(0, y, s, 2);
  }),
  grave: () => canvasTexture(32, (g, s) => speckle(g, s, '#6a6a68', 255, 120)),
  water: () => canvasTexture(64, (g, s) => {
    speckle(g, s, '#0d1622', 120, 300);
    g.fillStyle = 'rgba(120,40,40,0.25)';
    for (let i = 0; i < 20; i++) g.fillRect(Math.random() * s, Math.random() * s, 10, 1);
  }, 12, 3),
};

// Shoji: papel con rejilla de madera; stage 1/2 dibuja una silueta detrás
function shojiTexture(stage) {
  return canvasTexture(64, (g, s) => {
    g.fillStyle = '#e4dcc4'; g.fillRect(0, 0, s, s);
    if (stage > 0) {
      g.fillStyle = 'rgba(10,8,8,0.92)';
      const k = stage === 1 ? 0.6 : 1.0;          // más grande = más cerca
      const cx = s * 0.5, top = s * (stage === 1 ? 0.3 : 0.12);
      g.beginPath(); g.arc(cx, top + 7 * k, 6 * k, 0, Math.PI * 2); g.fill();         // cabeza
      g.fillRect(cx - 5 * k, top + 8 * k, 10 * k, 18 * k);                              // pelo largo
      g.beginPath(); g.moveTo(cx - 13 * k, s); g.lineTo(cx - 9 * k, top + 15 * k);
      g.lineTo(cx + 9 * k, top + 15 * k); g.lineTo(cx + 13 * k, s); g.fill();           // cuerpo
      if (stage === 2) { g.fillRect(cx - 20, top + 18, 9, 3); g.fillRect(cx + 11, top + 22, 9, 3); } // brazos
    }
    g.fillStyle = '#2b1d12';
    for (let x = 0; x <= s; x += 16) g.fillRect(Math.min(x, s - 3), 0, 3, s);
    for (let y = 0; y <= s; y += 16) g.fillRect(0, Math.min(y, s - 3), s, 3);
  });
}

// Texto en kanji pintado con sangre (fondo transparente)
function kanjiTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#8a0a0a';
  g.font = 'bold 96px serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 60);
  for (let i = 0; i < 14; i++) {                       // chorreones
    const x = 30 + Math.random() * 196;
    g.fillRect(x, 70 + Math.random() * 20, 3, 20 + Math.random() * 40);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function collidesCircle(colliders, x, z, r) {
  for (const b of colliders) {
    if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z) return true;
  }
  return false;
}

const _p = new THREE.Vector3();

// Generador pseudoaleatorio con semilla (el mapa siempre sale igual)
function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

// Modelos GLB de decoración (models/env_<nombre>.glb)
export const PROP_MODELS = ['barrel', 'pallet', 'pallet_broken', 'blood_1', 'blood_2', 'blood_3', 'chest', 'chest_special'];

// Clona un GLB, lo escala para que su lado mayor mida `size` y lo apoya en el suelo
export function fitModel(gltf, size) {
  const obj = gltf.scene.clone(true);
  const box = new THREE.Box3().setFromObject(obj);
  const dims = box.getSize(new THREE.Vector3());
  const k = size / Math.max(dims.x, dims.y, dims.z);
  obj.scale.setScalar(k);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  const g = new THREE.Group();
  g.add(obj);
  return g;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = [];
    this.solidMeshes = [];
    this.torches = [];
    this.time = 0;
    this.nextLightning = 6;
    this.lightningT = 0;
    this.onLightning = null;

    this.mat = {
      ground: new THREE.MeshLambertMaterial({ map: TEX.ground() }),
      stone:  new THREE.MeshLambertMaterial({ map: TEX.stone() }),
      wood:   new THREE.MeshLambertMaterial({ map: TEX.wood() }),
      roof:   new THREE.MeshLambertMaterial({ map: TEX.roof() }),
      grave:  new THREE.MeshLambertMaterial({ map: TEX.grave() }),
      dark:   new THREE.MeshLambertMaterial({ color: 0x1a1612 }),
      iron:   new THREE.MeshLambertMaterial({ color: 0x222226 }),
      tree:   new THREE.MeshLambertMaterial({ color: 0x2a2018 }),
      flame:  new THREE.MeshBasicMaterial({ color: 0xffa040 }),
      water:  new THREE.MeshLambertMaterial({ map: TEX.water(), emissive: 0x050810 }),
    };

    this.buildLights();
    this.buildGround();
    this.buildBounds();
    this.buildStartZone();
    this.buildVillage();
    this.buildGraveyard();
    this.buildRiver();
    this.buildExtraction();
    this.buildJapanese();
    this.buildRain();
  }

  // ------------------------------------------------------------------
  //  Helpers de construcción
  // ------------------------------------------------------------------
  box(x, y, z, w, h, d, mat, solid = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    this.scene.add(m);
    if (solid) {
      this.colliders.push(new THREE.Box3().setFromObject(m));
      this.solidMeshes.push(m);
    }
    return m;
  }

  // Muro con una abertura (paso) centrado en gapX
  wallWithGap(z, gapX, gapW, h = 3.2) {
    const left = -30, right = 30;
    const a = gapX - gapW / 2, b = gapX + gapW / 2;
    this.box((left + a) / 2, 0, z, a - left, h, 1, this.mat.stone);
    this.box((b + right) / 2, 0, z, right - b, h, 1, this.mat.stone);
    // arco sobre el paso
    this.box(gapX - gapW / 2 - 0.4, 0, z, 0.8, h + 1, 1.2, this.mat.stone);
    this.box(gapX + gapW / 2 + 0.4, 0, z, 0.8, h + 1, 1.2, this.mat.stone);
    this.torch(gapX - gapW / 2 - 0.4, z + 0.8, true);
    this.torch(gapX + gapW / 2 + 0.4, z + 0.8, false);
  }

  house(x, z, w, d, h = 4) {
    this.box(x, 0, z, w, h, d, this.mat.stone);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.75, 2.5, 4), this.mat.roof);
    roof.position.set(x, h + 1.25, z);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
    this.scene.add(roof);
    // ventanas iluminadas (algunas)
    if (Math.random() < 0.5) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ color: 0x6a3a10 }));
      win.position.set(x + (x > 0 ? -w / 2 - 0.01 : w / 2 + 0.01), 2, z);
      win.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.scene.add(win);
    }
  }

  torch(x, z, withLight = true) {
    this.box(x, 0, z, 0.15, 2.2, 0.15, this.mat.wood, false);
    const flame = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.25), this.mat.flame);
    flame.position.set(x, 2.35, z);
    this.scene.add(flame);
    let light = null;
    if (withLight) {
      light = new THREE.PointLight(0xff8a3a, 6, 12, 1.5);
      light.position.set(x, 2.6, z);
      this.scene.add(light);
    }
    this.torches.push({ flame, light, seed: Math.random() * 100 });
  }

  deadTree(x, z) {
    const trunk = this.box(x, 0, z, 0.4, 3.5, 0.4, this.mat.tree);
    for (let i = 0; i < 3; i++) {
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.6, 0.15), this.mat.tree);
      br.position.set(x, 2.2 + i * 0.5, z);
      br.rotation.set((Math.random() - 0.5) * 1.6, Math.random() * 6, (Math.random() - 0.5) * 1.6 + 0.7);
      this.scene.add(br);
    }
    return trunk;
  }

  sign(x, z, text, rotY = 0) {
    this.box(x, 0, z, 0.15, 1.6, 0.15, this.mat.wood, false);
    const tex = canvasTexture(256, (g, s) => {
      g.fillStyle = '#3b2716'; g.fillRect(0, 0, s, s / 2);
      g.fillStyle = '#e8d2a0'; g.font = 'bold 34px serif'; g.textAlign = 'center';
      text.split('\n').forEach((line, i) => g.fillText(line, s / 2, 50 + i * 42));
    });
    tex.repeat.set(1, 0.5); tex.offset.set(0, 0.5);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
    board.position.set(x, 1.9, z);
    board.rotation.y = rotY;
    this.scene.add(board);
  }

  // ------------------------------------------------------------------
  //  Luces: luna roja, ambiente, relámpago
  // ------------------------------------------------------------------
  buildLights() {
    const hemi = new THREE.HemisphereLight(0x5a4a6a, 0x1a0e0a, 0.9);
    hemi.layers.enableAll();
    this.scene.add(hemi);

    this.moonLight = new THREE.DirectionalLight(0xc04040, 0.9);
    this.moonLight.position.set(-30, 50, -80);
    this.moonLight.layers.enableAll();
    this.scene.add(this.moonLight);

    this.lightning = new THREE.DirectionalLight(0xc8d0ff, 0);
    this.lightning.position.set(20, 60, -40);
    this.lightning.layers.enableAll();
    this.scene.add(this.lightning);

    // Luna roja en el cielo (no le afecta la niebla)
    const moon = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xb02020, fog: false }));
    moon.position.set(-60, 90, -320);
    this.scene.add(moon);
    this.moon = moon;
  }

  buildGround() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 240), this.mat.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -100);
    this.scene.add(ground);
    this.solidMeshes.push(ground);
  }

  buildBounds() {
    // muros que rodean todo el nivel
    this.box(-30.5, 0, -100, 1, 4, 240, this.mat.stone);
    this.box(30.5, 0, -100, 1, 4, 240, this.mat.stone);
    this.box(0, 0, 18.5, 62, 4, 1, this.mat.stone);
    this.box(0, 0, -218.5, 62, 4, 1, this.mat.stone);
  }

  // ------------------------------------------------------------------
  //  Zona 1: casa del protagonista (la de la intro) + fogata
  // ------------------------------------------------------------------
  buildStartZone() {
    // Casa: x -4..4, z 4..12, puerta en la pared norte (z = 4)
    const H = 3.2;
    const m = this.mat;
    const parts = [];
    const add = (x, y, z, w, h, d, mat) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      b.position.set(x, y + h / 2, z);
      this.scene.add(b);
      parts.push(b);
      this.solidMeshes.push(b);
      return b;
    };
    add(0, 0, 12, 8.4, H, 0.4, m.stone);          // pared sur
    add(4, 0, 8, 0.4, H, 8, m.stone);             // pared este
    add(-4, 0, 8, 0.4, H, 8, m.stone);            // pared oeste (ventana)
    add(-2.35, 0, 4, 3.7, H, 0.4, m.stone);       // pared norte izq.
    add(2.35, 0, 4, 3.7, H, 0.4, m.stone);        // pared norte der.
    add(0, 2.2, 4, 1.0, 1.0, 0.4, m.stone);       // dintel puerta
    const floor = add(0, 0, 8, 7.8, 0.05, 7.8, m.wood);
    floor.position.y = 0.02;

    // Techo plano interior y tejado
    const ceiling = add(0, H, 8, 8.4, 0.2, 8.4, m.wood);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 2.8, 4), m.roof);
    roof.position.set(0, H + 1.6, 8);
    roof.rotation.y = Math.PI / 4;
    this.scene.add(roof);

    // Ventana (brilla con los relámpagos)
    this.windowMat = new THREE.MeshBasicMaterial({ color: 0x0a0a18 });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.0), this.windowMat);
    win.position.set(-3.78, 1.7, 8);
    win.rotation.y = Math.PI / 2;
    this.scene.add(win);

    // Cama, mesa y vela
    add(2.6, 0, 10.4, 1.4, 0.5, 2.4, m.wood);
    add(2.6, 0.5, 10.4, 1.3, 0.15, 2.3, new THREE.MeshLambertMaterial({ color: 0x5a4a3a }));
    add(-2.5, 0, 10.5, 1.2, 0.8, 0.8, m.wood);
    const candle = new THREE.PointLight(0xffa050, 2.5, 7, 1.5);
    candle.position.set(-2.5, 1.2, 10.5);
    this.scene.add(candle);
    this.candle = candle;

    // Puerta (con pivote en la bisagra)
    this.doorPivot = new THREE.Group();
    this.doorPivot.position.set(-0.5, 0, 4);
    // Puerta corrediza de papel (shoji). Con el relámpago se ve una silueta detrás.
    this.shojiTex = [shojiTexture(0), shojiTexture(1), shojiTexture(2)];
    this.shojiMat = new THREE.MeshBasicMaterial({ map: this.shojiTex[0], color: 0x2a2620 });
    this.shojiStage = 0;                     // 0 = sin silueta, 1 = lejos, 2 = pegada al papel
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.06), this.shojiMat);
    door.position.set(0.5, 1.1, 0);
    this.shoji = door;
    this.doorPivot.add(door);
    this.scene.add(this.doorPivot);

    // Viga del techo que caerá en la intro
    this.beam = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.4, 0.4), m.wood);
    this.beam.position.set(1.8, H - 0.3, 9.4);
    this.scene.add(this.beam);

    this.home = { ceiling, roof, parts };
    // Mientras la casa está intacta, el jugador no puede salir por las paredes
    this.houseColliders = parts.filter(p => p !== floor && p !== ceiling).map(p => new THREE.Box3().setFromObject(p));

    // Fogata y letrero afuera
    this.campfire(5, -3);
    this.sign(-2.5, -1, 'CARRUAJE\nAL NORTE  ↑', 0);
    this.torch(-6, 2);
    this.deadTree(-12, -8);
    this.deadTree(14, 4);
    this.deadTree(-20, 6);

    // Rocas
    const r = seeded(7);
    for (let i = 0; i < 10; i++) {
      const x = (r() - 0.5) * 50, z = 10 - r() * 26;
      if (Math.abs(x) < 7 && z > -8) continue;
      this.box(x, 0, z, 0.8 + r(), 0.6 + r() * 0.6, 0.8 + r(), this.mat.grave);
    }

    this.wallWithGap(-20, 0, 4);
  }

  campfire(x, z) {
    for (let i = 0; i < 5; i++) {
      const log = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.15, 0.15), this.mat.wood);
      log.position.set(x, 0.1, z);
      log.rotation.y = (i / 5) * Math.PI;
      this.scene.add(log);
    }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 5), this.mat.flame);
    flame.position.set(x, 0.55, z);
    this.scene.add(flame);
    const light = new THREE.PointLight(0xff7a2a, 10, 16, 1.4);
    light.position.set(x, 1.2, z);
    this.scene.add(light);
    this.torches.push({ flame, light, seed: 3 });
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.6, 0, z - 0.6), new THREE.Vector3(x + 0.6, 1, z + 0.6)));
  }

  // Al terminar la intro: el techo se derrumba y la casa queda en ruinas
  ruinHouse() {
    this.home.roof.visible = false;
    this.home.ceiling.visible = false;
    this.beam.position.set(1.5, 0.3, 9.0);
    this.beam.rotation.set(0.1, 0.3, 0.25);
    this.doorPivot.visible = false;          // el shoji quedó destrozado
    // escombros que tapan la puerta
    const r = seeded(3);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.6 + r() * 0.6, 0.4 + r() * 0.5, 0.6 + r() * 0.5), this.mat.stone);
      b.position.set((r() - 0.5) * 1.6, 0.25, 4.6 + r() * 0.8);
      b.rotation.set(r(), r() * 3, r());
      this.scene.add(b);
    }
    // toda la casa pasa a ser un bloque sólido
    this.colliders.push(new THREE.Box3(new THREE.Vector3(-4.3, 0, 3.7), new THREE.Vector3(4.3, 4, 12.3)));
    this.candle.intensity = 0;
  }

  // ------------------------------------------------------------------
  //  Zona 2: aldea
  // ------------------------------------------------------------------
  buildVillage() {
    // casas lado izquierdo (x -24..-16) y derecho (x 16..24)
    [-32, -52, -72].forEach(z => this.house(-20, z, 8, 10));
    [-28, -48, -68, -84].forEach(z => this.house(20, z, 8, 9));
    // casas pequeñas pegadas al centro para formar calles
    this.house(-8, -40, 5, 6, 3.5);
    this.house(9, -76, 5, 6, 3.5);

    // barricadas de carretas y cajas que obligan a zigzaguear
    this.box(3, 0, -45, 12, 1.3, 1.2, this.mat.wood);
    this.box(-6, 0, -62, 9, 1.3, 1.2, this.mat.wood);
    this.box(0, 0, -72, 1.2, 1.3, 6, this.mat.wood);
    this.box(-3, 0, -88, 10, 1.2, 1, this.mat.wood);
    [[-12, -28], [13, -36], [-14, -66], [5, -55], [14, -80]].forEach(([x, z]) => {
      this.box(x, 0, z, 1, 1, 1, this.mat.wood);
      this.box(x + 0.3, 1, z + 0.2, 0.8, 0.8, 0.8, this.mat.wood);
    });

    this.torch(-13, -36);
    this.torch(13, -56);
    this.torch(-12, -78);
    this.torch(0, -50, false);
    this.torch(13, -86, false);
    this.sign(-11, -24, 'CEMENTERIO\n← ←', 0);

    this.wallWithGap(-90, -14, 4);
  }

  // ------------------------------------------------------------------
  //  Zona 3: cementerio
  // ------------------------------------------------------------------
  buildGraveyard(avoid = []) {
    const r = seeded(42);
    this.graveSpots = [];
    for (let x = -24; x <= 24; x += 4) {
      for (let z = -97; z >= -146; z -= 5) {
        if (r() < 0.45) continue;
        const gx = x + (r() - 0.5) * 1.2, gz = z + (r() - 0.5) * 1.2;
        this.graveSpots.push([gx, gz, r()]);
      }
    }
    // la cripta del centro
    this.box(-2, 0, -126, 6, 4.5, 5, this.mat.stone);
    const cr = new THREE.Mesh(new THREE.ConeGeometry(4.3, 2, 4), this.mat.roof);
    cr.position.set(-2, 5.5, -126); cr.rotation.y = Math.PI / 4;
    this.scene.add(cr);

    [[-26, -100], [24, -120], [-10, -146], [20, -140], [-26, -132]].forEach(([x, z]) => this.deadTree(x, z));
    this.torch(-8, -98);
    this.torch(10, -122);
    this.torch(-20, -138);
    this.torch(8, -146, false);
    this.wallWithGap(-150, 10, 4);
  }

  // Las lápidas se colocan después de conocer dónde están zombis y objetos
  placeGraves(avoidPoints) {
    avoidPoints = avoidPoints.concat(this.reserved || []);
    for (const [x, z, k] of this.graveSpots) {
      if (avoidPoints.some(p => Math.hypot(p.x - x, p.z - z) < 2.2)) continue;
      if (x > -6 && x < 2 && z < -122 && z > -130) continue; // cripta
      if (k < 0.7) {
        this.box(x, 0, z, 0.9, 1.1, 0.25, this.mat.grave);
      } else {
        this.box(x, 0, z, 0.2, 1.6, 0.2, this.mat.grave);
        this.box(x, 1.0, z, 0.9, 0.2, 0.2, this.mat.grave, false);
      }
    }
  }

  // ------------------------------------------------------------------
  //  Zona 4: río y puente
  // ------------------------------------------------------------------
  buildRiver() {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(60, 14), this.mat.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.03, -170);
    this.scene.add(water);
    this.water = water;
    // el agua no se puede cruzar (salvo por el puente x -2..2)
    this.colliders.push(new THREE.Box3(new THREE.Vector3(-30, -1, -177), new THREE.Vector3(-2.2, 2, -163)));
    this.colliders.push(new THREE.Box3(new THREE.Vector3(2.2, -1, -177), new THREE.Vector3(30, 2, -163)));

    // puente
    this.box(0, 0, -170, 4, 0.12, 16, this.mat.wood, false);
    this.box(-2.1, 0, -170, 0.2, 1.1, 16, this.mat.wood);
    this.box(2.1, 0, -170, 0.2, 1.1, 16, this.mat.wood);
    this.torch(-3, -161);
    this.torch(3, -179);
    this.deadTree(-14, -158);
    this.deadTree(16, -182);
    this.sign(4, -158, 'PUENTE\nDEL CUERVO', 0);
  }

  // ------------------------------------------------------------------
  //  Zona 5: extracción - carruaje de los cazadores
  // ------------------------------------------------------------------
  buildExtraction() {
    const ex = EXTRACTION;
    // carruaje
    const cz = ex.z - 6;
    this.box(ex.x, 0.6, cz, 2.4, 2.2, 3.6, this.mat.dark);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 3.8), this.mat.wood);
    top.position.set(ex.x, 2.9, cz); this.scene.add(top);
    for (const [dx, dz] of [[-1.3, -1.2], [1.3, -1.2], [-1.3, 1.2], [1.3, 1.2]]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.15, 10), this.mat.wood);
      w.rotation.z = Math.PI / 2;
      w.position.set(ex.x + dx, 0.6, cz + dz);
      this.scene.add(w);
    }
    // faroles
    for (const dx of [-1.5, 1.5]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.25), new THREE.MeshBasicMaterial({ color: 0x9fd8ff }));
      lamp.position.set(ex.x + dx, 2.3, cz + 1.9);
      this.scene.add(lamp);
    }
    const lampLight = new THREE.PointLight(0x7fc8ff, 10, 18, 1.4);
    lampLight.position.set(ex.x, 2.6, cz + 2.5);
    this.scene.add(lampLight);

    // círculo de luz = zona segura
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    this.extractRing = new THREE.Mesh(new THREE.CylinderGeometry(ex.radius, ex.radius, 3, 24, 1, true), ringMat);
    this.extractRing.position.set(ex.x, 1.5, ex.z);
    this.scene.add(this.extractRing);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(ex.radius, 24), new THREE.MeshBasicMaterial({ color: 0x2a6a90 }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(ex.x, 0.04, ex.z);
    this.scene.add(disc);

    this.torch(-6, -196);
    this.torch(6, -196);
    this.sign(-4, -197, 'CAZADORES\nZONA SEGURA', 0);
  }

  // ------------------------------------------------------------------
  //  Decoración con modelos GLB del Zombie Apocalypse Kit
  // ------------------------------------------------------------------
  addProps(M) {
    const place = (key, x, z, size, rotY = 0, solid = false) => {
      if (!M[key]) return;
      const g = fitModel(M[key], size);
      g.position.set(x, 0, z);
      g.rotation.y = rotY;
      this.scene.add(g);
      if (solid) {
        g.updateMatrixWorld(true);
        this.colliders.push(new THREE.Box3().setFromObject(g));
        g.traverse(o => { if (o.isMesh) this.solidMeshes.push(o); });
      }
    };
    // barriles (sólidos)
    [[-15, -30], [-15, -31.2], [15.3, -44], [-15, -60], [15, -73], [-27, -96], [26, -147],
     [4, -152], [-26, -186], [-6, -194], [6.5, -21.5], [-6.5, -21.5]]
      .forEach(([x, z], i) => place('barrel', x, z, 1.0, i, true));
    // pallets apoyados en las barricadas
    place('pallet', 2, -46.4, 1.6, 0.2);
    place('pallet', -6, -63.4, 1.6, -0.3);
    place('pallet_broken', 8, -24, 1.6, 1.2);
    place('pallet_broken', -18, -152, 1.6, 0.4);
    place('pallet_broken', 12, -160, 1.6, 2.1);
    // charcos de sangre
    [[1, -1, 1], [6, -10, 2], [-4, -35, 3], [10, -56, 1], [-2, -80, 2], [-12, -94, 3],
     [4, -108, 1], [-10, -136, 2], [0, -158, 3], [1, -181, 1], [-3, -190, 2]]
      .forEach(([x, z, n], i) => place('blood_' + n, x, z, 1.8, i * 1.7));
  }

  // ------------------------------------------------------------------
  //  Elementos japoneses y escenas de terror (j-horror)
  // ------------------------------------------------------------------
  buildJapanese() {
    const red = new THREE.MeshLambertMaterial({ color: 0xa01810 });
    const black = new THREE.MeshLambertMaterial({ color: 0x141010 });
    this.reserved = [];                          // lugares donde no van lápidas

    // Torii (portales rojos) en la aldea, el cementerio y el puente
    const torii = (x, z) => {
      this.box(x - 2.7, 0, z, 0.36, 4.2, 0.36, red);
      this.box(x + 2.7, 0, z, 0.36, 4.2, 0.36, red);
      this.box(x, 3.5, z, 6.0, 0.25, 0.25, red, false);
      this.box(x, 4.2, z, 7.0, 0.32, 0.5, black, false);
    };
    torii(0, -17);
    torii(-14, -87);
    torii(0, -159.5);

    // Farolillos de papel (chōchin) en la entrada de la aldea.
    // Escena: se apagan uno a uno hacia el jugador.
    this.lanterns = [];
    for (const z of [-38, -34, -30, -26]) {
      for (const x of [-3.2, 3.2]) {
        this.box(x, 0, z, 0.12, 3.0, 0.12, this.mat.wood, false);
        const mat = new THREE.MeshBasicMaterial({ color: 0xe03a1a });
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.5, 8), mat);
        l.position.set(x, 2.55, z);
        this.scene.add(l);
        this.lanterns.push({ mat, z });
      }
    }
    this.lanternLight = new THREE.PointLight(0xff4020, 8, 16, 1.4);
    this.lanternLight.position.set(0, 2.6, -32);
    this.scene.add(this.lanternLight);

    // Pozo (escena de Ringu)
    const wx = 18, wz = -124;
    const wellMat = this.mat.stone.clone();
    wellMat.side = THREE.DoubleSide;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.9, 12, 1, true), wellMat);
    ring.position.set(wx, 0.45, wz);
    this.scene.add(ring);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.95, 12), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    hole.rotation.x = -Math.PI / 2; hole.position.set(wx, 0.15, wz);
    this.scene.add(hole);
    this.box(wx - 1.1, 0, wz, 0.15, 2.3, 0.15, this.mat.wood, false);
    this.box(wx + 1.1, 0, wz, 0.15, 2.3, 0.15, this.mat.wood, false);
    this.box(wx, 2.3, wz, 2.6, 0.12, 1.4, this.mat.roof, false);
    this.colliders.push(new THREE.Box3(new THREE.Vector3(wx - 1, 0, wz - 1), new THREE.Vector3(wx + 1, 1, wz + 1)));
    this.solidMeshes.push(ring);
    this.reserved.push({ x: wx, z: wz }, { x: wx, z: wz + 2 }, { x: wx, z: wz - 2 }, { x: wx - 2, z: wz }, { x: wx + 2, z: wz });

    // Campana del templo
    const bx = -22, bz = -120;
    this.box(bx - 1.2, 0, bz, 0.2, 3.2, 0.2, this.mat.wood);
    this.box(bx + 1.2, 0, bz, 0.2, 3.2, 0.2, this.mat.wood);
    this.box(bx, 3.2, bz, 2.8, 0.25, 0.3, this.mat.roof, false);
    this.bellPivot = new THREE.Group();
    this.bellPivot.position.set(bx, 3.2, bz);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.0, 10), new THREE.MeshLambertMaterial({ color: 0x6a5020 }));
    bell.position.y = -0.7;
    this.bellPivot.add(bell);
    this.scene.add(this.bellPivot);
    this.bellT = 0;
    this.reserved.push({ x: bx, z: bz }, { x: bx - 1.2, z: bz }, { x: bx + 1.2, z: bz });

    // Jizō: estatuas de piedra con babero rojo. Giran para mirarte cuando no las ves.
    this.jizos = [];
    const stone = new THREE.MeshLambertMaterial({ color: 0x77736c });
    const bib = new THREE.MeshLambertMaterial({ color: 0xa01810 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2010 });
    for (const [x, z] of [[-18, -94], [-18, -97], [-18, -100], [-10, -94], [-10, -97], [-10, -100]]) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.6, 0.35), stone); body.position.y = 0.3;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), stone); head.position.y = 0.78;
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.22, 0.37), bib); b.position.set(0, 0.5, 0.01);
      const eye1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.02), eyeMat);
      eye1.position.set(-0.07, 0.8, 0.18);
      const eye2 = eye1.clone(); eye2.position.x = 0.07;
      g.add(body, head, b, eye1, eye2);
      g.position.set(x, 0, z);
      g.rotation.y = Math.PI;                 // al principio dan la espalda
      this.scene.add(g);
      this.colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.3, 0, z - 0.3), new THREE.Vector3(x + 0.3, 1, z + 0.3)));
      this.jizos.push({ g, x, z, turned: false });
      this.reserved.push({ x, z });
    }

    // Kanji escritos con sangre
    const kanji = (text, x, y, z, rotY, w = 2.4) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2),
        new THREE.MeshBasicMaterial({ map: kanjiTexture(text), transparent: true, depthWrite: false }));
      m.position.set(x, y, z); m.rotation.y = rotY;
      this.scene.add(m);
      return m;
    };
    kanji('逃げて', -9, 2.0, -19.45, 0);         // "huye" en el muro de la aldea
    kanji('呪', -2, 2.6, -123.45, 0, 2);         // "maldición" en la cripta
    this.kanjiBehind = kanji('後ろ', 6.47, 1.9, -76, -Math.PI / 2);   // "detrás de ti"
    this.kanjiBehind.material.opacity = 0;

    // Puerta que golpea (casa de la izquierda, z = -52)
    this.bangPivot = new THREE.Group();
    this.bangPivot.position.set(-15.95, 0, -51.4);
    const bd = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 1.2), this.mat.wood);
    bd.position.set(0, 1.1, -0.6);
    this.bangPivot.add(bd);
    this.scene.add(this.bangPivot);
    this.bangT = 0;
    this.bangOpen = 0;

    // Trozos de papel/madera del shoji roto
    this.debris = [];
  }

  // Rompe el shoji en pedazos (intro)
  breakShoji() {
    this.doorPivot.visible = false;
    const paper = new THREE.MeshBasicMaterial({ color: 0x8a8070 });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3 + Math.random() * 0.3, 0.3 + Math.random() * 0.4, 0.03), i % 3 ? paper : this.mat.wood);
      m.position.set((Math.random() - 0.5) * 1.0, 0.4 + Math.random() * 1.8, 4.1);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, 2 + Math.random() * 3);
      m.userData.w = new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.scene.add(m);
      this.debris.push(m);
    }
  }

  ringBell() { this.bellT = 3; }
  dim(seconds) { this.dimT = seconds; }

  // Apaga los farolillos uno a uno, del más lejano al más cercano
  lanternsOut(onDone) {
    const sorted = [...this.lanterns].sort((a, b) => a.z - b.z);
    sorted.forEach((l, i) => setTimeout(() => {
      l.mat.color.setHex(0x140404);
      if (i === sorted.length - 1) {
        this.lanternLight.intensity = 0;
        if (onDone) onDone();
      } else this.lanternLight.intensity *= 0.82;
    }, i * 260));
  }

  // Jizō que te miran cuando no los ves. Devuelve true si ves uno ya girado.
  updateJizos(frustum, playerPos) {
    let seenTurned = false;
    for (const j of this.jizos) {
      _p.set(j.x, 0.8, j.z);
      const visible = frustum.containsPoint(_p);
      const d = Math.hypot(playerPos.x - j.x, playerPos.z - j.z);
      if (!visible && d < 16) {
        j.g.rotation.y = Math.atan2(playerPos.x - j.x, playerPos.z - j.z);
        j.turned = true;
      } else if (visible && j.turned && d < 12) seenTurned = true;
    }
    return seenTurned;
  }

  updateJapanese(dt) {
    // campana
    if (this.bellT > 0) {
      this.bellT -= dt;
      this.bellPivot.rotation.x = Math.sin(this.time * 6) * 0.35 * (this.bellT / 3);
    }
    // puerta que golpea
    if (this.bangOpen > 0) {
      this.bangPivot.rotation.y = THREE.MathUtils.lerp(this.bangPivot.rotation.y, -1.7, dt * 10);
    } else if (this.bangT > 0) {
      this.bangT -= dt;
      this.bangPivot.rotation.y = -Math.max(0, Math.sin(this.time * 9)) * 0.18;
    } else this.bangPivot.rotation.y = 0;
    // trozos del shoji
    for (const m of this.debris) {
      if (m.position.y <= 0.03) continue;
      m.userData.v.y -= 9 * dt;
      m.position.addScaledVector(m.userData.v, dt);
      m.rotation.x += m.userData.w.x * dt; m.rotation.y += m.userData.w.y * dt;
      if (m.position.y < 0.03) m.position.y = 0.03;
    }
  }

  // Lluvia: segmentos de línea alrededor de la cámara que caen y se reciclan
  buildRain() {
    const N = 1400;
    const area = 36;
    const pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * area, y = Math.random() * 14, z = (Math.random() - 0.5) * area;
      pos.set([x, y, z, x + 0.05, y - 0.6, z], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9098b0, transparent: true, opacity: 0.28, fog: false }));
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  updateRain(dt, camPos) {
    if (!this.rain.visible || !camPos) return;
    this.rain.position.set(camPos.x, 0, camPos.z);
    const a = this.rain.geometry.attributes.position.array;
    const fall = 16 * dt;
    for (let i = 0; i < a.length; i += 6) {
      a[i + 1] -= fall; a[i + 4] -= fall;
      if (a[i + 4] < 0) { a[i + 1] += 14; a[i + 4] += 14; }
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }


  // ------------------------------------------------------------------
  //  Relámpago: un destello breve de luz azulada + trueno
  // ------------------------------------------------------------------
  flashLightning() {
    this.lightningT = 0.45;
    if (this.onLightning) this.onLightning();
  }

  update(dt, camPos = null) {
    this.time += dt;
    if (this.dimT > 0) this.dimT -= dt;
    const dim = this.dimT > 0 ? 0.12 + Math.random() * 0.15 : 1;
    const t = this.time;

    // antorchas que parpadean
    for (const tr of this.torches) {
      const f = 0.8 + Math.sin(t * 13 + tr.seed) * 0.12 + Math.sin(t * 27 + tr.seed * 2) * 0.08;
      tr.flame.scale.y = f;
      if (tr.light) tr.light.intensity = (tr.light.userData.base ??= tr.light.intensity) * f * dim;
      tr.flame.visible = dim > 0.5 || Math.random() < 0.3;
    }

    // relámpagos aleatorios cada 10-20 s
    this.nextLightning -= dt;
    if (this.nextLightning <= 0) {
      this.nextLightning = 10 + Math.random() * 10;
      this.flashLightning();
    }
    if (this.lightningT > 0) {
      this.lightningT -= dt;
      // doble destello
      const k = this.lightningT;
      const on = (k > 0.35) || (k > 0.12 && k < 0.22);
      this.lightning.intensity = on ? 3.5 : 0;
      this.windowMat.color.setHex(on ? 0xc0c8ff : 0x0a0a18);
      this.shojiMat.color.setHex(on ? 0xffffff : 0x2a2620);
      this.shojiMat.map = this.shojiTex[on ? this.shojiStage : 0];
    } else {
      this.lightning.intensity = 0;
    }

    this.updateJapanese(dt);
    this.updateRain(dt, camPos);

    // la zona de extracción pulsa
    this.extractRing.material.opacity = 0.25 + Math.sin(t * 3) * 0.12;
    this.extractRing.rotation.y += dt * 0.5;
    this.water.material.map.offset.x += dt * 0.02;
  }
}
