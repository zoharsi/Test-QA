'use strict';
/* =========================================================
   AI — civilian traffic, parked cars, police, helicopter
   ========================================================= */

class TrafficDriver {
  constructor(v, a, b) {
    this.v = v; this.a = a; this.b = b; this.next = null;
    this.cruise = rand(10, 14.5); this.stuck = 0; this.bumped = 0; this.honkT = 0;
    v.ai = this; v.driver = 'npc'; v.parked = false;
  }
  /** attach a driver to whatever road segment the car is on, in the direction it faces */
  static attach(v) {
    const f = v.fwd(), alongX = Math.abs(f.x) > Math.abs(f.z), G = CITY.GRID;
    const gi = (v.pos.x + CITY.HALF) / CITY.CELL, gj = (v.pos.z + CITY.HALF) / CITY.CELL;
    let a, b;
    if (alongX) {
      const j = clamp(Math.round(gj), 0, G), i = clamp(Math.floor(gi), 0, G - 1);
      a = f.x > 0 ? [i, j] : [i + 1, j]; b = f.x > 0 ? [i + 1, j] : [i, j];
    } else {
      const i = clamp(Math.round(gi), 0, G), j = clamp(Math.floor(gj), 0, G - 1);
      a = f.z > 0 ? [i, j] : [i, j + 1]; b = f.z > 0 ? [i, j + 1] : [i, j];
    }
    return new TrafficDriver(v, a, b);
  }
  chooseNext() {
    const opts = World.neighbors(this.b[0], this.b[1]).filter(n => !(n[0] === this.a[0] && n[1] === this.a[1]));
    const sx = this.b[0] - this.a[0], sz = this.b[1] - this.a[1];
    const straight = opts.find(n => n[0] - this.b[0] === sx && n[1] - this.b[1] === sz);
    return straight && Math.random() < 0.55 ? straight : pick(opts);
  }
  update(dt) {
    const v = this.v, inp = v.input;
    if (v.dead || v.burning) { inp.throttle = 0; inp.brake = 0; inp.handbrake = true; inp.steer = 0; return; }
    const H = CITY.ROAD / 2;
    let ax, az, L, dx, dz, t;
    for (let guard = 0; guard < 3; guard++) {
      ax = nodeCoord(this.a[0]); az = nodeCoord(this.a[1]);
      const bx = nodeCoord(this.b[0]), bz = nodeCoord(this.b[1]);
      L = Math.hypot(bx - ax, bz - az); dx = (bx - ax) / L; dz = (bz - az) / L;
      t = (v.pos.x - ax) * dx + (v.pos.z - az) * dz;
      if (t > L - H + 1) { this.a = this.b; this.b = this.next || this.chooseNext(); this.next = null; }
      else break;
    }
    const rx = -dz, rz = dx;
    if (!this.next && t > L - H - 24) this.next = this.chooseNext();

    let desired = this.cruise;
    if (this.next) {
      const turning = (this.next[0] - this.b[0]) !== Math.round(dx) || (this.next[1] - this.b[1]) !== Math.round(dz);
      if (turning && t > L - H - 22) desired = Math.min(desired, 6.5);
    }
    // traffic lights
    const stopT = L - H - 2.6;
    if (t < stopT + 0.5 && t > stopT - 32) {
      const s = World.signalState(Math.abs(dx) > 0.5 ? 'x' : 'z');
      if (s === 'r' || (s === 'y' && stopT - t > 9)) desired = Math.min(desired, Math.max(0, stopT - t - 0.5) * 0.85);
    }
    // obstacles ahead
    const f = v.fwd();
    for (const o of Vehicles.all) {
      if (o === v) continue;
      const ox = o.pos.x - v.pos.x, oz = o.pos.z - v.pos.z;
      if (ox * ox + oz * oz > 420) continue;
      const ahead = ox * f.x + oz * f.z, lat = Math.abs(ox * f.z - oz * f.x);
      if (ahead > 0 && ahead < 19 && lat < 2.6) desired = Math.min(desired, Math.max(0, (ahead - 6.5) * 0.8));
    }
    if (Player.mode === 'foot' && !Player.dead) {
      const ox = Player.pos.x - v.pos.x, oz = Player.pos.z - v.pos.z, ahead = ox * f.x + oz * f.z, lat = Math.abs(ox * f.z - oz * f.x);
      if (ahead > 0 && ahead < 13 && lat < 1.9) {
        desired = 0;
        this.honkT -= dt;
        if (this.honkT <= 0 && ahead < 9) { this.honkT = rand(2, 4); if (Math.hypot(ox, oz) < 25) Sound.tone(420, 0.35, 'square', 0.035); }
      }
    }
    // steer toward a lookahead point on our lane
    const la = t + 9, tx = ax + dx * la + rx * CITY.LANE, tz = az + dz * la + rz * CITY.LANE;
    const ad = angleDiff(v.heading, Math.atan2(tx - v.pos.x, tz - v.pos.z));
    inp.steer = clamp(ad * 2.5, -1, 1);
    if (Math.abs(ad) > 0.35) desired = Math.min(desired, 7);
    if (this.bumped > 0) { this.bumped -= dt; desired = 0; }

    const sp = v.vF;
    inp.throttle = sp < desired - 0.3 ? clamp((desired - sp) * 0.35, 0.2, 1) : 0;
    inp.brake = sp > desired + 1 && sp > 0.6 ? clamp((sp - desired) * 0.25, 0.2, 1) : 0;
    inp.handbrake = desired < 0.3 && sp < 0.9;
    if (desired > 3 && Math.abs(sp) < 0.5) this.stuck += dt; else this.stuck = 0;
  }
}

