// =====================================================================
//  tools/forge.js  -  "Forja" de personajes j-horror
//
//  Construye por código los zombis japoneses del juego y los exporta
//  como archivos .glb (GLTFExporter de Three.js) en models/jz_*.glb.
//
//  Cada personaje es una jerarquía de articulaciones (Object3D):
//    Hips -> Spine -> Head
//              Spine -> ArmL -> ForeL     Hips -> LegL -> ShinL
//              Spine -> ArmR -> ForeR     Hips -> LegR -> ShinR
//  Las partes del cuerpo (cajas y cilindros) cuelgan de esas
//  articulaciones, y las animaciones son pistas de rotación
//  (QuaternionKeyframeTrack) sobre ellas: Idle, Walk, Run, Crawl,
//  Death, HitReact y Punch. Es animación jerárquica (como un robot
//  articulado), sin skinning.
//
//  Uso: abrir tools/forge.html (vista previa) o tools/forge.html?save=1
//  con el servidor local para escribir los archivos.
// =====================================================================
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// ---------------------------------------------------------------------
//  Utilidades de modelado
// ---------------------------------------------------------------------
const M = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.95, metalness: 0, ...extra });

function joint(name, parent, x, y, z) {
  const j = new THREE.Group();
  j.name = name;
  j.position.set(x, y, z);
  parent.add(j);
  return j;
}

function part(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (rt, rb, h, s = 7) => new THREE.CylinderGeometry(rt, rb, h, s);

// Esqueleto humanoide estándar (mira hacia +Z, ~1.9 m)
const HIP_Y = 0.97;
function humanoid(name, c, o = {}) {
  const root = new THREE.Group();
  root.name = name;
  const r = { root };
  r.hips  = joint('Hips', root, 0, HIP_Y, 0);
  r.spine = joint('Spine', r.hips, 0, 0.05, 0);
  r.head  = joint('Head', r.spine, 0, 0.62, 0);
  const ua = o.longArms ? 0.36 : 0.3;
  r.armL  = joint('ArmL', r.spine, 0.27, 0.55, 0);
  r.armR  = joint('ArmR', r.spine, -0.27, 0.55, 0);
  r.foreL = joint('ForeL', r.armL, 0, -ua, 0);
  r.foreR = joint('ForeR', r.armR, 0, -ua, 0);
  r.legL  = joint('LegL', r.hips, 0.11, 0, 0);
  r.legR  = joint('LegR', r.hips, -0.11, 0, 0);
  r.shinL = joint('ShinL', r.legL, 0, -0.45, 0);
  r.shinR = joint('ShinR', r.legR, 0, -0.45, 0);

  // cuerpo
  part(r.spine, B(0.42, 0.6, 0.24), c.top, 0, 0.3, 0);
  part(r.hips, B(0.38, 0.18, 0.22), c.bottom, 0, -0.02, 0);
  part(r.head, B(0.24, 0.28, 0.26), c.skin, 0, 0.14, 0);
  part(r.head, B(0.1, 0.1, 0.1), c.skin, 0, -0.03, 0);                 // cuello
  // ojos
  if (!o.noEyes) {
    part(r.head, B(0.05, 0.03, 0.02), c.eye, 0.06, 0.17, 0.131);
    part(r.head, B(0.05, 0.03, 0.02), c.eye, -0.06, 0.17, 0.131);
  }
  // brazos
  for (const [arm, fore] of [[r.armL, r.foreL], [r.armR, r.foreR]]) {
    part(arm, B(o.sleeve ?? 0.11, ua, o.sleeve ?? 0.11), c.sleeve ?? c.top, 0, -ua / 2, 0);
    part(fore, B(0.1, ua, 0.1), c.forearm ?? c.skin, 0, -ua / 2, 0);
    part(fore, B(0.09, 0.11, 0.06), c.skin, 0, -ua - 0.04, 0);
    if (o.claws) part(fore, B(0.08, 0.08, 0.02), c.nail, 0, -ua - 0.13, 0.01);
  }
  // piernas
  if (!o.noLegs) {
    for (const [leg, shin] of [[r.legL, r.shinL], [r.legR, r.shinR]]) {
      part(leg, B(0.15, 0.45, 0.15), c.legs ?? c.bottom, 0, -0.225, 0);
      part(shin, B(0.13, 0.44, 0.13), c.shins ?? c.legs ?? c.skin, 0, -0.22, 0);
      part(shin, B(0.13, 0.07, 0.22), c.shoes, 0, -0.47, 0.04);
    }
  }
  return r;
}

// ---------------------------------------------------------------------
//  Animaciones (keyframes de rotación en cada articulación)
// ---------------------------------------------------------------------
const _q = new THREE.Quaternion(), _e = new THREE.Euler();

// Muestrea una función f(φ) -> {Joint: [rx,ry,rz], 'Hips.pos': [x,y,z]} a lo largo de un ciclo
function clip(name, duration, f, { samples = 13, step = false, loop = true } = {}) {
  const times = [];
  const frames = [];
  for (let i = 0; i < samples; i++) {
    const t = (i / (samples - 1)) * duration;
    times.push(t);
    frames.push(f(loop ? (i / (samples - 1)) * Math.PI * 2 : i / (samples - 1)));
  }
  const tracks = [];
  for (const key of Object.keys(frames[0])) {
    const values = [];
    if (key === 'pos') {
      for (const fr of frames) values.push(...fr.pos);
      tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, values));
    } else {
      for (const fr of frames) {
        _q.setFromEuler(_e.set(...fr[key]));
        values.push(_q.x, _q.y, _q.z, _q.w);
      }
      const tr = new THREE.QuaternionKeyframeTrack(key + '.quaternion', times, values);
      if (step) tr.setInterpolation(THREE.InterpolateDiscrete);   // movimiento a saltos
      tracks.push(tr);
    }
  }
  return new THREE.AnimationClip(name, duration, tracks);
}

