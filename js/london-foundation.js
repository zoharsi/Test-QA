'use strict';

// Fill the gap under the authored raised road terraces, without shifting the
// lower streets underground. One merged mesh keeps the extra draw cost small.
function buildLondonFoundation(world, streets) {
  const geometry = new GeoBuilder(), edges = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  const color = new THREE.Color(0x9c9a94);
  const key = point => point.toArray().map(n => n.toFixed(2)).join(',');
  for (const node of streets) {
    // The authored bridge/tunnel must keep its open space underneath.
    if (!/WorldCityStreet1Mat/.test(node.material.name)) continue;
    const positions = node.geometry.attributes.position, index = node.geometry.index;
    for (let i = 0; index && i < index.count; i += 3) {
      a.fromBufferAttribute(positions, index.getX(i)).applyMatrix4(node.matrixWorld);
      b.fromBufferAttribute(positions, index.getX(i + 1)).applyMatrix4(node.matrixWorld);
      c.fromBufferAttribute(positions, index.getX(i + 2)).applyMatrix4(node.matrixWorld);
      const normal = ab.subVectors(b, a).cross(ac.subVectors(c, a)).normalize();
      if (normal.y < 0.85 || Math.max(a.y, b.y, c.y) < 0.15) continue;
      for (const [start, end] of [[a, b], [b, c], [c, a]]) {
        const ids = [key(start), key(end)].sort(), id = ids.join('|');
        const edge = edges.get(id);
        if (edge) edge.count++;
        else edges.set(id, { start: start.clone(), end: end.clone(), count: 1 });
      }
    }
  }
  for (const { start, end, count } of edges.values()) {
    if (count !== 1) continue;
    const topA = [start.x, Math.max(-0.05, start.y - 0.04), start.z];
    const topB = [end.x, Math.max(-0.05, end.y - 0.04), end.z];
    geometry.quad([start.x, -0.05, start.z], [end.x, -0.05, end.z], topB, topA, 0, 0, 1, 1, color);
  }
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry.build(), material);
  mesh.name = 'London terrace foundations'; mesh.castShadow = mesh.receiveShadow = true;
  world.scene.add(mesh);
  return mesh;
}