const Traffic = {
  target: 30, parkedTarget: 12,
  update(dt, fx, fz) {
    let moving = 0, parked = 0;
    for (let k = Vehicles.all.length - 1; k >= 0; k--) {
      const v = Vehicles.all[k];
      if (v === Player.vehicle) continue;
      const d = Math.hypot(v.pos.x - fx, v.pos.z - fz);
      const traffic = v.ai instanceof TrafficDriver, keep = v === Game.lastCar && d < 600;
      if (!keep && ((d > 285 && !(v.ai instanceof PoliceDriver)) || (d > 420) || (traffic && v.ai.stuck > 9 && d > 45) || (v.dead && d > 130))) { Vehicles.remove(v); continue; }
      if (traffic) moving++;
      else if (v.parked) parked++;
    }
    for (let tries = 3; tries > 0 && moving < this.target; tries--) if (this.spawn(fx, fz, false)) moving++;
    if (parked < this.parkedTarget && Math.random() < 0.2) this.spawnParked(fx, fz, false);
    for (let k = 0; k < Vehicles.all.length; k++) { const v = Vehicles.all[k]; if (v.ai) v.ai.update(dt); }
  },
  visible(x, z) {
    const c = Game.camera, dx = x - c.position.x, dz = z - c.position.z, d = Math.hypot(dx, dz);
    c.getWorldDirection(Game._tmpV);
    return d < 170 && (dx * Game._tmpV.x + dz * Game._tmpV.z) / (d || 1) > 0.25;
  },
  randomSegment(fx, fz, minD, maxD) {
    const i = randInt(0, CITY.GRID), j = randInt(0, CITY.GRID), nb = pick(World.neighbors(i, j));
    const ax = nodeCoord(i), az = nodeCoord(j), dx = Math.sign(nb[0] - i), dz = Math.sign(nb[1] - j);
    const t = rand(16, CITY.CELL - 22), mx = ax + dx * t, mz = az + dz * t, d = Math.hypot(mx - fx, mz - fz);
    if (d < minD || d > maxD) return null;
    return { a: [i, j], b: nb, ax, az, dx, dz, t, rx: -dz, rz: dx };
  },
  spawn(fx, fz, initial) {
    const s = this.randomSegment(fx, fz, initial ? 30 : 95, 245);
    if (!s) return false;
    const x = s.ax + s.dx * s.t + s.rx * CITY.LANE, z = s.az + s.dz * s.t + s.rz * CITY.LANE;
    if (!initial && this.visible(x, z)) return false;
    for (const o of Vehicles.all) if (Math.abs(o.pos.x - x) < 12 && Math.abs(o.pos.z - z) < 12) return false;
    const type = Math.random() < 0.05 ? 'police' : pick(TRAFFIC_MIX);
    const v = new Vehicle(type, x, z, Math.atan2(s.dx, s.dz));
    v.vel.set(s.dx * 9, s.dz * 9);
    new TrafficDriver(v, s.a, s.b);
    return true;
  },
  spawnParked(fx, fz, initial) {
    const s = this.randomSegment(fx, fz, initial ? 20 : 140, initial ? 220 : 300);
    if (!s) return null;
    const off = CITY.ROAD / 2 - 1.45, x = s.ax + s.dx * s.t + s.rx * off, z = s.az + s.dz * s.t + s.rz * off;
    if (!initial && this.visible(x, z)) return null;
    for (const o of Vehicles.all) if (Math.abs(o.pos.x - x) < 9 && Math.abs(o.pos.z - z) < 9) return null;
    const v = new Vehicle(pick(['sedan', 'sedan', 'suv', 'sports', 'sports', 'van']), x, z, Math.atan2(s.dx, s.dz));
    v.parked = true; v.input.handbrake = true;
    return v;
  },
};

