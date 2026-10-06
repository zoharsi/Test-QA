'use strict';

// Map travel owns only the player's destination; NPC drivers and missions stay unchanged.
const Navigation = {
  drive: null,

  inside(x, z, radius) {
    return (Math.abs(x) <= CITY.BOUND - radius && Math.abs(z) <= CITY.BOUND - radius) ||
      Neighborhood.contains(x, z, radius) || Neighborhood.onBridge(x, z, radius);
  },
  clear(x, z, radius) {
    return this.inside(x, z, radius) && !World.pointBlocked(x, z, radius);
  },
  segment(a, b, radius) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (!this.clear(lerp(a.x, b.x, t), lerp(a.z, b.z, t), radius)) return false;
    }
    return true;
  },
  landing(x, z, radius, vehicle = null) {
    // A click on a building lands beside it, never inside it or in the sea.
    for (let r = 0; r <= 64; r += 2) {
      const count = r ? Math.ceil(Math.PI * r) : 1;
      for (let i = 0; i < count; i++) {
        const a = i / count * Math.PI * 2, p = { x: x + Math.sin(a) * r, z: z + Math.cos(a) * r };
        if (!this.clear(p.x, p.z, radius)) continue;
        if (Vehicles.all.some(v => {
          if (v === vehicle) return false;
          const f = v.fwd(), dx = p.x - v.pos.x, dz = p.z - v.pos.z;
          return Math.abs(dx * f.x + dz * f.z) < v.halfL + radius + 0.2 &&
            Math.abs(dx * f.z - dz * f.x) < v.halfW + radius + 0.2;
        })) continue;
        return p;
      }
    }
    return null;
  },

  travel(x, z) {
    if (Player.dead) return;
    const car = Player.mode === 'car' ? Player.vehicle : null;
    if (car && (car.dead || car.burning)) { UI.toast('Vehicle unavailable', 'Exit the vehicle to teleport.', 'info'); return; }
    const radius = car ? car.halfL + 0.35 : 0.5;
    const target = this.landing(x, z, radius, car);
    if (!target) { UI.toast('Destination unavailable', 'Choose a clear place on the map.', 'info'); return; }
    if (!car) {
      this.cancel();
      Player.vel.set(0, 0); Player.vy = 0;
      Player.y = World.groundHeight(target.x, target.z);
      Player.pos.set(target.x, Player.y, target.z);
      Game.waypoint = null; Game.route = []; Game.wpBeacon.visible = false;
      Game.camLambda = 90; Game.updateCamera(1);
      Game.closeMap();
      UI.toast('Teleported', 'You arrived at ' + World.zoneName(target.x, target.z) + '.', 'ok');
      return;
    }
    const path = this.plan(car.pos, target, radius);
    if (!path) { UI.toast('No driving route', 'Choose another nearby street or exit to teleport.', 'info'); return; }
    this.cancel();
    this.drive = { car, target, path, index: 1, stuck: 0, reverse: 0 };
    Game.waypoint = target;
    Game.route = path.map(p => [p.x, p.z]);
    Game.closeMap();
    UI.toast('Automatic driving', 'Following the route. WASD / arrows / Space cancel; right-click the map to clear.', 'info');
  },

  // A* on a clearance grid: street travel is cheaper than crossing sidewalks.
  // Unlike the old GPS line, every segment must be free of static obstacles.
  plan(start, target, radius) {
    const step = 4, key = (x, z) => x + ',' + z;
    const allowed = new Map();
    const pass = (x, z) => {
      const k = key(x, z);
      if (!allowed.has(k)) allowed.set(k, this.clear(x * step, z * step, radius));
      return allowed.get(k);
    };
    const snap = p => {
      const x = Math.round(p.x / step), z = Math.round(p.z / step);
      for (let r = 0; r <= 4; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (pass(x + dx, z + dz) && this.segment(p, { x: (x + dx) * step, z: (z + dz) * step }, radius)) return [x + dx, z + dz];
      }
      return null;
    };
    const a = snap(start), b = snap(target);
    if (!a || !b) return null;
    const heap = [];
    const push = n => {
      heap.push(n); let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p].f <= n.f) break;
        heap[i] = heap[p]; i = p;
      }
      heap[i] = n;
    };
    const pop = () => {
      const first = heap[0], last = heap.pop();
      if (heap.length) {
        let i = 0;
        while (i * 2 + 1 < heap.length) {
          let child = i * 2 + 1;
          if (child + 1 < heap.length && heap[child + 1].f < heap[child].f) child++;
          if (heap[child].f >= last.f) break;
          heap[i] = heap[child]; i = child;
        }
        heap[i] = last;
      }
      return first;
    };
    const goal = key(...b), costs = new Map(), closed = new Set();
    const first = { x: a[0], z: a[1], g: 0, f: Math.hypot(a[0] - b[0], a[1] - b[1]), parent: null };
    costs.set(key(...a), 0); push(first);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let visits = 0; heap.length && visits < 180000; visits++) {
      const n = pop(), k = key(n.x, n.z);
      if (closed.has(k)) continue;
      if (k === goal) {
        const points = [];
        for (let p = n; p; p = p.parent) points.push({ x: p.x * step, z: p.z * step });
        points.reverse();
        // Remove only collinear grid points, keeping the planned street turns.
        const path = [{ x: start.x, z: start.z }];
        for (let i = 0; i < points.length; i++) {
          const p = points[i], prev = points[i - 1], next = points[i + 1];
          if (!prev || !next || (p.x - prev.x) * (next.z - p.z) !== (p.z - prev.z) * (next.x - p.x)) path.push(p);
        }
        path.push(target);
        return path.filter((p, i) => !i || Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z) > 0.1);
      }
      closed.add(k);
      for (const [dx, dz] of dirs) {
        const x = n.x + dx, z = n.z + dz, nk = key(x, z);
        if (closed.has(nk) || !pass(x, z)) continue;
        if (!this.segment({ x: n.x * step, z: n.z * step }, { x: x * step, z: z * step }, radius)) continue;
        const penalty = World.sidewalkAt(x * step, z * step) ? 5 : 1;
        const g = n.g + Math.hypot(dx, dz) * penalty;
        if (g >= (costs.get(nk) ?? Infinity)) continue;
        costs.set(nk, g);
        push({ x, z, g, f: g + Math.hypot(x - b[0], z - b[1]), parent: n });
      }
    }
    return null;
  },

  cancel(clearWaypoint = false) {
    if (this.drive) {
      const i = this.drive.car.input;
      i.throttle = i.brake = i.steer = 0; i.handbrake = true;
    }
    this.drive = null;
    if (clearWaypoint) { Game.waypoint = null; Game.route = []; Game.wpBeacon.visible = false; }
  },
  update(dt) {
    const d = this.drive;
    if (!d) return;
    const v = d.car, i = v.input;
    if (Player.dead || Player.vehicle !== v || v.dead || v.burning) { this.cancel(true); return; }
    const distance = Math.hypot(v.pos.x - d.target.x, v.pos.z - d.target.z);
    if (distance < 3 && v.speed < 0.6) {
      this.cancel(true); UI.toast('Destination reached', 'Automatic driving complete.', 'ok'); return;
    }
    while (d.index < d.path.length - 1 && Math.hypot(v.pos.x - d.path[d.index].x, v.pos.z - d.path[d.index].z) < 3) d.index++;
    const target = d.path[d.index], dx = target.x - v.pos.x, dz = target.z - v.pos.z;
    const error = angleDiff(v.heading, Math.atan2(dx, dz)), turn = Math.abs(error);
    let desired = Math.min(10, Math.hypot(dx, dz) * 0.85);
    if (turn > 0.25) desired = Math.min(desired, turn > 1 ? 2.8 : 4.5);
    if (d.index === d.path.length - 1) desired = Math.min(desired, Math.max(0, distance - 1.5) * 1.1);
    const f = v.fwd();
    for (const o of Vehicles.all) {
      if (o === v) continue;
      const ox = o.pos.x - v.pos.x, oz = o.pos.z - v.pos.z;
      const ahead = ox * f.x + oz * f.z, lateral = Math.abs(ox * f.z - oz * f.x);
      if (ahead > 0 && ahead < 18 && lateral < o.halfW + v.halfW + 0.6) desired = Math.min(desired, Math.max(0, ahead - o.halfL - v.halfL - 2));
    }
    i.handbrake = false;
    i.steer = clamp(error * 2.5, -1, 1);
    i.throttle = v.vF < desired - 0.2 ? clamp((desired - v.vF) * 0.45, 0, 1) : 0;
    i.brake = v.vF > desired + 0.3 && v.vF > 0.6 ? clamp((v.vF - desired) * 0.4, 0, 1) : 0;
    if (desired < 0.2 && v.speed < 0.8) { i.throttle = i.brake = 0; i.handbrake = true; }
    // Back up to make room for a tight turn; never silently teleport the car.
    if (d.reverse > 0) {
      d.reverse -= dt;
      const back = { x: v.pos.x - f.x * 4, z: v.pos.z - f.z * 4 };
      if (this.segment(v.pos, back, v.halfW + 0.3)) {
        i.throttle = 0; i.brake = v.vF > -2 ? 0.4 : 0; i.steer = -Math.sign(error); i.handbrake = false;
      } else d.reverse = 0;
    } else if (desired > 1 && v.speed < 0.7) {
      d.stuck += dt;
      if (d.stuck > 2) { d.reverse = 1.2; d.stuck = 0; }
    } else d.stuck = 0;
    Game.route = [[v.pos.x, v.pos.z], ...d.path.slice(d.index).map(p => [p.x, p.z])];
  },
};
