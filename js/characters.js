'use strict';
/* =========================================================
   Characters — box-rig humans with procedural walk cycle
   ========================================================= */

const CharMats = {};
const lam = hex => CharMats[hex] || (CharMats[hex] = new THREE.MeshLambertMaterial({ color: hex }));
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x6b4423, 0xd9a066];
const SHIRT = [0xe63946, 0x457b9d, 0xf1faee, 0x2a9d8f, 0xe9c46a, 0x264653, 0x6d597a, 0xff8c42, 0x1b1b1b, 0x9bc1bc, 0xd62828];
const PANTS = [0x1d3557, 0x2b2d42, 0x3d405b, 0x5c4033, 0x6c757d, 0x222222, 0xa68a64];
const HAIR = [0x1b1b1b, 0x3b2a1a, 0x6a4b2a, 0xc9a26b, 0x9a9a9a, 0x7a2e12];

class Character {
  constructor(o = {}) {
    const g = (this.root = new THREE.Group());
    g.rotation.order = 'YXZ';
    const skin = lam(o.skin != null ? o.skin : pick(SKIN)), shirt = lam(o.shirt != null ? o.shirt : pick(SHIRT));
    const pants = lam(o.pants != null ? o.pants : pick(PANTS)), hair = lam(o.hair != null ? o.hair : pick(HAIR)), shoe = lam(0x1a1a1a);
    this.body = new THREE.Group(); g.add(this.body);
    const P = (mat, w, h, d, x, y, z, parent) => { const m = new THREE.Mesh(UNIT_BOX, mat); m.scale.set(w, h, d); m.position.set(x, y, z); parent.add(m); return m; };
    const torso = P(shirt, 0.46, 0.62, 0.26, 0, 1.24, 0, this.body); torso.castShadow = !!o.shadow;
    P(skin, 0.25, 0.27, 0.26, 0, 1.73, 0, this.body);
    P(hair, 0.27, 0.09, 0.28, 0, 1.89, -0.01, this.body);
    const limb = (x, y, mat, len, w, foot) => {
      const pivot = new THREE.Group(); pivot.position.set(x, y, 0); this.body.add(pivot);
      P(mat, w, len, w, 0, -len / 2, 0, pivot);
      if (foot) P(shoe, w, 0.08, 0.27, 0, -len + 0.03, 0.05, pivot);
      return pivot;
    };
    this.armL = limb(0.3, 1.52, shirt, 0.62, 0.12);
    this.armR = limb(-0.3, 1.52, shirt, 0.62, 0.12);
    this.legL = limb(0.12, 0.93, pants, 0.9, 0.17, true);
    this.legR = limb(-0.12, 0.93, pants, 0.9, 0.17, true);
    const blob = new THREE.Mesh(UNIT_PLANE, World.blobMat);
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.02; blob.scale.set(0.95, 0.95, 1); g.add(blob);
    this.phase = Math.random() * 10; this.fall = 0; this.down = false; this.punchT = 0;
    World.scene.add(g);
  }
  animate(dt, speed, running) {
    if (this.down) { this.fall = Math.min(1, this.fall + dt * 4); this.root.rotation.x = -Math.PI / 2 * (1 - Math.pow(1 - this.fall, 3)); return; }
    this.phase += dt * speed * 3.4;
    const amp = Math.min(1, speed / 3) * (running ? 1 : 0.62), s = Math.sin(this.phase);
    this.legL.rotation.x = s * amp; this.legR.rotation.x = -s * amp;
    this.armL.rotation.x = -s * amp * 0.85; this.armR.rotation.x = s * amp * 0.85;
    if (this.punchT > 0) { this.punchT -= dt; this.armR.rotation.x = -1.5 * Math.sin((1 - this.punchT / 0.3) * Math.PI); }
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.06 * amp;
    this.body.rotation.x = running ? 0.14 : 0.02 * amp;
  }
  knockDown() { this.down = true; this.fall = 0; }
  stand() { this.down = false; this.fall = 0; this.root.rotation.x = 0; }
}

