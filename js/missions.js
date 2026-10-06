'use strict';
/* =========================================================
   Missions & pickups
   ========================================================= */

function makeBeacon(color, height = 36, radius = 1.6) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, alphaMap: World.tex.beamGrad, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 24, 1, true), mat);
  cyl.position.y = height / 2; g.add(cyl);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 1.5, radius * 2, 40), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.32; g.add(ring);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshBasicMaterial({ color }));
  gem.position.y = 2.4; g.add(gem);
  g.userData = { ring, gem, t: Math.random() * 6 };
  World.scene.add(g);
  return g;
}
function animateBeacon(b, dt) {
  const u = b.userData; u.t += dt;
  u.gem.rotation.y += dt * 1.6; u.gem.position.y = 2.4 + Math.sin(u.t * 2) * 0.25;
  const s = 1 + Math.sin(u.t * 3) * 0.08; u.ring.scale.set(s, s, s);
}
/** corner of block (i,j) on the sidewalk */
const sidewalkCorner = (i, j) => [nodeCoord(i) + CITY.ROAD / 2 + 2.6, nodeCoord(j) + CITY.ROAD / 2 + 2.6];

const Missions = {
  defs: [
    { id: 'courier', title: 'משלוח לילה', desc: 'חבילה רגישה מחכה לאיסוף בצד השני של העיר. אסוף ומסור לפני שהשעון אוזל.', reward: 1800, color: 0xffc247, at: [4, 7] },
    { id: 'race', title: 'מרוץ רחוב', desc: 'שמונה נקודות ביקורת ושעון אחד. צריך רכב — וכמה שיותר מהיר.', reward: 3200, color: 0x3ee6c1, at: [7, 4], needCar: true },
    { id: 'heist', title: 'הכספת של הבנק המרכזי', desc: 'פרוץ לכספת בדאונטאון, התחמק מהמשטרה והגע למחבוא בסאנסט פלאטס.', reward: 9000, color: 0xff4d5e, at: [8, 8] },
  ],
  active: null, steps: [], si: 0, time: null, givers: [], target: null, ring: null,

  init() {
    for (const def of this.defs) {
      const [x, z] = sidewalkCorner(def.at[0], def.at[1]);
      const b = makeBeacon(def.color, 28, 1.3); b.position.set(x, 0.25, z);
      this.givers.push({ def, x, z, b });
    }
    this.target = makeBeacon(0xffc247, 60, 2.2); this.target.visible = false;
    const rm = new THREE.MeshBasicMaterial({ color: 0x3ee6c1, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.32, 8, 48), rm); this.ring.visible = false; World.scene.add(this.ring);
    this.ring2 = new THREE.Mesh(this.ring.geometry, rm.clone()); this.ring2.material.opacity = 0.25; this.ring2.visible = false; World.scene.add(this.ring2);
  },
  current() { return this.active ? this.steps[this.si] : null; },
  targetPos() { const s = this.current(); return s && s.type === 'goto' ? s : null; },

  farPoint(fromX, fromZ, minD, maxD) {
    for (let t = 0; t < 60; t++) {
      const i = randInt(0, CITY.GRID), j = randInt(0, CITY.GRID), x = nodeCoord(i), z = nodeCoord(j), d = Math.hypot(x - fromX, z - fromZ);
      if (d >= minD && d <= maxD) return { x, z, i, j };
    }
    const [i, j] = World.nearestNode(-fromX, -fromZ);
    return { x: nodeCoord(i), z: nodeCoord(j), i, j };
  },

  build(def) {
    const P = Player.focus();
    if (def.id === 'courier') {
      const a = this.farPoint(P.x, P.z, 160, 360), b = this.farPoint(a.x, a.z, 260, 520);
      const t = Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 11 + 28);
      return [
        { type: 'goto', x: a.x, z: a.z, r: 7, text: 'סע לנקודת האיסוף', onDone: () => { this.time = t; UI.toast('החבילה אצלך', `יש לך ${t} שניות להגיע ליעד.`, 'mission'); Sound.pickup(); } },
        { type: 'goto', x: b.x, z: b.z, r: 7, text: 'מסור את החבילה ליעד' },
      ];
    }
    if (def.id === 'race') {
      let cur = World.nearestNode(P.x, P.z), dir = null, len = 0;
      const pts = [], N = CITY.GRID;
      for (let k = 0; k < 8; k++) {
        for (let s = 0; s < 2; s++) {
          const opts = World.neighbors(cur[0], cur[1]).filter(n => !dir || !(n[0] - cur[0] === -dir[0] && n[1] - cur[1] === -dir[1]));
          const straight = dir && opts.find(n => n[0] - cur[0] === dir[0] && n[1] - cur[1] === dir[1]);
          const nx = straight && Math.random() < 0.6 ? straight : pick(opts);
          dir = [nx[0] - cur[0], nx[1] - cur[1]]; cur = nx; len += CITY.CELL;
        }
        if (cur[0] === 0 || cur[0] === N || cur[1] === 0 || cur[1] === N) dir = null;
        pts.push({ type: 'goto', x: nodeCoord(cur[0]), z: nodeCoord(cur[1]), r: 10, text: `נקודת ביקורת ${k + 1} מתוך 8`, race: true, needCar: true, dir: dir ? Math.atan2(dir[0], dir[1]) : 0 });
      }
      pts[0].onStart = () => { this.time = Math.round(len / 21 + 14); UI.banner('יוצאים!', 'עבור בכל נקודות הביקורת לפני שהזמן אוזל', 'mission', 1600); };
      return pts;
    }
    // heist
    const [bx, bz] = sidewalkCorner(5, 5), [hx, hz] = sidewalkCorner(1, 9);
    return [
      { type: 'goto', x: bx, z: bz, r: 6, text: 'הגע לבנק המרכזי בדאונטאון',
        onDone: () => { Wanted.setLevel(3); UI.banner('הכספת נפתחה', 'עכשיו צריך לצאת מזה בחיים', 'heat', 2400); Sound.explosion(0.4); FX.sparks(bx, 1.5, bz, 14); } },
      { type: 'lose', text: 'התחמק מהמשטרה' },
      { type: 'goto', x: hx, z: hz, r: 6, text: 'הגע למחבוא בסאנסט פלאטס', clean: true },
    ];
  },

  start(def) {
    if (def.needCar && Player.mode !== 'car') { UI.toast('צריך רכב', 'היכנס לרכב ואז חזור לנקודה.', 'mission'); return; }
    this.active = def; this.steps = this.build(def); this.si = 0; this.time = null;
    for (const g of this.givers) g.b.visible = false;
    UI.banner(def.title, def.desc, 'mission', 3000);
    Sound.passed();
    this.enterStep();
  },
  enterStep() {
    const s = this.current(); if (!s) return;
    if (s.onStart) s.onStart();
    this.ring.visible = this.ring2.visible = false;
    if (s.type === 'goto') {
      this.target.visible = !s.race;
      this.target.position.set(s.x, 0.05, s.z);
      if (s.race) {
        this.ring.visible = true; this.ring.position.set(s.x, 5.4, s.z); this.ring.rotation.y = s.dir;
        const n = this.steps[this.si + 1];
        if (n) { this.ring2.visible = true; this.ring2.position.set(n.x, 5.4, n.z); this.ring2.rotation.y = n.dir; }
      }
    } else this.target.visible = false;
    Game.routeT = 0;
  },
  advance() {
    const s = this.current();
    if (s && s.onDone) s.onDone();
    if (s && s.race) Sound.tone(1047, 0.18, 'triangle', 0.15);
    this.si++;
    if (this.si >= this.steps.length) this.complete(); else this.enterStep();
  },
  complete() {
    const def = this.active;
    Game.addMoney(def.reward);
    if (!Game.completed.includes(def.id)) Game.completed.push(def.id);
    UI.banner('המשימה הושלמה', `${def.title} · ${ltr('+' + fmtMoney(def.reward))}`, 'passed', 3800);
    Sound.passed();
    this.cleanup(); Game.save();
  },
  fail(reason) {
    if (!this.active) return;
    UI.banner('המשימה נכשלה', reason, 'failed', 3200);
    Sound.failed();
    this.cleanup();
  },
  abort() { if (this.active) this.cleanup(); },
  cleanup() {
    this.active = null; this.steps = []; this.time = null;
    this.target.visible = this.ring.visible = this.ring2.visible = false;
    for (const g of this.givers) g.b.visible = true;
    UI.objective(''); UI.timer(null);
  },

  update(dt) {
    const P = Player.focus();
    for (const g of this.givers) if (g.b.visible) animateBeacon(g.b, dt);
    if (this.target.visible) animateBeacon(this.target, dt);
    if (this.ring.visible) this.ring.rotation.z += dt * 0.6;
    if (!this.active) {
      for (const g of this.givers) {
        if (Math.hypot(P.x - g.x, P.z - g.z) < 5.5) {
          Game.prompt = `<kbd>E</kbd> ${g.def.title} <span class="pm">${ltr(fmtMoney(g.def.reward))}</span>`;
          if (Input.hit('KeyE')) this.start(g.def);
          break;
        }
      }
      return;
    }
    const s = this.current();
    if (this.time != null) {
      this.time -= dt; UI.timer(this.time);
      if (this.time <= 0) { this.fail('נגמר הזמן'); return; }
    }
    if (s.type === 'goto') {
      const inCar = Player.mode === 'car';
      if (s.needCar && !inCar) UI.objective('חזור לרכב כדי להמשיך');
      else if (s.clean && Wanted.level > 0) UI.objective('קודם תתנער מהמשטרה');
      else UI.objective(s.text);
      if (Math.hypot(P.x - s.x, P.z - s.z) < s.r && (!s.needCar || inCar) && (!s.clean || Wanted.level === 0)) this.advance();
    } else if (s.type === 'lose') {
      UI.objective(s.text);
      if (Wanted.level === 0) this.advance();
    }
  },
};