const S = Math.sin, Co = Math.cos;

// style: 'zombie' (brazos al frente), 'ghost' (brazos colgando, a saltos),
//        'runner' (corre balanceando brazos), 'samurai', 'monk', 'crawler'
function makeClips(style) {
  const zombieArms = style === 'zombie';
  const ghost = style === 'ghost';
  const clips = [];

  // Idle
  clips.push(clip('Idle', 2.6, φ => ({
    pos: [0, HIP_Y - 0.01 * S(φ), 0],
    Spine: [ghost ? 0.25 : 0.1, 0, 0.05 * S(φ)],
    Head: [ghost ? 0.5 : 0.1, 0.1 * S(φ), ghost ? 0.45 : 0.25 + 0.08 * S(φ)],
    ArmL: [zombieArms ? -1.1 + 0.08 * S(φ) : 0.05, 0, 0.08],
    ArmR: [zombieArms ? -1.0 - 0.08 * S(φ) : 0.05, 0, -0.08],
    ForeL: [zombieArms ? -0.2 : -0.1, 0, 0], ForeR: [zombieArms ? -0.2 : -0.1, 0, 0],
    LegL: [0, 0, 0.03], LegR: [0, 0, -0.03], ShinL: [0.05, 0, 0], ShinR: [0.05, 0, 0],
  })));

  // Walk (los fantasmas caminan "a saltos" con interpolación discreta)
  const amp = ghost ? 0.18 : style === 'samurai' ? 0.4 : 0.5;
  clips.push(clip('Walk', ghost ? 1.6 : 1.2, φ => ({
    pos: [0, HIP_Y - 0.035 * Math.abs(Co(φ)), 0],
    Spine: [ghost ? 0.35 : 0.15, 0.1 * S(φ), 0.08 * S(φ)],
    Head: [ghost ? 0.55 : 0.15, 0.15 * S(φ * 2), ghost ? 0.5 * S(φ * 0.5) : 0.2],
    ArmL: [zombieArms ? -1.3 + 0.15 * S(φ) : style === 'monk' ? -0.3 : -0.4 * S(φ) * (ghost ? 0.2 : 1), 0, 0.1],
    ArmR: [zombieArms ? -1.25 - 0.15 * S(φ) : style === 'monk' ? -0.5 : 0.4 * S(φ) * (ghost ? 0.2 : 1), 0, -0.1],
    ForeL: [zombieArms ? -0.15 : -0.25, 0, 0], ForeR: [zombieArms ? -0.15 : -0.35, 0, 0],
    LegL: [-amp * S(φ), 0, 0], LegR: [amp * S(φ), 0, 0],
    ShinL: [0.1 + 0.7 * Math.max(0, S(φ)), 0, 0], ShinR: [0.1 + 0.7 * Math.max(0, -S(φ)), 0, 0],
  }), { samples: ghost ? 9 : 13, step: ghost }));

  // Run
  clips.push(clip('Run', 0.62, φ => ({
    pos: [0, HIP_Y - 0.06 * Math.abs(Co(φ)), 0],
    Spine: [0.45, 0.15 * S(φ), 0],
    Head: [-0.25, 0, 0.1],
    ArmL: [zombieArms ? -1.4 : -0.9 * S(φ), 0, 0.15], ArmR: [zombieArms ? -1.4 : 0.9 * S(φ), 0, -0.15],
    ForeL: [-0.9, 0, 0], ForeR: [-0.9, 0, 0],
    LegL: [-0.9 * S(φ), 0, 0], LegR: [0.9 * S(φ), 0, 0],
    ShinL: [0.2 + 1.2 * Math.max(0, S(φ)), 0, 0], ShinR: [0.2 + 1.2 * Math.max(0, -S(φ)), 0, 0],
  })));

  // Crawl (tumbado boca abajo, avanzando con los brazos)
  clips.push(clip('Crawl', 1.0, φ => ({
    pos: [0, 0.3 + 0.04 * Math.abs(S(φ)), 0],
    Hips: [1.35, 0.1 * S(φ), 0],
    Spine: [0.1, 0, 0.1 * S(φ)],
    Head: [-1.05, 0, 0.1 * S(φ)],
    ArmL: [-2.5 + 0.7 * S(φ), 0, 0.25], ArmR: [-2.5 - 0.7 * S(φ), 0, -0.25],
    ForeL: [-0.4 - 0.4 * Math.max(0, -S(φ)), 0, 0], ForeR: [-0.4 - 0.4 * Math.max(0, S(φ)), 0, 0],
    LegL: [0.15, 0, 0.1], LegR: [0.15, 0, -0.1], ShinL: [0.2, 0, 0], ShinR: [0.3, 0, 0],
  }), { samples: 13 }));

  // Death (cae de espaldas), una sola vez
  clips.push(clip('Death', 1.1, k => {
    const e = Math.min(1, k * 1.3);
    return {
      pos: [0, HIP_Y - (HIP_Y - 0.2) * e * e, -0.3 * e],
      Hips: [-1.45 * e * e, 0, 0.15 * e],
      Spine: [-0.2 * e, 0, 0], Head: [-0.4 * e, 0.5 * e, 0],
      ArmL: [-2.6 * e, 0, 0.6 * e], ArmR: [-2.4 * e, 0, -0.7 * e],
      ForeL: [-0.3, 0, 0], ForeR: [-0.3, 0, 0],
      LegL: [-0.6 * e, 0, 0.1], LegR: [-0.3 * e, 0, -0.1], ShinL: [0.5 * e, 0, 0], ShinR: [0.2 * e, 0, 0],
    };
  }, { loop: false, samples: 12 }));

  // HitReact
  clips.push(clip('HitReact', 0.45, k => {
    const e = S(k * Math.PI);
    return {
      pos: [0, HIP_Y, -0.08 * e],
      Spine: [-0.45 * e, 0, 0.15 * e], Head: [-0.6 * e, 0, -0.3 * e],
      ArmL: [-0.6 * e, 0, 0.5 * e], ArmR: [-0.4 * e, 0, -0.5 * e],
    };
  }, { loop: false, samples: 9 }));

  // Punch / ataque
  clips.push(clip('Punch', 0.6, k => {
    const e = S(k * Math.PI);
    return {
      pos: [0, HIP_Y, 0.1 * e],
      Spine: [0.35 * e, 0, 0], ArmL: [-1.7 * e, 0, 0.1], ArmR: [-1.6 * e, 0, -0.1],
      ForeL: [-0.1, 0, 0], ForeR: [-0.1, 0, 0],
    };
  }, { loop: false, samples: 9 }));

  return clips;
}

