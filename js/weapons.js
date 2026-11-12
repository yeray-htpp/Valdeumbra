// =====================================================================
//  weapons.js  -  Sistema de armas, disparos y municiones
//
//  RF01: dos armas GLB, tecla 1 / tecla 2, un disparo por clic.
//  RF02: munición independiente por arma; sin munición no dispara;
//        NO existe tecla de recarga (solo cajas en el escenario).
//  RF07: el disparo es un rayo (Raycaster) desde el centro de la
//        cámara. 1 disparo = 1 impacto como máximo.
// =====================================================================
import * as THREE from 'three';
import { START_AMMO } from './levelData.js';
import { sfx } from './sfx.js';

// Ajustes de cada arma. `rotY` corrige hacia dónde apunta el modelo GLB.
export const WEAPON_DEFS = {
  pistol: {
    name: 'PISTOLA', file: 'models/pistol.glb', length: 0.32,
    pos: new THREE.Vector3(0.2, -0.2, -0.42), rotY: 0,
    range: 60, knockback: 0, recoil: 0.06, sound: 'pistol',
  },
  shotgun: {
    name: 'ESCOPETA', file: 'models/shotgun.glb', length: 0.85,
    pos: new THREE.Vector3(0.24, -0.24, -0.55), rotY: 0,
    range: 30, knockback: 2.2, recoil: 0.14, sound: 'shotgun',
  },
};

// Escala y orienta el modelo: su lado más largo pasa a apuntar hacia -Z
export function normalizeWeapon(model, def) {
  const wrap = new THREE.Group();
  wrap.add(model);
  let box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  if (size.x > size.z) model.rotation.y = Math.PI / 2;  // cañón en X -> girar a -Z
  model.rotation.y += def.rotY;
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const s = def.length / Math.max(...box.getSize(new THREE.Vector3()).toArray());
  model.scale.multiplyScalar(s);
  model.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  return wrap;
}

// Modelo de respaldo si falta el archivo GLB (para no romper el juego)
function fallbackWeapon(kind) {
  const g = new THREE.Group();
  const metal = new THREE.MeshLambertMaterial({ color: 0x333338 });
  const wood = new THREE.MeshLambertMaterial({ color: 0x5a3a20 });
  if (kind === 'pistol') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.3), metal); g.add(body);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), wood);
    grip.position.set(0, -0.09, 0.09); grip.rotation.x = 0.3; g.add(grip);
  } else {
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.8), metal); g.add(barrel);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.3), wood);
    stock.position.set(0, -0.05, 0.45); g.add(stock);
  }
  return g;
}

export class Weapons {
  constructor(camera, models, hud) {
    this.camera = camera;
    this.hud = hud;
    this.ammo = { ...START_AMMO };       // contador independiente por arma
    this.current = 'pistol';
    this.raycaster = new THREE.Raycaster();
    this.recoil = 0;
    this.switchT = 0;
    this.swayT = 0;

    this.holder = new THREE.Group();     // el holder es hijo de la cámara:
    camera.add(this.holder);             // así el arma sigue su posición y rotación

    this.items = {};
    for (const kind of Object.keys(WEAPON_DEFS)) {
      const def = WEAPON_DEFS[kind];
      const src = models[kind] ? models[kind].scene : fallbackWeapon(kind);
      const obj = normalizeWeapon(src, def);
      obj.position.copy(def.pos);
      obj.traverse(o => {
        o.layers.set(1);                 // capa 1: se dibuja encima del mundo
        if (o.isMesh) o.frustumCulled = false;
      });
      obj.visible = kind === this.current;
      this.holder.add(obj);
      this.items[kind] = obj;
    }

    // Fogonazo del disparo (luz + destello)
    this.flashLight = new THREE.PointLight(0xffc070, 0, 8, 1.5);
    this.flashLight.layers.enableAll();
    this.flashLight.position.set(0.2, -0.1, -1);
    camera.add(this.flashLight);
    this.flashMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, depthWrite: false })
    );
    this.flashMesh.layers.set(1);
    this.flashMesh.visible = false;
    camera.add(this.flashMesh);
    this.flashT = 0;

    // Marcas de impacto
    this.sparks = [];
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffaa55 });
    this.bloodMat = new THREE.MeshBasicMaterial({ color: 0x8a0a0a });
  }

  get def() { return WEAPON_DEFS[this.current]; }

  select(kind) {
    if (kind === this.current) return;
    this.items[this.current].visible = false;
    this.current = kind;
    this.items[kind].visible = true;
    this.switchT = 1;                    // animación de bajar/subir arma
    sfx.swap();
    this.hud.setAmmo(this);
  }

  // Recupera munición SOLO desde cajas recogidas en el escenario
  addAmmo(kind, amount) {
    this.ammo[kind] += amount;
    this.hud.setAmmo(this);
  }

  // Un disparo. Devuelve el zombi impactado (o null).
  shoot(zombies, solidMeshes, scene) {
    if (this.ammo[this.current] <= 0) {  // bloqueo al agotar municiones
      sfx.empty();
      this.hud.message('SIN MUNICIÓN — busca una caja de ' + this.def.name.toLowerCase(), 1800, 'danger');
      return null;
    }
    this.ammo[this.current] -= 1;        // cada disparo consume una bala
    this.hud.setAmmo(this);
    sfx[this.def.sound]();
    this.recoil = 1;
    this.flashT = 0.06;

    // Rayo desde el centro de la pantalla
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = this.def.range;
    const targets = zombies.hitboxes().concat(solidMeshes);
    const hits = this.raycaster.intersectObjects(targets, false);
    if (hits.length === 0) return null;

    const first = hits[0];               // el objeto más cercano bloquea el resto
    const zombie = first.object.userData.zombie;
    this.spawnSpark(first.point, scene, zombie ? this.bloodMat : this.sparkMat);
    if (zombie) {
      const dir = this.raycaster.ray.direction.clone();
      zombies.hit(zombie, this.def.knockback, dir);
      return zombie;
    }
    return null;
  }

  spawnSpark(point, scene, mat) {
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), mat);
      m.position.copy(point);
      m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3);
      m.userData.life = 0.4;
      scene.add(m);
      this.sparks.push(m);
    }
  }

  update(dt, moving, scene) {
    // balanceo al caminar + retroceso + animación de cambio
    this.swayT += dt * (moving ? 9 : 2);
    const amp = moving ? 0.012 : 0.004;
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.switchT = Math.max(0, this.switchT - dt * 4);

    const obj = this.items[this.current];
    const def = this.def;
    obj.position.set(
      def.pos.x + Math.sin(this.swayT) * amp,
      def.pos.y + Math.abs(Math.cos(this.swayT)) * amp - this.switchT * 0.3,
      def.pos.z + this.recoil * def.recoil
    );
    obj.rotation.x = this.recoil * 0.25;

    // fogonazo
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flashLight.intensity = 6;
      this.flashMesh.visible = true;
      this.flashMesh.position.set(def.pos.x, def.pos.y + 0.03, def.pos.z - def.length * 0.6);
      this.flashMesh.rotation.z = Math.random() * 3;
    } else {
      this.flashLight.intensity = 0;
      this.flashMesh.visible = false;
    }

    // partículas de impacto
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.userData.life -= dt;
      s.userData.v.y -= 9 * dt;
      s.position.addScaledVector(s.userData.v, dt);
      if (s.userData.life <= 0) {
        scene.remove(s);
        s.geometry.dispose();
        this.sparks.splice(i, 1);
      }
    }
  }
}
