# Vehicle models

`police.glb`: **Los Angeles Police Department Car** by
[hruschak30](https://sketchfab.com/hruschak30),
[source](https://sketchfab.com/3d-models/los-angeles-police-department-car-9102f6469b3b4477827b4a480fcc2c2e),
licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Uniformly scaled and grounded at runtime; original LAPD livery and roof/grille
lights are preserved, with siren flashing applied to their materials.

# Sports-car models

Drop self-contained sports-car `.glb` files in this directory, then reload the
page. The development server's directory listing is scanned before spawning
vehicles; every GLB is loaded once. `police.glb` and `van.glb` are reserved for
their own vehicle types, not included in the random sports-car pool.

Export Y-up with the nose toward +Z. For other forward axes, add an entry in
`Assets.manifest.cars` with the actual filename and `front` set to `-z`, `+x`, or
`-x`. Bounds cannot identify a car's nose. Each clone is uniformly scaled to
its vehicle spec length and grounded at y=0. Separate objects with `logo` or
`badge` in their names are removed; branding baked into textures/geometry is
not removed.

Name separate wheel objects/groups with `wheel` and paint materials with `body`
or `paint`. Wheels retain their authored transforms and get steering/spin
pivots. Paint is independently tinted per car, including taxis. Police retain
their livery, light bar, and existing model. Brake lights and blob shadows remain.

The player's and parked cars always retain full detail. Below a one-second
average of 45 FPS, moving traffic beyond 100 metres from the camera uses a
procedural low-detail sports-car model, returning to full detail within 80 metres
or above 50 FPS. The distance/FPS margins prevent flickering.

On static hosts without directory listings, explicitly register every filename
in `Assets.manifest.cars` before deployment. `alfa-romeo-t332.glb` is supplied
and explicitly registered. Its wheel parts were separated into four named
assemblies without changing their geometry/textures; separate badge meshes were
named for removal, and the export's slight tilt is corrected in the manifest.
