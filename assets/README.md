# Optional GLB models

The game uses Three.js r128 global scripts, with no build step. `js/assets.js`
contains the explicit manifest and discovers every GLB in `assets/cars/` from
the development server's directory listing (see `cars/README.md`). On static hosts
without directory listings, register the actual car filenames explicitly.
Its base URL is `assets/` on this site, not the
placeholder GitHub Pages URL. URLs are relative to the page, so subpath hosting
works. Remote hosting requires CORS permission from the asset server.

## Expected files

| Game type | Path |
| --- | --- |
| Sedan | `assets/cars/sedan.glb` |
| Sports | `assets/cars/sedan-sports.glb` |
| SUV | `assets/cars/suv.glb` |
| Van | `assets/cars/van.glb` |
| Taxi | `assets/cars/taxi.glb` |
| Police | `assets/cars/police.glb` |
| Current player (already uploaded) | `assets/trevor.glb` |

No building or animated-person files have been supplied yet. Do not invent
filenames: add their actual paths as `{ file: 'buildings/<filename>.glb', front: '+z' }`
or `{ file: 'people/<filename>.glb', front: '+z' }` entries in the manifest after
uploading. A static browser site cannot enumerate a GitHub Pages directory.

People index **0** is always the player (currently the static Trevor model).
Replace that entry with the desired rigged player. Indices **1 onward** are
pedestrians; with no such entries, pedestrians stay procedural. A missing or
invalid file falls back per item, without blocking the game. Every unique file
is fetched once per page load, including failed requests, with a 15-second timeout.

## Asset conventions

- Self-contained GLB, Y-up after glTF scene transforms. Embed textures and clips.
  Draco/KTX2/Meshopt assets need additional decoders and are not enabled here;
  export uncompressed GLB instead.
- `front` declares the model's original forward axis: `+z`, `-z`, `+x`, or `-x`.
  The adapter rotates it to +Z. A bounding box cannot determine which end is
  a nose or a doorway; verify and adjust this field when each real file arrives.
- Cars scale uniformly to the existing spec length. Name separate wheels or
  their parent groups with `wheel`. Wheels must be separate, non-skinned objects;
  meshes with wheels baked into the chassis cannot steer/spin independently.
  Materials containing `body` or `paint` get independent per-car tints (including
  taxis; police retain their original liveries). All non-police/non-van types
  randomly share the loaded sports-car pool. Separate `logo`/`badge` objects are
  removed before normalization. Headlight meshes/materials can be named
  `headlight`. Brake lamps, police flashers and blob shadows remain procedural.
- People scale to 1.8 metres. Name clips with `idle`, `walk`, `run`, and optionally
  `death`, `die` or `fall` (case-insensitive). Locomotion defaults to the first clip.
  Use **in-place animations**: gameplay, not animation root motion, moves people.
  Static files remain static; this adapter cannot create a missing rig or clips.
- Midtown/suburb buildings scale uniformly inside each generated lot, with their
  front toward the nearest street. Geometry/material pairs are instanced for static
  opaque models; skinned, animated, morphing or transparent models use regular
  clones. The final world bounds feed collisions and the existing minimap.
  Downtown towers stay procedural.

The currently absent car/building/animated-person models must be uploaded before
those real visuals, wheel naming, facing directions and animations can be verified.
