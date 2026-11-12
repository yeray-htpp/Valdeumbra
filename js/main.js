// =====================================================================
//  main.js  -  Punto de entrada: escena, cámara, carga y bucle del juego
//
//  Estados del juego:
//   loading -> menu -> intro -> play <-> pause -> over | win
// =====================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { World, PROP_MODELS } from './world.js';
import { Player } from './player.js';
import { Weapons, WEAPON_DEFS } from './weapons.js';
import { ZombieManager } from './zombies.js';
import { Pickups } from './pickups.js';
import { Intro } from './intro.js';
import { Scares } from './scares.js';
import { Finale } from './finale.js';
import { PostFX } from './postfx.js';
import { hud } from './hud.js';
import { sfx, initAudio, setRain } from './sfx.js';
import { START, EXTRACTION, ZOMBIES, ZOMBIE_MODELS, OFUDA_NEEDED, DROP_CHANCE, LIVES, CHECKPOINTS } from './levelData.js';

// ---------- Renderer, escena y cámara (con proyección en perspectiva) ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x120608);           // cielo nocturno rojizo

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x120608, 0.05); // niebla densa

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 500);
camera.rotation.order = 'YXZ';
scene.add(camera);                          // necesario: el arma es hija de la cámara

const postfx = new PostFX(renderer);
const clock = new THREE.Clock();

const game = {
  state: 'loading', debug: false, startTime: 0,
  lives: LIVES,                              // vidas restantes
  checkpoint: { x: START.x, z: START.z },   // dónde reaparecer
  cpReached: new Set(),
  invuln: 0,                                 // segundos de invulnerabilidad tras reaparecer
};
let finale;
let world, player, weapons, zombies, pickups, intro, scares;
const frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();

// ---------- Carga de modelos GLB ----------
const loader = new GLTFLoader();
function loadGLB(url) {
  return new Promise(resolve => {
    loader.load(url, gltf => resolve(gltf), undefined, err => {
      console.warn('No se pudo cargar', url, err);
      resolve(null);                        // se usa un modelo de respaldo
    });
  });
}

async function init() {
  // Todos los modelos GLB del juego
  const files = {
    pistol: WEAPON_DEFS.pistol.file,
    shotgun: WEAPON_DEFS.shotgun.file,
    ...Object.fromEntries(Object.entries(ZOMBIE_MODELS).map(([k, file]) => ['z_' + k, `models/${file}.glb`])),
    ...Object.fromEntries(PROP_MODELS.map(m => [m, `models/env_${m}.glb`])),
  };
  const keys = Object.keys(files);
  let done = 0;
  const loaded = await Promise.all(keys.map(k => loadGLB(files[k]).then(g => {
    document.getElementById('loading-text').textContent = `Cargando modelos… ${++done}/${keys.length}`;
    return g;
  })));
  const M = Object.fromEntries(keys.map((k, i) => [k, loaded[i]]));
  const { pistol, shotgun } = M;
  const missing = keys.filter(k => !M[k]).map(k => files[k]);
  if (missing.length) {
    const el = document.getElementById('missing');
    el.textContent = 'Faltan modelos GLB: ' + missing.join(', ') + '. Se usan modelos de respaldo.';
    el.classList.remove('hidden');
  }

  world = new World(scene);
  world.onLightning = () => sfx.thunder(0.4 + Math.random() * 0.8);

  player = new Player(camera, document.body, world.colliders);
  weapons = new Weapons(camera, { pistol, shotgun }, hud);
  world.addProps(M);
  zombies = new ZombieManager(scene, Object.fromEntries(Object.keys(ZOMBIE_MODELS).map(k => [k, M['z_' + k]])), world.colliders);
  pickups = new Pickups(scene, M);

  // las lápidas evitan los lugares de zombis y objetos
  world.placeGraves([...ZOMBIES, ...pickups.points()]);
  for (const def of ZOMBIES) zombies.spawn(def);

  scares = new Scares({ world, zombies, hud, scene, camera, player });
  world.rain.visible = false;

  zombies.onEvent = (type, z) => {
    // algunos zombis sueltan una caja pequeña de munición
    if (type === 'kill' && Math.random() < DROP_CHANCE) pickups.addDrop(z.root.position.x, z.root.position.z);
    if (type === 'howl') { hud.message('¡Un aullido despierta a los muertos cercanos!', 2500, 'danger'); scares.scare(0.5); }
    if (type === 'emerge') scares.scare(1);
    if (type === 'kill') hud.message('Zombi eliminado', 1200, 'good');
  };

  intro = new Intro({ camera, scene, world, zombies, hud, onEnd: startPlay,
    onScare: v => { postfx.material.uniforms.uFear.value = v; } });

  hud.setAmmo(weapons);
  hud.setNotes(0, pickups.notesTotal);
  hud.setOfuda(0, OFUDA_NEEDED);
  hud.setLives(game.lives, LIVES);
  finale = new Finale({ camera, scene, world, zombies, hud, postfx, player, weapons, onEnd: win });
  bindEvents();

  // vista de fondo del menú: dentro de la casa
  camera.position.set(2.6, 1.2, 10.8);
  camera.lookAt(0, 1.3, 4);
  weapons.holder.visible = false;
  hud.screen('menu');
  game.state = 'menu';

  // Modo prueba: index.html?dev=x,z (aparecer en un punto) o ?dev=intro&t=9 (saltar a un momento de la intro). Añade &debug para ver rangos.
  const q = new URLSearchParams(location.search);
  if (q.has('dev')) {
    hud.screen(null);
    if (q.get('dev') === 'finale') {
      world.ruinHouse(); world.unseal(); startPlay(); hud.screen(null);
      player.spawn(EXTRACTION.x, EXTRACTION.z + 2);
      startFinale();
      for (let t = 0; t < (+q.get('t') || 0); t += 0.05) finale.update(0.05);
      if (q.has('freeze')) finale.update = () => {};
    } else if (q.get('dev') === 'intro') { game.state = 'intro'; intro.start(); intro.t = +q.get('t') || 0; }
    else {
      world.ruinHouse(); startPlay(); game.state = 'play'; hud.screen(null);
      const [x, z, yaw] = (q.get('dev') || '0,1,0').split(',').map(Number);
      player.spawn(x, z); camera.rotation.y = yaw || 0;
      if (q.has('debug')) { game.debug = true; zombies.setDebug(true); hud.setDebug(true); }
    }
  }
}

