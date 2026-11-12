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
//   7. TV en una ventana: estática y un rostro       (aldea)
//   8. Kasa-obake: un paraguas de un ojo cruza saltando (aldea)
//   9. Manos que salen del suelo y te sujetan        (cementerio)
//  10. Pasos detrás de ti... sin nadie               (antes del río)
//
//  Cinemáticas de cámara (la cámara se gira sola y hace zoom):
//  11. Kuchisake-onna: "¿Soy bonita?"... y se quita la mascarilla
//  12. Apagón: todo se pone negro y al volver la luz hay algo delante
//  13. Teke-teke: "teke, teke, teke"... la cámara se gira hacia atrás
//  14. El ochimusha guarda el puente
//  (El pozo de Ringu y el onryō están en zombies.js)
// =====================================================================
import * as THREE from 'three';
import { collidesCircle } from './world.js';
import { sfx } from './sfx.js';

const _f = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _qt = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const smooth = t => t * t * (3 - 2 * t);

export class Scares {
  constructor({ world, zombies, hud, scene, camera, player }) {
    Object.assign(this, { world, zombies, hud, scene, camera, player });
    this.done = new Set();
    this.spike = 0;            // pico de "miedo" para el glitch VHS
    this.timers = [];

    // Figura del onryō que aparece un instante en el puente
    this.ghost = zombies.createModel('onryo');
    this.ghost.holder.position.set(0, 0, -181);
    this.ghost.holder.visible = false;
    scene.add(this.ghost.holder);
  }

  // ------------------------------------------------------------------
  //  Cinemática: la cámara mira a `target` con zoom (fov) durante `dur`
  //  segundos y luego vuelve exactamente a donde miraba el jugador.
  //  Mientras dura, el juego queda en pausa (nadie se mueve).
  // ------------------------------------------------------------------
  startCut({ target, dur = 3, fov = 40, events = [], onEnd }) {
    this.cut = {
      t: 0, target, dur, fov, onEnd,
      events: events.map(([t, fn]) => ({ t, fn, done: false })),
      q0: this.camera.quaternion.clone(), fov0: this.camera.fov,
    };
    document.body.classList.add('cinema');
  }

