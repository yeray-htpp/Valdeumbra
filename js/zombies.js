// =====================================================================
//  zombies.js  -  Enemigos: carga GLB, estados y persecución
//
//  Estados (máquina de estados simple):
//    'idle'  -> inactivo, el jugador está fuera de su rango
//    'chase' -> el jugador entró al rango: camina hacia él
//    'dead'  -> recibió 2 impactos: ya no persigue ni ataca
//
//  Cada zombi tiene una caja invisible (hitbox) que el rayo del
//  disparo comprueba. La caja se ve en el modo depuración (F3).
// =====================================================================
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { ZOMBIE_TYPES, ZOMBIE_HP } from './levelData.js';
import { collidesCircle } from './world.js';
import { sfx } from './sfx.js';

const BASE_HEIGHT = 1.8;
const _head = new THREE.Vector3();

// Modelo de respaldo si falta zombie.glb
function fallbackZombie() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0x6a8a5a });
  const cloth = new THREE.MeshLambertMaterial({ color: 0x3a3028 });
  const add = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  add(0.5, 0.7, 0.3, 0, 1.15, 0, cloth);
  add(0.35, 0.35, 0.35, 0, 1.7, 0.05, skin);
  add(0.15, 0.6, 0.15, -0.17, 0.4, 0, cloth);
  add(0.15, 0.6, 0.15, 0.17, 0.4, 0, cloth);
  const armL = add(0.12, 0.12, 0.6, -0.32, 1.35, 0.3, skin);
  const armR = add(0.12, 0.12, 0.6, 0.32, 1.35, 0.3, skin);
  g.userData.arms = [armL, armR];
  return g;
}

// Pelo negro largo del onryō (cubre la cara, al estilo de Sadako)
function makeHair(s) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x050505 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.3), mat);
  back.position.set(0, 1.38, -0.04);
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.75, 0.05), mat);
  front.position.set(0, 1.42, 0.2);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.44), mat);
  top.position.set(0, 1.86, 0.03);
  g.add(back, front, top);
  g.scale.setScalar(s);
  return g;
}

