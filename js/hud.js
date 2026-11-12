// =====================================================================
//  hud.js  -  Interfaz: munición, mensajes, notas, pantallas
// =====================================================================
import * as THREE from 'three';

const $ = id => document.getElementById(id);
const _v = new THREE.Vector3();

let msgTimer = 0;
let noteTimer = 0;
const labelEls = new Map();

export const hud = {
  show(on) { $('hud').classList.toggle('hidden', !on); },

  setAmmo(weapons) {
    const n = weapons.ammo[weapons.current];
    $('ammo-count').textContent = n;
    $('ammo-count').classList.toggle('empty', n === 0);
    $('ammo-name').textContent = weapons.current === 'pistol' ? 'Pistola' : 'Escopeta';
    document.querySelectorAll('.slot').forEach(s => {
      s.classList.toggle('active', s.dataset.w === weapons.current);
      s.querySelector('span').textContent = weapons.ammo[s.dataset.w];
    });
  },

  message(text, ms = 2000, kind = '') {
    const el = $('message');
    el.textContent = text;
    el.className = 'show ' + kind;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { el.className = kind; }, ms);
  },

  hitMarker() {
    const c = $('crosshair');
    c.classList.add('hit');
    setTimeout(() => c.classList.remove('hit'), 120);
  },

  showNote(title, text) {
    $('note-title').textContent = title;
    $('note-text').textContent = text;
    $('note-card').classList.remove('hidden');
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => $('note-card').classList.add('hidden'), 7000);
  },

  // Vidas: 命 (inochi = vida) encendidos o apagados
  setLives(n, total = 3) {
    $('lives').innerHTML = Array.from({ length: total }, (_, i) =>
      `<span class="${i < n ? '' : 'lost'}">命</span>`).join('');
  },

  setOfuda(n, total) {
    $('ofuda').textContent = n >= total ? 'Sello del puente roto' : `Ofuda ${n}/${total}`;
    $('ofuda').classList.toggle('done', n >= total);
  },

  setNotes(found, total) { $('notes').textContent = `Notas del diario ${found}/${total}`; },

  setDistance(m) { $('distance').textContent = `${Math.max(0, Math.round(m))} m`; },

  setBoost(t) {
    $('boost').classList.toggle('hidden', t <= 0);
    if (t > 0) $('boost').textContent = `Celeridad ${Math.ceil(t)}`;
  },

  setStamina(v, tired) {
    $('stamina-fill').style.width = (v * 100).toFixed(0) + '%';
    $('stamina').classList.toggle('tired', tired);
  },

  setDebug(on) { $('debug-tag').classList.toggle('hidden', !on); },

  screen(name) {
    for (const s of ['loading', 'menu', 'pause', 'over', 'win']) {
      $('screen-' + s).classList.toggle('hidden', s !== name);
    }
  },

  // Fundido a negro (intro / transiciones)
  fade(opacity, seconds = 0.4) {
    const f = $('fade');
    f.style.transition = `opacity ${seconds}s`;
    f.style.opacity = opacity;
  },

  caption(text) {
    const c = $('caption');
    if (text) { c.textContent = text; c.classList.add('show'); }
    else c.classList.remove('show');
  },

  // Etiquetas sobre los zombis: impactos recibidos (1/2) y, en
  // modo depuración, su estado (IDLE / CHASE / DEAD).
  updateLabels(zombies, camera, debug) {
    const root = $('labels');
    for (const z of zombies.list) {
      let el = labelEls.get(z);
      const dist = camera.position.distanceTo(z.root.position);
      const hits = 2 - z.hp;
      const show = dist < 30 && (debug || (hits > 0 && z.state !== 'dead'));
      if (!show) { if (el) el.style.display = 'none'; continue; }
      if (!el) { el = document.createElement('div'); root.appendChild(el); labelEls.set(z, el); }

      _v.copy(z.root.position);
      _v.y += 2.0 * z.type.scale + 0.2;
      _v.project(camera);
      if (_v.z > 1) { el.style.display = 'none'; continue; }
      el.style.display = 'block';
      el.style.left = ((_v.x + 1) / 2 * innerWidth) + 'px';
      el.style.top = ((1 - _v.y) / 2 * innerHeight) + 'px';
      if (debug) {
        el.className = 'zlabel dbg';
        el.textContent = `${z.type.name} · ${z.state.toUpperCase()} · impactos ${hits}/2 · rango ${z.type.range} m`;
      } else {
        el.className = 'zlabel hp';
        el.textContent = `impactos ${hits}/2`;
      }
    }
  },

  clearLabels() { for (const el of labelEls.values()) el.style.display = 'none'; },
};
