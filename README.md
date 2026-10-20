# airupt.dev

A developer portfolio you sail through: steer a little boat across a low-poly sea,
and each island opens a section (about, projects, skills, contact).
A classic HTML view shows the same content without 3D.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/
npm run deploy   # build + deploy to Cloudflare (needs `npx wrangler login` once)
```

## Edit the content

All text lives in `src/content/portfolio.js`. Island placement is in `src/world/layout.js`;
a section's `id` there must match its `id` in the content file.

## Structure

| Path | What it does |
| --- | --- |
| `src/engine/` | Renderer setup, frame ticker, inputs (keyboard, gamepad, touch), fixed-step physics, follow camera |
| `src/world/` | Sky and lights, ocean shader, procedural islands, boat, buoys, section zones |
| `src/world/waves.js` | One wave function shared by the ocean shader and buoyancy |
| `src/ui/` | Loader, HUD, island labels, section panel, classic view |
| `src/content/` | Portfolio text |

## Controls

WASD or arrow keys to sail, Shift to boost, E to explore, R to reset.
Gamepad and an on-screen touch joystick work too.

## Debugging

In dev mode the app is available in the console as `window.experience`.

See `CREDITS.md` for licences.
