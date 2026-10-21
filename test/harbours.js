// Where the docks, berths, section buoys and channel marks stand, worked out
// from the terrain the same way the world places them (Islands.findShore,
// Zones, Seascape), for tests that keep other things clear of them
import { facingDirection, islandHeight } from '../src/world/terrain.js'
import { islands, spawn } from '../src/world/layout.js'
import { DOCK_INLAND, DOCK_LENGTH, DOCK_WIDTH } from '../src/world/Dock.js'

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
    const side = Math.sign(out.z * toCamera.x - out.x * toCamera.z) || 1
    const across = { x: out.z * side, z: -out.x * side }
    const offset = DOCK_WIDTH / 2 + 1.45
    const reach = (DOCK_LENGTH - DOCK_INLAND) * 0.55
    const berth = { x: x + out.x * reach + across.x * offset, z: z + out.z * reach + across.z * offset }
    points.push([berth.x, berth.z, 2.5, `${island.id} berth`])
    const buoyReach = DOCK_LENGTH - DOCK_INLAND + 3.4
    points.push([x + out.x * buoyReach + across.x * (offset + 3.4), z + out.z * buoyReach + across.z * (offset + 3.4), 1.5, `${island.id} buoy`])
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
