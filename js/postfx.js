// =====================================================================
//  postfx.js  -  Estilo retro "pixel" con un shader GLSL propio
//
//  1) La escena se dibuja en una textura de BAJA resolución
//     (WebGLRenderTarget, ~240 px de alto, filtro Nearest => píxeles).
//  2) Esa textura se dibuja en un rectángulo a pantalla completa
//     con un ShaderMaterial (vertex + fragment shader) que aplica:
//     gamma, posterización con tramado (dithering), viñeta, grano
//     y un tinte rojo al morir.
// =====================================================================
import * as THREE from 'three';

const PIXEL_HEIGHT = 240;

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);   // rectángulo ya en coordenadas de pantalla
  }
`;

const fragmentShader = /* glsl */`
  uniform sampler2D tDiffuse;   // imagen de la escena en baja resolución
  uniform vec2  uRes;           // resolución de esa imagen
  uniform float uTime;
  uniform float uLevels;        // niveles de color por canal
  uniform float uDamage;        // 0..1 tinte rojo (game over)
  uniform float uFear;          // 0..1 glitch VHS (zombis cerca / sustos)
  varying vec2 vUv;

  float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }

  void main() {
    // --- Glitch VHS: cada fila se desplaza un poco y los canales se separan
    vec2 uv = vUv;
    float row = floor(uv.y * uRes.y / 3.0);
    float jitter = (rand(vec2(row, floor(uTime * 20.0))) - 0.5) * 0.04 * uFear;
    float band = step(0.985 - uFear * 0.05, rand(vec2(floor(uTime * 8.0), row * 0.1)));
    uv.x += jitter + band * 0.03 * uFear;
    float ab = 0.004 * uFear;
    vec3 c;
    c.r = texture2D(tDiffuse, uv + vec2(ab, 0.0)).r;
    c.g = texture2D(tDiffuse, uv).g;
    c.b = texture2D(tDiffuse, uv - vec2(ab, 0.0)).b;

    // La textura está en espacio lineal: corregimos gamma para la pantalla
    c = pow(c, vec3(1.0 / 2.2));

    // Tramado ordenado 2x2 + posterización (paleta reducida estilo PS1)
    vec2 p = floor(vUv * uRes);
    float bayer = mod(p.x * 2.0 + p.y * 3.0, 4.0) / 4.0 - 0.375;
    c = floor(c * uLevels + bayer) / uLevels;

    // Viñeta oscura en los bordes
    float d = distance(vUv, vec2(0.5));
    c *= smoothstep(0.85, 0.3, d);

    // Grano de película
    c += (rand(p + fract(uTime)) - 0.5) * 0.035;

    // Estática y líneas de barrido (scanlines)
    c = mix(c, vec3(rand(p * 0.37 + uTime)), uFear * 0.18);
    c *= 1.0 - uFear * 0.25 * step(0.5, mod(p.y, 2.0));

    // Tinte rojo al ser atrapado
    c = mix(c, vec3(c.r * 1.2 + 0.25, c.g * 0.2, c.b * 0.2), uDamage);

    gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
  }
`;

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uRes:     { value: new THREE.Vector2(1, 1) },
        uTime:    { value: 0 },
        uLevels:  { value: 20 },
        uDamage:  { value: 0 },
        uFear:    { value: 0 },
      },
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.resize();
  }

  resize() {
    const aspect = window.innerWidth / window.innerHeight;
    const h = PIXEL_HEIGHT;
    const w = Math.round(h * aspect);
    this.target.setSize(w, h);
    this.material.uniforms.uRes.value.set(w, h);
  }

  // Dibuja en dos pasadas: el mundo (capa 0) y luego el arma (capa 1)
  // limpiando la profundidad, para que el arma nunca atraviese paredes.
  render(scene, camera, time) {
    const r = this.renderer;
    this.material.uniforms.uTime.value = time;

    r.autoClear = false;
    r.setRenderTarget(this.target);
    r.clear();
    camera.layers.set(0);
    r.render(scene, camera);
    r.clearDepth();
    camera.layers.set(1);
    r.render(scene, camera);
    camera.layers.set(0);

    r.setRenderTarget(null);
    r.clear();
    r.render(this.quadScene, this.quadCam);
  }
}