export class ZombieManager {
  // gltfs: { basic, arm, chubby, ribcage } (cada uno puede ser null)
  constructor(scene, gltfs, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.list = [];
    this.debug = false;
    this.onEvent = () => {};
    this.hitMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, wireframe: true });

    // Para cada modelo: altura original (para normalizarlo a 1.8 m) y animaciones
    this.models = {};
    for (const [key, gltf] of Object.entries(gltfs)) {
      if (!gltf) continue;
      // medida precisa (aplicando el esqueleto) del modelo en pose de reposo
      gltf.scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(gltf.scene, true);
      const clips = {};
      for (const c of gltf.animations || []) clips[c.name] = c;
      this.models[key] = {
        gltf, clips,
        height: Math.max(0.01, box.max.y - box.min.y),
        minY: box.min.y,
      };
    }
  }

  // Crea el modelo visual (lo usa también la intro)
  createModel(typeKey) {
    const type = ZOMBIE_TYPES[typeKey];
    const s = type.scale;
    const holder = new THREE.Group();
    let model, mixer = null, actions = {};
    const materials = [];
    const info = this.models[type.model] || Object.values(this.models)[0];

    if (info) {
      model = SkeletonUtils.clone(info.gltf.scene);
      const k = (BASE_HEIGHT * s) / info.height;
      model.scale.setScalar(k);
      model.position.y = -info.minY * k;
      mixer = new THREE.AnimationMixer(model);
      const pick = { idle: 'Idle', walk: type.move, death: 'Death', hit: 'HitReact', attack: 'Punch' };
      for (const [name, clipName] of Object.entries(pick)) {
        const clip = info.clips[clipName] || (name === 'walk' ? info.clips.Walk : null);
        if (clip) actions[name] = mixer.clipAction(clip);
      }
    } else {
      model = fallbackZombie();
      model.scale.setScalar(s);
    }

    // materiales propios para teñir por tipo y parpadear al recibir disparos
    const tint = new THREE.Color(type.tint);
    model.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = mats.map(m => {
        const c = m.clone();
        if (c.color) c.color.multiply(tint);
        if (!c.emissive) c.emissive = new THREE.Color(0, 0, 0);
        if (type.ghost) {                       // piel pálida y lavada
          c.color.multiplyScalar(0.55);
          c.emissive.setRGB(0.32, 0.33, 0.38);
        }
        c.userData.baseEmissive = c.emissive.clone();
        materials.push(c);
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    });

    holder.add(model);
    if (type.ghost) holder.add(makeHair(s));
    if (actions.idle) actions.idle.play();
    return { holder, model, mixer, actions, materials };
  }

  spawn(def) {
    const type = ZOMBIE_TYPES[def.type];
    const s = type.scale;
    const vis = this.createModel(def.type);
    const root = vis.holder;
    root.position.set(def.x, type.emerge ? -2.2 : 0, def.z);
    // si quedó dentro de un obstáculo, buscar un lugar libre cercano
    for (let i = 0; i < 24 && !type.emerge && collidesCircle(this.colliders, root.position.x, root.position.z, 0.4 * s); i++) {
      root.position.set(def.x + Math.cos(i) * (0.5 + i * 0.25), 0, def.z + Math.sin(i) * (0.5 + i * 0.25));
    }
    root.rotation.y = Math.random() * Math.PI * 2;

    // Hitbox: caja invisible para detectar los disparos
    // (el que se arrastra tiene una caja baja y alargada)
    const hb = type.crawl ? [0.8 * s, 0.7 * s, 1.5 * s] : [0.75 * s, BASE_HEIGHT * s, 0.75 * s];
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(...hb), this.hitMat);
    hitbox.position.y = hb[1] / 2;
    hitbox.visible = false;
    root.add(hitbox);

    // Anillo del rango de detección (modo depuración)
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(type.range - 0.1, type.range, 48),
      new THREE.MeshBasicMaterial({ color: 0x33ff66, side: THREE.DoubleSide, transparent: true, opacity: 0.6, fog: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.visible = false;
    root.add(ring);

    this.scene.add(root);
    const z = {
      typeKey: def.type, type, def, root, hitbox, ring, ...vis, emergeT: -1,
      hp: ZOMBIE_HP, state: 'idle', flash: 0, hitT: 0, stun: 0, deadT: 0,
      groanT: 2 + Math.random() * 4, wobble: Math.random() * 10,
    };
    hitbox.userData.zombie = z;
    this.list.push(z);
    return z;
  }

  // Solo los zombis vivos pueden recibir disparos
  hitboxes() {
    return this.list.filter(z => z.state !== 'dead').map(z => z.hitbox);
  }

  setDebug(on) {
    this.debug = on;
    for (const z of this.list) {
      z.hitbox.visible = on && z.state !== 'dead';
      z.ring.visible = on && z.state !== 'dead';
    }
  }

  playAnim(z, name) {
    if (!z.mixer || !z.actions[name]) return;
    const next = z.actions[name];
    for (const a of Object.values(z.actions)) if (a !== next) a.fadeOut(0.25);
    next.reset().fadeIn(0.25).play();
    if (name === 'death' || name === 'hit') { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; }
  }

  // Estado inactivo -> activo
  activate(z, byHowl = false) {
    if (z.state !== 'idle') return;
    if (z.type.emerge && z.emergeT < 0) {      // primero sale del pozo
      z.state = 'emerge';
      z.emergeT = 0;
      z.emergeFrom = z.root.position.clone();
      this.playAnim(z, 'walk');
      sfx.croak(0.35);
      this.onEvent('emerge', z);
      return;
    }
    z.state = 'chase';
    z.ring.material.color.setHex(0xff3333);
    this.playAnim(z, 'walk');
    if (z.actions.walk) z.actions.walk.timeScale = z.type.move === 'Walk' ? Math.min(2, z.type.speed / 1.4) : 1;
    if (!byHowl) sfx.groan(0.3);

    // El aullador despierta a los zombis cercanos
    if (z.type.howl && !byHowl) {
      sfx.howl();
      this.onEvent('howl');
      for (const o of this.list) {
        if (o !== z && o.state === 'idle' &&
            o.root.position.distanceTo(z.root.position) < z.type.howl) this.activate(o, true);
      }
    }
  }

  // Impacto válido: resta 1 punto de resistencia
  hit(z, knockback, dir) {
    if (z.state === 'dead') return;
    z.hp -= 1;
    z.flash = 0.25;
    sfx.hit();
    if (z.hp <= 0) { this.kill(z); return; }
    this.activate(z);                        // si estaba quieto, el disparo lo despierta
    if (z.actions.hit) { this.playAnim(z, 'hit'); z.hitT = 0.45; }
    if (knockback > 0) {                     // la escopeta lo empuja hacia atrás
      const p = z.root.position, r = 0.35 * z.type.scale;
      const nx = p.x + dir.x * knockback, nz = p.z + dir.z * knockback;
      if (!collidesCircle(this.colliders, nx, p.z, r)) p.x = nx;
      if (!collidesCircle(this.colliders, p.x, nz, r)) p.z = nz;
      z.stun = 0.6;
    }
  }

  kill(z) {
    z.state = 'dead';                        // deja de perseguir y de atacar
    z.hp = 0;
    z.hitbox.visible = false;
    z.ring.visible = false;
    if (z.actions.death) this.playAnim(z, 'death');
    else for (const a of Object.values(z.actions)) a.stop();
    this.onEvent('kill', z);
  }

  // Devuelve true si algún zombi atrapa al jugador
  // frustum: lo que ve la cámara (para el onryō, que solo avanza si no lo miras)
  update(dt, playerPos, active = true, frustum = null) {
    let caught = false;
    this.nearest = Infinity;
    for (const z of this.list) {
      if (z.mixer) z.mixer.update(dt);

      // parpadeo rojo al recibir un impacto
      if (z.flash > 0) z.flash -= dt;
      if (z.hitT > 0 && (z.hitT -= dt) <= 0 && z.state === 'chase') this.playAnim(z, 'walk');
      const e = Math.max(0, z.flash) * 4;
      for (const m of z.materials) m.emissive.copy(m.userData.baseEmissive).r += e;

      if (z.state === 'dead') {
        z.deadT += dt;
        if (!z.actions.death) {                // caída procedural si no hay animación
          z.model.rotation.x = Math.max(-Math.PI / 2, -z.deadT * 4);
          z.model.position.y = Math.min(z.model.position.y, 0.25 * z.type.scale) ;
        }
        if (z.deadT > 8) z.root.position.y = Math.max(-1.5, z.root.position.y - dt * 0.2);
        continue;
      }
      if (!active) continue;

      const p = z.root.position;
      const dx = playerPos.x - p.x, dz = playerPos.z - p.z;
      const dist = Math.hypot(dx, dz);

      // Saliendo del pozo: sube y avanza 1.6 m hacia el jugador
      if (z.state === 'emerge') {
        z.emergeT += dt / 2.2;
        const k = Math.min(1, z.emergeT);
        p.y = THREE.MathUtils.lerp(-2.2, 0, Math.sqrt(k));
        p.x = z.emergeFrom.x + (dx / dist) * 1.8 * k;
        p.z = z.emergeFrom.z + (dz / dist) * 1.8 * k;
        z.root.rotation.y = Math.atan2(dx, dz);
        if (k >= 1) { p.y = 0; z.state = 'idle'; this.activate(z, true); }
        continue;
      }

      // ¿el jugador entró al rango de detección?
      if (z.state === 'idle') {
        if (dist < z.type.range) this.activate(z);
        else {                                  // balanceo leve mientras espera
          z.wobble += dt;
          z.model.rotation.z = Math.sin(z.wobble) * 0.03;
          continue;
        }
      }

      this.nearest = Math.min(this.nearest, dist);

      // Onryō: si está dentro de la vista de la cámara, se congela
      let frozen = false;
      if (z.type.ghost && frustum) {
        _head.set(p.x, 1.4 * z.type.scale, p.z);
        frozen = frustum.containsPoint(_head) && dist < 35;
        if (z.mixer) z.mixer.timeScale = frozen ? 0 : 1;
        z.croakT = (z.croakT ?? 0) - dt;
        if (!frozen && z.croakT <= 0 && dist < 18) { z.croakT = 2.2; sfx.croak(0.3 * (1 - dist / 18)); }
      }

      // Persecución: girar hacia el jugador y avanzar
      if (!frozen) z.root.rotation.y = Math.atan2(dx, dz);
      if (frozen) { /* quieto mientras lo miras */ }
      else if (z.stun > 0) { z.stun -= dt; }
      else if (z.hitT > 0) { /* se tambalea por el impacto */ }
      else if (dist > 0.01) {
        const step = z.type.speed * dt;
        const r = 0.35 * z.type.scale;
        const nx = p.x + (dx / dist) * step, nz = p.z + (dz / dist) * step;
        if (!collidesCircle(this.colliders, nx, p.z, r)) p.x = nx;
        if (!collidesCircle(this.colliders, p.x, nz, r)) p.z = nz;
      }
      if (!z.mixer && z.model.userData.arms) {   // animación simple del respaldo
        z.wobble += dt * z.type.speed * 3;
        z.model.rotation.z = Math.sin(z.wobble) * 0.08;
      }

      z.groanT -= dt;
      if (z.groanT <= 0 && !z.type.ghost) { z.groanT = 3 + Math.random() * 4; if (dist < 15) sfx.groan(0.25 * (1 - dist / 15)); }

      // Contacto con el jugador => atrapado
      if (dist < 0.75 + 0.35 * z.type.scale) caught = true;
    }
    return caught;
  }

  kills() { return this.list.filter(z => z.state === 'dead').length; }
}
