// =====================================================================
//  scares.js  -  Escenas de terror con guion y horda final
//
//  Cada escena tiene un disparador (el jugador entra a una zona) y se
//  ejecuta UNA sola vez. Los zombis que aparecen en estas escenas son
//  zombis normales: también mueren con exactamente 2 impactos.
//
//   1. Farolillos que se apagan + algo detrás      (entrada de la aldea)
//   2. La puerta que golpea                         (calle izquierda)
//   3. "後ろ" (detrás de ti) escrito con sangre     (final de la aldea)
//   4. Jizō que giran cuando no los miras           (entrada del cementerio)
//   5. La campana del templo suena sola             (cementerio)
//   6. Rostro en el relámpago                       (puente)
//   7. Horda final: resistir hasta que el carruaje esté listo
//  (El pozo de Ringu y el onryō están en zombies.js)
// =====================================================================
import * as THREE from 'three';
import { EXTRACTION, HORDE_TIME } from './levelData.js';
import { collidesCircle } from './world.js';
import { sfx } from './sfx.js';

const _f = new THREE.Vector3();

export class Scares {
  constructor({ world, zombies, hud, scene, camera }) {
    Object.assign(this, { world, zombies, hud, scene, camera });
    this.done = new Set();
    this.spike = 0;            // pico de "miedo" para el glitch VHS
    this.timers = [];
    this.horde = null;

    // Figura del onryō que aparece un instante en el puente
    this.ghost = zombies.createModel('onryo');
    this.ghost.holder.position.set(0, 0, -181);
    this.ghost.holder.visible = false;
    scene.add(this.ghost.holder);
  }

  once(id, cond, fn) {
    if (!this.done.has(id) && cond) { this.done.add(id); fn(); }
  }

  later(seconds, fn) { this.timers.push({ t: seconds, fn }); }

  scare(amount) { this.spike = Math.max(this.spike, amount); }

  // Aparece un zombi a espaldas del jugador (ya persiguiéndolo)
  spawnBehind(type, playerPos, dist = 5) {
    this.camera.getWorldDirection(_f);
    _f.y = 0; _f.normalize();
    for (const d of [dist, dist - 1, dist + 1.5, dist - 2]) {
      const x = playerPos.x - _f.x * d, z = playerPos.z - _f.z * d;
      if (!collidesCircle(this.world.colliders, x, z, 0.5)) {
        const zb = this.zombies.spawn({ type, x, z });
        this.zombies.activate(zb);
        return zb;
      }
    }
    return null;
  }

  update(dt, p, frustum) {
    const w = this.world;
    this.spike = Math.max(0, this.spike - dt * 0.8);
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      if ((tm.t -= dt) <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }

    // 1. Farolillos que se apagan uno a uno... y algo gruñe detrás
    this.once('lanterns', p.z < -25 && p.z > -40 && Math.abs(p.x) < 7, () => {
      sfx.whoosh();
      w.lanternsOut(() => {
        sfx.groan(0.6);
        this.scare(0.7);
        this.spawnBehind('errante', p, 5);
      });
    });

    // 2. La puerta que golpea cada vez más fuerte
    const dDoor = Math.hypot(p.x + 15, p.z + 52);
    this.once('bang', dDoor < 16, () => {
      w.bangT = 999;
      const knock = () => {
        if (w.bangOpen) return;
        sfx.bang();
        this.later(0.55 + Math.random() * 0.3, knock);
      };
      knock();
    });
    this.once('bangOpen', dDoor < 6.5, () => {
      w.bangOpen = 1;
      sfx.crash();
      this.scare(0.9);
      const zb = this.zombies.spawn({ type: 'corredor', x: -14.6, z: -52.2 });
      this.zombies.activate(zb);
    });

    // 3. "後ろ" aparece escrito con sangre... y hay alguien detrás
    this.once('kanji', Math.hypot(p.x - 4, p.z + 76) < 5, () => {
      this.kanjiT = 0;
      sfx.sting();
      this.scare(0.6);
      this.later(1.8, () => { this.spawnBehind('errante', p, 4); sfx.groan(0.6); this.scare(0.8); });
    });
    if (this.kanjiT !== undefined && this.kanjiT < 1) {
      this.kanjiT += dt / 1.5;
      w.kanjiBehind.material.opacity = Math.min(1, this.kanjiT);
    }

    // 4. Jizō que se giran para mirarte
    if (frustum && w.updateJizos(frustum, p)) {
      this.once('jizo', true, () => { sfx.sting(); this.scare(0.8); this.hud.message('…te están mirando', 2500, 'danger'); });
    }

    // 5. La campana del templo suena sola y las antorchas casi se apagan
    this.once('bell', p.z < -114 && p.x < 0, () => {
      w.ringBell();
      sfx.bell();
      w.dim(2.5);
      this.scare(0.5);
    });

    // 6. Rostro en el relámpago (en medio del puente)
    this.once('bridge', p.z < -165 && p.z > -176, () => {
      w.flashLightning();
      this.ghost.holder.visible = true;
      this.ghost.holder.lookAt(p.x, 0, p.z);
      sfx.sting();
      sfx.croak(0.5);
      this.scare(1);
      this.later(0.45, () => { this.ghost.holder.visible = false; });
    });
  }

  // ------------------------------------------------------------------
  //  Horda final: al llegar al carruaje hay que resistir HORDE_TIME s
  // ------------------------------------------------------------------
  startHorde() {
    this.horde = { t: HORDE_TIME, elapsed: 0, idx: 0, drum: 0, finished: false };
    this.world.extractRing.material.color.setHex(0xff3322);
    this.hud.message('¡El carruaje aún no está listo! Resiste junto a él', 3500, 'danger');
    sfx.bell();
    this.scare(0.6);
  }

  // Devuelve true cuando termina la cuenta atrás
  updateHorde(dt) {
    const h = this.horde;
    if (!h || h.finished) return h?.finished ?? false;
    h.t -= dt;
    h.elapsed += dt;

    // tambores taiko, cada vez más rápidos
    h.drum -= dt;
    if (h.drum <= 0) { h.drum = 0.45 + 0.5 * (h.t / HORDE_TIME); sfx.taiko(); }

    // oleadas alrededor del carruaje
    const waves = [[0, 'errante'], [3, 'corredor'], [6, 'errante'], [10, 'errante'], [14, 'corredor'], [18, 'errante']];
    while (h.idx < waves.length && h.elapsed >= waves[h.idx][0]) {
      const a = Math.random() * Math.PI * 2;
      const x = THREE.MathUtils.clamp(EXTRACTION.x + Math.cos(a) * 13, -26, 26);
      const z = THREE.MathUtils.clamp(EXTRACTION.z + Math.sin(a) * 9, -214, -184);
      const zb = this.zombies.spawn({ type: waves[h.idx][1], x, z });
      this.zombies.activate(zb);
      h.idx++;
    }

    this.hud.setHorde(Math.max(0, Math.ceil(h.t)));
    if (h.t <= 0) {
      h.finished = true;
      this.hud.setHorde(null);
      this.world.extractRing.material.color.setHex(0x66ccff);
      sfx.bell();
      return true;
    }
    return false;
  }
}
