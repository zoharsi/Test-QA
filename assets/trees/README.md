# Imported tree models

- `willow.glb`: **Willow Tree** by vervoortward, CC BY 4.0.
  Source: https://sketchfab.com/3d-models/willow-tree-7bd70b487fae4f3eb70d4e69394e97b4
- `animated.glb`: **Tree Animate** by RandyGF, CC BY 4.0.
  Source: https://sketchfab.com/3d-models/tree-animate-f0f9eb5e6c104bbb8e1f41c97019e6f2

License: https://creativecommons.org/licenses/by/4.0/

Original GLB files are unchanged. Runtime grounds and scales both models to replace all generated broadleaf trees and palms (including beach palms), preserving placement RNG and trunk collision bounds. Tree Animate includes three trees in one mesh; runtime keeps the origin tree, including its morph and texture data. Both species are centered on the trunk base rather than the full trunk bounds, aligning visible roots with the colliders. Beach placements on the London access bridge are excluded before collisions are created. Willow leaf cards are merged by material, with alpha cutout enabled. Tree Animate's original morph animation is baked into shared instanced geometry at 10 Hz because Three.js r128 does not support per-instance morph targets. Willow is rendered in its static authored pose. Spatial tiles limit draw distance according to graphics quality. Attribution also appears in the game's About panel.
