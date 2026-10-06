# Agent notes

- Pure static site (no build, no deps). Three.js r128 and Google Fonts load from CDN.
- Served by python http.server in `docker-compose.base44.yml` with the repo bind-mounted read-only; edits are live on browser reload (no HMR).
- Verify: `curl localhost:3000/` returns index.html; game needs WebGL in the browser.
- Optional GLBs are explicitly listed in `js/assets.js` (see `assets/README.md`); missing car files deliberately warn and retain the procedural fallback. Only `assets/trevor.glb` is currently supplied; it has no rig/clips. Index 0 is the player, other people entries are NPCs.
- Load Assets before World.build, not only before vehicles: building placement needs the cache. Model selection uses a separate RNG so skipped procedural visuals still consume the original world RNG sequence.
- Three.js r128 instanced building batches disable frustum culling because that version does not compute instance-aware bounds; animation uses SkeletonUtils clones and per-character mixers.
