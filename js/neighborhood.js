'use strict';

// A complete authored district is placed once, never repeated in building lots.
const Neighborhood = {
  model: null, bounds: null, streets: [], bridge: null,
  ray: new THREE.Raycaster(), down: new THREE.Vector3(0, -1, 0),

  build(world) {
    const asset = Assets.clone(Assets.manifest.neighborhoods[0]);
    if (!asset) return;
    const model = Assets.oriented(asset), buildings = [], visible = [];
    model.updateMatrixWorld(true);
    model.traverse(node => {
      if (!node.isMesh) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const name = materials.map(m => m.name).join(' ');
      // Exported helpers and zero-opacity lightmap duplicates are not scenery.
      if (/CollisionTraffic|InvisibleWall|Lightmap/i.test(name)) { node.visible = false; return; }
      visible.push(node);
      if (/WorldCityBuildings\d+Mat/.test(name)) buildings.push(node);
      if (/WorldCityStreet1Mat|BridgeAndTunnel/.test(name)) this.streets.push(node);
      node.castShadow = !/Street|Sea/.test(name); node.receiveShadow = true;
    });
    const urban = new THREE.Box3();
    for (const node of buildings) urban.union(new THREE.Box3().setFromObject(node));
    if (urban.isEmpty()) return;
    // The export also contains distant terrain and invisible driving bounds.
    // Keep its urban area, without those large outlying triangles.
    urban.min.x -= 28; urban.max.x += 28;
    urban.min.z -= 28; urban.max.z += 28;
    const v = new THREE.Vector3();
    for (const node of visible) {
      const geometry = node.geometry.clone(), positions = geometry.attributes.position;
      const old = geometry.index, count = old ? old.count : positions.count, indices = [];
      for (let i = 0; i < count; i += 3) {
        const ids = [0, 1, 2].map(k => old ? old.getX(i + k) : i + k);
        const inside = ids.every(id => {
          v.fromBufferAttribute(positions, id).applyMatrix4(node.matrixWorld);
          return v.x >= urban.min.x && v.x <= urban.max.x && v.z >= urban.min.z && v.z <= urban.max.z;
        });
        if (inside) indices.push(...ids);
      }
      geometry.setIndex(indices); geometry.clearGroups();
      node.geometry = geometry;
      if (!indices.length) node.visible = false;
    }
    const size = urban.getSize(new THREE.Vector3()), center = urban.getCenter(new THREE.Vector3());
    const scale = 720 / size.z;
    const south = -CITY.HALF - 70;
    model.scale.setScalar(scale);
    // The principal authored road deck is at y=-10, not the terrain minimum.
    model.position.set(CITY.CELL - center.x * scale, 10 * scale, south - urban.max.z * scale);
    model.name = 'London District'; world.scene.add(model); model.updateMatrixWorld(true);
    this.model = model;
    this.bounds = { minX: CITY.CELL - size.x * scale / 2, maxX: CITY.CELL + size.x * scale / 2,
      minZ: south - 720, maxZ: south };
    const b = this.bounds;
    const land = new THREE.Mesh(UNIT_BOX, world.mats.concrete);
    land.position.set(CITY.CELL, -0.6, (b.minZ + b.maxZ) / 2);
    land.scale.set(b.maxX - b.minX + 24, 1.2, 744); land.receiveShadow = true;
    world.scene.add(land);
    // A level access boulevard runs outside the authored building footprint.
    const road = (x, z, w, d) => {
      const m = new THREE.Mesh(UNIT_PLANE, new THREE.MeshStandardMaterial({ color: 0x3a3c41, roughness: 0.65 }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.025, z); m.scale.set(w, d, 1);
      m.receiveShadow = true; world.scene.add(m);
      const line = new THREE.Mesh(UNIT_PLANE, world.mats.yellow);
      line.rotation.x = -Math.PI / 2; line.position.set(x, 0.035, z); line.scale.set(w > d ? w : 0.15, w > d ? 0.15 : d, 1);
      world.scene.add(line);
    };
    const bridgeX = Math.round(CITY.CELL / CITY.CELL) * CITY.CELL;
    this.bridge = { x: bridgeX, minZ: south - 12, maxZ: -CITY.HALF + 1, halfW: CITY.ROAD / 2 };
    const bridge = this.bridge, length = bridge.maxZ - bridge.minZ;
    const deck = new THREE.Mesh(UNIT_BOX, world.mats.concrete);
    deck.position.set(bridge.x, -0.45, (bridge.minZ + bridge.maxZ) / 2);
    deck.scale.set(CITY.ROAD + 2, 0.9, length); deck.receiveShadow = true; world.scene.add(deck);
    road(bridge.x, deck.position.z, CITY.ROAD, length);
    road(CITY.CELL, south, b.maxX - b.minX + 24, 16);
    road(b.minX - 4, (b.minZ + south) / 2, 16, 736);
    road(b.maxX + 4, (b.minZ + south) / 2, 16, 736);
    road(CITY.CELL, b.minZ, b.maxX - b.minX + 24, 16);
    for (const x of [bridge.x - 9, bridge.x + 9]) {
      const rail = new THREE.Mesh(UNIT_BOX, world.mats.concrete);
      rail.position.set(x, 0.55, deck.position.z); rail.scale.set(0.6, 1.1, length); world.scene.add(rail);
      world.addCollider(x - 0.3, x + 0.3, bridge.minZ, bridge.maxZ, 1.1);
    }
    this.foundation = buildLondonFoundation(world, this.streets);
    this.buildingFoundations = new GeoBuilder();
    // Separate buildings are baked into six meshes. Weld shared positions and
    // bound connected pieces, rather than blocking each entire city-wide mesh.
    this.colliderCount = 0;
    for (const node of buildings) this.addBuildingColliders(world, node);
    const foundations = new THREE.Mesh(this.buildingFoundations.build(), this.foundation.material);
    foundations.name = 'London building foundations';
    foundations.castShadow = foundations.receiveShadow = true; world.scene.add(foundations);
    this.buildingFoundations = null;
  },

  addBuildingColliders(world, node) {
    const p = node.geometry.attributes.position, index = node.geometry.index;
    if (!index) return;
    const parents = new Map(), keys = [], point = new THREE.Vector3();
    const find = key => {
      if (!parents.has(key)) parents.set(key, key);
      let root = key;
      while (parents.get(root) !== root) root = parents.get(root);
      while (parents.get(key) !== key) { const next = parents.get(key); parents.set(key, root); key = next; }
      return root;
    };
    for (let i = 0; i < p.count; i++) keys.push([p.getX(i), p.getY(i), p.getZ(i)].map(n => n.toFixed(2)).join(','));
    for (let i = 0; i < index.count; i += 3) {
      const root = find(keys[index.getX(i)]);
      for (let j = 1; j < 3; j++) parents.set(find(keys[index.getX(i + j)]), root);
    }
    const boxes = new Map();
    for (let i = 0; i < index.count; i++) {
      const id = index.getX(i), root = find(keys[id]);
      if (!boxes.has(root)) boxes.set(root, new THREE.Box3());
      boxes.get(root).expandByPoint(point.fromBufferAttribute(p, id).applyMatrix4(node.matrixWorld));
    }
    for (const box of boxes.values()) {
      if (box.max.y - box.min.y < 2 || box.min.y > 12) continue;
      world.addCollider(box.min.x, box.max.x, box.min.z, box.max.z, box.max.y);
      if (box.min.y > 0.15) {
        this.buildingFoundations.box({ x: (box.min.x + box.max.x) / 2, z: (box.min.z + box.max.z) / 2,
          y: -0.05, w: box.max.x - box.min.x, d: box.max.z - box.min.z,
          h: box.min.y + 0.05, col: new THREE.Color(0x9c9a94) });
      }
      this.colliderCount++;
    }
  },

  contains(x, z, pad = 0) {
    const b = this.bounds;
    return !!b && x >= b.minX - 12 + pad && x <= b.maxX + 12 - pad && z >= b.minZ - 12 + pad && z <= b.maxZ + 12 - pad;
  },
  onBridge(x, z, pad = 0) {
    const b = this.bridge;
    return !!b && Math.abs(x - b.x) <= b.halfW - pad && z >= b.minZ && z <= b.maxZ;
  },
  groundHeight(x, z) {
    if (!this.contains(x, z)) return 0;
    this.ray.set(new THREE.Vector3(x, 80, z), this.down);
    const hits = this.ray.intersectObjects(this.streets, false);
    return hits.length ? Math.max(0, hits[0].point.y) : 0;
  },
  constrain(p, radius = 0) {
    if (!this.bounds || (Math.abs(p.x) <= CITY.BOUND - radius && Math.abs(p.z) <= CITY.BOUND - radius) ||
      this.contains(p.x, p.z, radius) || this.onBridge(p.x, p.z, radius)) return;
    const b = this.bounds, bridge = this.bridge;
    const candidates = [
      [clamp(p.x, -CITY.BOUND + radius, CITY.BOUND - radius), clamp(p.z, -CITY.BOUND + radius, CITY.BOUND - radius)],
      [clamp(p.x, b.minX - 12 + radius, b.maxX + 12 - radius), clamp(p.z, b.minZ - 12 + radius, b.maxZ + 12 - radius)],
      [clamp(p.x, bridge.x - bridge.halfW + radius, bridge.x + bridge.halfW - radius), clamp(p.z, bridge.minZ, bridge.maxZ)],
    ];
    candidates.sort((a, b) => Math.hypot(a[0] - p.x, a[1] - p.z) - Math.hypot(b[0] - p.x, b[1] - p.z));
    [p.x, p.z] = candidates[0];
  },
  drawMap(g, X, k) {
    if (!this.bounds) return;
    const b = this.bounds, bridge = this.bridge;
    g.fillStyle = '#566070';
    g.fillRect(X(b.minX - 12), X(b.minZ - 12), (b.maxX - b.minX + 24) * k, 744 * k);
    g.fillRect(X(bridge.x - bridge.halfW), X(bridge.minZ), CITY.ROAD * k, (bridge.maxZ - bridge.minZ) * k);
    // Project the authored road triangles so the map reflects its actual layout.
    const v = new THREE.Vector3(); g.fillStyle = '#707b88';
    for (const node of this.streets) {
      const p = node.geometry.attributes.position, ids = node.geometry.index;
      for (let i = 0; ids && i < ids.count; i += 3) {
        g.beginPath();
        for (let j = 0; j < 3; j++) {
          v.fromBufferAttribute(p, ids.getX(i + j)).applyMatrix4(node.matrixWorld);
          if (j) g.lineTo(X(v.x), X(v.z)); else g.moveTo(X(v.x), X(v.z));
        }
        g.closePath(); g.fill();
      }
    }
  },
};
