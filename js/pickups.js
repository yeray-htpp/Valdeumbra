// =====================================================================
//  pickups.js  -  Objetos coleccionables del escenario (RF10)
//   - Caja amarilla: munición de PISTOLA
//   - Caja roja:     munición de ESCOPETA
//   - Poción azul:   velocidad +50% por 8 s
//   - Nota:          página del diario (historia)
//  Se recogen al acercarse (distancia < 1.3 m).
// =====================================================================
import * as THREE from 'three';
import { PICKUPS, NOTES } from './levelData.js';
import { sfx } from './sfx.js';

const PICK_DIST = 1.3;

export class Pickups {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.notesFound = 0;
    this.notesTotal = NOTES.length;
    this.time = 0;

    const mats = {
      ammo_pistol:  new THREE.MeshLambertMaterial({ color: 0xc8a020, emissive: 0x3a2a00 }),
      ammo_shotgun: new THREE.MeshLambertMaterial({ color: 0xb02a20, emissive: 0x3a0800 }),
      potion:       new THREE.MeshLambertMaterial({ color: 0x40a0ff, emissive: 0x103060 }),
      note:         new THREE.MeshBasicMaterial({ color: 0xf0e6c8, side: THREE.DoubleSide }),
      band:         new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    };

    for (const p of PICKUPS) this.add(p, mats);
    for (const n of NOTES) this.add({ ...n, kind: 'note' }, mats);
  }

  add(data, mats) {
    let mesh;
    if (data.kind.startsWith('ammo')) {
      mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.38), mats[data.kind]));
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.08, 0.4), mats.band);
      band.position.y = 0.05;
      mesh.add(band);
    } else if (data.kind === 'potion') {
      mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mats.potion));
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 6), mats.potion);
      neck.position.y = 0.22;
      mesh.add(neck);
    } else {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.45), mats.note);
    }
    mesh.position.set(data.x, 0.7, data.z);
    this.scene.add(mesh);
    this.items.push({ data, mesh, taken: false, phase: Math.random() * 6 });
  }

  // Puntos que las lápidas deben evitar
  points() { return this.items.map(i => ({ x: i.data.x, z: i.data.z })); }

  update(dt, playerPos, { weapons, player, hud }) {
    this.time += dt;
    for (const it of this.items) {
      if (it.taken) continue;
      it.mesh.rotation.y += dt * 1.5;
      it.mesh.position.y = 0.7 + Math.sin(this.time * 2.5 + it.phase) * 0.12;

      const d = Math.hypot(playerPos.x - it.data.x, playerPos.z - it.data.z);
      if (d > PICK_DIST) continue;

      it.taken = true;
      this.scene.remove(it.mesh);
      const k = it.data.kind;
      if (k === 'ammo_pistol') {
        weapons.addAmmo('pistol', it.data.amount);
        hud.message(`+${it.data.amount} balas de PISTOLA`, 2000, 'good');
        sfx.pickup();
      } else if (k === 'ammo_shotgun') {
        weapons.addAmmo('shotgun', it.data.amount);
        hud.message(`+${it.data.amount} cartuchos de ESCOPETA`, 2000, 'good');
        sfx.pickup();
      } else if (k === 'potion') {
        player.boost(8);
        hud.message('Poción de celeridad: ¡más velocidad por 8 s!', 2200, 'good');
        sfx.pickup();
      } else if (k === 'note') {
        this.notesFound++;
        hud.showNote(it.data.title, it.data.text);
        hud.setNotes(this.notesFound, this.notesTotal);
        sfx.note();
      }
    }
  }
}
