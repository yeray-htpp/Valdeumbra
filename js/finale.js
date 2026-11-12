// =====================================================================
//  finale.js  -  Escena final: "El último pasajero" (se salta con ESPACIO)
//
//  1. «¡MISIÓN COMPLETADA! Has llegado a la zona de extracción».
//  2. Negro... estás dentro del carruaje, que avanza (traqueteo y
//     cascos). Por la ventana se ve la aldea. «Por fin… a salvo.»
//  3. La linterna parpadea y se apaga. Se oye el croar.
//  4. Un relámpago: el onryō está de pie frente a ti.
//  5. SCREAMER: se lanza contra la cámara con un grito.
//  6. Negro. «El carruaje llegó al amanecer… con un pasajero más.»
// =====================================================================
import * as THREE from 'three';
import { sfx } from './sfx.js';
import { EXTRACTION } from './levelData.js';

const smooth = t => t * t * (3 - 2 * t);
const _look = new THREE.Vector3();

export class Finale {
  constructor({ camera, scene, world, zombies, hud, postfx, player, weapons, onEnd }) {
    Object.assign(this, { camera, scene, world, zombies, hud, postfx, player, weapons, onEnd });
    this.running = false;
    this.cz = EXTRACTION.z - 6;                        // centro del carruaje
    this.screamer = document.getElementById('screamer');
    drawScreamerFace(this.screamer.querySelector('canvas'));
  }

  start() {
    this.running = true;
    this.t = 0;
    this.fired = new Set();
    this.ghost = null;
    this.hooves = 0;
    document.body.classList.add('cinema');
    this.hud.show(false);
    this.hud.clearLabels();
    this.hud.caption('¡MISIÓN COMPLETADA! Has llegado a la zona de extracción');
    sfx.win();
    this.camPos0 = this.camera.position.clone();
  }

  at(time, fn) {
    if (this.t >= time && !this.fired.has(time)) { this.fired.add(time); fn(); }
  }

  update(dt) {
    if (!this.running) return;
    this.t += dt;
    const cz = this.cz, hud = this.hud, w = this.world, cam = this.camera;
    const fear = this.postfx.material.uniforms.uFear;

    // 1. mirando el carruaje
    if (this.t < 3) {
      _look.set(EXTRACTION.x, 1.8, cz);
      cam.lookAt(_look);
    }
    this.at(2.6, () => hud.fade(1, 0.4));

    // 2. dentro del carruaje
    this.at(3.2, () => {
      this.weapons.holder.visible = false;
      this.player.lantern.intensity = 0;
      w.carriageLight.intensity = 7;
      w.rain.visible = false;
      hud.caption(null);
      hud.fade(0, 1.2);
    });
    this.at(4.4, () => hud.caption('Por fin… a salvo.'));
    this.at(6.4, () => { hud.caption(null); w.flashLightning(); });
    this.at(7.6, () => hud.caption('…¿por qué tengo tanto frío?'));
    this.at(9.0, () => hud.caption(null));

    if (this.t >= 3.2 && this.t < 14) {
      // traqueteo del carruaje
      const bump = Math.sin(this.t * 9) * 0.015 + Math.sin(this.t * 23) * 0.006;
      cam.position.set(0.35, 1.55 + bump, cz + 1.2);
      this.hooves -= dt;
      if (this.hooves <= 0 && this.t < 10.5) { this.hooves = 0.32; sfx.step(); sfx.step(0.12); }
      // mira por la ventana y luego se gira despacio hacia delante
      const k = smooth(THREE.MathUtils.clamp((this.t - 8.2) / 2.2, 0, 1));
      const win = new THREE.Vector3(-3, 1.8, cz + 0.4);
      const front = new THREE.Vector3(0, 1.75, cz - 1.6);
      _look.lerpVectors(win, front, k);
      if (this.ghost && this.t >= 12.4) _look.set(this.ghost.holder.position.x, 2.15, this.ghost.holder.position.z);
      cam.lookAt(_look);
    }

    // 3. la linterna parpadea y se apaga
    if (this.t > 9.4 && this.t < 10.8) w.carriageLight.intensity = Math.random() < 0.5 ? 0.3 : 6;
    this.at(10.8, () => { w.carriageLight.intensity = 0; sfx.croak(0.7); });

    // 4. relámpago: está sentada frente a ti
    this.at(11.6, () => {
      this.ghost = this.zombies.createModel('onryo');
      this.ghost.holder.position.set(0, 0.6, cz - 1.3);
      this.ghost.holder.rotation.y = 0;                  // mirando hacia ti (+Z)
      this.scene.add(this.ghost.holder);
      w.flashLightning();
      sfx.sting();
      fear.value = 0.7;
    });

    // 5. SCREAMER
    this.at(12.4, () => {
      sfx.scream();
      fear.value = 1;
      this.postfx.material.uniforms.uDamage.value = 0.6;
      this.screamer.classList.add('show');
      cam.fov = 32; cam.updateProjectionMatrix();
    });
    if (this.ghost && this.t >= 12.4 && this.t < 12.75) {
      const k = (this.t - 12.4) / 0.35;                   // se lanza contra la cámara
      this.ghost.holder.position.z = THREE.MathUtils.lerp(cz - 1.3, cz + 0.75, smooth(k));
      this.ghost.holder.position.x = 0.25 * k;
    }
    if (this.t >= 12.4 && this.t < 13.1) {
      cam.position.x += (Math.random() - 0.5) * 0.06;
      cam.position.y += (Math.random() - 0.5) * 0.06;
    }
    if (this.ghost?.mixer) this.ghost.mixer.update(dt);

    // 6. negro y epílogo
    this.at(13.1, () => {
      this.screamer.classList.remove('show');
      hud.fade(1, 0.02);
      fear.value = 0;
      this.postfx.material.uniforms.uDamage.value = 0;
    });
    this.at(14.6, () => hud.caption('El carruaje llegó al amanecer… con un pasajero más.'));
    this.at(19.0, () => this.finish());
  }

