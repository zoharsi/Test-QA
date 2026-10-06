'use strict';

// Paths are relative to baseURL. Add uploaded building/person filenames here.
// Index 0 is reserved for the player; pedestrians use indices 1 and above.
// front describes the asset's ORIGINAL forward axis after its glTF transforms.
const Assets = {
  baseURL: 'assets/',
  manifest: {
    cars: {
      sedan: { file: 'cars/sedan.glb', front: '+z' },
      sports: { file: 'cars/alfa-romeo-t332.glb', front: '+z', tilt: -0.03136960035380437 },
      suv: { file: 'cars/suv.glb', front: '+z' },
      van: { file: 'cars/van.glb', front: '+z' },
      taxi: { file: 'cars/taxi.glb', front: '+z' },
      police: { file: 'cars/police.glb', front: '+z' },
    },
    weapons: [
      { file: 'weapons/m4-v1.glb', name: 'M4 · v1' },
      { file: 'weapons/m4-v11.glb', name: 'M4 · v11' },
    ],
    buildings: [],
    neighborhoods: [{ file: 'london-city.glb', front: '+z' }],
    people: [
      { file: 'people/niko.glb', front: '+z', proceduralMotion: true }, // Player.
      { file: 'people/claude.glb', front: '+z' },
      { file: 'people/alien.glb', front: '+z', proceduralMotion: true },
    ],
  },
  cache: new Map(),
  _loadPromise: null,
  sportsCars: [],

  // The development static server exposes directory links. Explicit manifest
  // entries also work on hosts which do not offer directory listings.
  async discoverCars() {
    const entries = new Map(Object.values(this.manifest.cars).map(entry => [entry.file, entry]));
    try {
      const directory = new URL(this.baseURL + 'cars/', document.baseURI);
      const response = await fetch(directory, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const listing = new DOMParser().parseFromString(await response.text(), 'text/html');
        for (const link of listing.querySelectorAll('a[href]')) {
          const url = new URL(link.getAttribute('href'), directory);
          if (url.origin !== directory.origin || !url.pathname.startsWith(directory.pathname) || !/\.glb$/i.test(url.pathname)) continue;
          const file = 'cars/' + decodeURIComponent(url.pathname.slice(directory.pathname.length));
          if (!entries.has(file)) entries.set(file, { file, front: '+z' });
        }
      }
    } catch (error) {
      console.warn('Car directory unavailable; using registered models.', error);
    }
    const special = new Set(['police', 'van'].map(type => this.manifest.cars[type].file));
    this.sportsCars = [...entries.values()].filter(entry => !special.has(entry.file));
    return [...entries.values()];
  },

  load(onProgress = () => {}) {
    if (this._loadPromise) return this._loadPromise.then(() => onProgress(1));
    onProgress(0);
    this._loadPromise = this.discoverCars().then(async cars => {
    const files = [...new Set([
      ...cars, ...this.manifest.buildings, ...this.manifest.people, ...this.manifest.neighborhoods, ...this.manifest.weapons,
    ].map(entry => entry.file))];
    let completed = 0;
    onProgress(0);
    await Promise.all(files.map(async file => {
      const controller = new AbortController();
      let timer;
      try {
        const url = new URL(this.baseURL + file, document.baseURI).href;
        const timeout = new Promise((resolve, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Model load timed out')); }, 15000);
        });
        const request = async () => {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const bytes = await response.arrayBuffer();
          const gltf = await new Promise((resolve, reject) => {
            new THREE.GLTFLoader().parse(bytes, new URL('.', url).href, resolve, reject);
          });
          const bounds = new THREE.Box3().setFromObject(gltf.scene);
          const size = bounds.getSize(new THREE.Vector3());
          if (![size.x, size.y, size.z].every(v => Number.isFinite(v) && v > 0)) {
            throw new Error('Empty or invalid model bounds');
          }
          return gltf;
        };
        this.cache.set(file, await Promise.race([request(), timeout]));
      } catch (error) {
        this.cache.set(file, null);
        console.warn('Asset unavailable; keeping procedural fallback:', file, error);
      } finally {
        clearTimeout(timer);
        onProgress(++completed / files.length);
      }
    }));
    if (!files.length) onProgress(1);
    });
    return this._loadPromise;
  },

  clone(entry) {
    if (!entry) return null;
    const gltf = this.cache.get(entry.file);
    if (!gltf) return null;
    try {
      let skinned = false;
      gltf.scene.traverse(node => { if (node.isSkinnedMesh) skinned = true; });
      const scene = skinned ? THREE.SkeletonUtils.clone(gltf.scene) : gltf.scene.clone(true);
      return { scene, animations: (gltf.animations || []).filter(clip => clip.duration > 0), proceduralMotion: !!entry.proceduralMotion, front: entry.front || '+z', tilt: entry.tilt || 0, file: entry.file };
    } catch (error) {
      console.warn('Asset cannot be cloned; keeping procedural fallback:', entry.file, error);
      this.cache.set(entry.file, null);
      return null;
    }
  },
  car(type) {
    if (type === 'police' || type === 'van') return this.clone(this.manifest.cars[type]);
    const available = this.sportsCars.filter(entry => this.cache.get(entry.file));
    return this.clone(available[Math.floor(Math.random() * available.length)]);
  },
  building(i = Math.floor(Math.random() * this.manifest.buildings.length)) { return this.clone(this.manifest.buildings[i]); },
  person(i = 1 + Math.floor(Math.random() * Math.max(0, this.manifest.people.length - 1))) {
    return this.clone(this.manifest.people[i]);
  },

  // Preserve authored transforms inside a wrapper; never mutate cached geometry.
  oriented(asset) {
    const group = new THREE.Group(), facing = new THREE.Group();
    const yaw = { '+z': 0, '-z': Math.PI, '+x': -Math.PI / 2, '-x': Math.PI / 2 };
    facing.rotation.y = yaw[asset.front] || 0;
    facing.rotation.x = asset.tilt || 0;
    facing.add(asset.scene); group.add(facing);
    group.userData.assetFile = asset.file;
    return group;
  },
  // r128's Box3 ignores skinning. Measure posed vertices so imported rigs
  // with scaled armatures are grounded and sized by their rendered shape.
  modelBounds(object) {
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3(), vertex = new THREE.Vector3();
    object.traverseVisible(node => {
      if (!node.isMesh) return;
      if (node.isSkinnedMesh) {
        node.skeleton.update();
        const positions = node.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          vertex.fromBufferAttribute(positions, i);
          node.boneTransform(i, vertex);
          bounds.expandByPoint(vertex.applyMatrix4(node.matrixWorld));
        }
      } else {
        if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
        bounds.union(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
      }
    });
    return bounds;
  },
  normalize(asset, axis, target) {
    const group = this.oriented(asset);
    const bounds = this.modelBounds(group);
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const scale = target / size[axis];
    group.scale.setScalar(scale);
    group.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
    return group;
  },

  // The collider and minimap use the same world-space box as the rendered model.
  placeBuilding(world, index, lot, block) {
    const asset = this.building(index);
    if (!asset) return false;
    const model = this.oriented(asset);
    const streets = [
      { distance: lot.x - block.x0, yaw: -Math.PI / 2 },
      { distance: block.x0 + CITY.BLOCK - lot.x, yaw: Math.PI / 2 },
      { distance: lot.z - block.z0, yaw: Math.PI },
      { distance: block.z0 + CITY.BLOCK - lot.z, yaw: 0 },
    ];
    streets.sort((a, b) => a.distance - b.distance);
    model.rotation.y = streets[0].yaw;
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const scale = Math.min(lot.w / size.x, lot.d / size.z);
    model.scale.setScalar(scale);
    model.position.set(lot.x - center.x * scale, 0.25 - bounds.min.y * scale, lot.z - center.z * scale);
    model.updateMatrixWorld(true);
    bounds.setFromObject(model);
    world.addCollider(bounds.min.x, bounds.max.x, bounds.min.z, bounds.max.z, bounds.max.y);

    const meshes = [];
    let canInstance = asset.animations.length === 0;
    model.traverseVisible(node => {
      if (node.isMesh) {
        node.castShadow = node.receiveShadow = true;
        meshes.push(node);
        if (node.isSkinnedMesh || node.isInstancedMesh || node.morphTargetInfluences) canInstance = false;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        if (materials.some(m => m.transparent)) canInstance = false;
      } else if (!node.isGroup && node !== model && node.type !== 'Object3D') canInstance = false;
    });
    if (!canInstance) world.scene.add(model);
    else for (const mesh of meshes) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const key = mesh.geometry.uuid + ':' + materials.map(m => m.uuid).join(',');
      let batch = world.assetBuildingBatches.get(key);
      if (!batch) {
        batch = { geometry: mesh.geometry, material: mesh.material, matrices: [] };
        world.assetBuildingBatches.set(key, batch);
      }
      batch.matrices.push(mesh.matrixWorld.clone());
    }
    return true;
  },
  flushBuildings(world) {
    for (const batch of world.assetBuildingBatches.values()) {
      const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.matrices.length);
      batch.matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = mesh.receiveShadow = true;
      // r128 does not compute an aggregate bounding sphere for instance transforms.
      mesh.frustumCulled = false;
      mesh.name = 'Imported buildings';
      world.scene.add(mesh);
    }
    world.assetBuildingBatches.clear();
  },
};