// ---------- Flujo del juego ----------
function skipIntroFlag() {
  try { return sessionStorage.getItem('valdeumbra-skip') === '1'; } catch { return false; }
}

function beginFromMenu() {
  initAudio();
  hud.screen(null);
  player.controls.lock();
  if (skipIntroFlag()) {
    world.ruinHouse();
    startPlay();
  } else {
    game.state = 'intro';
    intro.start();
  }
}

function startPlay() {
  game.state = 'play';
  game.startTime = clock.elapsedTime;
  player.spawn(START.x, START.z);
  weapons.holder.visible = true;
  world.rain.visible = true;
  setRain(1);
  hud.show(true);
  hud.message('Busca el carruaje de los cazadores, al norte', 3500);
  if (!player.controls.isLocked) { game.state = 'pause'; hud.screen('pause'); }
}

function gameOver() {
  game.state = 'over';                      // detiene el desarrollo normal
  game.lives -= 1;
  hud.setLives(game.lives, LIVES);
  document.getElementById('over-lives').textContent = game.lives > 0
    ? `Te quedan ${game.lives} ${game.lives === 1 ? 'vida' : 'vidas'}`
    : 'No te quedan vidas';
  document.getElementById('btn-retry').textContent = game.lives > 0 ? 'Continuar (R)' : 'Reintentar desde el inicio (R)';
  postfx.material.uniforms.uDamage.value = 0.8;
  sfx.gameover();
  player.controls.unlock();
  hud.show(false);
  hud.clearLabels();
  document.getElementById('over-stats').textContent =
    `Zombis eliminados: ${zombies.kills()} · Notas: ${pickups.notesFound}/${pickups.notesTotal}`;
  hud.screen('over');
}

function win() {
  game.state = 'win';
  sfx.win();
  player.controls.unlock();
  hud.show(false);
  hud.clearLabels();
  const secs = Math.round(clock.elapsedTime - game.startTime);
  document.getElementById('win-stats').textContent =
    `Tiempo: ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} · Zombis eliminados: ${zombies.kills()} · Notas: ${pickups.notesFound}/${pickups.notesTotal}`;
  hud.screen('win');
}

// Continuar: reaparecer en el último punto de control
function continueGame() {
  if (game.lives <= 0) { restart(); return; }
  const cp = game.checkpoint;
  postfx.material.uniforms.uDamage.value = 0;
  zombies.resetNear(cp.x, cp.z, 16);
  player.spawn(cp.x, cp.z);
  player.slowT = 0;
  game.invuln = 2.5;
  hud.show(true);
  hud.message('Has vuelto… pero ellos siguen aquí', 2500, 'danger');
  game.state = 'pause';
  hud.screen('pause');
  player.controls.lock();                   // al bloquear el mouse vuelve a 'play'
}

function startFinale() {
  game.state = 'finale';
  finale.start();
}

function restart() {
  try { sessionStorage.setItem('valdeumbra-skip', '1'); } catch { /* sin almacenamiento */ }
  location.reload();
}

