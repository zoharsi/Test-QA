'use strict';
/* =========================================================
   Vehicles — low-poly meshes + bicycle-model physics with
   lateral grip (drifting), damage, fire and explosions.
   ========================================================= */

const CarMats = {};
const carMat = (key, make) => CarMats[key] || (CarMats[key] = make());

function buildCar(spec, color, lowDetail = false) {
  const type = Object.keys(VEHICLES).find(key => VEHICLES[key] === spec);
  const asset = lowDetail ? null : Assets.car(type);
  if (asset) return buildAssetCar(spec, color, asset);
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const L = spec.len, W = spec.wid, H = spec.hgt;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const paint = carMat('p' + color, () => std({ color, metalness: 0.55, roughness: 0.3 }));
  const glass = carMat('glass', () => std({ color: 0x0c131b, metalness: 0.9, roughness: 0.08 }));
  const dark = carMat('dark', () => std({ color: 0x121315, roughness: 0.7 }));
  const head = carMat('head', () => std({ color: 0xffffff, emissive: 0xfff1cf, emissiveIntensity: 0.6 }));
  const plate = carMat('plate', () => std({ color: 0xf4f1e6, roughness: 0.6 }));
  const tire = carMat('tire', () => std({ color: 0x141414, roughness: 0.92 }));
  const hub = carMat('hub', () => std({ color: 0xb8bec6, metalness: 0.9, roughness: 0.3 }));
  const tailM = std({ color: 0x4a0000, emissive: 0xff1a1a, emissiveIntensity: 0.4 });
  const paintMeshes = [], headMeshes = [];

  const part = (mat, w, h, d, x, y, z, shadow, parent = body) => {
    const m = new THREE.Mesh(UNIT_BOX, mat);
    m.scale.set(w, h, d); m.position.set(x, y, z);
    if (shadow) m.castShadow = true;
    parent.add(m);
    return m;
  };
  const clear = 0.28, lowH = H * (spec.van ? 0.45 : 0.42), yTop = clear + lowH;
  paintMeshes.push(part(paint, W, lowH, L, 0, clear + lowH / 2, 0, true));

  if (spec.van) {
    const bh = H - yTop;
    paintMeshes.push(part(paint, W * 0.98, bh, L * 0.7, 0, yTop + bh / 2, -L * 0.15, true));
    paintMeshes.push(part(paint, W * 0.96, bh * 0.82, L * 0.26, 0, yTop + bh * 0.41, L * 0.33, true));
    part(glass, W * 0.9, bh * 0.45, 0.06, 0, yTop + bh * 0.5, L * 0.46 + 0.01, false);
    part(glass, W * 0.97, bh * 0.4, L * 0.16, 0, yTop + bh * 0.52, L * 0.35, false);
  } else {
    const cabH = H - yTop, cabL = L * spec.cab, cz = spec.cabZ * L * 0.5;
    part(glass, W * 0.84, cabH * 0.92, cabL, 0, yTop + cabH * 0.46, cz, true);
    paintMeshes.push(part(paint, W * 0.86, 0.07, cabL * 0.84, 0, yTop + cabH * 0.92 + 0.035, cz, true));
    if (spec.taxi) part(carMat('taxisign', () => std({ color: 0xffe9a8, emissive: 0xffc94a, emissiveIntensity: 0.8 })), 0.7, 0.22, 0.32, 0, yTop + cabH + 0.13, cz, false);
  }
  part(dark, W * 1.01, 0.22, 0.2, 0, clear + 0.14, L / 2 + 0.02, false);
  part(dark, W * 1.01, 0.22, 0.2, 0, clear + 0.14, -L / 2 - 0.02, false);
  const hy = clear + lowH * 0.72;
  for (const sx of [1, -1]) {
    headMeshes.push(part(head, W * 0.22, 0.13, 0.06, sx * W * 0.32, hy, L / 2 + 0.01, false));
    part(tailM, W * 0.24, 0.12, 0.06, sx * W * 0.32, hy, -L / 2 - 0.01, false);
  }
  part(dark, W * 0.34, 0.16, 0.05, 0, hy - 0.04, L / 2 + 0.02, false);
  part(plate, 0.52, 0.12, 0.02, 0, clear + 0.3, -L / 2 - 0.13, false);

  let bar = null;
  if (spec.police) {
    part(dark, W * 1.005, lowH * 0.42, L * 0.44, 0, clear + lowH * 0.5, -0.1, false);
    const red = std({ color: 0x330000, emissive: 0xff1a2e, emissiveIntensity: 0.2 });
    const blue = std({ color: 0x000a33, emissive: 0x1a5cff, emissiveIntensity: 0.2 });
    const ry = H + 0.08, cz = spec.cabZ * L * 0.5;
    part(dark, W * 0.7, 0.08, 0.32, 0, ry - 0.06, cz, false);
    part(red, W * 0.32, 0.14, 0.28, W * 0.18, ry + 0.04, cz, false);
    part(blue, W * 0.32, 0.14, 0.28, -W * 0.18, ry + 0.04, cz, false);
    bar = { red, blue };
  }

  const wheelGeo = carMat('wgeo', () => { const g = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 16); g.rotateZ(Math.PI / 2); return g; });
  const wheels = [], wx = W / 2 - 0.12, wz = spec.wb / 2;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const pivot = new THREE.Group(), spin = new THREE.Group();
    pivot.position.set(sx * wx, 0.36, sz * wz);
    root.add(pivot); pivot.add(spin);
    const t = new THREE.Mesh(wheelGeo, [tire, hub, hub]); t.castShadow = true; spin.add(t);
    wheels.push({ pivot, spin, front: sz > 0 });
  }
  const shadow = new THREE.Mesh(UNIT_PLANE, World.blobMat);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03; shadow.scale.set(W * 1.6, L * 1.25, 1);
  root.add(shadow);
  return { root, body, wheels, tailM, paintMeshes, headMeshes, bar };
}