// Versión "tumbada" de las animaciones (teke-teke): todo es arrastrarse
function crawlerClips() {
  const all = makeClips('zombie');
  const crawl = all.find(c => c.name === 'Crawl');
  const idle = crawl.clone(); idle.name = 'Idle';
  idle.tracks.forEach(t => { t.times = t.times.map(x => x * 3); }); idle.duration *= 3;
  const walk = crawl.clone(); walk.name = 'Walk';
  const fast = crawl.clone(); fast.name = 'Run';
  fast.tracks.forEach(t => { t.times = t.times.map(x => x * 0.6); }); fast.duration *= 0.6;
  // morir: se queda plano
  const death = clip('Death', 0.6, k => ({
    pos: [0, 0.3 - 0.15 * k, 0], Hips: [1.35 + 0.2 * k, 0, 0.3 * k], Head: [-1.05 + 1.0 * k, 0, 0],
    ArmL: [-2.5 + 0.8 * k, 0, 0.6 * k], ArmR: [-2.5 + 0.6 * k, 0, -0.6 * k],
  }), { loop: false, samples: 8 });
  const hit = all.find(c => c.name === 'HitReact');
  return [idle, walk, fast, crawl, death, hit];
}

// ---------------------------------------------------------------------
//  Personajes
// ---------------------------------------------------------------------
const pal = {
  pale: M(0xd8d6cc), rot: M(0x7d8a6a), grey: M(0x8c8c84), black: M(0x060606), white: M(0xe8e6de),
  blood: M(0x6a0606), red: M(0x9a1410), navy: M(0x1a2440), gold: M(0xc8a030, { metalness: 0.4 }),
  steel: M(0xb0b4b8, { metalness: 0.6, roughness: 0.4 }), wood: M(0x4a3020), beige: M(0xb09a72),
  orange: M(0xb0581a), brown: M(0x3a2618), straw: M(0xc8a860), dark: M(0x161414),
  eyeRed: new THREE.MeshStandardMaterial({ color: 0xff2010, emissive: 0xaa0000 }),
  eyeWhite: new THREE.MeshStandardMaterial({ color: 0xf0f0e0, emissive: 0x404040 }),
};

