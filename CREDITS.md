# Credits

All code in this repository is original work written for airupt.dev.
Islands, Mount Airupt, ocean, sky, grass, foliage, gulls, wake, smoke, ramps, signs, project boards, the map picture and section buoys are generated in code.

## Inspiration

The idea of an explorable 3D portfolio was inspired by Bruno Simon's
[folio-2025](https://github.com/brunosimon/folio-2025) (MIT). Its source was studied to learn
techniques, which were then written from scratch here in our own GLSL and JavaScript:
- shadows tinted with a colour instead of darkened
- a tilt-shift blur and HDR-only bloom
- fog that doubles as the sky gradient
- single-triangle grass blades
- leaf-card foliage with bent normals
- noise baked into a texture at boot
- a colour-preset day cycle

No code, models, textures, sounds or fonts from it are used.

## 3D models

All by [Kenney](https://www.kenney.nl), CC0 1.0 (public domain). Thank you, Kenney!
Source files and licence texts are in `assets/kenney/`.

- Watercraft Kit: speedboat, sailboat, fishing boat, houseboat
- Pirate Kit: palm trees, barrels, crates, bottle, shipwreck
- Survival Kit: fish
- Fantasy Town Kit: cart

## Sound

All CC0 1.0. Provenance notes are in `assets/freesound/` and `assets/kenney/ui-audio/`.

- "Calm ocean waves" by SamsterBirdies, https://freesound.org/s/578524/ (trimmed into a 30 s loop)
- "Speedboat Loop" by morganpurkis, https://freesound.org/s/394287/
- "Splash" by swordofkings128, https://freesound.org/s/398032/
- "SHIP DOCK IMPACT WOOD" by allsowill, https://freesound.org/s/865175/ (trimmed)
- "Seagulls_short" by Lydmakeren, https://freesound.org/s/510917/ (trimmed)
- "boat knocks fiberglass water laps on hull" by kyles, https://freesound.org/s/637206/ (cut into a 12 s loop)
- UI Audio and Interface Sounds by [Kenney](https://www.kenney.nl): click, chime, open, close, glass
- The volcano rumble is synthesised in the browser (filtered noise), not a recording

## Fonts

SIL Open Font License 1.1. Licence texts ship next to the fonts in `public/fonts/`.
Both are subset to Latin characters; Bricolage Grotesque is pinned to one width and optical size.

- Bricolage Grotesque by Mathieu Triay, Copyright 2022 The Bricolage Grotesque Project Authors
  (https://github.com/ateliertriay/bricolage)
- Figtree by Erik Kennedy, Copyright 2022 The Figtree Project Authors
  (https://github.com/erikdkennedy/figtree)

## Libraries

| Library | Licence |
| --- | --- |
| [three.js](https://threejs.org) | MIT |
| [Rapier](https://rapier.rs) (`@dimforge/rapier3d-compat`) | Apache-2.0 |
| [Vite](https://vite.dev) (build only) | MIT |
| [glTF-Transform](https://gltf-transform.dev) (build only) | MIT |
| [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (deploy only) | MIT OR Apache-2.0 |