// Visual adapter only: Vehicle's physics dimensions and controls stay unchanged.
function buildAssetCar(spec, color, asset) {
  const root = new THREE.Group(), body = new THREE.Group();
  const badges = [];
  asset.scene.traverse(node => { if (/logo|badge/i.test(node.name)) badges.push(node); });
  for (const node of badges) if (node.parent) node.parent.remove(node);
  const model = Assets.normalize(asset, 'z', spec.len);
  root.add(body); body.add(model);
  root.userData.assetFile = asset.file;
  const paintMeshes = [], headMeshes = [], wheels = [], wheelNodes = [];
  const ownedMaterials = new Map();
  model.traverse(node => {
    if (node.isMesh) {
      node.castShadow = node.receiveShadow = true;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const isPaint = material => /body|paint|car.?colou?r/i.test(material.name) ||
        (materials.length === 1 && /body|paint/i.test(node.name) && !/glass|tire|rubber|chrome|light/i.test(material.name));
      if (materials.some(isPaint)) {
        paintMeshes.push(node);
        const copies = materials.map(material => {
          if (!isPaint(material)) return material;
          if (!ownedMaterials.has(material)) {
            const copy = material.clone();
            if (!spec.police && copy.color) copy.color.setHex(color);
            ownedMaterials.set(material, copy);
          }
          return ownedMaterials.get(material);
        });
        node.material = Array.isArray(node.material) ? copies : copies[0];
      }
      if (/headlight/i.test(node.name) || materials.some(m => /headlight/i.test(m.name))) headMeshes.push(node);
    }
    if (/wheel/i.test(node.name) && !node.isSkinnedMesh) {
      let ancestor = node.parent, nested = false;
      while (ancestor && ancestor !== model) {
        if (/wheel/i.test(ancestor.name)) nested = true;
        ancestor = ancestor.parent;
      }
      if (!nested) wheelNodes.push(node);
    }
  });
  root.userData.ownedMaterials = [...ownedMaterials.values()];
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const width = bounds.max.x - bounds.min.x, height = bounds.max.y;
  for (const node of wheelNodes) {
    const wheelBounds = new THREE.Box3().setFromObject(node);
    if (wheelBounds.isEmpty()) continue;
    const pivot = new THREE.Group(), spin = new THREE.Group();
    pivot.position.copy(wheelBounds.getCenter(new THREE.Vector3()));
    root.add(pivot); pivot.add(spin);
    // Keep authored mesh rotation/scale, but rotate around the wheel's own center.
    spin.attach(node);
    wheels.push({ pivot, spin, front: pivot.position.z > 0 });
  }
  const part = (material, w, h, d, x, y, z) => {
    const mesh = new THREE.Mesh(UNIT_BOX, material);
    mesh.scale.set(w, h, d); mesh.position.set(x, y, z); body.add(mesh);
    return mesh;
  };
  const tailM = new THREE.MeshStandardMaterial({ color: 0x4a0000, emissive: 0xff1a1a, emissiveIntensity: 0.4 });
  for (const side of [-1, 1]) part(tailM, width * 0.2, 0.12, 0.06, side * width * 0.32, height * 0.4, -spec.len / 2 - 0.02);
  let bar = null;
  if (spec.police) {
    const dark = carMat('dark', () => new THREE.MeshStandardMaterial({ color: 0x121315, roughness: 0.7 }));
    const red = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff1a2e, emissiveIntensity: 0.2 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x000a33, emissive: 0x1a5cff, emissiveIntensity: 0.2 });
    const z = spec.cabZ * spec.len * 0.5;
    part(dark, width * 0.7, 0.08, 0.32, 0, height + 0.02, z);
    part(red, width * 0.32, 0.14, 0.28, width * 0.18, height + 0.12, z);
    part(blue, width * 0.32, 0.14, 0.28, -width * 0.18, height + 0.12, z);
    bar = { red, blue };
  }
  const shadow = new THREE.Mesh(UNIT_PLANE, World.blobMat);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03;
  shadow.scale.set(spec.wid * 1.6, spec.len * 1.25, 1); root.add(shadow);
  return { root, body, wheels, tailM, paintMeshes, headMeshes, bar };
}

