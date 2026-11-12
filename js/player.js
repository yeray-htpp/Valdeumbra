// =====================================================================
//  player.js  -  Cámara en primera persona y movimiento WASD
//  - El mouse orienta la cámara (PointerLockControls).
//  - W/S avanzan/retroceden, A/D se desplazan a los lados.
//  - Colisión: se mueve un eje a la vez y se revierte si choca.
// =====================================================================
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { collidesCircle } from './world.js';

const EYE_HEIGHT = 1.6;
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class Player {
  constructor(camera, domElement, colliders) {
    this.camera = camera;
    this.controls = new PointerLockControls(camera, domElement);
    this.colliders = colliders;
    this.keys = {};
    this.speed = 4.6;          // m/s
    this.radius = 0.35;
    this.boostTime = 0;        // poción de velocidad
    this.moving = false;
    this.bobT = 0;

    addEventListener('keydown', e => { this.keys[e.code] = true; });
    addEventListener('keyup',   e => { this.keys[e.code] = false; });
    addEventListener('blur',    () => { this.keys = {}; });

    // Luz tipo linterna que acompaña al jugador
    this.lantern = new THREE.PointLight(0xffd8a0, 5, 14, 1.3);
    this.lantern.position.set(0.3, -0.2, 0);
    camera.add(this.lantern);           // solo capa 0 (el mundo)

    // Luz suave solo para el arma (capa 1)
    const gunLight = new THREE.PointLight(0xffd8a0, 1.2, 3, 1);
    gunLight.position.set(0.2, 0.3, 0.2);
    gunLight.layers.set(1);
    camera.add(gunLight);
  }

  get position() { return this.camera.position; }

  spawn(x, z) {
    this.camera.position.set(x, EYE_HEIGHT, z);
    this.camera.rotation.set(0, 0, 0, 'YXZ');   // mirando hacia -Z (el norte)
  }

  boost(seconds) { this.boostTime = seconds; }

  update(dt) {
    const k = this.keys;
    let f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    let r = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const len = Math.hypot(f, r);
    this.moving = len > 0;

    if (this.boostTime > 0) this.boostTime -= dt;
    const speed = this.speed * (this.boostTime > 0 ? 1.5 : 1);

    if (this.moving) {
      f /= len; r /= len;
      // dirección hacia donde mira la cámara, proyectada en el suelo
      this.camera.getWorldDirection(_fwd);
      _fwd.y = 0; _fwd.normalize();
      _right.crossVectors(_fwd, _up).normalize();

      const dx = (_fwd.x * f + _right.x * r) * speed * dt;
      const dz = (_fwd.z * f + _right.z * r) * speed * dt;
      const p = this.camera.position;
      if (!collidesCircle(this.colliders, p.x + dx, p.z, this.radius)) p.x += dx;
      if (!collidesCircle(this.colliders, p.x, p.z + dz, this.radius)) p.z += dz;
      this.bobT += dt * speed * 2.2;
    }
    // balanceo de la cabeza al caminar
    this.camera.position.y = EYE_HEIGHT + Math.sin(this.bobT) * 0.04;
  }
}
