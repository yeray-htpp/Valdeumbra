// =====================================================================
//  intro.js  -  Cinemática inicial (se salta con ESPACIO)
//
//  El protagonista despierta en su cama; un relámpago ilumina la
//  ventana, alguien golpea la puerta, un zombi la derriba y entra.
//  El techo se derrumba y una viga cae sobre ambos. Pantalla negra.
//  "Despiertas entre los escombros…" y empieza la partida afuera.
//
//  La cámara se anima interpolando posiciones/objetivos (lerp) entre
//  fotogramas clave, igual que en una animación por keyframes.
// =====================================================================
import * as THREE from 'three';
import { sfx } from './sfx.js';

// [tiempo, posición de la cámara, punto al que mira]
const KEYS = [
  [0.0,  [2.6, 0.85, 11.2], [2.6, 3.2, 10.2]],   // acostado mirando el techo
  [3.0,  [2.6, 0.85, 11.2], [2.6, 3.2, 10.2]],
  [4.6,  [2.6, 1.2, 10.8],  [0.0, 1.3, 8.0]],    // se sienta
  [5.3,  [2.6, 1.2, 10.8],  [-4.0, 1.7, 8.0]],   // mira la ventana
  [6.6,  [2.6, 1.2, 10.8],  [-4.0, 1.7, 8.0]],
  [7.4,  [2.6, 1.2, 10.8],  [0.0, 1.3, 4.0]],    // mira la puerta
  [8.8,  [2.6, 1.2, 10.8],  [0.0, 1.3, 4.0]],
  [9.6,  [2.6, 1.6, 10.6],  [0.9, 1.4, 7.2]],    // se levanta, ve al zombi
  [10.5, [2.6, 1.6, 10.6],  [1.4, 1.5, 8.2]],
  [10.9, [2.6, 1.6, 10.6],  [1.8, 2.9, 9.4]],    // mira la viga
  [11.4, [2.6, 1.3, 10.7],  [1.4, 0.6, 8.8]],
  [20.0, [2.6, 1.3, 10.7],  [1.4, 0.6, 8.8]],
];

const smooth = t => t * t * (3 - 2 * t);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _look = new THREE.Vector3();

export class Intro {
  constructor({ camera, scene, world, zombies, hud, onEnd }) {
    Object.assign(this, { camera, scene, world, zombies, hud, onEnd });
    this.running = false;
  }

  start() {
    this.running = true;
    this.t = 0;
    this.fired = new Set();
    this.shake = 0;
    this.doorT = -1;
    this.beamT = -1;
    this.zombie = null;
    this.hud.fade(1, 0);
    this.hud.caption('Valdeumbra, 1693');
    this.applyCamera();
  }

  // ejecuta una acción una sola vez cuando el tiempo llega a `time`
  at(time, fn) {
    if (this.t >= time && !this.fired.has(time)) { this.fired.add(time); fn(); }
  }

  applyCamera() {
    let i = 0;
    while (i < KEYS.length - 2 && this.t > KEYS[i + 1][0]) i++;
    const [t0, p0, l0] = KEYS[i];
    const [t1, p1, l1] = KEYS[i + 1];
    const k = smooth(THREE.MathUtils.clamp((this.t - t0) / (t1 - t0), 0, 1));
    this.camera.position.lerpVectors(_a.fromArray(p0), _b.fromArray(p1), k);
    _look.lerpVectors(_a.fromArray(l0), _b.fromArray(l1), k);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * 0.08 * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * 0.08 * this.shake;
    }
    this.camera.lookAt(_look);
  }

  update(dt) {
    if (!this.running) return;
    this.t += dt;
    const w = this.world, hud = this.hud;

    this.at(1.8, () => hud.caption('Otra noche. Otra pesadilla…'));
    this.at(3.0, () => { hud.caption(null); hud.fade(0, 0.6); });
    this.at(3.7, () => hud.fade(1, 0.12));                       // parpadeo
    this.at(3.9, () => hud.fade(0, 0.5));
    this.at(5.6, () => w.flashLightning());
    this.at(6.8, () => sfx.knock());
    this.at(7.3, () => sfx.knock());
    this.at(7.8, () => { sfx.knock(); sfx.groan(0.35); });
    this.at(8.4, () => {                                         // la puerta salta
      sfx.crash();
      this.doorT = 0;
      const z = this.zombies.createModel('errante');
      z.holder.position.set(0, 0, 3.0);
      z.holder.rotation.y = 0;                                   // mira hacia +Z (hacia la cama)
      if (z.actions.walk) { z.actions.idle?.stop(); z.actions.walk.play(); }
      this.scene.add(z.holder);
      this.zombie = z;
    });
    this.at(10.3, () => { this.shake = 1; sfx.crash(); });
    this.at(10.8, () => { this.beamT = 0; });
    this.at(11.35, () => { hud.fade(1, 0.05); sfx.hit(); sfx.knock(); this.shake = 0; });
    this.at(12.2, () => hud.caption('Despiertas entre los escombros…'));
    this.at(15.0, () => this.finish());

    // puerta derribada
    if (this.doorT >= 0 && this.doorT < 1) {
      this.doorT = Math.min(1, this.doorT + dt * 5);
      w.doorPivot.rotation.y = -1.6 * this.doorT;
    }
    // el zombi camina hacia la cama
    if (this.zombie) {
      const z = this.zombie;
      if (z.mixer) z.mixer.update(dt);
      const target = new THREE.Vector3(1.6, 0, 8.6);
      const d = target.clone().sub(z.holder.position);
      if (d.length() > 0.05) {
        z.holder.position.addScaledVector(d.normalize(), Math.min(1.3 * dt, d.length()));
        z.holder.rotation.y = Math.atan2(d.x, d.z);
      }
    }
    // la viga cae girando
    if (this.beamT >= 0 && this.beamT < 1) {
      this.beamT = Math.min(1, this.beamT + dt * 2);
      const k = this.beamT * this.beamT;
      w.beam.position.y = THREE.MathUtils.lerp(2.9, 0.9, k);
      w.beam.rotation.z = 0.35 * k;
      w.beam.rotation.y = 0.3 * k;
    }
    if (this.shake > 0) this.shake = Math.max(0.3, this.shake - dt * 0.2);
    if (this.running) this.applyCamera();
  }

  skip() { if (this.running) this.finish(); }

  finish() {
    this.running = false;
    if (this.zombie) { this.scene.remove(this.zombie.holder); this.zombie = null; }
    this.world.ruinHouse();
    this.hud.caption(null);
    this.hud.fade(0, 1.2);
    this.onEnd();
  }
}