class Vehicle {
  constructor(type, x, z, heading, color) {
    const spec = (this.spec = VEHICLES[type]);
    this.type = type;
    this.color = color != null ? color : pick(spec.colors);
    const m = buildCar(spec, this.color);
    this.visual = m; this.lowVisual = null; this.usingLowDetail = false;
    this.mesh = m.root; this.body = m.body; this.wheels = m.wheels; this.tailM = m.tailM;
    this.paintMeshes = m.paintMeshes; this.headMeshes = m.headMeshes; this.bar = m.bar;
    this.mesh.rotation.order = 'YXZ';
    this.mesh.position.set(x, 0, z);
    this.pos = this.mesh.position;
    this.heading = heading;
    this.vel = new THREE.Vector2(0, 0);
    this.vF = 0; this.vR = 0; this.steer = 0; this.yawRate = 0; this.yawKick = 0; this.accelLong = 0;
    this.spin = 0; this.roll = 0; this.pitch = 0; this.slip = 0;
    this.health = 100; this.dead = false; this.burning = false; this.burnT = 0;
    this.driver = null; this.ai = null; this.siren = false; this.parked = false;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.halfL = spec.len / 2; this.halfW = spec.wid / 2;
    this.fxT = Math.random(); this.lastHitByPlayer = false;
    World.scene.add(this.mesh);
    Vehicles.all.push(this);
  }
  get speed() { return this.vel.length(); }
  fwd() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  update(dt) {
    const s = this.spec, inp = this.input;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading), rx = -fz, rz = fx;
    let vF = this.vel.x * fx + this.vel.y * fz;
    let vR = this.vel.x * rx + this.vel.y * rz;
    const thr = this.dead ? 0 : inp.throttle, brk = this.dead ? 0 : inp.brake, hb = this.dead || inp.handbrake;
    const prev = vF;

