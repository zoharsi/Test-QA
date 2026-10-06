# Agent notes

- Pure static site (no build, no deps). Three.js r128 and Google Fonts load from CDN.
- Served by python http.server in `docker-compose.base44.yml` with the repo bind-mounted read-only; edits are live on browser reload (no HMR).
- Verify: `curl localhost:3000/` returns index.html; game needs WebGL in the browser.
- Cars are discovered from the Python server's `assets/cars/` directory listing; hosts without listings need explicit entries in `js/assets.js`. Non-police/non-van vehicles randomly share the loaded sports pool. The supplied Alfa Romeo is registered explicitly with a small X tilt correction; its GLB wheel geometry was split into four named assemblies and separate badge meshes were named for removal. Lucia is the player; Claude is the pedestrian pool. Both are skinned but have no clips (exported static poses). `assets/trevor.glb` remains unused. Index 0 is the player, other people entries are NPCs. Car forward axes must be authored +Z or declared in the manifest; bounds cannot determine the nose.
- Vehicles.sampleFrame measures uncapped frame time even in the menu; a one-second FPS average below 45 enables procedural sports-car proxies for distant moving traffic only. Player and parked cars remain detailed; 80/100m and 45/50 FPS margins prevent LOD flicker.
- Load Assets before World.build, not only before vehicles: building placement needs the cache. Model selection uses a separate RNG so skipped procedural visuals still consume the original world RNG sequence.
- Three.js r128 instanced building batches disable frustum culling because that version does not compute instance-aware bounds; animation uses SkeletonUtils clones and per-character mixers.
- r128 Box3 ignores skinned poses. Assets.modelBounds measures bone-transformed vertices before character normalization: Lucia's scaled armature otherwise makes her render about five times too small; Claude's skinned waist also needs posed bounds.
