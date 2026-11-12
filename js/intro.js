// =====================================================================
//  intro.js  -  Cinemática inicial (se salta con ESPACIO)
//
//  Despiertas en un cuarto japonés (tatami, futón, shoji). La TV vieja
//  se enciende sola: estática... y la imagen de un pozo. Se apaga.
//  Un relámpago muestra una silueta de pelo largo tras el shoji, cada
//  vez más cerca. Un zombi atraviesa el papel y entra. Al girarte,
//  el onryō está de pie junto a la TV. El techo se derrumba y una
//  viga cae sobre ellos. "Despiertas entre los escombros…"
//
//  La cámara se anima interpolando posiciones/objetivos (lerp) entre
//  fotogramas clave, igual que en una animación por keyframes.
// =====================================================================
import * as THREE from 'three';
import { sfx } from './sfx.js';

// [tiempo, posición de la cámara, punto al que mira]
const KEYS = [
  [0.0,  [2.6, 0.55, 11.0], [2.6, 3.2, 10.0]],   // acostado en el futón mirando el techo
  [3.0,  [2.6, 0.55, 11.0], [2.6, 3.2, 10.0]],
  [4.4,  [2.6, 1.05, 10.9], [-0.5, 0.75, 10.6]], // se incorpora: la TV se enciende sola
  [7.4,  [2.6, 1.05, 10.9], [-0.5, 0.75, 10.6]],
  [8.1,  [2.6, 1.05, 10.9], [0.0, 1.3, 4.0]],    // mira el shoji
  [10.2, [2.6, 1.05, 10.9], [0.0, 1.3, 4.0]],
  [11.0, [2.6, 1.6, 10.7],  [1.0, 1.4, 7.4]],    // se levanta: el zombi entra
  [11.8, [2.6, 1.6, 10.7],  [1.3, 1.4, 8.0]],
  [12.3, [2.6, 1.6, 10.7],  [0.1, 1.3, 9.6]],   // se gira... el onryō junto a la TV
  [13.3, [2.6, 1.6, 10.7],  [0.1, 1.3, 9.6]],
  [13.7, [2.6, 1.6, 10.7],  [1.8, 2.9, 9.4]],    // mira la viga
  [14.2, [2.6, 1.3, 10.8],  [0.5, 0.6, 9.0]],
  [30.0, [2.6, 1.3, 10.8],  [0.5, 0.6, 9.0]],
];

const smooth = t => t * t * (3 - 2 * t);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _look = new THREE.Vector3();

export class Intro {
  constructor({ camera, scene, world, zombies, hud, onEnd, onScare }) {
    Object.assign(this, { camera, scene, world, zombies, hud, onEnd, onScare });
    this.running = false;
  }

  start() {
    this.running = true;
    this.t = 0;
    this.fired = new Set();
    this.shake = 0;
    this.beamT = -1;
    this.zombie = null;
    this.ghost = null;
    this.tvMode = 'off';
    this.hud.fade(1, 0);
    this.hud.caption('Valdeumbra. La noche de la luna roja.');
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

  addActor(type, x, z, rotY) {
    const a = this.zombies.createModel(type);
    a.holder.position.set(x, 0, z);
    a.holder.rotation.y = rotY;
    this.scene.add(a.holder);
    return a;
  }

  update(dt) {
    if (!this.running) return;
    this.t += dt;
    const w = this.world, hud = this.hud, tv = w.tv;

    this.at(1.8, () => hud.caption('Otra noche. Otra pesadilla…'));
    this.at(3.0, () => { hud.caption(null); hud.fade(0, 0.6); });
    this.at(3.6, () => hud.fade(1, 0.12));                       // parpadeo
    this.at(3.8, () => hud.fade(0, 0.5));

    // La TV se enciende sola
    this.at(4.6, () => { this.tvMode = 'static'; sfx.staticNoise(2.4); });
    this.at(7.0, () => { this.tvMode = 'well'; tv.draw('well'); sfx.sting(); this.onScare(0.6); });
    this.at(7.9, () => { this.tvMode = 'off'; tv.draw('off'); });

    // Silueta tras el shoji con los relámpagos
    this.at(8.4, () => { w.shojiStage = 1; w.flashLightning(); });
    this.at(9.1, () => sfx.knock());
    this.at(9.4, () => sfx.croak(0.4));
    this.at(9.8, () => { w.shojiStage = 2; w.flashLightning(); sfx.sting(); this.onScare(0.7); });

    // Un zombi atraviesa el papel
    this.at(10.4, () => {
      sfx.paper(); sfx.crash();
      w.breakShoji();
      this.zombie = this.addActor('errante', 0, 3.0, 0);
      if (this.zombie.actions.walk) { this.zombie.actions.idle?.stop(); this.zombie.actions.walk.play(); }
      sfx.groan(0.6);
    });

    // Al girarse: el onryō está junto a la TV
    this.at(12.2, () => {
      this.ghost = this.addActor('onryo', 0.1, 9.6, Math.PI / 2);
      tv.draw('face');
      sfx.croak(0.6); sfx.sting();
      this.onScare(1);
    });

    // El techo se derrumba
    this.at(13.2, () => { this.shake = 1; sfx.crash(); });
    this.at(13.7, () => { this.beamT = 0; });
    this.at(14.25, () => { hud.fade(1, 0.05); sfx.hit(); sfx.knock(); this.shake = 0; tv.draw('off'); });
    this.at(15.0, () => hud.caption('Despiertas entre los escombros…'));
    this.at(17.5, () => this.finish());

    if (this.tvMode === 'static') tv.draw('static');

    // el zombi camina hacia el futón
    if (this.zombie) {
      const z = this.zombie;
      if (z.mixer) z.mixer.update(dt);
      const target = new THREE.Vector3(1.6, 0, 8.6);
      const d = target.clone().sub(z.holder.position);
      if (d.length() > 0.05) {
        z.holder.position.addScaledVector(d.normalize(), Math.min(1.5 * dt, d.length()));
        z.holder.rotation.y = Math.atan2(d.x, d.z);
      }
    }
    if (this.ghost?.mixer) this.ghost.mixer.update(dt);

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
    for (const a of [this.zombie, this.ghost]) if (a) this.scene.remove(a.holder);
    this.zombie = this.ghost = null;
    this.world.tv.draw('off');
    this.world.ruinHouse();
    this.hud.caption(null);
    this.hud.fade(0, 1.2);
    this.onEnd();
  }
}