function longHair(r, len = 0.75) {
  part(r.head, B(0.3, 0.1, 0.3), pal.black, 0, 0.3, 0);                // coronilla
  part(r.head, B(0.3, len, 0.08), pal.black, 0, 0.27 - len / 2, -0.13);  // espalda
  part(r.head, B(0.05, len * 0.8, 0.26), pal.black, 0.14, 0.27 - len * 0.4, 0);
  part(r.head, B(0.05, len * 0.8, 0.26), pal.black, -0.14, 0.27 - len * 0.4, 0);
}

function bloodStains(r, n = 4) {
  for (let i = 0; i < n; i++) {
    part(r.spine, B(0.08 + Math.random() * 0.08, 0.05 + Math.random() * 0.12, 0.01), pal.blood,
      (Math.random() - 0.5) * 0.3, 0.1 + Math.random() * 0.4, 0.125);
  }
}

// 1. Onryō: kimono blanco (shiroshōzoku), pelo negro que cubre la cara
function onryo() {
  const r = humanoid('Onryo', { skin: pal.pale, top: pal.white, bottom: pal.white, sleeve: pal.white, forearm: pal.pale, legs: pal.pale, shoes: pal.pale, eye: pal.black }, { sleeve: 0.17, longArms: true, noEyes: true });
  part(r.hips, C(0.22, 0.34, 0.92), pal.white, 0, -0.5, 0);           // kimono largo
  part(r.spine, B(0.08, 0.5, 0.02), pal.grey, 0.06, 0.3, 0.125, 0, 0, 0.5); // cruce del kimono
  longHair(r, 0.95);
  part(r.head, B(0.26, 0.55, 0.04), pal.black, 0, 0.02, 0.15);        // pelo sobre la cara
  part(r.head, B(0.04, 0.03, 0.02), pal.eyeWhite, 0.035, 0.15, 0.172); // un ojo que asoma
  part(r.head, B(0.015, 0.025, 0.01), pal.black, 0.035, 0.15, 0.182);
  bloodStains(r, 3);
  return { r, clips: makeClips('ghost') };
}