  skip() { if (this.running) this.finish(); }

  finish() {
    this.running = false;
    this.screamer.classList.remove('show');
    document.body.classList.remove('cinema');
    this.camera.fov = 70; this.camera.updateProjectionMatrix();
    this.hud.caption(null);
    this.hud.fade(0, 0.6);
    this.onEnd();
  }
}

// Rostro del screamer, dibujado en un canvas pequeño (se ve pixelado)
function drawScreamerFace(c) {
  const g = c.getContext('2d');
  const W = c.width, H = c.height;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.save();
  g.translate(W / 2, H / 2); g.rotate(-0.12); g.translate(-W / 2, -H / 2);   // cabeza ladeada
  // cara pálida, alargada
  g.fillStyle = '#cfcabd';
  g.beginPath(); g.ellipse(W / 2, H * 0.55, W * 0.2, H * 0.46, 0, 0, Math.PI * 2); g.fill();
  // venas grises
  g.strokeStyle = '#8a8f88'; g.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    g.beginPath(); let x = W * (0.36 + Math.random() * 0.28), y = H * (0.5 + Math.random() * 0.3);
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 8; y += 4 + Math.random() * 4; g.lineTo(x, y); }
    g.stroke();
  }
  // ojos desiguales: cuencas negras con iris rojos diminutos
  g.fillStyle = '#000';
  g.beginPath(); g.ellipse(W * 0.42, H * 0.42, W * 0.055, H * 0.085, 0.3, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(W * 0.585, H * 0.45, W * 0.07, H * 0.11, -0.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ff2a10';
  g.fillRect(W * 0.418, H * 0.42, 2, 2); g.fillRect(W * 0.588, H * 0.455, 2, 2);
  // sangre de los ojos
  g.fillStyle = '#7a0606';
  g.fillRect(W * 0.41, H * 0.49, 2, H * 0.2); g.fillRect(W * 0.6, H * 0.54, 3, H * 0.26);
  // boca desencajada, estirada hasta la barbilla
  g.fillStyle = '#0c0000';
  g.beginPath(); g.ellipse(W / 2, H * 0.8, W * 0.06, H * 0.2, 0.05, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d8d0b8';                               // dientes
  for (let i = 0; i < 5; i++) g.fillRect(W * 0.465 + i * 4, H * 0.62, 2, 4);
  // mechones de pelo negro que caen sobre la cara
  g.fillStyle = '#050505';
  g.fillRect(0, 0, W, H * 0.1);
  for (let i = 0; i < 26; i++) {
    const x = W * (0.26 + Math.random() * 0.48);
    const len = H * (0.12 + Math.random() * (Math.abs(x - W / 2) > W * 0.1 ? 0.9 : 0.3));
    const w = 1 + Math.random() * 3, slant = (Math.random() - 0.5) * 8;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w, 0); g.lineTo(x + w + slant, len); g.lineTo(x + slant, len); g.fill();
  }
  g.fillRect(0, 0, W * 0.3, H); g.fillRect(W * 0.7, 0, W * 0.3, H);
  g.restore();
  // ruido de VHS
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.18})`;
    g.fillRect(Math.random() * W, Math.random() * H, 1, 1);
  }
  for (let y = 0; y < H; y += 2) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, W, 1); }
}
