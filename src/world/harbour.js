import { islandHeight } from './terrain.js'
import { islands, rockClusters } from './layout.js'
import { DOCK_INLAND, DOCK_LENGTH, DOCK_WIDTH } from './Dock.js'

// Highest ground of any island at a world position (-10 out at sea)
function groundAt(x, z) {
  let height = -10
  for (const island of islands) {
    const dx = x - island.x
    const dz = z - island.z
    if (Math.hypot(dx, dz) > island.radius * 1.3) continue
    height = Math.max(height, islandHeight(island, dx, dz))
  }
  return height
}

// Metres of open water round a point, up to 8: land and sea stacks count
function roomAround(x, z) {
  let room = 8
  for (const [rx, rz] of rockClusters) room = Math.min(room, Math.hypot(rx - x, rz - z) - 4.5)
  for (let radius = 1; radius < room; radius += 1) {
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      if (groundAt(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius) > -1.2) return radius
    }
  }
  return room
}

// A section island's berth and buoy, from where its dock meets the shore and
// the way it faces. The berth is alongside the dock on the camera's side, so
// the dock never stands in front of the moored boat, and the boat lies bow
// out to sea. The buoy stands off the dock's end, a few metres to the side
// of the boat's way out: on the camera's side if there is open water round
// it, otherwise the far side, or a little further out (a sea stack, a reef
// or an island's arm can crowd the first choice).
export function harbourLayout(shore, out, toCamera) {
  const side = Math.sign(out.z * toCamera.x - out.x * toCamera.z) || 1
  const across = { x: out.z * side, z: -out.x * side }
  const offset = DOCK_WIDTH / 2 + 1.45
  const reach = (DOCK_LENGTH - DOCK_INLAND) * 0.55
  const berth = {
    x: shore.x + out.x * reach + across.x * offset,
    z: shore.z + out.z * reach + across.z * offset,
    yaw: Math.atan2(-out.x, -out.z),
  }
  const candidates = []
  for (const further of [0, 4, 8]) {
    for (const sign of [1, -1]) {
      const along = DOCK_LENGTH - DOCK_INLAND + 3.4 + further
      const aside = (offset + 3.4) * sign
      const x = shore.x + out.x * along + across.x * aside
      const z = shore.z + out.z * along + across.z * aside
      candidates.push({ x, z, room: roomAround(x, z) })
    }
  }
  const { x, z } = candidates.find(candidate => candidate.room >= 4.5) ?? candidates.reduce((best, candidate) => (candidate.room > best.room ? candidate : best))
  return { berth, buoy: { x, z } }
}

// Metres between the two marks of a channel
export const CHANNEL_WIDTH = 9

// A pair of channel marks part-way (t, 0 to 1) along the run from one point
// to another, `width` metres apart: facing along the run, red to port (the
// left) and green to starboard
export function channelMarks(from, to, t, width) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const length = Math.hypot(dx, dz)
  // Left of the way the run faces, seen from above (+y up, -z ahead turns left to -x)
  const left = { x: dz / length, z: -dx / length }
  const x = from.x + dx * t
  const z = from.z + dz * t
  return [
    { side: 'port', x: x + (left.x * width) / 2, z: z + (left.z * width) / 2 },
    { side: 'starboard', x: x - (left.x * width) / 2, z: z - (left.z * width) / 2 },
  ]
}