/* ---------------- Police ---------------- */
class PoliceDriver {
  constructor(v) {
    this.v = v; v.ai = this; v.driver = 'police'; v.siren = true; v.parked = false;
    this.node = null; this.prev = null; this.losT = 0; this.los = false; this.stuck = 0; this.rev = 0;
    this.shoot = rand(1, 2); this.dist = 999;
  }
  update(dt) {
    const v = this.v, inp = v.input;
    if (v.dead || v.burning) { inp.throttle = 0; inp.brake = 0; inp.handbrake = true; return; }
    if (Wanted.level === 0) { v.siren = false; TrafficDriver.attach(v); return; }
    const P = Player.focus(), PV = Player.focusVel();
    const dx = P.x - v.pos.x, dz = P.z - v.pos.z, dist = Math.hypot(dx, dz);
    this.dist = dist;
    this.losT -= dt;
    if (this.losT <= 0) { this.losT = 0.3; this.los = !Player.dead && dist < 110 && World.lineOfSight(v.pos.x, v.pos.z, P.x, P.z); }

    let tx, tz;
    if (this.los) {
      const lead = Math.min(1.1, dist / 30);
      tx = P.x + PV.x * lead; tz = P.z + PV.y * lead; this.node = null;
    } else {
      const goal = Wanted.lastSeen;
      if (!this.node || Math.hypot(nodeCoord(this.node[0]) - v.pos.x, nodeCoord(this.node[1]) - v.pos.z) < 10) this.pickNode(goal);
      tx = nodeCoord(this.node[0]); tz = nodeCoord(this.node[1]);
    }
    const ad = angleDiff(v.heading, Math.atan2(tx - v.pos.x, tz - v.pos.z));
    let desired = v.spec.maxSpeed * (1 - Math.min(1, Math.abs(ad) / 1.4) * 0.72);
    const pSlow = Player.speedNow() < 2.2;
    if (this.los) desired = Math.min(desired, Player.speedNow() + 6 + dist * 0.8);
    if (this.los && dist < 12) desired = pSlow ? Math.max(0, (dist - 6) * 1.2) : Math.max(Player.speedNow() + 3, 6);
    if (Player.mode === 'foot' && dist < 16) desired = Math.min(desired, dist < 7 ? 0 : 5);
    if (pSlow && dist < 7.5) desired = 0;

    if (this.rev > 0) {
      this.rev -= dt; inp.throttle = 0; inp.brake = 1; inp.handbrake = false; inp.steer = -Math.sign(ad || 1);
      return;
    }
    inp.steer = clamp(ad * 2.8, -1, 1);
    const sp = v.vF;
    inp.throttle = sp < desired ? 1 : 0;
    inp.brake = sp > desired + 2 && sp > 0.6 ? 0.7 : 0;
    inp.handbrake = Math.abs(ad) > 1.2 && sp > 12;
    if (desired < 0.5 && sp < 1) { inp.throttle = 0; inp.brake = 0; inp.handbrake = true; }
    if (desired > 3 && Math.abs(sp) < 1.2 && inp.throttle > 0) {
      this.stuck += dt;
      if (this.stuck > 1.3) { this.rev = 1.1; this.stuck = 0; this.node = null; }
    } else this.stuck = Math.max(0, this.stuck - dt);

    if (Wanted.level >= 3 && this.los && dist < 40 && !Player.dead) {
      this.shoot -= dt;
      if (this.shoot <= 0) { this.shoot = rand(0.6, 1.3); Game.policeShot(v, dist); }
    }
  }
  pickNode(goal) {
    const v = this.v, f = v.fwd(), ends = World.segmentEnds(v.pos.x, v.pos.z);
    const cur = World.nearestNode(v.pos.x, v.pos.z);
    const dCur = Math.hypot(nodeCoord(cur[0]) - v.pos.x, nodeCoord(cur[1]) - v.pos.z);
    const cands = dCur > 12 ? ends : World.neighbors(cur[0], cur[1]).filter(n => !this.prev || n[0] !== this.prev[0] || n[1] !== this.prev[1]);
    let best = cands[0], bs = 1e9;
    for (const n of cands) {
      const nx = nodeCoord(n[0]), nz = nodeCoord(n[1]);
      let s = Math.hypot(nx - goal.x, nz - goal.z);
      if ((nx - v.pos.x) * f.x + (nz - v.pos.z) * f.z < -5) s += 40;
      if (s < bs) { bs = s; best = n; }
    }
    if (dCur <= 12) this.prev = cur;
    this.node = best;
  }
}