// 2. Ochimusha: samurái caído con armadura roja, katana rota y flechas
function ochimusha() {
  const r = humanoid('Ochimusha', { skin: pal.rot, top: pal.navy, bottom: pal.navy, legs: pal.navy, shoes: pal.dark, eye: pal.eyeRed });
  // dō (peto) lacado en rojo con cordones
  part(r.spine, B(0.48, 0.42, 0.3), pal.red, 0, 0.36, 0);
  for (let i = 0; i < 4; i++) part(r.spine, B(0.49, 0.02, 0.31), pal.dark, 0, 0.2 + i * 0.1, 0);
  // kusazuri (faldones)
  for (const [x, z, ry] of [[0, 0.13, 0], [0, -0.13, 0], [0.17, 0, Math.PI / 2], [-0.17, 0, Math.PI / 2]]) {
    part(r.hips, B(0.22, 0.3, 0.04), pal.red, x, -0.2, z, 0, ry, 0);
  }
  // sode (hombreras)
  part(r.armL, B(0.06, 0.24, 0.22), pal.red, 0.07, -0.08, 0, 0, 0, 0.2);
  part(r.armR, B(0.06, 0.24, 0.22), pal.red, -0.07, -0.08, 0, 0, 0, -0.2);
  // kabuto (casco) con kuwagata dorado
  part(r.head, C(0.17, 0.19, 0.16, 8), pal.dark, 0, 0.3, 0);
  part(r.head, B(0.42, 0.04, 0.36), pal.dark, 0, 0.23, -0.02, -0.15, 0, 0);
  part(r.head, B(0.03, 0.22, 0.02), pal.gold, 0.06, 0.45, 0.15, 0, 0, -0.4);
  part(r.head, B(0.03, 0.22, 0.02), pal.gold, -0.06, 0.45, 0.15, 0, 0, 0.4);
  part(r.head, B(0.2, 0.08, 0.02), pal.dark, 0, 0.05, 0.135);            // mempō (máscara)
  // katana rota en la mano derecha
  part(r.foreR, B(0.03, 0.22, 0.03), pal.dark, 0, -0.36, 0.06, 1.4, 0, 0);
  part(r.foreR, B(0.02, 0.06, 0.45), pal.steel, 0, -0.38, 0.38, 0, 0, 0);
  // flechas clavadas en la espalda
  for (const [x, y, rz] of [[0.1, 0.45, 0.3], [-0.06, 0.3, -0.2], [0.02, 0.5, 0]]) {
    const a = part(r.spine, C(0.01, 0.01, 0.6, 4), pal.wood, x, y, -0.32, -0.7, 0, rz);
    part(a, B(0.06, 0.12, 0.005), pal.white, 0, 0.27, 0);
  }
  bloodStains(r, 2);
  return { r, clips: makeClips('samurai') };
}

// 3. Kuchisake-onna: gabardina, mascarilla, boca cortada y tijeras
function kuchisake() {
  const r = humanoid('Kuchisake', { skin: pal.pale, top: pal.beige, bottom: pal.beige, sleeve: pal.beige, forearm: pal.beige, legs: pal.dark, shins: pal.dark, shoes: pal.red, eye: pal.eyeRed });
  part(r.hips, C(0.22, 0.28, 0.6), pal.beige, 0, -0.3, 0);             // falda de la gabardina
  part(r.spine, B(0.44, 0.08, 0.26), pal.brown, 0, 0.0, 0);            // cinturón
  longHair(r, 0.8);
  part(r.head, B(0.28, 0.08, 0.06), pal.black, 0, 0.27, 0.12);          // flequillo
  // la boca cortada de oreja a oreja (bajo la mascarilla)
  part(r.head, B(0.25, 0.025, 0.01), pal.blood, 0, 0.07, 0.132);
  part(r.head, B(0.05, 0.05, 0.01), pal.blood, 0.11, 0.09, 0.132, 0, 0, 0.5);
  part(r.head, B(0.05, 0.05, 0.01), pal.blood, -0.11, 0.09, 0.132, 0, 0, -0.5);
  const mask = part(r.head, B(0.2, 0.12, 0.03), pal.white, 0, 0.07, 0.14);
  mask.name = 'Mask';
  // tijeras gigantes
  const sc = joint('Scissors', r.foreR, 0, -0.38, 0.05);
  part(sc, B(0.02, 0.45, 0.04), pal.steel, 0.015, -0.18, 0, 0, 0, 0.12);
  part(sc, B(0.02, 0.45, 0.04), pal.steel, -0.015, -0.18, 0, 0, 0, -0.12);
  part(sc, C(0.04, 0.04, 0.02, 6), pal.red, 0.03, 0.04, 0, Math.PI / 2, 0, 0);
  return { r, clips: makeClips('runner') };
}

