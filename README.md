# airupt.dev

A developer portfolio you sail through. You steer a little boat across a low-poly sea,
and each island opens a section: about, projects, skills and contact.
A classic HTML view shows the same content without 3D.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/
npm test         # layout and steering tests (Node's built-in runner)
npm run models   # rebuilds src/assets/models/world.glb from assets/kenney
npm run deploy   # build + deploy to Cloudflare (needs `npx wrangler login` once)
```

## Edit the content

- All text lives in `src/content/portfolio.js`: profile, sections, projects and the bottle messages.
  - A project can have an `image` (imported from `src/assets/projects/`) and a `url`.
- Island placement and section colours are in `src/world/layout.js`. A section's `id` there must match its `id` in the content file.

## Controls

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Sail | WASD or arrow keys | Stick or triggers |
| Boost | Shift or Space | RB |
| Open a section | E or Enter | A |
| Map | M | — |
| Captain's log | L | — |
| Photo mode | P (Space to shoot) | — |
| Reset | R | Y |

On touch devices an on-screen stick appears: point it where you want to sail.

## Structure

| Path | What it does |
| --- | --- |
| `src/engine/` | Renderer and post-processing (tilt-shift, bloom, grading), frame ticker, inputs, fixed-step physics, follow camera, sound, quality levels |
| `src/world/shading.js` | The shared stylised shader: tinted shadows, sea bounce light, waterline foam, cloud shadows, gradient fog, wind |
| `src/world/waves.js` | One wave function shared by the ocean shader, buoyancy, foam and particles |
| `src/world/` | Ocean, procedural islands, grass, foliage, Kenney props, boat and effects, birds, fish, day cycle, lights, zones, bottles, signs |
| `src/world/Logbook.js` | The captain's log: sixteen things to find, and the checks for the ones about where the boat is |
| `src/world/Treasure.js` | Bottles as treasure map pieces, the chest on the reef cay, and the map card in the log |
| `src/world/Wildlife.js` | Dolphins that race a boat going flat out, a whale at night, a tentacle by the wreck |
| `src/world/RingCourse.js` | The timed lap of rings round the home island |
| `src/world/layout.js` | Every hand-placed thing: islands, sea stacks, the arch, anchored boats, bottles, the start |
| `src/world/terrain.js` | Island ground heights as pure maths, shared by the meshes, the sea map and the tests |
| `src/ui/` | Loader, HUD, island labels, section panel, map, captain's log, photo mode, classic view |
| `src/content/` | Portfolio text |
| `scripts/build-models.mjs` | Bundles the hand-picked Kenney models into one GLB |
| `test/` | Checks that everything at sea is in open water, docks have shores, islands don't merge, and the touch stick steers right |

## Debugging

- In dev mode the app is available in the console as `window.experience`.
- `?time=0.6` starts at another time of day: 0 to 1, where 0.5 is sunset and 0.7 is night.
- `?quality=low` or `?quality=high` forces a quality level.
- `?touch=1` forces the touch interface (joystick, tap prompts).
- http://localhost:5173/scripts/phone.html shows the site in a 390×844 phone frame with touch forced on (dev only, not built).
- http://localhost:5173/scripts/coast.html draws every island's coastline from above (dev only).

## Licence

The code is MIT licensed (see `LICENSE`). Third-party models, sounds and fonts keep their own
licences, listed in `CREDITS.md`. The portfolio text, the profile picture and the project
images are not covered by the MIT licence; see the last section of `CREDITS.md`.
