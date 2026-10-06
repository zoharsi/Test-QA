'use strict';
/* =========================================================
   FX — pooled sprite particles + one flash light
   ========================================================= */

const FX = {
  parts: [], idx: 0,
  init(scene) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.tex = new THREE.CanvasTexture(c);
    for (let i = 0; i < 240; i++) {
      const m = new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false });
      const s = new THREE.Sprite(m); s.visible = false; scene.add(s);
      this.parts.push({ s, m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 1, o: 1, drag: 0, grav: 0, inout: false });
    }
    // constant light count keeps shader programs stable
    this.light = new THREE.PointLight(0xff8a3a, 0, 70, 2);
    scene.add(this.light);
  },
  emit(x, y, z, o) {
    const p = this.parts[(this.idx = (this.idx + 1) % this.parts.length)];
    p.s.position.set(x, y, z);
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.life = p.max = o.life || 1; p.s0 = o.s0 || 1; p.s1 = o.s1 || p.s0;
    p.o = o.o != null ? o.o : 1; p.drag = o.drag || 0; p.grav = o.grav || 0; p.inout = !!o.inout;
    p.m.color.setHex(o.color != null ? o.color : 0xffffff);
    p.m.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.m.rotation = Math.random() * 6.28;
    p.s.scale.setScalar(p.s0); p.s.visible = true;
  },
  update(dt) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const t = 1 - p.life / p.max, k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vy = p.vy * k + p.grav * dt; p.vz *= k;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      if (p.s.position.y < 0.1) { p.s.position.y = 0.1; p.vy = Math.abs(p.vy) * 0.3; }
      p.s.scale.setScalar(lerp(p.s0, p.s1, t));
      p.m.opacity = p.o * (p.inout ? Math.sin(t * Math.PI) : 1 - t);
    }
    this.light.intensity *= Math.exp(-dt * 5);
  },
  explosion(x, z) {
    for (let i = 0; i < 28; i++) this.emit(x + rand(-1, 1), 1 + rand(0, 1.5), z + rand(-1, 1), { vx: rand(-7, 7), vy: rand(2, 10), vz: rand(-7, 7), life: rand(0.5, 1.1), s0: 2, s1: rand(5, 9), color: pick([0xffd27a, 0xff8a2b, 0xff5a1f]), add: true, drag: 2.5 });
    for (let i = 0; i < 22; i++) this.emit(x + rand(-1.5, 1.5), 1.5 + rand(0, 2), z + rand(-1.5, 1.5), { vx: rand(-3, 3), vy: rand(2, 6), vz: rand(-3, 3), life: rand(2.2, 4), s0: 3, s1: rand(10, 16), color: pick([0x222222, 0x333333, 0x444444]), o: 0.75, drag: 1.2, grav: 1.2, inout: true });
    for (let i = 0; i < 18; i++) this.emit(x, 1, z, { vx: rand(-14, 14), vy: rand(6, 16), vz: rand(-14, 14), life: rand(0.6, 1.2), s0: 0.35, s1: 0.1, color: 0xffe08a, add: true, grav: -18 });
    this.light.position.set(x, 3, z); this.light.color.setHex(0xff8a3a); this.light.intensity = 14;
  },
  smoke(x, y, z, dark) {
    this.emit(x + rand(-0.3, 0.3), y, z + rand(-0.3, 0.3), { vx: rand(-0.4, 0.4), vy: rand(1.4, 2.8), vz: rand(-0.4, 0.4), life: rand(1.4, 2.2), s0: 0.8, s1: rand(3, 4.5), color: dark ? 0x1e1e1e : 0x9a9a9a, o: dark ? 0.6 : 0.4, inout: true, drag: 0.3 });
  },
  fire(x, y, z) {
    this.emit(x + rand(-0.4, 0.4), y, z + rand(-0.4, 0.4), { vy: rand(2, 4), life: rand(0.35, 0.6), s0: 1.2, s1: 0.4, color: pick([0xffb347, 0xff7a1f, 0xffd36b]), add: true });
  },
  tireSmoke(x, z) {
    this.emit(x + rand(-0.5, 0.5), 0.35, z + rand(-0.5, 0.5), { vx: rand(-0.5, 0.5), vy: rand(0.3, 0.9), vz: rand(-0.5, 0.5), life: rand(0.9, 1.5), s0: 0.6, s1: rand(2.4, 3.4), color: 0xd8d8d8, o: 0.32, inout: true, drag: 0.6 });
  },
  sparks(x, y, z, n = 6) {
    for (let i = 0; i < n; i++) this.emit(x, y, z, { vx: rand(-6, 6), vy: rand(2, 7), vz: rand(-6, 6), life: rand(0.25, 0.5), s0: 0.22, s1: 0.06, color: 0xffd27a, add: true, grav: -16 });
  },
  dust(x, z) {
    for (let i = 0; i < 5; i++) this.emit(x, 0.3, z, { vx: rand(-1, 1), vy: rand(0.2, 0.8), vz: rand(-1, 1), life: rand(0.6, 1), s0: 0.5, s1: 1.6, color: 0xb9ad98, o: 0.4, inout: true });
  },
  muzzle(x, y, z) {
    this.emit(x, y, z, { life: 0.07, s0: 1.3, s1: 0.8, color: 0xfff1b0, add: true });
    if (this.light.intensity < 2) { this.light.position.set(x, y, z); this.light.color.setHex(0xffe2a0); this.light.intensity = 3; }
  },
};
