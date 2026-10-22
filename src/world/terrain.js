// Island ground as pure maths: no three.js or physics, so the terrain mesh,
// the baked sea map and the tests all read the same heights.
import { spawn } from './layout.js'
import { fbm, smoothstep } from '../utils/noise.js'

const TERRACE_STEP = 1.1

// Which way an island's beach and dock face: its own `facing`, or the start point
export function facingDirection(island) {
  if (island.facing) return { x: island.facing[0], z: island.facing[1] }
  const dx = spawn.x - island.x
  const dz = spawn.z - island.z
  const length = Math.hypot(dx, dz) || 1
  return { x: dx / length, z: dz / length }
}

const YARD_HEIGHT = 0.85 // metres above the sea

// Ground height at a point given relative to the island centre. Mesh vertices
// and the baked sea map both come from here, so they always agree.
//  - every blob is a dome; the island is the highest dome at each point
//  - the side facing the start slopes gently into a beach, the far side rises
//    into a cliff
//  - terraced islands step their slopes; the volcano is a cone with a crater
//  - an inhabited island has a level yard cut into it behind its beach, where
//    the dock path, plaza, props and sign stand (props on a slope float on
//    one side and sink on the other; on level ground they simply sit)
export function islandHeight(island, x, z) {
  const y = naturalHeight(island, x, z)
  const yard = yardOf(island)
  if (!yard) return y
  const { out, shore } = yard
  const inland = shore - (x * out.x + z * out.z)
  const across = x * out.z - z * out.x
  const shape = Math.hypot((inland - yard.centre) / yard.along, across / yard.across)
  const inside = 1 - smoothstep(0.72, 1, shape)
  // A gentle ramp up from the beach, then level
  const level = 0.25 + (YARD_HEIGHT - 0.25) * smoothstep(0, 2.6, inland)
  return y + (level - y) * inside
}

// The yard of a section island (or the home island), in metres from where
// its ground meets the sea on the dock side: [centre inland, half length
// inland, half width across]. Found once and kept on the island.
function hasYard(island) {
  return Boolean(island.section || island.label === 'name' || island.landing)
}

function yardOf(island) {
  if (island.yardShape !== undefined) return island.yardShape
  if (!hasYard(island)) return (island.yardShape = null)
  const out = facingDirection(island)
  let shore = 0
  for (let distance = 0; distance < island.radius * 1.3; distance += 0.25) {
    shore = distance
    if (naturalHeight(island, out.x * distance, out.z * distance) < 0.25) break
  }
  const [centre, along, across] = island.yard ?? [5.5, 6, 7.5]
  return (island.yardShape = { out, shore, centre, along, across })
}

function naturalHeight(island, x, z) {
  const toward = facingDirection(island)
  const facing = (x * toward.x + z * toward.z) / (Math.hypot(x, z) || 1)
  const beach = smoothstep(0.1, 0.9, facing)
  const cliff = 1 - smoothstep(-0.8, -0.1, facing)

  const noise = fbm(x * 0.11 + island.seed, z * 0.11, island.seed)
  // The coast wanders: blobs are measured from a point pushed about by noise,
  // so round blobs grow headlands and coves. It stays calm on the dock side
  // of an inhabited island, where the beach, dock and yard need a clean shore.
  const calm = hasYard(island) ? smoothstep(0.45, 0.85, facing) : 0
  const warp = (island.warp ?? 3.4) * (1 - calm)
  const wx = x + (fbm(x * 0.075 + island.seed * 3.1, z * 0.075, island.seed + 5, 2) - 0.5) * 2 * warp
  const wz = z + (fbm(x * 0.075, z * 0.075 + island.seed * 1.7, island.seed + 9, 2) - 0.5) * 2 * warp
  let elevation = 0
  let nearest = Infinity

  island.blobs.forEach(([bx, bz, radius, height], index) => {
    const distance = Math.hypot(wx - bx, wz - bz) / radius + (noise - 0.5) * 0.3
    nearest = Math.min(nearest, distance)
    let dome
    if (island.volcano && index === 0) {
      // Concave flanks rising to a steep summit, like a real stratovolcano
      // The crater: a flat-floored bowl sunk into the summit (the cone is
      // levelled off inside it so no peak pokes up through the lava)
      dome = Math.pow(Math.max(0, 1 - Math.max(distance, 0.2)), 1.4)
      dome -= 0.4 * (1 - smoothstep(0.08, 0.24, distance))
    } else {
      dome = Math.pow(Math.max(0, 1 - distance * distance), 1.2 + beach * 0.9 - cliff * 0.5)
    }
    elevation = Math.max(elevation, height * (1 + cliff * 0.3) * dome)
  })

  let y = elevation * (island.volcano ? 0.9 + noise * 0.2 : 0.6 + noise * 0.8)

  if (island.terraces) {
    const level = Math.floor(y / TERRACE_STEP) * TERRACE_STEP
    const stepped = level + smoothstep(0.7, 1, (y - level) / TERRACE_STEP) * TERRACE_STEP
    y += (stepped - y) * 0.85 * smoothstep(0.4, 1.2, y)
  }

  return y - 0.6 - 2.5 * smoothstep(0.75 + cliff * 0.12, 1.3 - cliff * 0.18, nearest)
}

// Where the treasure is buried, in world coordinates (see the reef cay in layout.js)
export function treasureSpot(cay) {
  const [x, z] = cay.treasure
  return { x: cay.x + x, y: islandHeight(cay, x, z), z: cay.z + z }
}

