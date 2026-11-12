// =====================================================================
//  sfx.js  -  Efectos de sonido generados con la Web Audio API
//  (no se necesitan archivos de audio: todo es ruido y osciladores)
// =====================================================================

let ctx = null;
let master = null;
let noiseBuffer = null;

export function initAudio() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  // Buffer de ruido blanco reutilizable (2 segundos)
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  startWind();
}

// Ráfaga de ruido filtrado con envolvente (disparos, golpes, truenos)
function noise(dur, { freq = 1000, q = 0.8, gain = 1, attack = 0.002, type = 'lowpass', delay = 0 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

// Tono con barrido de frecuencia (aullidos, gruñidos, campanas)
function tone(f0, f1, dur, { type = 'sine', gain = 0.3, delay = 0 } = {}) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.05, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// Viento de fondo en bucle
function startWind() {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 350;
  const g = ctx.createGain();
  g.gain.value = 0.06;
  src.connect(filter).connect(g).connect(master);
  src.start();
}

// Lluvia de fondo en bucle (ruido agudo filtrado)
let rainGain = null;
export function setRain(level) {
  if (!ctx) return;
  if (!rainGain) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    src.connect(hp).connect(lp).connect(rainGain).connect(master);
    src.start();
  }
  rainGain.gain.setTargetAtTime(level * 0.12, ctx.currentTime, 0.5);
}

// Croar del onryō (estilo Ju-On): pulsos graves y rápidos
function croak(vol = 0.3, delay = 0) {
  if (!ctx) return;
  for (let i = 0; i < 14; i++) {
    noise(0.03, { freq: 500 + Math.random() * 200, type: 'bandpass', q: 6, gain: vol, delay: delay + i * 0.045 });
  }
  tone(95, 80, 0.65, { type: 'square', gain: vol * 0.25, delay });
}

export const sfx = {
  croak,
  staticNoise(dur = 2) { noise(dur, { freq: 3500, type: 'highpass', gain: 0.25, attack: 0.01 }); },
  step(delay = 0) { noise(0.09, { freq: 160, gain: 0.9, delay }); },
  boing(delay = 0) { tone(180, 420, 0.18, { type: 'triangle', gain: 0.3, delay }); },
  giggle() { [0, 0.12, 0.24, 0.36, 0.5].forEach((d, i) => tone(900 - i * 60, 700 - i * 60, 0.1, { type: 'triangle', gain: 0.15, delay: d })); },
  taiko(delay = 0) { tone(90, 45, 0.5, { gain: 0.6, delay }); noise(0.12, { freq: 200, gain: 0.5, delay }); },
  bell()     { [220, 552, 880, 1320].forEach((f, i) => tone(f, f * 0.995, 5 - i, { gain: 0.22 / (i + 1) })); },
  whoosh(delay = 0) { noise(0.5, { freq: 900, type: 'bandpass', q: 1.5, gain: 0.35, attack: 0.15, delay }); },
  sting()    { tone(1200, 1150, 1.2, { type: 'sawtooth', gain: 0.12 }); tone(1270, 1210, 1.2, { type: 'sawtooth', gain: 0.12 }); noise(0.6, { freq: 4000, type: 'highpass', gain: 0.3 }); },
  paper()    { noise(0.35, { freq: 2500, type: 'highpass', gain: 0.8 }); noise(0.2, { freq: 600, gain: 0.6, delay: 0.05 }); },
  bang()     { noise(0.2, { freq: 250, gain: 1.4 }); tone(70, 40, 0.25, { gain: 0.5 }); },

  pistol()   { noise(0.18, { freq: 2600, gain: 0.9 }); tone(180, 60, 0.12, { type: 'square', gain: 0.15 }); },
  shotgun()  { noise(0.45, { freq: 1100, gain: 1.3 }); tone(120, 40, 0.3, { type: 'square', gain: 0.25 }); },
  empty()    { tone(1800, 1500, 0.05, { type: 'square', gain: 0.12 }); },
  swap()     { noise(0.08, { freq: 3000, type: 'bandpass', q: 3, gain: 0.3 }); noise(0.08, { freq: 2000, type: 'bandpass', q: 3, gain: 0.3, delay: 0.1 }); },
  hit()      { noise(0.12, { freq: 500, gain: 0.7 }); },
  thunder(delay = 0) { noise(2.8, { freq: 260, gain: 1.2, attack: 0.08, delay }); },
  knock(delay = 0)   { noise(0.15, { freq: 180, gain: 1.2, delay }); },
  crash()    { noise(1.6, { freq: 700, gain: 1.4, attack: 0.01 }); noise(2.2, { freq: 150, gain: 1.2 }); },
  groan(vol = 0.25) { tone(110, 70, 0.9, { type: 'sawtooth', gain: vol }); },
  howl()     { tone(300, 720, 0.6, { type: 'sawtooth', gain: 0.25 }); tone(720, 260, 1.2, { type: 'sawtooth', gain: 0.25, delay: 0.6 }); },
  pickup()   { tone(600, 600, 0.1, { gain: 0.25 }); tone(900, 900, 0.15, { gain: 0.25, delay: 0.1 }); },
  note()     { tone(400, 400, 0.4, { type: 'triangle', gain: 0.25 }); tone(500, 500, 0.6, { type: 'triangle', gain: 0.2, delay: 0.15 }); },
  gameover() { tone(220, 55, 2.0, { type: 'sawtooth', gain: 0.35 }); noise(1.0, { freq: 300, gain: 0.8 }); },
  win()      { [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.5, { type: 'triangle', gain: 0.25, delay: i * 0.18 })); },
};