/* ---------------- Wanted / heat ---------------- */
const Wanted = {
  level: 0, points: 0, evade: 0, need: 10, seen: false, spawnT: 0,
  lastSeen: { x: 0, z: 0 },
  thresholds: [0, 1, 5, 12, 22, 35],
  policeNear(r) {
    const P = Player.focus();
    return Vehicles.all.some(v => v.type === 'police' && v.driver !== 'player' && !v.dead && Math.hypot(v.pos.x - P.x, v.pos.z - P.z) < r);
  },
  crime(pts, needWitness) {
    if (Game.state !== 'playing' || Player.dead) return;
    if (needWitness && this.level === 0 && !this.policeNear(75) && Math.random() > 0.35) return;
    this.points += pts;
    let L = 0;
    for (let k = 1; k <= 5; k++) if (this.points >= this.thresholds[k]) L = k;
    if (L > this.level) this.raise(L);
    else if (this.level > 0) this.evade = 0;
  },
  setLevel(L) { if (L > this.level) { this.points = Math.max(this.points, this.thresholds[L]); this.raise(L); } },
  raise(L) {
    const first = this.level === 0;
    this.level = L; this.evade = 0;
    const P = Player.focus(); this.lastSeen.x = P.x; this.lastSeen.z = P.z;
    Sound.heat(); UI.heatPulse();
    if (first) UI.toast('Police incoming', 'Get out of their line of sight to drop off the radar.', 'heat');
    for (const v of Vehicles.all) {
      if (v.type === 'police' && v.ai instanceof TrafficDriver && Math.hypot(v.pos.x - P.x, v.pos.z - P.z) < 220) new PoliceDriver(v);
    }
  },
  clear(silent) {
    const had = this.level > 0;
    this.level = 0; this.points = 0; this.evade = 0;
    if (had && !silent) { UI.toast('You lost the cops', 'Wanted level cleared.', 'ok'); Sound.pickup(); }
  },
  update(dt) {
    if (this.level === 0) return;
    const P = Player.focus();
    let seen = false, count = 0;
    for (const v of Vehicles.all) if (v.ai instanceof PoliceDriver && !v.dead) { count++; if (v.ai.los && v.ai.dist < 100) seen = true; }
    if (Heli.active && Heli.sees) seen = true;
    this.seen = seen;
    if (seen) { this.evade = 0; this.lastSeen.x = P.x; this.lastSeen.z = P.z; }
    else {
      this.evade += dt;
      // the search area slowly drifts toward the player
      this.lastSeen.x = damp(this.lastSeen.x, P.x, 0.08, dt); this.lastSeen.z = damp(this.lastSeen.z, P.z, 0.08, dt);
    }
    this.need = 7 + this.level * 3.5;
    if (this.evade >= this.need) { this.clear(); return; }
    const want = [0, 2, 3, 4, 6, 8][this.level];
    this.spawnT -= dt;
    if (count < want && this.spawnT <= 0) { this.spawnT = 2.2; this.spawnPolice(P); }
  },
  spawnPolice(P) {
    for (let t = 0; t < 14; t++) {
      const i = randInt(0, CITY.GRID), j = randInt(0, CITY.GRID), x = nodeCoord(i), z = nodeCoord(j);
      const d = Math.hypot(x - P.x, z - P.z);
      if (d < 95 || d > 185) continue;
      if (Vehicles.all.some(o => Math.abs(o.pos.x - x) < 9 && Math.abs(o.pos.z - z) < 9)) continue;
      const v = new Vehicle('police', x, z, Math.atan2(P.x - x, P.z - z));
      new PoliceDriver(v);
      return v;
    }
    return null;
  },
};

