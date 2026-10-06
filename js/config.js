'use strict';
/* =========================================================
   SAN AURELIO — shared config & helpers
   ========================================================= */

const CITY = (() => {
  const c = { BLOCK: 64, ROAD: 16, GRID: 12, WALK: 4, LANE: 3.8 };
  c.CELL = c.BLOCK + c.ROAD;          // 80m between road centre-lines
  c.HALF = (c.GRID * c.CELL) / 2;     // 480m
  c.BOUND = c.HALF + 6;               // playable edge (perimeter road)
  return c;
})();

/** world coordinate of road centre-line #i (0..GRID) */
const nodeCoord = i => -CITY.HALF + i * CITY.CELL;

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wait = ms => new Promise(r => setTimeout(r, ms));

function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
const dampAngle = (a, b, lambda, dt) => a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt));

/** deterministic RNG so the city is identical on every load */
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fmtMoney = n => '$' + Math.round(n).toLocaleString('en-US');
/** isolate LTR fragments (money, key names) inside Hebrew text */
const ltr = s => '\u2066' + s + '\u2069';

/* shared unit geometries (scaled per mesh) */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

/* ---------------------------------------------------------
   Vehicles — fictional makes. Units: metres, m/s, m/s²
   --------------------------------------------------------- */
const VEHICLES = {
  sedan:  { name: 'Vireo LX',     maxSpeed: 46, accel: 7.5,    brake: 30, grip: 7.5, steer: 0.62, wb: 2.7, len: 4.6, wid: 1.95, hgt: 1.42, cab: 0.5,  cabZ: -0.15, mass: 1.0,
            colors: [0x8a1c1c, 0x1d3557, 0xdedede, 0x2b2b2b, 0x5c6b73, 0x7a5c3a, 0x23395b, 0x9aa5ad] },
  sports: { name: 'Strata GT',    maxSpeed: 66, accel: 11.5,   brake: 36, grip: 8.6, steer: 0.58, wb: 2.6, len: 4.45, wid: 2.0, hgt: 1.18, cab: 0.4,  cabZ: -0.32, mass: 0.9,
            colors: [0xff3b1f, 0xffb800, 0x0094ff, 0x121212, 0xf2f2f2, 0x6cff3a, 0xb31dff] },
  suv:    { name: 'Kodiak XR',    maxSpeed: 42, accel: 6.5,  brake: 26, grip: 6.6, steer: 0.6,  wb: 2.9, len: 4.9, wid: 2.1,  hgt: 1.85, cab: 0.62, cabZ: -0.18, mass: 1.4,
            colors: [0x111111, 0x3b3f45, 0xe8e8e8, 0x2e4a3a, 0x5a3825, 0x1f2f4a] },
  van:    { name: 'Porter Cargo', maxSpeed: 36, accel: 5.5,    brake: 22, grip: 6.0, steer: 0.62, wb: 3.1, len: 5.3, wid: 2.1,  hgt: 2.35, cab: 0.8,  cabZ: -0.35, mass: 1.6, van: true,
            colors: [0xf0f0f0, 0x3d5a80, 0xc9ada7, 0xd4a017] },
  taxi:   { name: 'Metro Cab',    maxSpeed: 46, accel: 7.5,    brake: 30, grip: 7.5, steer: 0.62, wb: 2.7, len: 4.7, wid: 1.95, hgt: 1.45, cab: 0.5,  cabZ: -0.15, mass: 1.0, taxi: true,
            colors: [0xffc21a] },
  police: { name: 'Interceptor',  maxSpeed: 60, accel: 10.5, brake: 34, grip: 8.2, steer: 0.6,  wb: 2.8, len: 4.85, wid: 2.0, hgt: 1.45, cab: 0.5,  cabZ: -0.15, mass: 1.25, police: true,
            colors: [0xf4f4f4] },
};
const TRAFFIC_MIX = ['sedan', 'sedan', 'sedan', 'sedan', 'suv', 'suv', 'taxi', 'van', 'sports'];

const QUALITY = {
  low:    { pr: 1,   shadows: 0,    fog: 430, traffic: 20, peds: 22 },
  medium: { pr: 1.5, shadows: 1024, fog: 600, traffic: 28, peds: 32 },
  high:   { pr: 2,   shadows: 2048, fog: 760, traffic: 36, peds: 42 },
};

const LOAD_TIPS = [
  'Handbrake (Space) while turning = controlled drift.',
  'Out of the cops\' sight, your wanted level starts to drop.',
  'Golden cash is scattered on the sidewalks. Worth a stop.',
  'Q switches radio stations. There are three, and one is for the small hours.',
  'M opens the map. Click it to set a waypoint and start GPS.',
  'A burning car explodes after a few seconds. Get out fast.',
  'Traffic lights really work — and other drivers obey them.',
];