/* ---------------- Player ---------------- */
const Player = {
  ch: null, pos: null, vel: new THREE.Vector2(), facing: 0, vy: 0, y: 0.25,
  health: 100, mode: 'foot', vehicle: null, dead: false, invuln: 0,

  async init() {
    this.ch = new Character({ skin: 0xd6a07c, shirt: 0xeeeeea, pants: 0x27364f, hair: 0x15110e, shadow: true });
    this.pos = this.ch.root.position;
    try {
      await loadPlayerModel(this.ch);
    } catch (error) {
      console.warn('Player model could not load; using the original character.', error);
      UI.toast('Character model unavailable', 'Using the original character. Refresh to retry.', 'info');
    }
  },
  focus() { return this.mode === 'car' && this.vehicle ? this.vehicle.pos : this.pos; },
  focusVel() { return this.mode === 'car' && this.vehicle ? this.vehicle.vel : this.vel; },
  speedNow() { return this.mode === 'car' && this.vehicle ? this.vehicle.speed : this.vel.length(); },

  updateFoot(dt, inp, camYaw) {
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw), rx = -fz, rz = fx;
    let mx = 0, mz = 0;
    if (inp.fwd) { mx += fx; mz += fz; }
    if (inp.back) { mx -= fx; mz -= fz; }
    if (inp.right) { mx += rx; mz += rz; }
    if (inp.left) { mx -= rx; mz -= rz; }
    const len = Math.hypot(mx, mz), ground = World.sidewalkAt(this.pos.x, this.pos.z) ? 0.25 : 0;
    const airborne = this.y > ground + 0.02;
    const target = len > 0 ? (inp.sprint ? 7.2 : 3.4) : 0;
    if (len > 0) { mx /= len; mz /= len; this.facing = dampAngle(this.facing, Math.atan2(mx, mz), 12, dt); }
    const k = airborne ? 1.5 : 11;
    this.vel.x = damp(this.vel.x, mx * target, k, dt);
    this.vel.y = damp(this.vel.y, mz * target, k, dt);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.y * dt;
    if (inp.jump && !airborne) this.vy = 6.2;
    this.vy -= 20 * dt; this.y += this.vy * dt;
    if (this.y <= ground) { this.y = ground; this.vy = 0; }
    World.resolveCircle(this.pos, 0.38);
    this.pos.x = clamp(this.pos.x, -CITY.BOUND, CITY.BOUND); this.pos.z = clamp(this.pos.z, -CITY.BOUND, CITY.BOUND);
    this.pos.y = this.y;
    this.ch.root.rotation.y = this.facing;
    const sp = this.vel.length();
    this.ch.animate(dt, sp, inp.sprint && sp > 4);
    if (this.invuln > 0) this.invuln -= dt;
  },

  punch() {
    if (this.ch.punchT > 0) return;
    this.ch.punchT = 0.3;
    const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
    for (const p of Peds.list) {
      if (p.state === 'down') continue;
      const q = p.ch.root.position, dx = q.x - this.pos.x, dz = q.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 1.7 && (dx * fx + dz * fz) / (d || 1) > 0.45) {
        p.hit(dx / (d || 1), dz / (d || 1), 4);
        Sound.punch(); Wanted.crime(1, true); Peds.scareAround(q.x, q.z, 16);
        return;
      }
    }
  },

  enter(v) {
    this.mode = 'car'; this.vehicle = v;
    this.ch.root.visible = false;
    v.driver = 'player'; v.ai = null; v.siren = false; v.parked = false;
  },
  exit() {
    const v = this.vehicle; if (!v) return;
    const f = v.fwd(), fast = v.speed > 9;
    // driver's door is on the left (traffic drives on the right)
    this.pos.set(v.pos.x + f.z * (v.halfW + 0.9), 0.25, v.pos.z - f.x * (v.halfW + 0.9));
    World.resolveCircle(this.pos, 0.4);
    this.y = World.sidewalkAt(this.pos.x, this.pos.z) ? 0.25 : 0;
    this.facing = v.heading;
    this.vel.set(v.vel.x * (fast ? 0.35 : 0), v.vel.y * (fast ? 0.35 : 0));
    v.driver = null; v.input.throttle = 0; v.input.brake = 0; v.input.handbrake = !fast; v.input.steer = 0;
    this.mode = 'foot'; this.vehicle = null;
    this.ch.root.visible = true; this.ch.stand();
    if (fast) this.takeDamage(8, true);
    Sound.setHorn(false);
    return v;
  },
  takeDamage(n, force) {
    if (this.dead || (this.invuln > 0 && !force)) return;
    this.health = Math.max(0, this.health - n);
    UI.hurt(n);
    if (this.health <= 0) Game.wasted();
  },
};