/* ---------------- Helicopter (heat 4+) ---------------- */
const Heli = {
  active: false, sees: false, ang: 0, leaveT: 0,
  pos: new THREE.Vector3(0, 80, 0), vel: new THREE.Vector3(),
  build() {
    const g = (this.mesh = new THREE.Group()), S = World.scene;
    g.rotation.order = 'YXZ';
    const dark = new THREE.MeshStandardMaterial({ color: 0x1b2433, metalness: 0.5, roughness: 0.45 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe9eef2, metalness: 0.3, roughness: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0c131b, metalness: 0.9, roughness: 0.1 });
    const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m; };
    add(new THREE.SphereGeometry(1, 16, 12), dark, 0, 0, 0, 1.5, 1.4, 2.7);
    add(new THREE.SphereGeometry(1, 16, 12), glass, 0, 0.25, 1.4, 1.2, 1.0, 1.5);
    add(UNIT_BOX, white, 0, 0.1, -4, 0.38, 0.4, 5);
    add(UNIT_BOX, dark, 0, 0.9, -6.3, 0.12, 1.6, 0.9);
    for (const sx of [1.1, -1.1]) add(UNIT_BOX, dark, sx, -1.55, 0, 0.12, 0.12, 3.6);
    this.rotor = new THREE.Group(); this.rotor.position.y = 1.55; g.add(this.rotor);
    add(UNIT_BOX, dark, 0, 0, 0, 0.35, 0.05, 11.5, this.rotor);
    add(UNIT_BOX, dark, 0, 0, 0, 11.5, 0.05, 0.35, this.rotor);
    this.tail = new THREE.Group(); this.tail.position.set(0.25, 0.9, -6.3); g.add(this.tail);
    add(UNIT_BOX, dark, 0, 0, 0, 0.05, 2.2, 0.2, this.tail);
    g.visible = false; S.add(g);

    const coneGeo = new THREE.ConeGeometry(1, 1, 24, 1, true); coneGeo.translate(0, -0.5, 0);
    this.beam = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.visible = false; S.add(this.beam);
    this.spot = new THREE.Mesh(UNIT_PLANE, new THREE.MeshBasicMaterial({ map: World.tex.glow, color: 0xdfe8ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.spot.rotation.x = -Math.PI / 2; this.spot.scale.set(16, 16, 1); this.spot.visible = false; S.add(this.spot);
    this._d = new THREE.Vector3(); this._up = new THREE.Vector3(0, -1, 0);
  },
  reset() { this.active = false; this.mesh.visible = this.beam.visible = this.spot.visible = false; Sound.setHeli(0); },
  update(dt) {
    const want = Wanted.level >= 4 && Game.state === 'playing';
    const P = Player.focus();
    if (want && !this.active) {
      const a = Math.random() * Math.PI * 2;
      this.pos.set(P.x + Math.cos(a) * 320, 85, P.z + Math.sin(a) * 320); this.vel.set(0, 0, 0);
      this.active = true; this.leaveT = 0; this.mesh.visible = true;
      UI.toast('Police chopper overhead', 'Its spotlight marks you for the cops.', 'heat');
    }
    if (!this.active) return;
    let tx, tz, ty;
    if (want) { this.leaveT = 0; this.ang += dt * 0.25; tx = P.x + Math.cos(this.ang) * 28; tz = P.z + Math.sin(this.ang) * 28; ty = 48; }
    else { this.leaveT += dt; tx = this.pos.x + (this.pos.x - P.x); tz = this.pos.z + (this.pos.z - P.z); ty = 140; if (this.leaveT > 14) { this.reset(); return; } }
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz) || 1, sp = Math.min(30, d * 0.8);
    this.vel.x = damp(this.vel.x, dx / d * sp, 1.4, dt); this.vel.z = damp(this.vel.z, dz / d * sp, 1.4, dt);
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.pos.y = damp(this.pos.y, ty, 0.8, dt);
    const m = this.mesh, hs = Math.hypot(this.vel.x, this.vel.z);
    m.position.copy(this.pos);
    if (hs > 1) m.rotation.y = dampAngle(m.rotation.y, Math.atan2(this.vel.x, this.vel.z), 2, dt);
    m.rotation.x = Math.min(0.3, hs * 0.012);
    this.rotor.rotation.y += dt * 38; this.tail.rotation.x += dt * 50;
    const hd = Math.hypot(P.x - this.pos.x, P.z - this.pos.z);
    this.sees = want && hd < 75 && !Player.dead;
    const aimX = this.sees ? P.x : this.pos.x, aimZ = this.sees ? P.z : this.pos.z;
    const b = this.beam, dir = this._d.set(aimX - this.pos.x, 0.2 - this.pos.y, aimZ - this.pos.z), L = dir.length();
    b.visible = this.spot.visible = true;
    b.position.copy(this.pos); b.position.y -= 1.2;
    b.quaternion.setFromUnitVectors(this._up, dir.normalize());
    b.scale.set(6, L, 6);
    b.material.opacity = 0.05 + World.night * 0.09;
    this.spot.position.set(aimX, 0.3, aimZ);
    this.spot.material.opacity = 0.12 + World.night * 0.35;
    const cd = Game.camera.position.distanceTo(this.pos);
    Sound.setHeli(clamp(1 - cd / 260, 0, 1) * 0.45);
  },
};