// ---------- Entrada ----------
function bindEvents() {
  document.getElementById('btn-play').addEventListener('click', beginFromMenu);
  document.getElementById('btn-retry').addEventListener('click', continueGame);
  document.getElementById('btn-again').addEventListener('click', restart);

  document.getElementById('screen-pause').addEventListener('click', () => player.controls.lock());
  player.controls.addEventListener('lock', () => {
    if (game.state === 'pause') { game.state = 'play'; hud.screen(null); }
  });
  player.controls.addEventListener('unlock', () => {
    if (game.state === 'play') { game.state = 'pause'; hud.screen('pause'); }
  });

  // Disparo: 'mousedown' ocurre UNA vez por clic -> no hay disparo automático
  document.addEventListener('mousedown', e => {
    if (e.button !== 0 || game.state !== 'play' || !player.controls.isLocked || scares.cut) return;
    const z = weapons.shoot(zombies, world.solidMeshes, scene);
    if (z) hud.hitMarker();
  });

  addEventListener('keydown', e => {
    if (e.code === 'Space' && game.state === 'intro') { e.preventDefault(); intro.skip(); }
    if (e.code === 'Space' && game.state === 'finale') { e.preventDefault(); finale.skip(); }
    if (game.state === 'play') {
      if (e.code === 'Digit1') weapons.select('pistol');
      if (e.code === 'Digit2') weapons.select('shotgun');
    }
    if (e.code === 'F3' || e.code === 'KeyH') {
      e.preventDefault();
      game.debug = !game.debug;
      zombies.setDebug(game.debug);
      hud.setDebug(game.debug);
    }
    if (e.code === 'KeyR' && game.state === 'over') continueGame();
    if (e.code === 'KeyR' && game.state === 'win') restart();
  });

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    postfx.resize();
  });
}

// ---------- Bucle principal ----------
function animate() {
  requestAnimationFrame(animate);
  tick(Math.min(clock.getDelta(), 0.05));
  postfx.render(scene, camera, clock.elapsedTime);
}

// Un paso de la lógica del juego
function tick(dt) {

  if (game.state !== 'loading') {
    world.update(dt, camera.position);
    if (scares?.ghost.mixer) scares.ghost.mixer.update(dt);

    if (game.state === 'intro') intro.update(dt);
    if (game.state === 'finale') finale.update(dt);
    if (game.state !== 'play') postfx.material.uniforms.uFear.value *= 0.95;

    if (game.state === 'play' && scares.cut) {
      // cinemática: la cámara se mueve sola y el mundo se detiene
      scares.updateCut(dt);
      weapons.update(dt, false, scene);
      postfx.material.uniforms.uFear.value = Math.max(postfx.material.uniforms.uFear.value * 0.96, scares.spike);
    } else if (game.state === 'play') {
      player.update(dt);
      weapons.update(dt, player.moving, scene);
      pickups.update(dt, player.position, { weapons, player, hud, world });
      hud.setBoost(player.boostTime);

      hud.setStamina(player.stamina, player.exhausted);

      // lo que ve la cámara (para el onryō y los jizō)
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(_pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));

      const caught = zombies.update(dt, player.position, true, frustum);
      if (game.debug) zombies.setDebug(true);   // refresca colores/visibilidad
      scares.update(dt, player.position, frustum);
      // invulnerable unos segundos al reaparecer
      if (game.invuln > 0) game.invuln -= dt;
      if (caught && game.invuln <= 0) gameOver();

      // puntos de control
      for (const cp of CHECKPOINTS) {
        if (!game.cpReached.has(cp) && player.position.z < cp.z) {
          game.cpReached.add(cp);
          game.checkpoint = { x: cp.x, z: cp.sz };
          hud.message(`Punto de control: ${cp.name}`, 2000, 'good');
        }
      }

      // Extracción: al entrar al círculo de luz se gana
      const dEx = Math.hypot(player.position.x - EXTRACTION.x, player.position.z - EXTRACTION.z);
      const inZone = dEx < EXTRACTION.radius;
      hud.setDistance(dEx);
      if (game.state === 'play' && inZone) startFinale();

      // glitch VHS: más fuerte cuanto más cerca está un zombi que te persigue
      const near = THREE.MathUtils.clamp(1 - zombies.nearest / 9, 0, 1);
      postfx.material.uniforms.uFear.value = Math.min(1, near * 0.6 + scares.spike);
    } else if (game.state === 'pause' || game.state === 'menu') {
      // nada se mueve
    }

    if (game.state === 'play' || game.state === 'pause') hud.updateLabels(zombies, camera, game.debug);
  }

}

hud.screen('loading');
animate();
init().catch(err => {
  console.error(err);
  document.getElementById('loading-text').textContent = 'Error al iniciar: ' + err.message;
});
