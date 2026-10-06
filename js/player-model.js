'use strict';

// The supplied GLB is a textured, static mesh (no skeleton or animation clips).
// Attach only to the player; the existing root still owns movement, collisions,
// vehicle visibility and respawning, and the body supplies its subtle bob/lean.
async function loadPlayerModel(character) {
  const gltf = await new THREE.GLTFLoader().loadAsync('assets/trevor.glb');
  const model = new THREE.Group();
  model.name = 'Player model';
  model.add(gltf.scene);
  model.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  if (!Number.isFinite(size.y) || size.y <= 0) throw new Error('Invalid player model dimensions');
  const scale = 1.93 / size.y;
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  model.traverse(node => {
    if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
  });

  // Retain the procedural rig as a fallback, but never render it over the model.
  for (const child of character.body.children) child.visible = false;
  character.body.add(model);
  character.model = model;
}
