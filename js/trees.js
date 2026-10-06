'use strict';

// Merge the willow's hundreds of leaf cards by material, then instance both
// species in spatial tiles. All copies share geometry/textures, not scene rigs.
const ImportedTrees = {
  tiles: [], templates: [], count: 0, animationT: 0,
  build(world, trees, palms) {
    const assets = Assets.manifest.trees.map(entry => Assets.clone(entry));
    if (assets.some(asset => !asset)) return false;
    this.templates = assets.map(asset => this.prepare(asset));
    const groups = new Map(), dummy = new THREE.Object3D();
    const placements = [...trees.map(p => ({ p, height: 7.4 })), ...palms.map(p => ({ p, height: 9 }))];
    placements.forEach(({ p, height }, i) => {
      const [x, z, size, rotation, y = 0.25] = p;
      const species = i % 2;
      const gx = Math.floor(x / 80), gz = Math.floor(z / 80), key = `${gx},${gz},${species}`;
      if (!groups.has(key)) groups.set(key, { gx, gz, species, matrices: [] });
      const template = this.templates[species];
      dummy.position.set(x, y, z); dummy.rotation.set(0, rotation * Math.PI * 2, 0);
      dummy.scale.setScalar(size * height / template.height); dummy.updateMatrix();
      groups.get(key).matrices.push(dummy.matrix.clone());
    });
    for (const batch of groups.values()) {
      const group = new THREE.Group(); group.name = 'Imported tree tile';
      group.userData.species = batch.species;
      for (const part of this.templates[batch.species].parts) {
        const mesh = new THREE.InstancedMesh(part.geometry, part.material, batch.matrices.length);
        batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
        mesh.instanceMatrix.needsUpdate = true;
        // r128 cannot infer world-space bounds from instance matrices.
        mesh.frustumCulled = false;
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.name = Assets.manifest.trees[batch.species].file;
        group.add(mesh);
      }
      const center = new THREE.Vector3((batch.gx + 0.5) * 80, 8, (batch.gz + 0.5) * 80);
      this.tiles.push({ group, center }); world.scene.add(group);
    }
    this.count = placements.length;
    return true;
  },
  prepare(asset) {
    const root = asset.scene;
    let mixer = null;
    if (/animated/.test(asset.file) && asset.animations.length) {
      mixer = new THREE.AnimationMixer(root);
      mixer.clipAction(asset.animations[0]).play(); mixer.update(0);
    }
    // Tree Animate contains three separate trees side by side in one mesh.
    // Keep the tree at the authored origin, including its UVs and morph data.
    if (/animated/.test(asset.file)) root.traverse(node => {
      if (!node.isMesh) return;
      const geometry = node.geometry.clone(), positions = geometry.attributes.position;
      const index = geometry.index, kept = [], count = index ? index.count : positions.count;
      for (let i = 0; i < count; i += 3) {
        const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
        if ((positions.getX(a) + positions.getX(b) + positions.getX(c)) / 3 > -35) kept.push(a, b, c);
      }
      geometry.setIndex(kept);
      // Box3 scans all POSITION entries, even vertices omitted by the index.
      const box = new THREE.Box3(), point = new THREE.Vector3();
      for (const i of kept) box.expandByPoint(point.fromBufferAttribute(positions, i));
      geometry.boundingBox = box;
      node.geometry = geometry;
    });
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root), parts = [], merged = new Map();
    // Anchor the base, not the midpoint of a leaning trunk and its branches.
    const trunk = root.getObjectByName('Trunk_bark_0') || root.getObjectByName('Object_4');
    const anchor = bounds.getCenter(new THREE.Vector3());
    let groundY = bounds.min.y;
    if (trunk) {
      const positions = trunk.geometry.attributes.position, indices = trunk.geometry.index;
      const point = new THREE.Vector3(), base = new THREE.Box3();
      const trunkBounds = new THREE.Box3().setFromObject(trunk);
      const cutoff = trunkBounds.min.y + (trunkBounds.max.y - trunkBounds.min.y) * 0.02;
      for (let i = 0, n = indices ? indices.count : positions.count; i < n; i++) {
        point.fromBufferAttribute(positions, indices ? indices.getX(i) : i).applyMatrix4(trunk.matrixWorld);
        if (point.y <= cutoff) base.expandByPoint(point);
      }
      if (!base.isEmpty()) { base.getCenter(anchor); groundY = base.min.y; }
    }
    const offset = new THREE.Matrix4().makeTranslation(-anchor.x, -groundY, -anchor.z);
    root.traverse(node => {
      if (!node.isMesh) return;
      const material = node.material.clone();
      // Loader flags still request GPU morph attributes after CPU baking.
      // Disable them on our copies to stay within the instancing attribute limit.
      material.morphTargets = false; material.morphNormals = false;
      if (/aiStandardSurface|Leaf|Branch/i.test(material.name)) {
        material.transparent = false; material.depthWrite = true;
        material.alphaTest = material.alphaTest || 0.4; material.side = THREE.DoubleSide;
      }
      const matrix = new THREE.Matrix4().multiplyMatrices(offset, node.matrixWorld);
      if (node.morphTargetInfluences) {
        const geometry = node.geometry.clone();
        // r128 InstancedMesh has no per-instance morph support. Bake one shared
        // animated pose on the CPU, then let every instance reuse those vertices.
        geometry.morphAttributes = {};
        geometry.applyMatrix4(matrix);
        geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
        parts.push({ geometry, material, source: node, matrix });
      } else {
        const geometry = (node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone());
        geometry.applyMatrix4(matrix);
        const key = node.material.uuid;
        if (!merged.has(key)) merged.set(key, { material, geometries: [] });
        else material.dispose();
        merged.get(key).geometries.push(geometry);
      }
    });
    for (const { material, geometries } of merged.values()) {
      const geometry = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        if (!geometries.every(g => g.attributes[name])) continue;
        const size = geometries[0].attributes[name].itemSize;
        const array = new Float32Array(geometries.reduce((n, g) => n + g.attributes[name].array.length, 0));
        let cursor = 0;
        for (const g of geometries) { array.set(g.attributes[name].array, cursor); cursor += g.attributes[name].array.length; }
        geometry.setAttribute(name, new THREE.BufferAttribute(array, size));
      }
      geometry.computeBoundingSphere();
      parts.push({ geometry, material });
      for (const g of geometries) g.dispose();
    }
    return { parts, mixer, height: bounds.max.y - groundY };
  },
  update(dt, camera) {
    if (!this.tiles.length || !camera) return;
    const distance = Game.settings.quality === 'low' ? 180 : 320;
    for (const tile of this.tiles) tile.group.visible = tile.center.distanceTo(camera.position) < distance;
    this.animationT += dt;
    if (this.animationT < 0.1) return;
    for (const template of this.templates) {
      if (!template.mixer) continue;
      template.mixer.update(this.animationT);
      for (const part of template.parts) {
        if (!part.source) continue;
        const source = part.source, base = source.geometry.attributes.position;
        const targets = source.geometry.morphAttributes.position, weights = source.morphTargetInfluences;
        const output = part.geometry.attributes.position, e = part.matrix.elements;
        for (let i = 0; i < base.count; i++) {
          const bx = base.getX(i), by = base.getY(i), bz = base.getZ(i);
          let x = bx, y = by, z = bz;
          for (let t = 0; t < targets.length; t++) {
            const w = weights[t]; if (!w) continue;
            const target = targets[t], relative = source.geometry.morphTargetsRelative;
            x += (target.getX(i) - (relative ? 0 : bx)) * w;
            y += (target.getY(i) - (relative ? 0 : by)) * w;
            z += (target.getZ(i) - (relative ? 0 : bz)) * w;
          }
          output.setXYZ(i, e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
        }
        output.needsUpdate = true;
      }
    }
    this.animationT = 0;
  },
};
