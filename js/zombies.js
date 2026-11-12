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

function findClip(clips, regex) {
  return clips.find(c => regex.test(c.name)) || null;
}

export class ZombieManager {
  constructor(scene, gltf, colliders) {
    this.scene = scene;
    this.gltf = gltf;
    this.colliders = colliders;
    this.list = [];
    this.debug = false;
    this.onEvent = () => {};
    this.hitMat = new THREE.MeshBasicMaterial({ color: 0x00ff66, wireframe: true });

    // altura original del modelo para normalizarlo a 1.8 m
    if (gltf) {
      const box = new THREE.Box3().setFromObject(gltf.scene);
      this.modelHeight = Math.max(0.01, box.max.y - box.min.y);
      this.modelMinY = box.min.y;
      const clips = gltf.animations || [];
      this.clips = {
        idle:  findClip(clips, /idle/i),
        walk:  findClip(clips, /walk|run|crawl/i),
        death: findClip(clips, /death|die|dead/i),
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

    if (this.gltf) {
      model = SkeletonUtils.clone(this.gltf.scene);
      const k = (BASE_HEIGHT * s) / this.modelHeight;
      model.scale.setScalar(k);
      model.position.y = -this.modelMinY * k;
      mixer = new THREE.AnimationMixer(model);
      for (const [name, clip] of Object.entries(this.clips)) {
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
        materials.push(c);
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    });

    holder.add(model);
    if (actions.idle) actions.idle.play();
    return { holder, model, mixer, actions, materials };
  }

  spawn(def) {
    const type = ZOMBIE_TYPES[def.type];
    const s = type.scale;
    const vis = this.createModel(def.type);
    const root = vis.holder;
    root.position.set(def.x, 0, def.z);
    // si quedó dentro de un obstáculo, buscar un lugar libre cercano
    for (let i = 0; i < 24 && collidesCircle(this.colliders, root.position.x, root.position.z, 0.4 * s); i++) {
      root.position.set(def.x + Math.cos(i) * (0.5 + i * 0.25), 0, def.z + Math.sin(i) * (0.5 + i * 0.25));
    }
    root.rotation.y = Math.random() * Math.PI * 2;

    // Hitbox: caja invisible para detectar los disparos
    const hitbox = new THREE.Mesh(new THREE.BoxGeometry(0.75 * s, BASE_HEIGHT * s, 0.75 * s), this.hitMat);
    hitbox.position.y = (BASE_HEIGHT * s) / 2;
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
      typeKey: def.type, type, root, hitbox, ring, ...vis,
      hp: ZOMBIE_HP, state: 'idle', flash: 0, stun: 0, deadT: 0,
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
    if (name === 'death') { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; }
  }

  // Estado inactivo -> activo
  activate(z, byHowl = false) {
    if (z.state !== 'idle') return;
    z.state = 'chase';
    z.ring.material.color.setHex(0xff3333);
    this.playAnim(z, 'walk');
    if (z.actions.walk) z.actions.walk.timeScale = Math.min(2.2, z.type.speed / 1.6);
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
  update(dt, playerPos, active = true) {
    let caught = false;
    for (const z of this.list) {
      if (z.mixer) z.mixer.update(dt);

      // parpadeo rojo al recibir un impacto
      if (z.flash > 0) z.flash -= dt;
      const e = Math.max(0, z.flash) * 4;
      for (const m of z.materials) m.emissive.setRGB(e, 0, 0);

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

      // ¿el jugador entró al rango de detección?
      if (z.state === 'idle') {
        if (dist < z.type.range) this.activate(z);
        else {                                  // balanceo leve mientras espera
          z.wobble += dt;
          z.model.rotation.z = Math.sin(z.wobble) * 0.03;
          continue;
        }
      }

      // Persecución: girar hacia el jugador y avanzar
      z.root.rotation.y = Math.atan2(dx, dz);
      if (z.stun > 0) { z.stun -= dt; }
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
      if (z.groanT <= 0) { z.groanT = 3 + Math.random() * 4; if (dist < 15) sfx.groan(0.25 * (1 - dist / 15)); }

      // Contacto con el jugador => atrapado
      if (dist < 0.75 + 0.35 * z.type.scale) caught = true;
    }
    return caught;
  }

  kills() { return this.list.filter(z => z.state === 'dead').length; }
}
