# airupt.dev

A developer portfolio you sail through. You steer a little boat across a low-poly sea,
and each island opens a section: about, projects, skills and contact.
A classic HTML view shows the same content without 3D.

## Run

Needs Node 24 (see `.node-version`).

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/
npm run preview  # serves dist/ as it will be deployed
npm test         # layout, gates, captain's log, steering and bindings tests (Node's built-in runner)
npm run models   # rebuilds src/assets/models/world.glb from assets/kenney
npm run deploy   # build + deploy to Cloudflare (needs `npx wrangler login` once)
```

## Edit the content

- All text lives in `src/content/portfolio.js`: profile, sections, projects and the bottle messages.
  - A project can have an `image` (imported from `src/assets/projects/`) and a `url`.
- Island placement and section colours are in `src/world/layout.js`. A section's `id` there must match its `id` in the content file.

## Controls

Every control works with a keyboard and mouse, a touch screen and a gamepad. The names in the
legend and the tooltips follow whichever one is in use (`src/engine/bindings.js`).

| Action | Keyboard | Gamepad |
| --- | --- | --- |
| Sail | WASD or arrow keys | Left stick (points where to go on screen), LT to back up |
| Boost | Shift or Space | RT or RB |
| Zoom | Scroll, − and = | Right stick up and down |
| Open a section | E or Enter | A |
| Map | M (1–7 sails to an island or the ring course) | View |
| Captain's log | L | Menu |
| Photo mode | P | X |
| Sound on or off | N | LB |
| Read as a page | V | R3 |
| Reset the boat | R | Y |
| Share a lap time | C | D-pad up |
| Back, close | Esc | B |

In the map, the log, a section and the page view a gamepad's D-pad (or left stick) moves
between buttons, A presses, B goes back and the right stick scrolls.

On touch screens a stick appears on the left (point it where you want to sail) and a bolt on
the right (hold it to boost); pinch to zoom. Touching the screen of a laptop brings them up
too.

### Photo mode

| Action | Mouse and keyboard | Touch | Gamepad |
| --- | --- | --- | --- |
| Turn the camera | Drag or arrow keys | Drag | Right stick |
| Move the camera | Right-drag, shift-drag or WASD | Two-finger drag | Left stick |
| Zoom | Scroll, − and =, or the slider | Pinch or the slider | LT and RT |
| Light (dawn, day, golden, sunset, night) | [ and ] or the buttons | The buttons | D-pad left and right |
| Background blur | Q and E or the slider | The slider | D-pad up and down |
| Hide the boat | H | The boat button | X |
| Framing grid | G | The grid button | RB |
| Usual view | R | The reset button | Y |
| Take the photo | Space | The shutter | A |
| Save, share (after the shot) | S, D | The buttons | A, X |
| Leave | Esc or P | The close button | B |

## Structure

| Path | What it does |
| --- | --- |
| `src/engine/` | Renderer and post-processing (tilt-shift, bloom, grading), frame ticker, inputs, fixed-step physics, follow camera, sound, quality levels |
| `src/engine/bindings.js` | Every action's key and gamepad button, for the legend, tooltips and hints |
| `src/engine/Inputs.js` | Keyboard, touch stick and gamepad: sailing, actions, and gamepad buttons for menus |
| `src/engine/helm.js` | Steering toward a direction on screen, for the touch stick and the gamepad's left stick |
| `src/world/shading.js` | The shared stylised shader: tinted shadows, sea bounce light, waterline foam, cloud shadows, gradient fog, wind |
| `src/world/waves.js` | One wave function shared by the ocean shader, buoyancy, foam and particles |
| `src/world/` | Ocean, procedural islands, grass, foliage, Kenney props, boat and effects, birds, fish, day cycle, lights, zones, bottles, signs |
| `src/world/Logbook.js` | The captain's log: sixteen things to find, and the checks for the ones about where the boat is |
| `src/world/Treasure.js` | Bottles as treasure map pieces, the chest on the reef cay, and the map card in the log |
| `src/world/Wildlife.js` | Dolphins that race a boat going flat out, a whale at night, a tentacle by the wreck |
| `src/world/RingCourse.js` | The ring course: a timed lap of the whole archipelago, through the rock arch |
| `src/world/gates.js` | Gates the boat sails through (rings, the arch): the crossing check and the course as gates |
| `src/world/lightColumn.js` | The beams of light over the section buoys still to visit and over the next ring |
| `src/world/harbour.js` | Where a section island's berth, buoy and channel marks go, shared by the world and the tests |
| `src/world/layout.js` | Every hand-placed thing: islands, sea stacks, the arch, anchored boats, bottles, the start |
| `src/world/terrain.js` | Island ground heights as pure maths, shared by the meshes, the sea map and the tests |
| `src/ui/` | Loader, HUD, island labels, section panel, map, captain's log, photo mode, classic view |
| `src/ui/MapView.js` | The chart: a picture of the world from above with the ring course, pins and landmark badges over it, names placed so nothing overlaps, and what you've done ticked off; choosing a place (or anywhere near the course) sails you there |
| `src/ui/GamepadUi.js` | Menus by gamepad: focus, pressing, going back and scrolling |
| `src/ui/PhotoMode.js` | Photo mode: camera, light, blur, boat and grid, the shutter and the preview |
| `src/content/` | Portfolio text |
| `scripts/build-models.mjs` | Bundles the hand-picked Kenney models into one GLB |
| `test/` | Layout (everything at sea in open water, docks, islands apart, the course clear, channel mark sides), gates and a simulated lap, the captain's log, the treasure spot, the touch stick, and that every tooltip names a real binding |
| `public/.well-known/security.txt` | Where to report a security problem |

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