/* ---------------- pickups ---------------- */
const Pickups = {
  list: [],
  init() {
    const cashMat = new THREE.MeshStandardMaterial({ color: 0xffc247, emissive: 0xffa000, emissiveIntensity: 0.55, metalness: 0.6, roughness: 0.35 });
    const bandMat = new THREE.MeshStandardMaterial({ color: 0x2c6e3f, roughness: 0.6 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f6, emissive: 0xffffff, emissiveIntensity: 0.25 });
    const redMat = new THREE.MeshStandardMaterial({ color: 0xff2a3a, emissive: 0xff2a3a, emissiveIntensity: 0.8 });
    const make = type => {
      const g = new THREE.Group();
      if (type === 'cash') {
        const a = new THREE.Mesh(UNIT_BOX, cashMat); a.scale.set(0.62, 0.3, 0.36); g.add(a);
        const b = new THREE.Mesh(UNIT_BOX, bandMat); b.scale.set(0.16, 0.32, 0.38); g.add(b);
      } else {
        const a = new THREE.Mesh(UNIT_BOX, whiteMat); a.scale.set(0.6, 0.6, 0.6); g.add(a);
        const c1 = new THREE.Mesh(UNIT_BOX, redMat); c1.scale.set(0.62, 0.16, 0.62 * 0.35); g.add(c1);
        const c2 = new THREE.Mesh(UNIT_BOX, redMat); c2.scale.set(0.62 * 0.35, 0.16, 0.62); g.add(c2);
        c1.position.y = c2.position.y = 0.31;
      }
      const glow = new THREE.Mesh(UNIT_PLANE, new THREE.MeshBasicMaterial({ map: World.tex.glow, color: type === 'cash' ? 0xffc247 : 0xff5060, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.scale.set(3, 3, 1); glow.position.y = -0.85; g.add(glow);
      World.scene.add(g);
      return g;
    };
    for (let k = 0; k < 26; k++) this.list.push(this.place({ type: 'cash', mesh: make('cash') }));
    for (let k = 0; k < 7; k++) this.list.push(this.place({ type: 'health', mesh: make('health') }));
  },
  place(p) {
    const b = pick(World.blocks), side = randInt(0, 3), u = rand(6, CITY.BLOCK - 6), o = 2;
    const [x, z] = side === 0 ? [b.x0 + u, b.z0 + o] : side === 1 ? [b.x0 + u, b.z0 + CITY.BLOCK - o] : side === 2 ? [b.x0 + o, b.z0 + u] : [b.x0 + CITY.BLOCK - o, b.z0 + u];
    p.x = x; p.z = z; p.cool = 0; p.t = Math.random() * 6;
    p.amount = p.type === 'cash' ? pick([100, 150, 250, 400, 600]) : 40;
    p.mesh.position.set(x, 1.15, z); p.mesh.visible = true;
    return p;
  },
  update(dt) {
    const P = Player.focus(), r = Player.mode === 'car' ? 3.4 : 1.6;
    for (const p of this.list) {
      if (p.cool > 0) { p.cool -= dt; if (p.cool <= 0) this.place(p); continue; }
      p.t += dt; p.mesh.rotation.y += dt * 1.8; p.mesh.position.y = 1.15 + Math.sin(p.t * 2.4) * 0.15;
      if (Math.abs(P.x - p.x) < r && Math.abs(P.z - p.z) < r && !Player.dead) {
        if (p.type === 'health' && Player.health >= 100) continue;
        p.mesh.visible = false; p.cool = 50;
        if (p.type === 'cash') { Game.addMoney(p.amount); Sound.pickup(); }
        else { Player.health = Math.min(100, Player.health + p.amount); Sound.pickup(); UI.toast('בריאות', `${ltr('+' + p.amount)} נקודות`, 'ok'); }
      }
    }
  },
};