/* ---------------- Pedestrians ---------------- */
class Ped {
  constructor(fx, fz) {
    this.ch = new Character();
    this.respawn(fx, fz, false);
  }
  respawn(fx, fz, far) {
    let b = null;
    for (let t = 0; t < 30 && !b; t++) {
      const c = pick(World.blocks), d = Math.hypot(c.cx - fx, c.cz - fz);
      if (d > (far ? 75 : 0) && d < 210) b = c;
    }
    this.block = b || pick(World.blocks);
    this.inset = rand(1.3, 2.9);
    this.side = CITY.BLOCK - this.inset * 2;
    this.s = rand(0, this.side * 4);
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.speed = rand(1.15, 1.75);
    this.state = 'walk'; this.t = 0; this.pause = 0;
    this.ch.stand(); this.ch.root.visible = true;
    const [x, z] = this.perim(this.s);
    this.ch.root.position.set(x, 0.25, z);
  }
  perim(s) {
    const S = this.side, P = S * 4, b = this.block;
    s = ((s % P) + P) % P;
    const side = Math.floor(s / S), u = s - side * S, x0 = b.x0 + this.inset, z0 = b.z0 + this.inset;
    if (side === 0) return [x0 + u, z0, 0];
    if (side === 1) return [x0 + S, z0 + u, 1];
    if (side === 2) return [x0 + S - u, z0 + S, 2];
    return [x0, z0 + S - u, 3];
  }
  update(dt, fx, fz) {
    const p = this.ch.root.position, r = this.ch.root;
    if (this.state === 'walk') {
      if (this.pause > 0) { this.pause -= dt; this.ch.animate(dt, 0); }
      else {
        this.s += this.dir * this.speed * dt;
        const [x, z, side] = this.perim(this.s);
        p.set(x, 0.25, z);
        let a = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][side];
        if (this.dir < 0) a += Math.PI;
        r.rotation.y = dampAngle(r.rotation.y, a, 8, dt);
        this.ch.animate(dt, this.speed);
        if (Math.random() < dt * 0.025) this.pause = rand(1, 4);
      }
    } else if (this.state === 'flee' || this.state === 'gone') {
      const sp = this.state === 'flee' ? 5.6 : 1.5;
      p.x += this.fx * sp * dt; p.z += this.fz * sp * dt;
      const hit = World.resolveCircle(p, 0.4);
      if (hit && hit.pen > 0.02) { const s = Math.random() < 0.5 ? 1 : -1, ox = this.fx; this.fx = -this.fz * s; this.fz = ox * s; }
      p.x = clamp(p.x, -CITY.BOUND, CITY.BOUND); p.z = clamp(p.z, -CITY.BOUND, CITY.BOUND);
      p.y = World.sidewalkAt(p.x, p.z) ? 0.25 : 0;
      r.rotation.y = dampAngle(r.rotation.y, Math.atan2(this.fx, this.fz), 10, dt);
      this.ch.animate(dt, sp, this.state === 'flee');
      this.t -= dt;
      if (this.t <= 0 && this.state === 'flee') { this.state = 'gone'; this.t = 20; }
    } else if (this.state === 'down') {
      this.ch.animate(dt, 0); this.t -= dt;
    }
    const d = Math.hypot(p.x - fx, p.z - fz);
    if (d > 225 || (d > 70 && ((this.state === 'gone') || (this.state === 'down' && this.t < 0)))) this.respawn(fx, fz, true);
  }
  scare(x, z) {
    if (this.state !== 'walk' && this.state !== 'gone') return;
    const p = this.ch.root.position, dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz) || 1;
    this.fx = dx / d; this.fz = dz / d; this.state = 'flee'; this.t = rand(4, 7);
  }
  hit(dx, dz, force) {
    if (this.state === 'down') return false;
    this.state = 'down'; this.t = 8;
    const p = this.ch.root.position;
    this.ch.root.rotation.y = Math.atan2(-dx, -dz);
    this.ch.knockDown();
    p.x += dx * Math.min(force, 20) * 0.12; p.z += dz * Math.min(force, 20) * 0.12;
    World.resolveCircle(p, 0.4);
    Sound.thud();
    return true;
  }
}

const Peds = {
  list: [], target: 36,
  init(n, fx, fz) { for (let i = 0; i < n; i++) this.list.push(new Ped(fx, fz)); this.target = n; },
  setTarget(n, fx, fz) {
    this.target = n;
    while (this.list.length < n) this.list.push(new Ped(fx, fz));
    while (this.list.length > n) { const p = this.list.pop(); World.scene.remove(p.ch.root); }
  },
  update(dt, fx, fz) {
    for (const p of this.list) p.update(dt, fx, fz);
    if (Wanted.level > 0 && Math.random() < dt * 2) this.scareAround(fx, fz, 14);
  },
  scareAround(x, z, r) {
    for (const p of this.list) { const q = p.ch.root.position; if (Math.hypot(q.x - x, q.z - z) < r) p.scare(x, z); }
  },
  /** pull the furthest ped and place them at (x,z) fleeing — used for carjacked drivers */
  eject(x, z, fromX, fromZ) {
    let best = null, bd = -1;
    for (const p of this.list) { const q = p.ch.root.position, d = Math.hypot(q.x - fromX, q.z - fromZ); if (d > bd) { bd = d; best = p; } }
    if (!best) return;
    best.ch.stand(); best.ch.root.visible = true;
    best.ch.root.position.set(x, 0, z);
    best.state = 'walk'; best.scare(fromX, fromZ);
  },
};
