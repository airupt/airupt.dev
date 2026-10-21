// Where the docks, berths, section buoys and channel marks stand, worked out
// from the terrain the same way the world places them (Islands.findShore,
// Zones, Seascape), for tests that keep other things clear of them
import { facingDirection, islandHeight } from '../src/world/terrain.js'
import { islands, spawn } from '../src/world/layout.js'
import { DOCK_INLAND, DOCK_LENGTH } from '../src/world/Dock.js'
import { harbourLayout } from '../src/world/harbour.js'

// The fixed camera looks along this (CameraRig: polar 0.3π, azimuth 0.25π)
const toCamera = { x: Math.sin(Math.PI * 0.3) * Math.sin(Math.PI * 0.25), z: Math.sin(Math.PI * 0.3) * Math.cos(Math.PI * 0.25) }

function shoreOf(island) {
  const out = facingDirection(island)
  let distance = 0
  while (distance < island.radius * 1.3 && islandHeight(island, out.x * distance, out.z * distance) >= 0.25) distance += 0.25
  return { x: island.x + out.x * distance, z: island.z + out.z * distance, out }
}

// [x, z, radius, what] for everything round the harbours
export function harbourPoints() {
  const points = []
  for (const island of islands.filter(island => island.section || island.label === 'name' || island.landing)) {
    const { x, z, out } = shoreOf(island)
    for (let t = 0; t <= 1; t += 0.25) {
      const reach = -DOCK_INLAND + DOCK_LENGTH * t
      points.push([x + out.x * reach, z + out.z * reach, 1.5, `${island.id} dock`])
    }
    if (!island.section) continue
    const { berth, buoy } = harbourLayout({ x, z }, out, toCamera)
    points.push([berth.x, berth.z, 2.5, `${island.id} berth`])
    points.push([buoy.x, buoy.z, 1.5, `${island.id} buoy`])
    // Channel marks halfway along the run from the start to the berth
    const dx = berth.x - spawn.x
    const dz = berth.z - spawn.z
    const length = Math.hypot(dx, dz)
    for (const t of [0.42, 0.5, 0.58]) {
      for (const sign of [-1, 1]) {
        points.push([spawn.x + dx * t + (-dz / length) * 4.5 * sign, spawn.z + dz * t + (dx / length) * 4.5 * sign, 1.5, `${island.id} channel mark`])
      }
    }
  }
  return points
}