    if (thr > 0) {
      if (vF < -0.5) vF += s.brake * thr * dt;
      else vF += s.accel * thr * Math.max(0.04, 1 - (vF / s.maxSpeed) * (vF / s.maxSpeed)) * dt;
    }
    if (brk > 0) {
      if (vF > 0.5) vF -= s.brake * brk * dt;
      else if (vF > -s.maxSpeed * 0.3) vF -= s.accel * 0.6 * brk * dt;
    }
    vF -= vF * (0.03 + Math.abs(vF) * 0.0012) * dt;                       // aero + rolling
    if (thr === 0 && brk === 0) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 1.6 * dt); // engine braking
    if (hb) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 8 * dt);

    const grip = hb ? s.grip * 0.18 : s.grip * (this.burning ? 0.8 : 1);
    vR -= vR * Math.min(1, grip * dt);
    this.slip = Math.abs(vR);

    const steerMax = s.steer / (1 + Math.abs(vF) * 0.045);
    this.steer += ((this.dead ? 0 : inp.steer) * steerMax - this.steer) * Math.min(1, dt * 7);
    let yaw = (this.steer * vF) / s.wb;
    const latMax = s.grip * (hb ? 3.2 : 1.8), av = Math.max(Math.abs(vF), 1);
    yaw = clamp(yaw, -latMax / av, latMax / av);
    this.yawRate = yaw;
    this.heading += (yaw + this.yawKick) * dt;
    this.yawKick *= Math.exp(-dt * 3.5);

    // velocity stays in the old basis — the heading change creates slip that grip removes
    this.vel.set(fx * vF + rx * vR, fz * vF + rz * vR);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    this.accelLong = (vF - prev) / Math.max(dt, 1e-4);
    this.vF = vF; this.vR = vR;

    this.collideWorld();
    if (Neighborhood.contains(this.pos.x, this.pos.z) || Neighborhood.onBridge(this.pos.x, this.pos.z) || this.pos.z < -CITY.BOUND) {
      Neighborhood.constrain(this.pos, this.halfW + 0.1);
      this.pos.y = World.groundHeight(this.pos.x, this.pos.z);
    } else this.pos.y = 0;
    if (this.burning) { this.burnT -= dt; if (this.burnT <= 0) this.explode(); }
  }

  collideWorld() {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading), off = this.halfL - this.halfW, r = this.halfW + 0.05;
    let worst = null, px = 0, pz = 0;
    for (const k of [off, 0, -off]) {
      const p = { x: this.pos.x + fx * k, z: this.pos.z + fz * k }, ox = p.x, oz = p.z;
      const hit = World.resolveCircle(p, r);
      if (hit) {
        this.pos.x += p.x - ox; this.pos.z += p.z - oz;
        if (!worst || hit.pen > worst.pen) { worst = hit; px = p.x - hit.nx * r; pz = p.z - hit.nz * r; }
      }
    }
    if (!worst) return;
    const vn = this.vel.x * worst.nx + this.vel.y * worst.nz;
    if (vn < 0) {
      this.vel.x -= worst.nx * vn * 1.3; this.vel.y -= worst.nz * vn * 1.3;
      this.vel.multiplyScalar(0.93);
      if (-vn > 2.5) Game.onImpact(this, -vn, px, pz);
    }
  }

  updateDetail() {
    if (!this.mesh.userData.assetFile || this.spec.police || this.spec.van) return;
    const camera = Game.camera.position;
    const distance = Math.hypot(this.pos.x - camera.x, this.pos.z - camera.z);
    const low = Vehicles.lowDetail && !this.parked && this.driver !== 'player' &&
      Player.vehicle !== this && !this.dead && distance > (this.usingLowDetail ? 80 : 100);
    if (low === this.usingLowDetail) return;
    if (low && !this.lowVisual) {
      // Lightweight sports-shaped model; detailed GLB geometry stays cached.
      const spec = { ...this.spec, cab: VEHICLES.sports.cab, cabZ: VEHICLES.sports.cabZ,
        hgt: Math.min(this.spec.hgt, VEHICLES.sports.hgt) };
      this.lowVisual = buildCar(spec, this.color, true);
      this.mesh.add(this.lowVisual.root);
      this.paintMeshes.push(...this.lowVisual.paintMeshes);
      this.headMeshes.push(...this.lowVisual.headMeshes);
    }
    for (const child of this.mesh.children) child.visible = child === this.lowVisual?.root ? low : !low;
    const visual = low ? this.lowVisual : this.visual;
    this.body = visual.body; this.wheels = visual.wheels; this.tailM = visual.tailM;
    this.usingLowDetail = low;
  }

  updateVisual(dt) {
    this.updateDetail();
    this.mesh.rotation.y = this.heading;
    this.spin += (this.vF * dt) / 0.36;
    for (const w of this.wheels) { w.spin.rotation.x = this.spin; if (w.front) w.pivot.rotation.y = this.steer; }
    const lat = this.vF * this.yawRate;
    this.roll = damp(this.roll, clamp(lat * 0.006, -0.075, 0.075), 6, dt);
    this.pitch = damp(this.pitch, clamp(-this.accelLong * 0.005, -0.045, 0.045), 6, dt);
    this.body.rotation.z = this.roll; this.body.rotation.x = this.pitch;
    if (!this.dead) {
      const braking = this.input.brake > 0 && this.vF > 0.5;
      this.tailM.emissiveIntensity = braking ? 2.6 : 0.3 + World.night * 0.9;
    }
    if (this.bar) {
      const t = performance.now() * 0.001, on = this.siren && !this.dead;
      this.bar.red.emissiveIntensity = on ? (Math.sin(t * 18) > 0 ? 3.5 : 0.1) : 0.15;
      this.bar.blue.emissiveIntensity = on ? (Math.sin(t * 18) <= 0 ? 3.5 : 0.1) : 0.15;
    }
    // effects (throttled)
    this.fxT -= dt;
    if (this.fxT <= 0) {
      this.fxT = 0.06;
      const f = this.fwd(), bx = this.pos.x - f.x * this.halfL * 0.6, bz = this.pos.z - f.z * this.halfL * 0.6;
      if (this.burning) { FX.fire(this.pos.x + f.x * this.halfL * 0.5, 1.1, this.pos.z + f.z * this.halfL * 0.5); FX.smoke(this.pos.x, 1.6, this.pos.z, true); }
      else if (this.dead) { if (Math.random() < 0.4) FX.smoke(this.pos.x, 1.4, this.pos.z, true); }
      else if (this.health < 40) FX.smoke(this.pos.x + f.x * this.halfL * 0.7, 1.1, this.pos.z + f.z * this.halfL * 0.7, this.health < 22);
      if (!this.dead && this.slip > 4.5 && this.speed > 5) FX.tireSmoke(bx, bz);
    }
  }

  damage(n) {
    if (this.dead || n <= 0) return;
    this.health -= n;
    if (this.health <= 0 && !this.burning) { this.health = 0; this.burning = true; this.burnT = rand(3.5, 6); }
  }

  explode() {
    if (this.dead) return;
    this.dead = true; this.burning = false; this.siren = false;
    const burnt = carMat('burnt', () => new THREE.MeshStandardMaterial({ color: 0x1a1817, roughness: 1 }));
    for (const m of this.paintMeshes) m.material = burnt;
    for (const m of this.headMeshes) m.material = burnt;
    this.visual.tailM.emissiveIntensity = 0;
    if (this.lowVisual) this.lowVisual.tailM.emissiveIntensity = 0;
    this.vel.multiplyScalar(0.3);
    Game.explosionAt(this.pos.x, this.pos.z, this);
  }
}

