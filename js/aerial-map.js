'use strict';

// A cached daylight survey of the actual city, using the same north-up X/Z
// projection as the map's existing markers and click-to-travel coordinates.
const AerialMap = {
  canvas: null,
  build(renderer, scene) {
    const size = 2048, extent = World.mapExtent;
    const camera = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 1, 6000);
    camera.position.set(0, 3000, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    const previousSize = renderer.getSize(new THREE.Vector2());
    const pixelRatio = renderer.getPixelRatio();
    const sun = new THREE.DirectionalLight(0xfff5df, 2.1);
    sun.position.set(-900, 1800, -600);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 5000 });
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.1;
    const hemi = new THREE.HemisphereLight(0xd4e5ef, 0x8d8267, 0.9);
    const hidden = [];
    scene.traverse(node => {
      if (node.isLight || node === World.sky || node === World.stars || node.material === World.mtnMat) {
        hidden.push([node, node.visible]); node.visible = false;
      }
    });
    const materials = new Set();
    scene.traverse(node => {
      if (node.material) for (const material of (Array.isArray(node.material) ? node.material : [node.material])) materials.add(material);
    });
    const emissions = [];
    for (const material of materials) if (material.emissiveIntensity !== undefined) {
      emissions.push([material, material.emissiveIntensity]); material.emissiveIntensity = 0;
    }
    const fog = scene.fog, exposure = renderer.toneMappingExposure;
    const previousTarget = renderer.getRenderTarget(), water = World.waterMat.color.clone();
    const specular = World.waterMat.specular.clone(), normalScale = World.waterMat.normalScale.clone();
    const shadows = renderer.shadowMap.enabled;
    try {
      scene.fog = null;
      scene.add(sun, sun.target, hemi);
      World.waterMat.color.setHex(0x236b8a);
      World.waterMat.specular.setHex(0x000000);
      World.waterMat.normalScale.set(0, 0);
      renderer.toneMappingExposure = 0.9;
      renderer.shadowMap.enabled = true;
      // r128 skips display tone mapping on offscreen render targets. Copy the
      // daylight framebuffer synchronously instead, before the game loop starts.
      renderer.setRenderTarget(null);
      renderer.setPixelRatio(1);
      renderer.setSize(size, size, false);
      renderer.render(scene, camera);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(renderer.domElement, 0, 0);
      this.canvas = canvas;
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.toneMappingExposure = exposure;
      renderer.shadowMap.enabled = shadows;
      scene.fog = fog;
      World.waterMat.color.copy(water);
      World.waterMat.specular.copy(specular);
      World.waterMat.normalScale.copy(normalScale);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(previousSize.x, previousSize.y, false);
      scene.remove(sun, sun.target, hemi);
      for (const [node, visible] of hidden) node.visible = visible;
      for (const [material, intensity] of emissions) material.emissiveIntensity = intensity;
      if (sun.shadow.map) sun.shadow.map.dispose();
    }
  },
};
