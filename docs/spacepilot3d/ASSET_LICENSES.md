# Space Pilot 3D asset provenance

## R2 current spacecraft: Aurora — original project geometry

- Shipped model: `public/spacepilot3d/models/aurora.glb`.
- Editable, deterministic source: `docs/spacepilot3d/assets/create-aurora.mjs`; regenerate with `node docs/spacepilot3d/assets/create-aurora.mjs`.
- Created specifically for this project from authored fuselage stations, beveled wing/service panels, canopy surfaces, engine profiles, vent grids, fasteners and inlays. No third-party spacecraft mesh or texture is incorporated; no additional third-party asset license or attribution is required for commercial use of this original asset.
- Six merged PBR material meshes. Metallic ceramic/alloy surfaces, blue titanium, graphite recesses, steel, clear-coated smoked canopy and emissive inlays are encoded in the GLB. The geometry is authored in the unchanged collision-proxy coordinate envelope, facing -Z. Upgrade attachments remain separate runtime cosmetics.
- Three.js GLTFExporter and BufferGeometryUtils use the existing MIT-licensed dependency. They are authoring tools; no new application dependency was installed.
- Evaluated sources: [Quaternius Spaceships](https://quaternius.com/packs/spaceships.html) is explicitly CC0 but remains a simple low-poly pack. [Benjamin97 Spaceship](https://blendswap.com/blend/8098) is CC0 but requires a logged-in download and references external texture issues. Neither was downloaded or incorporated into Aurora. Creating a new model avoided carrying the existing stylized hull forward or importing an asset with unverified dependencies.
- The user's reference image guided the general white/blue craft and twin-exhaust direction. It was not sampled into a texture, used as a background, or substituted for geometry.

R2 planets, cloud/terrain/day-night shaders, gas bands, irregular cratered rocks, fiery cracks, gold stars and nebula remain original procedural project assets. There are no newly downloaded environment textures. The R1 Bob file below is preserved for historical reproducibility but is no longer loaded by the active experimental renderer.

## Historical R1 spacecraft: Bob — Quaternius Ultimate Spaceships Pack

- Author and publisher: Quaternius.
- Primary source: https://quaternius.com/packs/ultimatespaceships.html
- Author's announcement: https://www.patreon.com/quaternius/posts/ultimate-pack-51541119
- License: **CC0 1.0 Universal**, verified on the publisher's page. Commercial use, modification and redistribution permitted. https://creativecommons.org/publicdomain/zero/1.0/
- Official download folder: https://drive.google.com/drive/folders/1NpfT3wqe2k3Jwue2xryi7tzxP4bWzETu
- The official individual glTF and license downloads returned a Google Drive quota-exceeded page during acquisition. No HTML error page is shipped as an asset.
- Public redistribution used for the identical named pack: https://github.com/euuuuuuan/voidclad-public/tree/main/assets/vendor/quaternius_ultimate_spaceships
- Download: https://raw.githubusercontent.com/euuuuuuan/voidclad-public/main/assets/vendor/quaternius_ultimate_spaceships/Bob.gltf
- Redistribution provenance: https://github.com/euuuuuuan/voidclad-public/blob/main/THIRD_PARTY_ASSETS.md
- Shipped file: `public/spacepilot3d/models/bob.glb`. Source glTF base64 buffer converted to binary GLB. Original mesh and embedded 2048px diffuse PNG unchanged. No mirror code or other game assets imported.
- Runtime modifications: fit model to the existing visual/collision envelope, rotate to -Z forward, recolor orange paint blue in the material shader while retaining panel markings, set PBR metalness/roughness; add paired engine housings, glows and cosmetic upgrade attachments.
- Insurgent from the same pack was evaluated and rejected for its bulky silhouette. It is not part of the final shipped scene.
- Attribution is voluntary under CC0; credit is retained here. No endorsement implied.

## Procedural scene assets

Rock meshes and rock/fire shaders, beveled gold stars, procedural planet/nebula, starfields, radial glow texture, pooled collection/impact particles and upgrade attachments were authored in repository TypeScript. There are no externally sourced asteroid, planet or sky textures. They are live Three.js geometry/materials/effects, not a rendered gameplay image.

## Renderer support

Three.js `RoomEnvironment`, `GLTFLoader` and renderer: existing `three` dependency, MIT license, https://github.com/mrdoob/three.js/blob/dev/LICENSE. No new package dependency was added in Phases 05–07.

## User reference

`IMG_1448.JPG` is used only as a visual comparison reference. It is not copied into public assets, used as the scene background, or claimed as a gameplay screenshot.

## Integrity

- `Bob.gltf`: 3,718,805 bytes; SHA-256 `73f187cd1a11e487a1b20405bfa59d3d9f98ef4960ee64e3f062a7373aa095ad`.
- `bob.glb`: 2,788,144 bytes; SHA-256 `ea2760841fe9d7fc3f0c141ae5b88c55367ef0ba3232e9c014b7097e9533996c`.

## R3 golden rings and library illustration

Golden ring/annular-glow geometry, Arabic instruction-card CSS illustrations and the local library's spacecraft/ring SVG are original project-authored code. They use the existing Three.js MIT dependency and introduce no externally sourced model, texture, image or package. Aurora and its R2 provenance remain unchanged. Static library/card illustrations are not used to simulate gameplay on Display.