const Vehicles = {
  all: [],
  lowDetail: false, frameSeconds: 0, frameCount: 0,
  sampleFrame(dt) {
    if (document.hidden) { this.frameSeconds = this.frameCount = 0; return; }
    this.frameSeconds += dt; this.frameCount++;
    if (this.frameSeconds < 1) return;
    const fps = this.frameCount / this.frameSeconds;
    if (fps < 45) this.lowDetail = true;
    else if (fps > 50) this.lowDetail = false;
    this.frameSeconds = this.frameCount = 0;
  },
  remove(v) {
    World.scene.remove(v.mesh);
    v.visual.tailM.dispose();
    if (v.lowVisual) v.lowVisual.tailM.dispose();
    if (v.bar) { v.bar.red.dispose(); v.bar.blue.dispose(); }
    for (const material of v.mesh.userData.ownedMaterials || []) material.dispose();
    const i = this.all.indexOf(v);
    if (i >= 0) this.all.splice(i, 1);
    v.removed = true;
  },
  collide() {
    const A = this.all;
    for (let a = 0; a < A.length; a++) for (let b = a + 1; b < A.length; b++) {
      const dx = A[a].pos.x - A[b].pos.x, dz = A[a].pos.z - A[b].pos.z;
      if (dx * dx + dz * dz < 40) this.pair(A[a], A[b]);
    }
  },
  pair(a, b) {
    const fa = a.fwd(), fb = b.fwd(), oa = a.halfL - a.halfW, ob = b.halfL - b.halfW, ra = a.halfW + 0.05, rb = b.halfW + 0.05;
    let best = null;
    for (const ka of [oa, 0, -oa]) for (const kb of [ob, 0, -ob]) {
      const ax = a.pos.x + fa.x * ka, az = a.pos.z + fa.z * ka, bx = b.pos.x + fb.x * kb, bz = b.pos.z + fb.z * kb;
      const dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz), pen = ra + rb - d;
      if (pen > 0 && (!best || pen > best.pen)) best = { pen, nx: d > 1e-4 ? dx / d : 1, nz: d > 1e-4 ? dz / d : 0, px: (ax + bx) / 2, pz: (az + bz) / 2 };
    }
    if (!best) return;
    const { pen, nx, nz, px, pz } = best;
    const ma = a.parked ? 3 : a.spec.mass, mb = b.parked ? 3 : b.spec.mass, wa = mb / (ma + mb), wb = ma / (ma + mb);
    a.pos.x += nx * pen * wa; a.pos.z += nz * pen * wa;
    b.pos.x -= nx * pen * wb; b.pos.z -= nz * pen * wb;
    const vn = (a.vel.x - b.vel.x) * nx + (a.vel.y - b.vel.y) * nz;
    if (vn >= 0) return;
    const j = (-(1 + 0.3) * vn) / (1 / ma + 1 / mb), jx = nx * j, jz = nz * j;
    a.vel.x += jx / ma; a.vel.y += jz / ma;
    b.vel.x -= jx / mb; b.vel.y -= jz / mb;
    // off-centre hits spin the cars
    // yaw torque = (r × J).y = rz·Jx − rx·Jz
    const tq = (v, jX, jZ, m) => clamp(((pz - v.pos.z) * jX - (px - v.pos.x) * jZ) * 0.12 / m, -2.5, 2.5);
    a.yawKick += tq(a, jx, jz, ma); b.yawKick += tq(b, -jx, -jz, mb);
    if (-vn > 2) Game.onCarCrash(a, b, -vn, px, pz);
  },
};
