'use strict';
/* =========================================================
   World — procedural city of San Aurelio
   ========================================================= */

/** Builds merged, vertex-coloured geometry from quads (one draw call per material). */
class GeoBuilder {
  constructor() { this.p = []; this.uv = []; this.c = []; }
  tri(a, b, c, ua, ub, uc, col) {
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    this.uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
    for (let i = 0; i < 3; i++) this.c.push(col.r, col.g, col.b);
  }
  quad(a, b, c, d, u0, v0, u1, v1, col) {
    this.tri(a, b, c, [u0, v0], [u1, v0], [u1, v1], col);
    this.tri(a, c, d, [u0, v0], [u1, v1], [u0, v1], col);
  }
  /** axis-aligned box: 4 textured walls, optional roof quad into another builder */
  box(o) {
    const { x, z, w, h, d, col } = o;
    const y0 = o.y || 0, y1 = y0 + h, tw = o.tw || 12, th = o.th || 12, uo = o.uo || 0, vo = o.vo || 0;
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, v1 = vo + h / th;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], uo, vo, uo + w / tw, v1, col);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], uo, vo, uo + d / tw, v1, col);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], uo, vo, uo + w / tw, v1, col);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], uo, vo, uo + d / tw, v1, col);
    if (o.roof) o.roof.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 0, w / 8, d / 8, o.roofCol || col);
  }
  pyramid(x, y0, z, w, d, h, col) {
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, ap = [x, y0 + h, z];
    const U = [0, 0], V = [1, 0], T = [0.5, 1];
    this.tri([x0, y0, z1], [x1, y0, z1], ap, U, V, T, col);
    this.tri([x1, y0, z1], [x1, y0, z0], ap, U, V, T, col);
    this.tri([x1, y0, z0], [x0, y0, z0], ap, U, V, T, col);
    this.tri([x0, y0, z0], [x0, y0, z1], ap, U, V, T, col);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

function mergeGeos(list) {
  const pos = [], nor = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

const SKY = {
  DAY_TOP: new THREE.Color(0x2f74c9), DAY_HOR: new THREE.Color(0xb9d3e6),
  DUSK_TOP: new THREE.Color(0x3a2a6e), DUSK_HOR: new THREE.Color(0xff6a8a),
  NIGHT_TOP: new THREE.Color(0x0a0820), NIGHT_HOR: new THREE.Color(0x2a1c3e),
  SUN: new THREE.Color(0xfff1dc), SUN_LOW: new THREE.Color(0xff8f4a), MOON: new THREE.Color(0x8ea6dc),
  MTN: new THREE.Color(0x1d2740), WATER_DAY: new THREE.Color(0x1a5a78), WATER_NIGHT: new THREE.Color(0x061522),
};

const World = {
  scene: null, colliders: [], hash: new Map(), blocks: [],
  time: 18.35, daySpeed: 24 / (20 * 60),   // one in-game day = 20 real minutes
  signalT: 0, day: 1, night: 0, dusk: 0, exposure: 1.15,
  _sunDir: new THREE.Vector3(), _top: new THREE.Color(), _hor: new THREE.Color(), _tmp: new THREE.Color(),

  async build(scene, progress) {
    this.scene = scene;
    const rng = mulberry32(20261006);
    progress(0.06, 'Laying out the street grid');
    // billboards are painted with web fonts — give them a moment to arrive
    try { if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, wait(1500)]); } catch (e) { /* ignore */ }
    await wait(30);
    this.makeTextures();
    this.makeSkyAndLights();
    this.makeGround();
    progress(0.2, 'Painting crosswalks and lane lines'); await wait(30);
    this.makeRoadMarkings();
    progress(0.34, 'Building skyscrapers'); await wait(30);
    this.makeBlocks(rng);
    progress(0.58, 'Planting trees and palms'); await wait(30);
    this.makeVegetation(rng);
    progress(0.7, 'Switching on streetlights and signals'); await wait(30);
    this.makeStreetFurniture(rng);
    progress(0.8, 'Drawing the city map'); await wait(30);
    this.makeMapImage();
  },

  /* ---------------- textures & materials ---------------- */
  makeTextures() {
    const mk = (w, h, draw, repeat = true) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c);
      if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      return t;
    };
    const speckle = (g, w, h, n, cols) => { for (let i = 0; i < n; i++) { g.fillStyle = pick(cols); g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); } };

    const facade = (cols, rows, wall, glass, mullion, lit) => {
      const S = 256, cw = S / cols, rh = S / rows, on = [];
      for (let i = 0; i < cols * rows; i++) on.push(Math.random() < lit ? pick(['#ffd9a0', '#ffe8c2', '#fff2d8', '#ffc98a', '#d6e9ff', '#ffdfb0']) : null);
      const cell = (x, y) => [x * cw + cw * 0.13, y * rh + rh * 0.17, cw * 0.74, rh * 0.62];
      const map = mk(S, S, g => {
        g.fillStyle = wall; g.fillRect(0, 0, S, S);
        speckle(g, S, S, 400, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.05)']);
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const [px, py, w, h] = cell(x, y), gr = g.createLinearGradient(px, py, px + w * 0.4, py + h);
          gr.addColorStop(0, glass[1]); gr.addColorStop(1, glass[0]);
          g.fillStyle = gr; g.fillRect(px, py, w, h);
          g.fillStyle = mullion; g.fillRect(px + w / 2 - 1, py, 2, h);
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px, py + h, w, 3);
        }
      });
      const em = mk(S, S, g => {
        g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
          const c = on[y * cols + x]; if (!c) continue;
          const [px, py, w, h] = cell(x, y);
          g.globalAlpha = 0.55 + Math.random() * 0.45; g.fillStyle = c; g.fillRect(px, py, w, h);
        }
        g.globalAlpha = 1;
      });
      return { map, em };
    };
    const off = facade(4, 4, '#cfd5dc', ['#1b2c3f', '#5a7f9e'], '#7d8a97', 0.42);
    const res = facade(3, 3, '#ece2d4', ['#262b33', '#4d5b6b'], '#b9ad9c', 0.36);
    const hou = facade(2, 1, '#f4eee3', ['#2c3138', '#5f6a77'], '#d8cfc2', 0.55);

    const roofTex = mk(128, 128, (g, w, h) => { g.fillStyle = '#9a9a98'; g.fillRect(0, 0, w, h); speckle(g, w, h, 900, ['#8a8a88', '#a8a8a5', '#7e7e7c']); });
    const asphalt = mk(256, 256, (g, w, h) => {
      g.fillStyle = '#3a3c41'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 4200, ['#2f3135', '#45474c', '#34363a', '#4b4d52']);
      g.strokeStyle = 'rgba(20,20,22,0.35)'; g.lineWidth = 1;
      for (let i = 0; i < 6; i++) { g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rand(-18, 18); y += rand(-18, 18); g.lineTo(x, y); } g.stroke(); }
    });
    const walk = mk(128, 128, (g, w, h) => {
      g.fillStyle = '#a7a59f'; g.fillRect(0, 0, w, h); speckle(g, w, h, 700, ['#99978f', '#b3b1ab']);
      g.fillStyle = '#8b8984'; for (let i = 0; i <= 4; i++) { g.fillRect(i * 32 - 1, 0, 2, h); g.fillRect(0, i * 32 - 1, w, 2); }
    });
    const grass = mk(128, 128, (g, w, h) => { g.fillStyle = '#4a7536'; g.fillRect(0, 0, w, h); speckle(g, w, h, 1600, ['#3f6a2e', '#5a8742', '#456f33', '#618f47']); });
    const sand = mk(128, 128, (g, w, h) => { g.fillStyle = '#d6c199'; g.fillRect(0, 0, w, h); speckle(g, w, h, 1500, ['#cbb58d', '#e0cda8', '#c4ad84']); });
    const radial = (inner, outer) => mk(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, inner); gr.addColorStop(1, outer);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, false);
    const blob = radial('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)');
    const glow = radial('rgba(255,196,120,1)', 'rgba(255,170,80,0)');
    const beamGrad = mk(4, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#000'); gr.addColorStop(1, '#fff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, false);

    // tileable water normal map from a sum of integer-frequency waves
    const waterN = (() => {
      const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d'), img = g.createImageData(S, S);
      const waves = [[1, 2, 1], [3, -1, 0.6], [2, 3, 0.5], [-4, 1, 0.35], [5, 2, 0.25], [-2, 6, 0.2]].map(([a, b, amp]) => [a, b, amp, Math.random() * 6.28]);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        let dx = 0, dy = 0;
        for (const [a, b, amp, ph] of waves) { const k = (a * x + b * y) / S * Math.PI * 2 + ph, cs = Math.cos(k) * amp; dx += cs * a; dy += cs * b; }
        const nx = -dx * 0.12, ny = -dy * 0.12, l = Math.hypot(nx, ny, 1), i = (y * S + x) * 4;
        img.data[i] = (nx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    })();

    this.tex = { asphalt, walk, grass, sand, blob, glow, beamGrad, waterN };
    walk.repeat.set(4, 4); grass.repeat.set(10, 10); sand.repeat.set(120, 120); waterN.repeat.set(300, 300);

    const facadeMat = (f, rough, metal) => new THREE.MeshStandardMaterial({ map: f.map, emissiveMap: f.em, emissive: 0xffffff, emissiveIntensity: 0.2, vertexColors: true, roughness: rough, metalness: metal });
    this.mats = {
      office: facadeMat(off, 0.42, 0.35),
      res: facadeMat(res, 0.82, 0.05),
      house: facadeMat(hou, 0.88, 0.0),
      roof: new THREE.MeshStandardMaterial({ map: roofTex, vertexColors: true, roughness: 0.95 }),
      tile: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }),
      walk: new THREE.MeshStandardMaterial({ map: walk, roughness: 0.95 }),
      grass: new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x9c9a94, roughness: 0.9 }),
      paint: new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      yellow: new THREE.MeshStandardMaterial({ color: 0xe0b42a, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.5, metalness: 0.6 }),
      lampHead: new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc27a, emissiveIntensity: 0 }),
      glow: new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      sigZ: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2bff88, emissiveIntensity: 1.6 }),
      sigX: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff2a2a, emissiveIntensity: 1.6 }),
      aviation: new THREE.MeshBasicMaterial({ color: 0xff2020 }),
    };
    this.blobMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false, opacity: 0.6 });
    this.waterMat = new THREE.MeshPhongMaterial({ color: SKY.WATER_DAY, specular: 0xffffff, shininess: 80, normalMap: waterN, normalScale: new THREE.Vector2(0.55, 0.55) });
  },

  /* ---------------- sky, sun, moon, stars ---------------- */
  makeSkyAndLights() {
    const s = this.scene;
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, bot: { value: new THREE.Color(0x070a10) },
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() },
        night: { value: 0 }, exposure: { value: 1.15 },
      },
      vertexShader: `varying vec3 vDir;
        void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol;
        uniform float night; uniform float exposure; varying vec3 vDir;
        vec3 skyRRT(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
        vec3 skyACES(vec3 c){
          const mat3 I = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
          const mat3 O = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
          c *= exposure / 0.6; c = I * c; c = skyRRT(c); c = O * c; return clamp(c, 0.0, 1.0);
        }
        void main(){
          vec3 d = normalize(vDir); float h = d.y;
          vec3 col = mix(hor, top, pow(clamp(h, 0.0, 1.0), 0.55));
          col = mix(col, bot, 1.0 - smoothstep(-0.25, 0.02, h));
          float s = max(dot(d, sunDir), 0.0);
          col += sunCol * (pow(s, 1400.0) * 28.0 + pow(s, 60.0) * 0.6 + pow(s, 6.0) * 0.18) * (1.0 - night);
          float m = max(dot(d, -sunDir), 0.0);
          col += vec3(0.78, 0.82, 0.95) * smoothstep(0.99955, 0.9997, m) * night * 1.6;
          col += vec3(0.3, 0.35, 0.5) * pow(m, 40.0) * 0.25 * night;
          gl_FragColor = vec4(skyACES(col), 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), this.skyMat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -1;
    s.add(this.sky);

    const starGeo = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 1400; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.acos(rand(0.08, 1)), r = 2800;
      sp.push(Math.cos(u) * Math.sin(v) * r, Math.cos(v) * r, Math.sin(u) * Math.sin(v) * r);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    s.add(this.stars);

    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x2d2a26, 0.6); s.add(this.hemi);
    this.amb = new THREE.AmbientLight(0x48506a, 0.15); s.add(this.amb);
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -95; sc.right = 95; sc.top = 95; sc.bottom = -95; sc.near = 10; sc.far = 520;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    s.add(sun); s.add(sun.target);
    s.fog = new THREE.Fog(0x9fb4c8, 140, 760);
  },

  /* ---------------- ground, beach, ocean, mountains ---------------- */
  makeGround() {
    const s = this.scene, S = CITY.HALF * 2 + CITY.ROAD;
    this.tex.asphalt.repeat.set(S / 12, S / 12);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshStandardMaterial({ map: this.tex.asphalt, roughness: 0.42, metalness: 0.25 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; s.add(ground);

    const beach = new THREE.Mesh(new THREE.PlaneGeometry(S + 190, S + 190), new THREE.MeshStandardMaterial({ map: this.tex.sand, roughness: 1 }));
    beach.rotation.x = -Math.PI / 2; beach.position.y = -0.3; beach.receiveShadow = true; s.add(beach);

    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), this.waterMat);
    ocean.rotation.x = -Math.PI / 2; ocean.position.y = -0.7; s.add(ocean);

    // seawall around the island
    const E = CITY.HALF + 8.6;
    for (const [x, z, w, d] of [[0, E, S + 4, 0.9], [0, -E, S + 4, 0.9], [E, 0, 0.9, S + 4], [-E, 0, 0.9, S + 4]]) {
      const m = new THREE.Mesh(UNIT_BOX, this.mats.concrete); m.scale.set(w, 1.1, d); m.position.set(x, 0.55, z);
      m.castShadow = m.receiveShadow = true; s.add(m);
      this.addCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 1.1);
    }

    // distant mainland: low-poly mountains, unaffected by fog (tinted toward the horizon each frame)
    this.mtnMat = new THREE.MeshBasicMaterial({ color: SKY.MTN, fog: false });
    const rng = mulberry32(77);
    for (let k = 0; k < 34; k++) {
      const a = (k / 34) * Math.PI * 2 + rng() * 0.15;
      if (a > Math.PI * 0.2 && a < Math.PI * 0.8) continue; // open sea to the south
      const r = 1600 + rng() * 650, h = 150 + rng() * 300;
      const m = new THREE.Mesh(new THREE.ConeGeometry(220 + rng() * 260, h, 5 + (k % 3)), this.mtnMat);
      m.position.set(Math.cos(a) * r, h / 2 - 30, Math.sin(a) * r); m.rotation.y = rng() * 6;
      s.add(m);
    }
  },

  /* ---------------- road paint ---------------- */
  makeRoadMarkings() {
    const { GRID, ROAD, CELL } = CITY, dummy = new THREE.Object3D(), white = [], yellow = [];
    const flat = (arr, x, z, sx, sz) => arr.push([x, z, sx, sz]);
    const segLen = CELL - ROAD - 10;
    for (let a = 0; a <= GRID; a++) for (let b = 0; b < GRID; b++) {
      const line = nodeCoord(a), mid = nodeCoord(b) + CELL / 2;
      // roads running along x (constant z = line) and along z (constant x = line)
      flat(yellow, mid, line - 0.18, segLen, 0.14); flat(yellow, mid, line + 0.18, segLen, 0.14);
      flat(yellow, line - 0.18, mid, 0.14, segLen); flat(yellow, line + 0.18, mid, 0.14, segLen);
      flat(white, mid, line - ROAD / 2 + 0.7, segLen, 0.16); flat(white, mid, line + ROAD / 2 - 0.7, segLen, 0.16);
      flat(white, line - ROAD / 2 + 0.7, mid, 0.16, segLen); flat(white, line + ROAD / 2 - 0.7, mid, 0.16, segLen);
    }
    // zebra crossings + stop lines on every approach
    for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) {
      const x = nodeCoord(i), z = nodeCoord(j), o = ROAD / 2 + 1.8;
      for (const [nx, nz] of World.neighbors(i, j)) {
        const dx = Math.sign(nx - i), dz = Math.sign(nz - j);
        for (let k = -3; k <= 3; k++) {
          if (dx) flat(white, x + dx * o, z + k * 2.1, 3, 0.9); else flat(white, x + k * 2.1, z + dz * o, 0.9, 3);
        }
        // stop line across the incoming lane (traffic drives on the right)
        const sl = ROAD / 2 + 3.9;
        // cars arriving from (dx,dz) travel along -(dx,dz); their right side is (dz,-dx)
        if (dx) flat(white, x + dx * sl, z - dx * CITY.LANE, 0.45, 7);
        else flat(white, x + dz * CITY.LANE, z + dz * sl, 7, 0.45);
      }
    }
    const make = (arr, mat) => {
      const im = new THREE.InstancedMesh(UNIT_PLANE, mat, arr.length);
      arr.forEach(([x, z, sx, sz], i) => {
        dummy.position.set(x, 0.02, z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(sx, sz, 1);
        dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
      });
      im.receiveShadow = true; this.scene.add(im);
    };
    make(white, this.mats.paint); make(yellow, this.mats.yellow);
  },

  /* ---------------- buildings ---------------- */
  makeBlocks(rng) {
    const R = (a, b) => a + rng() * (b - a), P = arr => arr[Math.floor(rng() * arr.length)];
    const { BLOCK, ROAD, GRID, WALK, HALF } = CITY;
    const G = { office: new GeoBuilder(), res: new GeoBuilder(), house: new GeoBuilder(), roof: new GeoBuilder(), tile: new GeoBuilder() };
    // Consume the same procedural RNG calls even when a GLB replaces a lot.
    // This keeps downtown, parks, billboards and the rest of the layout stable.
    const noop = { box() {}, pyramid() {} };
    const skipped = { res: noop, house: noop, roof: noop, tile: noop };
    const assetRng = mulberry32(9017);
    this.assetBuildingBatches = new Map();
    const placeAsset = (x, z, w, d, block) => Assets.placeBuilding(this,
      Math.floor(assetRng() * Assets.manifest.buildings.length), { x, z, w, d }, block);
    const C = hex => new THREE.Color(hex);
    const OFF = ['#e3e9f0', '#c4d0dc', '#a9bccd', '#ebe4d7', '#d0d9e0', '#94a8ba', '#b8b0a4'].map(C);
    const RES = ['#f0e2cc', '#e9c7a3', '#d8b597', '#cdd7c4', '#e7d1c0', '#f3e7d3', '#c9b6a3', '#e2bfae'].map(C);
    const HOU = ['#f7efe2', '#f3d9c6', '#e5efe1', '#f2e2b5', '#dde8f2', '#f4d3cd', '#ebdff0'].map(C);
    const TILE = ['#9b4a36', '#7a4a39', '#5c5e66', '#8a684d', '#b0634a', '#4f5560'].map(C);
    const FLAT = ['#6d6f73', '#5b5d61', '#7c7a74', '#4e5155'].map(C);
    const PARKS = new Set(['6,6', '2,3', '9,9', '3,9', '9,2']);
    this.parkBlocks = []; this.lawns = []; this.towerTops = []; this.billboardSpots = [];

    for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
      const x0 = nodeCoord(i) + ROAD / 2, z0 = nodeCoord(j) + ROAD / 2, cx = x0 + BLOCK / 2, cz = z0 + BLOCK / 2;
      const d = Math.hypot(cx, cz) / HALF;
      const type = PARKS.has(i + ',' + j) ? 'park' : d < 0.36 ? 'downtown' : d < 0.74 ? 'midtown' : 'suburb';
      const b = { i, j, x0, z0, cx, cz, type };
      this.blocks.push(b);
      const inner = BLOCK - WALK * 2, ix = x0 + WALK, iz = z0 + WALK;

      if (type === 'park') { this.parkBlocks.push(b); this.lawns.push([cx, cz, inner, inner]); continue; }

      if (type === 'downtown') {
        const r = rng();
        const lots = r < 0.34 ? [[0, 0, 1, 1]]
          : r < 0.68 ? (rng() < 0.5 ? [[0, 0, 0.5, 1], [0.5, 0, 1, 1]] : [[0, 0, 1, 0.5], [0, 0.5, 1, 1]])
          : [[0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5], [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]];
        for (const [a, bb, c2, e] of lots) {
          const lw = (c2 - a) * inner, ld = (e - bb) * inner;
          const x = ix + (a + c2) / 2 * inner, z = iz + (bb + e) / 2 * inner;
          const h = R(48, 150) * (1.38 - d) * (lots.length === 1 ? 1.2 : lots.length === 4 ? 0.72 : 1);
          const tint = P(OFF);
          let w = lw - R(2, 5), dd = ld - R(2, 5), base = 0;
          if (rng() < 0.55) {
            const ph = R(7, 12);
            G.res.box({ x, z, w: lw - 1, h: ph, d: ld - 1, col: P(RES), tw: 9, th: ph / 2, uo: Math.floor(rng() * 3) / 3, roof: G.roof, roofCol: P(FLAT) });
            this.addCollider(x - (lw - 1) / 2, x + (lw - 1) / 2, z - (ld - 1) / 2, z + (ld - 1) / 2, ph);
            base = ph; w *= 0.78; dd *= 0.78;
          }
          this.addCollider(x - w / 2, x + w / 2, z - dd / 2, z + dd / 2, base + h);
          const uo = Math.floor(rng() * 4) / 4, vo = Math.floor(rng() * 4) / 4;
          if (h > 90 && rng() < 0.6) {
            const h1 = h * R(0.6, 0.75);
            G.office.box({ x, y: base, z, w, h: h1, d: dd, col: tint, uo, vo, roof: G.roof, roofCol: P(FLAT) });
            w *= 0.72; dd *= 0.72;
            G.office.box({ x, y: base + h1, z, w, h: h - h1, d: dd, col: tint, uo, vo: vo + h1 / 12, roof: G.roof, roofCol: P(FLAT) });
          } else G.office.box({ x, y: base, z, w, h, d: dd, col: tint, uo, vo, roof: G.roof, roofCol: P(FLAT) });
          const top = base + h;
          G.roof.box({ x: x + R(-w * 0.15, w * 0.15), y: top, z: z + R(-dd * 0.15, dd * 0.15), w: w * R(0.25, 0.45), h: R(2.5, 5), d: dd * R(0.25, 0.45), col: P(FLAT), tw: 6, th: 6, roof: G.roof, roofCol: P(FLAT) });
          if (h > 100) {
            G.roof.box({ x, y: top, z, w: 0.5, h: 11, d: 0.5, col: FLAT[0], tw: 4, th: 4 });
            this.towerTops.push([x, top + 11.3, z]);
          }
        }
      } else if (type === 'midtown') {
        const half = inner / 2;
        for (const [qa, qb] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const lx = ix + half * qa + half / 2, lz = iz + half * qb + half / 2;
          if (rng() < 0.1) { this.lawns.push([lx, lz, half - 2, half - 2]); continue; }
          const w = R(16, half - 2), dd = R(16, half - 2), h = R(12, 44) * (1.25 - d * 0.5);
          const x = lx + (qa ? 1 : -1) * (half - w) / 2 * 0.8, z = lz + (qb ? 1 : -1) * (half - dd) / 2 * 0.8;
          const imported = placeAsset(x, z, w, dd, b), g = imported ? skipped : G;
          const tint = P(RES), uo = Math.floor(rng() * 3) / 3;
          g.res.box({ x, z, w, h, d: dd, col: tint, tw: 9, th: 9, uo, roof: g.roof, roofCol: P(FLAT) });
          if (!imported) this.addCollider(x - w / 2, x + w / 2, z - dd / 2, z + dd / 2, h);
          const r2 = rng();
          if (r2 < 0.32) g.res.box({ x, y: h, z, w: w * 0.6, h: R(4, 12), d: dd * 0.6, col: tint, tw: 9, th: 9, uo, vo: h / 9, roof: g.roof, roofCol: P(FLAT) });
          else if (r2 < 0.65) g.roof.box({ x, y: h, z, w: w * 0.3, h: 2.2, d: dd * 0.3, col: P(FLAT), tw: 4, th: 4, roof: g.roof });
          if (h < 34 && rng() < 0.45 && !imported) this.billboardSpots.push({ x, z, y: h, w, d: dd, qa, qb });
        }
      } else {
        this.lawns.push([cx, cz, inner, inner]);
        if (rng() < 0.22) {
          const w = inner - 8, dd = R(16, 22), h = R(5, 8), z = cz + R(-6, 6);
          const imported = placeAsset(cx, z, w, dd, b), g = imported ? skipped : G;
          g.res.box({ x: cx, z, w, h, d: dd, col: P(RES), tw: 9, th: h, roof: g.roof, roofCol: P(FLAT) });
          if (!imported) this.addCollider(cx - w / 2, cx + w / 2, z - dd / 2, z + dd / 2, h);
          if (rng() < 0.6) {
            const spot = { x: cx, z, y: h, w, d: dd, qa: rng() < 0.5 ? 0 : 1, qb: 0 };
            if (!imported) this.billboardSpots.push(spot);
          }
        } else {
          const n = rng() < 0.5 ? 2 : 3, cell = inner / n;
          for (let a = 0; a < n; a++) for (let e = 0; e < n; e++) {
            if (n === 3 && a === 1 && e === 1) continue;
            const w = R(cell * 0.5, cell * 0.72), dd = R(cell * 0.5, cell * 0.72), h = rng() < 0.3 ? R(6.5, 8) : R(3.6, 4.6);
            const x = ix + cell * (a + 0.5), z = iz + cell * (e + 0.5);
            const imported = placeAsset(x, z, w, dd, b), g = imported ? skipped : G;
            g.house.box({ x, z, w, h, d: dd, col: P(HOU), tw: 8, th: h > 6 ? h / 2 : h, uo: Math.floor(rng() * 2) / 2 });
            g.tile.pyramid(x, h, z, w + 0.9, dd + 0.9, R(1.8, 3.2), P(TILE));
            if (!imported) this.addCollider(x - w / 2, x + w / 2, z - dd / 2, z + dd / 2, h + 2);
          }
        }
      }
    }

    Assets.flushBuildings(this);
    const mk = (b, mat) => { const m = new THREE.Mesh(b.build(), mat); m.castShadow = true; m.receiveShadow = true; this.scene.add(m); return m; };
    mk(G.office, this.mats.office); mk(G.res, this.mats.res); mk(G.house, this.mats.house); mk(G.roof, this.mats.roof); mk(G.tile, this.mats.tile);

    // sidewalks (one raised slab per block)
    const dummy = new THREE.Object3D();
    const walks = new THREE.InstancedMesh(UNIT_BOX, this.mats.walk, this.blocks.length);
    this.blocks.forEach((b, k) => {
      dummy.position.set(b.cx, 0.125, b.cz); dummy.rotation.set(0, 0, 0); dummy.scale.set(BLOCK, 0.25, BLOCK);
      dummy.updateMatrix(); walks.setMatrixAt(k, dummy.matrix);
    });
    walks.receiveShadow = true; this.scene.add(walks);

    // lawns
    const lawns = new THREE.InstancedMesh(UNIT_PLANE, this.mats.grass, this.lawns.length);
    this.lawns.forEach(([x, z, w, d], k) => {
      dummy.position.set(x, 0.262, z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(w, d, 1);
      dummy.updateMatrix(); lawns.setMatrixAt(k, dummy.matrix);
    });
    lawns.receiveShadow = true; this.scene.add(lawns);

    // aviation warning lights on the tallest towers
    const av = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 8, 6), this.mats.aviation, Math.max(1, this.towerTops.length));
    this.towerTops.forEach(([x, y, z], k) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); av.setMatrixAt(k, dummy.matrix); });
    av.count = this.towerTops.length; this.scene.add(av); this.aviation = av;

    this.makeBillboards(rng);
  },

  makeBillboards(rng) {
    const brands = [
      ['KAFÉ NOIR', 'Coffee black as night', '#1a1410', '#f3c27a'],
      ['VOLTA', 'ELECTRIC MOTORS', '#0e2a3a', '#5ef0ff'],
      ['SUNRISE MOTEL', 'Vacancy', '#ff7a3d', '#fff3d6'],
      ['PIXL ONE', 'Your next phone', '#f2f2f2', '#141414'],
      ['AURELIO FM', '104.4 · The city radio', '#2a0f3a', '#ffb23f'],
      ['LUNA COLA', 'Taste of summer', '#b0122b', '#ffffff'],
      ['DRIFTWOOD', 'West Coast beer', '#20402c', '#f2e6c8'],
    ];
    const mats = brands.map(([t, sub, bg, fg]) => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 200;
      const g = c.getContext('2d');
      g.fillStyle = bg; g.fillRect(0, 0, 512, 200);
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '700 74px "Bebas Neue", Impact, "Arial Narrow", sans-serif'; g.fillText(t, 256, 88);
      g.font = '500 28px Heebo, Arial, sans-serif'; g.globalAlpha = 0.8; g.fillText(sub, 256, 150);
      g.globalAlpha = 1; g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(10, 10, 492, 180);
      const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
      return new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.6 });
    });
    this.billboardMats = mats;
    const legGeo = new THREE.BoxGeometry(0.25, 3, 0.25), panelGeo = new THREE.PlaneGeometry(12, 4.7);
    this.billboardSpots.slice(0, 26).forEach((s, k) => {
      const g = new THREE.Group(), alongX = rng() < 0.5;
      const nx = alongX ? 0 : (s.qa ? 1 : -1), nz = alongX ? (s.qb ? 1 : -1) : 0;
      const off = alongX ? s.d / 2 - 1 : s.w / 2 - 1;
      g.position.set(s.x + nx * off, s.y, s.z + nz * off);
      g.rotation.y = Math.atan2(nx, nz);
      const p = new THREE.Mesh(panelGeo, mats[k % mats.length]); p.position.y = 5.3; g.add(p);
      const back = new THREE.Mesh(panelGeo, this.mats.metal); back.position.set(0, 5.3, -0.05); back.rotation.y = Math.PI; g.add(back);
      for (const lx of [-4, 4]) { const l = new THREE.Mesh(legGeo, this.mats.metal); l.position.set(lx, 1.5, -0.2); g.add(l); }
      this.scene.add(g);
    });
  },

  /* ---------------- trees, palms, parks ---------------- */
  makeVegetation(rng) {
    const R = (a, b) => a + rng() * (b - a), trees = [], palms = [], paths = [];
    const S = this.scene, dummy = new THREE.Object3D();
    for (const b of this.parkBlocks) {
      const inner = CITY.BLOCK - CITY.WALK * 2, ix = b.x0 + CITY.WALK, iz = b.z0 + CITY.WALK, central = b.i === 6 && b.j === 6;
      for (let k = 0; k < 38; k++) {
        const x = ix + R(2, inner - 2), z = iz + R(2, inner - 2);
        if (Math.abs(x - b.cx) < 3.5 || Math.abs(z - b.cz) < 3.5 || Math.hypot(x - b.cx, z - b.cz) < 13) continue;
        trees.push([x, z, R(0.8, 1.35), rng()]);
      }
      paths.push([b.cx, b.cz, inner, 3.4], [b.cx, b.cz, 3.4, inner]);
      if (central) {
        const stone = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.4, 0.9, 32), this.mats.concrete); stone.position.set(b.cx, 0.45, b.cz); stone.receiveShadow = stone.castShadow = true; S.add(stone);
        const water = new THREE.Mesh(new THREE.CircleGeometry(6.3, 32), this.waterMat); water.rotation.x = -Math.PI / 2; water.position.set(b.cx, 0.92, b.cz); S.add(water);
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 4, 12), this.mats.concrete); col.position.set(b.cx, 2.4, b.cz); col.castShadow = true; S.add(col);
        const jet = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.2, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
        jet.position.set(b.cx, 5.3, b.cz); jet.rotation.x = Math.PI; S.add(jet);
        this.addCollider(b.cx - 7.2, b.cx + 7.2, b.cz - 7.2, b.cz + 7.2, 4);
      } else {
        const pond = new THREE.Mesh(new THREE.CircleGeometry(9.5, 32), this.waterMat); pond.rotation.x = -Math.PI / 2; pond.position.set(b.cx, 0.29, b.cz); S.add(pond);
        const rim = new THREE.Mesh(new THREE.RingGeometry(9.5, 10.6, 40), this.mats.concrete); rim.rotation.x = -Math.PI / 2; rim.position.set(b.cx, 0.3, b.cz); S.add(rim);
      }
    }
    for (const b of this.blocks) {
      if (b.type === 'park') continue;
      const step = b.type === 'suburb' ? 14 : 18, B = CITY.BLOCK;
      for (let s = 8; s < B - 6; s += step) {
        for (const [x, z] of [[b.x0 + s, b.z0 + 1.3], [b.x0 + s, b.z0 + B - 1.3], [b.x0 + 1.3, b.z0 + s], [b.x0 + B - 1.3, b.z0 + s]]) {
          if (rng() < (b.type === 'downtown' ? 0.22 : 0.45)) (b.type === 'suburb' || rng() < 0.25 ? palms : trees).push([x, z, R(0.7, 1.05), rng()]);
        }
      }
    }
    for (let k = 0; k < 90; k++) { // beach palms
      const side = k % 4, t = R(-CITY.HALF - 40, CITY.HALF + 40), o = CITY.HALF + R(22, 70);
      const [x, z] = side === 0 ? [t, o] : side === 1 ? [t, -o] : side === 2 ? [o, t] : [-o, t];
      palms.push([x, z, R(0.9, 1.25), rng(), -0.3]);
    }
    for (const [x, z, s] of trees) this.addCollider(x - 0.35 * s, x + 0.35 * s, z - 0.35 * s, z + 0.35 * s, 6, true);
    for (const [x, z, s, , y] of palms) if (y === undefined) this.addCollider(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 9, true);

    // broadleaf trees
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.32, 3.2, 6); trunkGeo.translate(0, 1.6, 0);
    const crownGeo = new THREE.IcosahedronGeometry(2.6, 1); crownGeo.translate(0, 4.8, 0);
    const bark = new THREE.MeshStandardMaterial({ color: 0x5a4433, roughness: 1 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
    const tT = new THREE.InstancedMesh(trunkGeo, bark, trees.length), tC = new THREE.InstancedMesh(crownGeo, leaf, trees.length);
    const greens = [0x3f6f2e, 0x4c7f35, 0x2f5e2a, 0x5b8a3c, 0x46743a].map(h => new THREE.Color(h));
    trees.forEach(([x, z, s, r], k) => {
      dummy.position.set(x, 0.25, z); dummy.rotation.set(0, r * 6.28, 0); dummy.scale.set(s, s, s); dummy.updateMatrix();
      tT.setMatrixAt(k, dummy.matrix); tC.setMatrixAt(k, dummy.matrix); tC.setColorAt(k, greens[k % greens.length]);
    });
    tT.castShadow = tC.castShadow = true; tC.receiveShadow = true; S.add(tT); S.add(tC);

    // palms — trunk and crown share the same instance matrix
    const pTrunk = new THREE.CylinderGeometry(0.15, 0.26, 9, 6); pTrunk.translate(0, 4.5, 0);
    const leaves = [];
    for (let k = 0; k < 9; k++) {
      const g = new THREE.BoxGeometry(0.75, 0.06, 4.2); g.translate(0, 0, 2.1); g.rotateX(0.55 + (k % 2) * 0.2); g.rotateY(k / 9 * Math.PI * 2); g.translate(0, 9, 0);
      leaves.push(g);
    }
    const nut = new THREE.IcosahedronGeometry(0.45, 0); nut.translate(0, 8.8, 0); leaves.push(nut);
    const pCrown = mergeGeos(leaves);
    const pT = new THREE.InstancedMesh(pTrunk, new THREE.MeshStandardMaterial({ color: 0x8a7158, roughness: 1 }), palms.length);
    const pC = new THREE.InstancedMesh(pCrown, new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 0.85, side: THREE.DoubleSide }), palms.length);
    palms.forEach(([x, z, s, r, y], k) => {
      dummy.position.set(x, y === undefined ? 0.25 : y, z); dummy.rotation.set((r - 0.5) * 0.18, r * 6.28, (r - 0.5) * 0.22); dummy.scale.set(s, s, s); dummy.updateMatrix();
      pT.setMatrixAt(k, dummy.matrix); pC.setMatrixAt(k, dummy.matrix);
    });
    pT.castShadow = pC.castShadow = true; S.add(pT); S.add(pC);

    const pathMesh = new THREE.InstancedMesh(UNIT_PLANE, this.mats.walk, paths.length);
    paths.forEach(([x, z, w, d], k) => { dummy.position.set(x, 0.272, z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(w, d, 1); dummy.updateMatrix(); pathMesh.setMatrixAt(k, dummy.matrix); });
    pathMesh.receiveShadow = true; S.add(pathMesh);
  },

  /* ---------------- lamps, signals ---------------- */
  makeStreetFurniture() {
    const S = this.scene, dummy = new THREE.Object3D(), lamps = [], B = CITY.BLOCK;
    for (const b of this.blocks) for (const s of [16, 48]) {
      lamps.push([b.x0 + s, b.z0 + 0.7, Math.PI], [b.x0 + s, b.z0 + B - 0.7, 0], [b.x0 + 0.7, b.z0 + s, -Math.PI / 2], [b.x0 + B - 0.7, b.z0 + s, Math.PI / 2]);
    }
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 7.6, 6); poleGeo.translate(0, 3.8, 0);
    const armGeo = new THREE.BoxGeometry(0.12, 0.12, 2.4); armGeo.translate(0, 7.5, 1.1);
    const headGeo = new THREE.BoxGeometry(0.5, 0.18, 0.95); headGeo.translate(0, 7.4, 2.3);
    const pole = new THREE.InstancedMesh(mergeGeos([poleGeo, armGeo]), this.mats.metal, lamps.length);
    const head = new THREE.InstancedMesh(headGeo, this.mats.lampHead, lamps.length);
    const glow = new THREE.InstancedMesh(UNIT_PLANE, this.mats.glow, lamps.length);
    lamps.forEach(([x, z, a], k) => {
      dummy.position.set(x, 0.25, z); dummy.rotation.set(0, a, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      pole.setMatrixAt(k, dummy.matrix); head.setMatrixAt(k, dummy.matrix);
      dummy.position.set(x + Math.sin(a) * 2.6, 0.04, z + Math.cos(a) * 2.6); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(11, 11, 1); dummy.updateMatrix();
      glow.setMatrixAt(k, dummy.matrix);
    });
    pole.castShadow = true; S.add(pole); S.add(head); glow.renderOrder = 1; S.add(glow);
    this.lampGlow = glow;

    // traffic signals: two poles per intersection, lamps grouped by the axis they control
    const poles = [], H = CITY.ROAD / 2 + 1.2;
    for (let i = 0; i <= CITY.GRID; i++) for (let j = 0; j <= CITY.GRID; j++) {
      const x = nodeCoord(i), z = nodeCoord(j);
      for (const [sx, sz] of [[1, 1], [-1, -1]]) {
        const px = x + sx * H, pz = z + sz * H;
        if (Math.abs(px) < CITY.HALF && Math.abs(pz) < CITY.HALF) poles.push([px, pz]);
      }
    }
    const spGeo = new THREE.CylinderGeometry(0.1, 0.12, 5, 6); spGeo.translate(0, 2.5, 0);
    const boxGeo = new THREE.BoxGeometry(0.42, 1.25, 0.42); boxGeo.translate(0, 5.4, 0);
    const lampGeo = new THREE.SphereGeometry(0.15, 8, 6);
    const sp = new THREE.InstancedMesh(mergeGeos([spGeo, boxGeo]), this.mats.metal, poles.length);
    const lz = new THREE.InstancedMesh(lampGeo, this.mats.sigZ, poles.length * 2);
    const lx = new THREE.InstancedMesh(lampGeo, this.mats.sigX, poles.length * 2);
    poles.forEach(([x, z], k) => {
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      dummy.position.set(x, 0.25, z); dummy.updateMatrix(); sp.setMatrixAt(k, dummy.matrix);
      dummy.position.set(x, 5.85, z + 0.23); dummy.updateMatrix(); lz.setMatrixAt(k * 2, dummy.matrix);
      dummy.position.set(x, 5.85, z - 0.23); dummy.updateMatrix(); lz.setMatrixAt(k * 2 + 1, dummy.matrix);
      dummy.position.set(x + 0.23, 5.85, z); dummy.updateMatrix(); lx.setMatrixAt(k * 2, dummy.matrix);
      dummy.position.set(x - 0.23, 5.85, z); dummy.updateMatrix(); lx.setMatrixAt(k * 2 + 1, dummy.matrix);
    });
    sp.castShadow = true; S.add(sp); S.add(lz); S.add(lx);
  },

  /* ---------------- minimap image ---------------- */
  makeMapImage() {
    const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), E = CITY.HALF + 90, k = S / (2 * E), X = v => (v + E) * k;
    this.mapExtent = E; this.mapScale = k; this.mapCanvas = c;
    g.fillStyle = '#0e2433'; g.fillRect(0, 0, S, S);
    const sand = CITY.HALF + 8 + 95;
    g.fillStyle = '#3a3a33'; g.fillRect(X(-sand), X(-sand), 2 * sand * k, 2 * sand * k);
    const city = CITY.HALF + 8;
    g.fillStyle = '#566070'; g.fillRect(X(-city), X(-city), 2 * city * k, 2 * city * k);
    for (const b of this.blocks) {
      g.fillStyle = b.type === 'park' ? '#22553a' : b.type === 'suburb' ? '#2b3d33' : '#2a303b';
      g.fillRect(X(b.x0), X(b.z0), CITY.BLOCK * k, CITY.BLOCK * k);
    }
    g.fillStyle = '#3d4554';
    for (const c2 of this.colliders) if (!c2.small && c2.h > 1.5) g.fillRect(X(c2.minX), X(c2.minZ), (c2.maxX - c2.minX) * k, (c2.maxZ - c2.minZ) * k);
    g.fillStyle = '#1f5a78';
    for (const b of this.parkBlocks) { g.beginPath(); g.arc(X(b.cx), X(b.cz), 9 * k, 0, Math.PI * 2); g.fill(); }
  },

  /* ---------------- per-frame update ---------------- */
  update(dt, focus, camera) {
    this.time = (this.time + dt * this.daySpeed) % 24;
    this.signalT = (this.signalT + dt) % 24;
    const phi = (this.time - 6) / 12 * Math.PI, sy = Math.sin(phi);
    const dir = this._sunDir.set(Math.cos(phi), sy, 0.38).normalize();
    const day = smooth(-0.08, 0.3, sy), night = 1 - smooth(-0.2, 0.04, sy), dusk = Math.exp(-Math.pow((sy - 0.02) / 0.2, 2));
    this.day = day; this.night = night; this.dusk = dusk;

    const top = this._top.copy(SKY.NIGHT_TOP).lerp(SKY.DAY_TOP, day).lerp(SKY.DUSK_TOP, dusk * 0.75);
    const hor = this._hor.copy(SKY.NIGHT_HOR).lerp(SKY.DAY_HOR, day).lerp(SKY.DUSK_HOR, dusk * 0.9);
    const U = this.skyMat.uniforms;
    U.top.value.copy(top); U.hor.value.copy(hor); U.sunDir.value.copy(dir); U.night.value = night;
    U.sunCol.value.copy(SKY.SUN).lerp(SKY.SUN_LOW, dusk);
    this.exposure = 1.12 + night * 0.28; U.exposure.value = this.exposure;
    this.scene.fog.color.copy(hor);

    const sun = this.sun, fx = Math.round(focus.x / 2) * 2, fz = Math.round(focus.z / 2) * 2;
    if (sy >= 0) {
      sun.color.copy(SKY.SUN).lerp(SKY.SUN_LOW, dusk);
      sun.intensity = (0.25 + 2.3 * day) * smooth(-0.01, 0.07, sy);
      sun.position.set(fx + dir.x * 260, dir.y * 260 + 4, fz + dir.z * 260);
    } else {
      sun.color.copy(SKY.MOON);
      sun.intensity = 0.38 * smooth(0.0, 0.14, -sy);
      sun.position.set(fx - dir.x * 260, -dir.y * 260 + 4, fz - dir.z * 260);
    }
    sun.target.position.set(fx, 0, fz);

    this.hemi.intensity = 0.2 + 0.55 * day + 0.18 * dusk;
    this.hemi.color.copy(top).lerp(this._tmp.set(0xffffff), 0.35);
    this.amb.intensity = 0.1 + night * 0.16;

    const lamp = smooth(0.05, 0.45, night + dusk * 0.5);
    this.lampK = lamp;
    this.mats.lampHead.emissiveIntensity = lamp * 2.4;
    this.mats.glow.opacity = lamp * 0.55;
    this.lampGlow.visible = lamp > 0.01;
    const win = 0.05 + night * 1.7 + dusk * 0.6;
    this.mats.office.emissiveIntensity = win; this.mats.res.emissiveIntensity = win * 0.95; this.mats.house.emissiveIntensity = win * 0.85;
    for (const m of this.billboardMats) m.emissiveIntensity = 0.15 + lamp * 0.9;
    this.stars.material.opacity = night * 0.9;
    this.mtnMat.color.copy(SKY.MTN).lerp(hor, 0.5).multiplyScalar(0.5 + 0.5 * day + 0.2 * dusk);
    this.waterMat.color.copy(SKY.WATER_NIGHT).lerp(SKY.WATER_DAY, day);
    this.waterMat.specular.copy(sun.color).multiplyScalar(0.8);
    this.tex.waterN.offset.x += dt * 0.0035; this.tex.waterN.offset.y += dt * 0.002;
    this.mats.aviation.color.setHex(Math.floor(this.signalT * 0.8) % 2 ? 0xff2020 : 0x330505);

    // traffic signals
    const col = s => (s === 'g' ? 0x2bff88 : s === 'y' ? 0xffc020 : 0xff2a2a);
    this.mats.sigZ.emissive.setHex(col(this.signalState('z')));
    this.mats.sigX.emissive.setHex(col(this.signalState('x')));

    if (camera) { this.sky.position.copy(camera.position); this.stars.position.copy(camera.position); }
  },

  /** 'g' | 'y' | 'r' for traffic moving along the given axis */
  signalState(axis) {
    const t = this.signalT;
    if (axis === 'z') return t < 10 ? 'g' : t < 12 ? 'y' : 'r';
    return t >= 12 && t < 22 ? 'g' : t >= 22 ? 'y' : 'r';
  },

  /* ---------------- collision helpers ---------------- */
  addCollider(minX, maxX, minZ, maxZ, h = 10, small = false) {
    const c = { minX, maxX, minZ, maxZ, h, small };
    this.colliders.push(c);
    const S = CITY.CELL, o = CITY.HALF + 200;
    for (let gx = Math.floor((minX + o) / S); gx <= Math.floor((maxX + o) / S); gx++)
      for (let gz = Math.floor((minZ + o) / S); gz <= Math.floor((maxZ + o) / S); gz++) {
        const key = gx * 1000 + gz;
        let arr = this.hash.get(key);
        if (!arr) this.hash.set(key, (arr = []));
        arr.push(c);
      }
  },
  query(x, z, r) {
    const S = CITY.CELL, o = CITY.HALF + 200, out = [];
    const gx0 = Math.floor((x - r + o) / S), gx1 = Math.floor((x + r + o) / S);
    const gz0 = Math.floor((z - r + o) / S), gz1 = Math.floor((z + r + o) / S);
    for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
      const arr = this.hash.get(gx * 1000 + gz);
      if (arr) for (const c of arr) if (out.indexOf(c) < 0) out.push(c);
    }
    return out;
  },
  pointBlocked(x, z, pad = 0, y = 0, ignoreSmall = false) {
    for (const c of this.query(x, z, pad)) {
      if (ignoreSmall && c.small) continue;
      if (y > c.h) continue;
      if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return c;
    }
    return null;
  },
  /** pushes p ({x,z}) out of every box; returns deepest contact */
  resolveCircle(p, r) {
    let hit = null;
    for (const c of this.query(p.x, p.z, r)) {
      const cx = clamp(p.x, c.minX, c.maxX), cz = clamp(p.z, c.minZ, c.maxZ);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let nx, nz, pen;
      if (d2 < 1e-8) {
        const l = p.x - c.minX, rr = c.maxX - p.x, t = p.z - c.minZ, bb = c.maxZ - p.z, m = Math.min(l, rr, t, bb);
        if (m === l) { nx = -1; nz = 0; pen = l + r; } else if (m === rr) { nx = 1; nz = 0; pen = rr + r; }
        else if (m === t) { nx = 0; nz = -1; pen = t + r; } else { nx = 0; nz = 1; pen = bb + r; }
      } else { const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d; }
      p.x += nx * pen; p.z += nz * pen;
      if (!hit || pen > hit.pen) hit = { nx, nz, pen };
    }
    return hit;
  },
  lineOfSight(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, n = Math.ceil(Math.hypot(dx, dz) / 5);
    for (let k = 1; k < n; k++) { const t = k / n; if (this.pointBlocked(ax + dx * t, az + dz * t, 0, 1.5, true)) return false; }
    return true;
  },
  sidewalkAt(x, z) {
    const { HALF, CELL, ROAD, BLOCK } = CITY;
    if (Math.abs(x) >= HALF || Math.abs(z) >= HALF) return false;
    const u = (x + HALF) % CELL, v = (z + HALF) % CELL;
    return u > ROAD / 2 && u < ROAD / 2 + BLOCK && v > ROAD / 2 && v < ROAD / 2 + BLOCK;
  },

  /* ---------------- road graph ---------------- */
  nearestNode(x, z) {
    return [clamp(Math.round((x + CITY.HALF) / CITY.CELL), 0, CITY.GRID), clamp(Math.round((z + CITY.HALF) / CITY.CELL), 0, CITY.GRID)];
  },
  neighbors(i, j) {
    const out = [];
    if (i > 0) out.push([i - 1, j]); if (i < CITY.GRID) out.push([i + 1, j]);
    if (j > 0) out.push([i, j - 1]); if (j < CITY.GRID) out.push([i, j + 1]);
    return out;
  },
  /** nodes at the two ends of the road segment containing (x,z) */
  segmentEnds(x, z) {
    const gi = (x + CITY.HALF) / CITY.CELL, gj = (z + CITY.HALF) / CITY.CELL;
    const onRow = Math.abs(gj - Math.round(gj)) * CITY.CELL < CITY.ROAD, onCol = Math.abs(gi - Math.round(gi)) * CITY.CELL < CITY.ROAD;
    const G = CITY.GRID, c = v => clamp(v, 0, G);
    if (onRow && !onCol) return [[c(Math.floor(gi)), c(Math.round(gj))], [c(Math.ceil(gi)), c(Math.round(gj))]];
    if (onCol && !onRow) return [[c(Math.round(gi)), c(Math.floor(gj))], [c(Math.round(gi)), c(Math.ceil(gj))]];
    return [this.nearestNode(x, z)];
  },
  /** BFS over the street grid (prefers fewer turns via neighbour ordering) */
  path(a, b) {
    const N = CITY.GRID + 1, key = (i, j) => i * N + j, prev = new Map([[key(a[0], a[1]), null]]), q = [a];
    while (q.length) {
      const cur = q.shift();
      if (cur[0] === b[0] && cur[1] === b[1]) break;
      const nb = this.neighbors(cur[0], cur[1]).sort((p, r) => (Math.abs(p[0] - b[0]) + Math.abs(p[1] - b[1])) - (Math.abs(r[0] - b[0]) + Math.abs(r[1] - b[1])));
      for (const n of nb) { const k = key(n[0], n[1]); if (!prev.has(k)) { prev.set(k, cur); q.push(n); } }
    }
    const out = []; let cur = b;
    while (cur) { out.unshift(cur); cur = prev.get(key(cur[0], cur[1])); }
    return out;
  },

  zoneName(x, z) {
    if (Math.abs(x) > CITY.HALF + 4 || Math.abs(z) > CITY.HALF + 4) return 'Coastline';
    const i = clamp(Math.floor((x + CITY.HALF) / CITY.CELL), 0, CITY.GRID - 1), j = clamp(Math.floor((z + CITY.HALF) / CITY.CELL), 0, CITY.GRID - 1);
    const b = this.blocks[i * CITY.GRID + j];
    if (b.type === 'downtown') return 'Downtown';
    if (b.type === 'park') return b.i === 6 && b.j === 6 ? 'City Hall Plaza' : 'Aurelio Park';
    const a = Math.atan2(z, x), q = Math.abs(a) < Math.PI / 4 ? 'E' : Math.abs(a) > Math.PI * 0.75 ? 'W' : a > 0 ? 'S' : 'N';
    const names = {
      midtown: { N: 'North Hill', S: 'Harbor District', E: 'East Side', W: 'Arts District' },
      suburb: { N: 'Aurelio Hills', S: 'Gold Coast', E: 'Palm Vista', W: 'Sunset Flats' },
    };
    return names[b.type][q];
  },
};