  updateCut(dt) {
    const c = this.cut;
    c.t += dt;
    for (const e of c.events) if (!e.done && c.t >= e.t) { e.done = true; e.fn(); }
    const tgt = typeof c.target === 'function' ? c.target() : c.target;
    _m.lookAt(this.camera.position, tgt, _up);
    _qt.setFromRotationMatrix(_m);
    const k = smooth(Math.min(1, c.t / 0.7)) * smooth(Math.min(1, Math.max(0, c.dur - c.t) / 0.7));
    this.camera.quaternion.slerpQuaternions(c.q0, _qt, k);
    this.camera.fov = THREE.MathUtils.lerp(c.fov0, c.fov, k);
    this.camera.updateProjectionMatrix();
    if (c.t >= c.dur) {
      this.camera.quaternion.copy(c.q0);
      this.camera.fov = c.fov0;
      this.camera.updateProjectionMatrix();
      this.cut = null;
      document.body.classList.remove('cinema');
      this.hud.caption(null);
      if (c.onEnd) c.onEnd();
    }
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

    // 7. TV en la ventana: estática, luego un rostro, luego nada
    const tv = w.villageTV;
    this.once('tv', Math.hypot(p.x - 14, p.z + 68) < 9, () => {
      tv.mode = 'static';
      sfx.staticNoise(2.2);
      this.later(2.2, () => { tv.draw('face'); sfx.sting(); this.scare(0.9); });
      this.later(2.9, () => { tv.draw('off'); });
    });
    if (tv.mode === 'static') tv.draw('static');

    // 8. Kasa-obake: cruza la calle saltando y se ríe
    this.once('kasa', p.z < -41 && p.z > -50, () => {
      this.kasaT = 0;
      w.kasa.visible = true;
      sfx.giggle();
    });
    if (this.kasaT !== undefined && this.kasaT >= 0) {
      this.kasaT += dt;
      const k = this.kasaT / 3.5;
      const hop = Math.abs(Math.sin(this.kasaT * Math.PI * 2.2));
      w.kasa.position.set(-13 + 27 * k, hop * 0.8, -48);
      w.kasa.rotation.y = Math.PI / 2 + Math.sin(this.kasaT * 6) * 0.3;
      if (hop < 0.05 && (this.lastHop ?? 0) + 0.2 < this.kasaT) { this.lastHop = this.kasaT; sfx.boing(); }
      if (k >= 1) { w.kasa.visible = false; this.kasaT = -1; }
    }

    // 9. Manos que salen del suelo alrededor del jugador
    this.once('hands', p.z < -128 && p.z > -137, () => {
      this.handsT = 0;
      w.hands.forEach((h, i) => {
        const a = (i / w.hands.length) * Math.PI * 2;
        h.position.set(p.x + Math.cos(a) * 1.1, -0.9, p.z + Math.sin(a) * 1.1);
        h.rotation.y = -a;
        h.visible = true;
      });
      this.player.slowT = 2.2;
      sfx.groan(0.6); sfx.hit();
      this.scare(0.9);
      this.hud.message('¡Algo te sujeta los pies!', 2000, 'danger');
    });
    if (this.handsT !== undefined && this.handsT >= 0) {
      this.handsT += dt;
      const up = this.handsT < 0.4 ? this.handsT / 0.4 : this.handsT > 2.4 ? Math.max(0, 1 - (this.handsT - 2.4)) : 1;
      w.hands.forEach((h, i) => { h.position.y = -0.9 + up * 0.75; h.rotation.z = Math.sin(this.handsT * 8 + i) * 0.25; });
      if (this.handsT > 3.5) { w.hands.forEach(h => { h.visible = false; }); this.handsT = -1; }
    }

    // 10. Pasos detrás de ti
    this.once('steps', p.z < -151 && p.z > -158, () => {
      for (let i = 0; i < 7; i++) sfx.step(i * 0.42);
      this.later(3.0, () => { sfx.croak(0.35); this.scare(0.5); });
    });

    // 11. Kuchisake-onna bajo los farolillos
    this.once('kuchisake', p.z < -60 && p.z > -68 && Math.abs(p.x) < 10, () => {
      const k = this.zombies.spawn({ type: 'kuchisake', x: 12, z: -71 });
      k.root.rotation.y = Math.atan2(p.x - 12, p.z + 71);
      const mask = k.model.getObjectByName('Mask');
      sfx.whoosh();
      this.startCut({
        target: new THREE.Vector3(12, 1.75, -71), dur: 5.2, fov: 22,
        events: [
          [0.8, () => this.hud.caption('「わたし、きれい？」 — ¿Soy bonita?')],
          [2.8, () => { if (mask) mask.visible = false; sfx.sting(); this.scare(1); this.hud.caption('「これでも？」 — ¿Y ahora?'); }],
          [4.2, () => { this.hud.caption(null); sfx.giggle(); }],
        ],
        onEnd: () => this.zombies.activate(k),
      });
    });

    // 12. Apagón en el callejón: negro, respiración... algo delante
    this.once('blackout', Math.hypot(p.x + 27, p.z + 48) < 3.5, () => {
      this.hud.fade(1, 0.05);
      sfx.breath();
      this.later(1.6, () => {
        this.camera.getWorldDirection(_f); _f.y = 0; _f.normalize();
        this.ghost.holder.position.set(p.x + _f.x * 1.3, 0, p.z + _f.z * 1.3);
        this.ghost.holder.lookAt(p.x, 0, p.z);
        this.ghost.holder.visible = true;
        this.hud.fade(0, 0.05);
        sfx.sting(); sfx.croak(0.6);
        this.scare(1);
      });
      this.later(2.3, () => { this.hud.fade(1, 0.05); });
      this.later(2.6, () => { this.ghost.holder.visible = false; this.hud.fade(0, 0.4); });
    });

    // 13. Teke-teke: se oye detrás y la cámara se gira sola
    this.once('teke', p.z < -138 && p.z > -147, () => {
      sfx.teke(2.4);
      const t = this.spawnBehind('teketeke', p, 13);
      if (!t) return;
      t.state = 'idle';
      this.startCut({
        target: () => t.root.position.clone().setY(0.4), dur: 2.8, fov: 35,
        events: [[0.9, () => { sfx.sting(); this.scare(0.9); this.hud.caption('teke… teke… teke…'); }]],
        onEnd: () => { this.zombies.activate(t); sfx.teke(1.5); },
      });
    });

    // Aviso del sello del puente
    if (w.sealed && Math.hypot(p.x, p.z + 160) < 4.5) {
      this.sealMsgT = (this.sealMsgT ?? 0) - dt;
      if (this.sealMsgT <= 0) {
        this.sealMsgT = 3;
        this.hud.message('Un sello (封) bloquea el puente: reúne 3 ofuda', 2800, 'danger');
      }
    }

    // 14. El ochimusha guarda el puente
    const guard = this.zombies.list.find(z => z.typeKey === 'guardian');
    this.once('samurai', !w.sealed && p.z < -163 && p.z > -170 && guard && guard.state === 'idle', () => {
      w.flashLightning();
      this.startCut({
        target: guard.root.position.clone().setY(2.4), dur: 3.6, fov: 28,
        events: [
          [0.6, () => { this.hud.caption('Un ochimusha, un samurái caído, guarda el paso…'); sfx.taiko(); sfx.taiko(0.5); }],
          [2.0, () => { sfx.groan(0.8); this.scare(0.6); }],
        ],
        onEnd: () => this.zombies.activate(guard),
      });
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
}