// 4. Teke-teke: colegiala partida por la mitad que se arrastra con los brazos
function tekeTeke() {
  const r = humanoid('TekeTeke', { skin: pal.pale, top: pal.white, bottom: pal.blood, sleeve: pal.white, eye: pal.eyeRed, nail: pal.blood }, { noLegs: true, longArms: true, claws: true });
  part(r.spine, B(0.44, 0.16, 0.26), pal.navy, 0, 0.58, -0.02);        // cuello marinero
  part(r.spine, B(0.12, 0.12, 0.03), pal.red, 0, 0.46, 0.13);          // pañuelo
  part(r.hips, C(0.2, 0.17, 0.12, 8), pal.blood, 0, -0.08, 0);         // muñón
  for (let i = 0; i < 5; i++) part(r.hips, B(0.03, 0.12 + Math.random() * 0.15, 0.03), pal.blood, (Math.random() - 0.5) * 0.3, -0.18, (Math.random() - 0.5) * 0.2);
  longHair(r, 0.55);
  part(r.head, B(0.28, 0.08, 0.06), pal.black, 0, 0.27, 0.12);
  part(r.head, B(0.12, 0.03, 0.01), pal.blood, 0, 0.06, 0.131);        // boca
  bloodStains(r, 5);
  // pose de reposo: tumbada (así se mide su altura real)
  r.hips.position.set(0, 0.3, 0);
  r.hips.rotation.x = 1.35;
  r.head.rotation.x = -1.05;
  r.armL.rotation.x = r.armR.rotation.x = -2.3;
  return { r, clips: crawlerClips() };
}

// 5. Monje zombi: sombrero de paja, túnica y bastón shakujō
function monk() {
  const r = humanoid('Monk', { skin: pal.grey, top: pal.dark, bottom: pal.dark, sleeve: pal.dark, legs: pal.dark, shoes: pal.straw, eye: pal.eyeRed }, { sleeve: 0.15 });
  part(r.hips, C(0.22, 0.3, 0.85), pal.dark, 0, -0.45, 0);             // koromo
  part(r.spine, B(0.46, 0.12, 0.27), pal.orange, 0, 0.35, 0, 0, 0, 0.55); // kesa
  part(r.spine, new THREE.TorusGeometry(0.15, 0.025, 4, 10), pal.brown, 0, 0.55, 0.06, 1.3, 0, 0); // rosario
  part(r.head, C(0.02, 0.42, 0.22, 10), pal.straw, 0, 0.36, 0);        // sombrero de paja
  part(r.head, B(0.12, 0.025, 0.01), pal.blood, 0, 0.05, 0.131);
  const staff = part(r.foreR, C(0.02, 0.02, 1.7, 5), pal.wood, 0, -0.35, 0.05);
  part(staff, new THREE.TorusGeometry(0.08, 0.012, 4, 8), pal.gold, 0, 0.85, 0);
  bloodStains(r, 2);
  return { r, clips: makeClips('monk') };
}

// 6. Colegiala zombi: uniforme de marinera
function schoolgirl() {
  const r = humanoid('Schoolgirl', { skin: pal.rot, top: pal.white, bottom: pal.navy, sleeve: pal.white, legs: pal.rot, shins: pal.white, shoes: pal.dark, eye: pal.eyeRed });
  part(r.hips, C(0.21, 0.3, 0.34, 10), pal.navy, 0, -0.16, 0);         // falda plisada
  part(r.spine, B(0.44, 0.16, 0.26), pal.navy, 0, 0.58, -0.02);
  part(r.spine, B(0.12, 0.14, 0.03), pal.red, 0, 0.45, 0.13);
  part(r.head, B(0.3, 0.12, 0.3), pal.black, 0, 0.3, 0);               // pelo corto (bob)
  part(r.head, B(0.3, 0.24, 0.06), pal.black, 0, 0.16, -0.13);
  part(r.head, B(0.05, 0.26, 0.28), pal.black, 0.14, 0.15, 0);
  part(r.head, B(0.05, 0.26, 0.28), pal.black, -0.14, 0.15, 0);
  part(r.head, B(0.28, 0.06, 0.05), pal.black, 0, 0.26, 0.12);
  part(r.head, B(0.1, 0.04, 0.01), pal.blood, 0, 0.05, 0.131);
  bloodStains(r, 4);
  return { r, clips: makeClips('zombie') };
}

export const CHARACTERS = { onryo, ochimusha, kuchisake, teketeke: tekeTeke, monk, schoolgirl };

// ---------------------------------------------------------------------
//  Exportar a GLB
// ---------------------------------------------------------------------
export async function exportGLB(name) {
  const { r, clips } = CHARACTERS[name]();
  r.root.updateMatrixWorld(true);
  const exporter = new GLTFExporter();
  const buf = await exporter.parseAsync(r.root, { binary: true, animations: clips });
  return { buf, root: r.root, clips };
}
