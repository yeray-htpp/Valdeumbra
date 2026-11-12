# Valdeumbra — Operación Extracción

FPS en primera persona de estilo **dark fantasy retro** hecho con **Three.js (WebGL)** para la evaluación T3 de Computación Gráfica.

> Valdeumbra, 1693. La luna se tiñó de rojo y los muertos despertaron. Despiertas en tu casa, un zombi derriba la puerta y el techo se derrumba. Sales de entre los escombros y tienes que cruzar la aldea, el cementerio y el Puente del Cuervo hasta el carruaje de los cazadores.

## Cómo ejecutar

El juego usa módulos ES y carga archivos `.glb`, así que **necesita un servidor local** (no funciona abriendo `index.html` con doble clic).

Con Python:
```bash
python -m http.server 8000
```
O con Node:
```bash
npx serve .
```
Luego abre **http://localhost:8000** en Chrome, Edge o Firefox.

No hay que instalar dependencias: Three.js r160 se carga desde CDN mediante un `importmap` (ver `index.html`).

## Controles

| Control | Acción |
|---|---|
| W / S | Avanzar / retroceder |
| A / D | Desplazarse a la izquierda / derecha |
| Mouse | Orientar la cámara |
| Clic izquierdo | Disparar (un disparo por clic) |
| 1 / 2 | Pistola / escopeta |
| Espacio | Saltar la intro |
| F3 o H | Modo depuración (rangos de detección, hitboxes y estado de cada zombi) |
| R | Reiniciar tras GAME OVER o victoria |
| Esc | Pausa |

## Mecánicas y requisitos

| Requisito | Implementación | Archivo |
|---|---|---|
| Cámara FPS y WASD | `PointerLockControls` + movimiento con colisión AABB por eje | `js/player.js` |
| Arma que sigue a la cámara | Las armas son hijas de la cámara y se dibujan en una segunda pasada (capa 1) para no atravesar paredes | `js/weapons.js`, `js/postfx.js` |
| 2 armas GLB, teclas 1/2 | `GLTFLoader`, solo una visible a la vez, con animación de cambio | `js/weapons.js` |
| Un disparo por clic | Evento `mousedown`: se dispara una vez por clic, sin modo automático | `js/main.js` |
| Munición por arma | `ammo = { pistol, shotgun }`. En 0 no dispara. **No hay tecla de recarga** | `js/weapons.js` |
| Recuperar munición | Solo con cofres del escenario: cofre normal (gema amarilla) = pistola, cofre especial (gema roja) = escopeta | `js/pickups.js` |
| Zombis GLB | 4 modelos GLB animados: `GLTFLoader` + `SkeletonUtils.clone` + `AnimationMixer` (caminar, correr, arrastrarse, recibir golpe, morir) | `js/zombies.js` |
| Detección y persecución | Máquina de estados `idle → chase → dead`. El rango se configura por tipo | `js/zombies.js`, `js/levelData.js` |
| Disparos y colisiones | `Raycaster` desde el centro de la cámara contra hitboxes y paredes | `js/weapons.js` |
| 2 impactos exactos | `hp = 2`, cada impacto válido resta 1. En 0 pasa a `dead`: deja de perseguir y atacar | `js/zombies.js` |
| Zona de extracción | Círculo de luz junto al carruaje y mensaje «¡MISIÓN COMPLETADA!» | `js/main.js`, `js/world.js` |
| Game Over | Contacto con un zombi vivo: se detiene el bucle y aparece GAME OVER (R reinicia) | `js/main.js` |
| Coleccionables | Cajas de munición, poción de velocidad y 4 notas del diario | `js/pickups.js` |
| Dificultad | Munición limitada, 5 tipos de zombi, aulladores que despiertan a otros, guardián en el puente y barricadas | `js/levelData.js` |

### Tipos de zombi (todos mueren con 2 impactos)

| Tipo | Modelo | Velocidad | Rango | Detalle |
|---|---|---|---|---|
| Errante | zombie_basic | 1.6 m/s | 12 m | camina |
| Corredor | zombie_arm | 4.0 m/s | 9 m | corre |
| Arrastrado | zombie_basic | 0.9 m/s | 6 m | se arrastra por el suelo, difícil de apuntar |
| Aullador | zombie_ribcage | 2.4 m/s | 14 m | al detectarte despierta a los zombis a 15 m |
| Guardián | zombie_chubby | 3.0 m/s | 16 m | gigante (×1.8), vigila el puente |

### Estilo visual (shader GLSL propio)

La escena se renderiza en un `WebGLRenderTarget` de 240 px de alto y luego se dibuja en pantalla completa con un **fragment shader propio** (`js/postfx.js`) que aplica pixelado, posterización con tramado (dithering), viñeta, grano y un tinte rojo en el GAME OVER. Además hay niebla exponencial, luna roja, antorchas que parpadean, relámpagos aleatorios y una linterna que sigue al jugador.

Los sonidos se generan con la **Web Audio API** (ruido y osciladores), así que no hay archivos de audio.

## Estructura

```
index.html        HUD, pantallas e importmap de Three.js
css/style.css     estilos del HUD y las pantallas
js/main.js        escena, cámara, carga de GLB, estados y bucle del juego
js/levelData.js   configuración: zombis, objetos, notas, munición inicial
js/world.js       escenario (geometría programada) y colisionadores
js/player.js      cámara en primera persona y movimiento
js/weapons.js     armas, disparo (raycasting) y munición
js/zombies.js     enemigos: estados, persecución, impactos y muerte
js/pickups.js     coleccionables
js/intro.js       cinemática inicial
js/postfx.js      shader retro (vertex + fragment GLSL)
js/hud.js         interfaz
js/sfx.js         sonidos generados con Web Audio
models/           pistol.glb, shotgun.glb, zombie_*.glb (4 zombis), env_*.glb (barriles, pallets, cofres, sangre)
```

## Créditos de recursos externos

- **Three.js** r160 — MIT — https://threejs.org
- **Zombis, armas y decoración:** Quaternius, *Zombie Apocalypse Kit* — CC0 — https://quaternius.com/packs/zombieapocalypsekit.html
  - `zombie_basic`, `zombie_arm`, `zombie_ribcage`, `zombie_chubby` (con animaciones Walk/Run/Crawl/Death/HitReact)
  - `pistol`, `shotgun`
  - `env_barrel`, `env_pallet`, `env_pallet_broken`, `env_chest`, `env_chest_special`, `env_blood_1..3`
  - Se convirtieron de `.gltf` a `.glb` (formato binario) para el proyecto.
- **Fuentes:** Pirata One y VT323 — SIL Open Font License — Google Fonts

El escenario, las texturas (generadas en canvas), los sonidos y el shader son propios.
