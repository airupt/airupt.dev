// How each inhabited island is laid out, as one small scene seen by the
// fixed camera. Every island follows the same pattern:
//   dock head (two lamps) → one path → a level plaza → the hero object on
//   the far side of the plaza from the camera, with a few props beside it,
//   and the island's sign beside the path where it never hides the dock.
//
// Because the camera never turns, props are positioned in screen terms
// around the hero: [id, metres to the right, metres further away, facing].
// Facing: 'camera', 'hero', 'plaza' or 'sea'. The composer turns this into
// world positions and keeps everything on the island's level yard.
const scenes = {
  home: {
    hero: 'signpost-hub',
    reach: 2.2,
    plaza: 2,
    props: [
      ['bench', 2.4, -0.9, 'plaza'],
      ['barrel', -2, 0.6, 'camera'],
    ],
  },
  // A camp: tent behind the fire, log seats round it
  about: {
    hero: 'campfire',
    reach: 0.6,
    plaza: 2.7,
    plazaAtHero: true,
    props: [
      ['tent', 0.3, 2.9, 'hero'],
      ['log-seat', -1.75, 0.2, 'hero'],
      ['log-seat', 1.75, 0.2, 'hero'],
      ['log-seat', 0.1, -1.8, 'hero'],
      ['barrel', -2.7, 1.9, 'camera'],
    ],
  },
  // A market square in front of a row of project boards
  projects: {
    hero: null,
    reach: 3.2,
    plaza: 3.4,
    boards: [
      [-4.5, 0],
      [0, 0.6],
      [4.5, 0],
    ],
    props: [
      ['stall', -7, -3.6, 'plaza'],
      ['crate', -8.2, -2.3, 'camera'],
      ['crate-bottles', -8.3, -3.8, 'camera'],
      ['cart', 6.9, -3.4, 'plaza'],
      ['barrel', 8, -2.2, 'camera'],
    ],
  },
  // A workshop yard at the foot of a timber lookout
  skills: {
    hero: 'lookout',
    reach: 3,
    plaza: 2.3,
    props: [
      ['anvil', -2.6, -1.8, 'plaza'],
      ['lumber', 3, -1.2, 'plaza'],
      ['barrel', 3.6, 0.6, 'camera'],
      ['crate', -3.4, -0.2, 'camera'],
    ],
  },
  // Mount Airupt's landing: a bench to sit and look back over the islands
  volcano: {
    hero: 'bench',
    reach: 2,
    plaza: 1.8,
    props: [
      ['barrel', -2.2, 0.4, 'camera'],
      ['crate', 2, 0.6, 'camera'],
    ],
  },
  // A lighthouse, a post box and a bench looking out to sea
  contact: {
    hero: 'lighthouse',
    reach: 3.4,
    plaza: 1.9,
    props: [
      ['mailbox', -3, -1.3, 'plaza'],
      ['bench', 2.4, -2.2, 'sea'],
    ],
  },
}

// Ground each object needs to itself, in metres
export const footprints = {
  lighthouse: 2.4,
  lookout: 2.1,
  tent: 1.5,
  campfire: 1,
  'log-seat': 0.7,
  'signpost-hub': 0.8,
  stall: 1.6,
  cart: 1.5,
  bench: 1,
  mailbox: 0.5,
  lantern: 0.4,
  crate: 0.8,
  'crate-bottles': 0.8,
  barrel: 0.6,
  anvil: 1,
  board: 2,
  lumber: 1.2,
}

// Turns an island's scene into world positions. Needs the island's level
// yard (see Islands.js) and the camera's fixed screen axes.
export function planIsland(island, rig) {
  const scene = scenes[island.id] ?? scenes[island.section]
  const yard = island.yardShape
  if (!scene || !yard) return null

  const { out } = yard
  const side = { x: out.z, z: -out.x }
  const toWorld = (along, across) => ({
    x: island.x + out.x * (yard.shore - along) + side.x * across,
    z: island.z + out.z * (yard.shore - along) + side.z * across,
  })
  const toLocal = ({ x, z }) => {
    const dx = x - island.x
    const dz = z - island.z
    return { along: yard.shore - (dx * out.x + dz * out.z), across: dx * side.x + dz * side.z }
  }
  // Pulls a point back far enough onto the yard that an object of this
  // footprint stands wholly on its level part (the bank starts at 0.72)
  const settle = (point, radius = 1, limit = 0.64) => {
    limit = Math.min(limit, 0.7 - radius / Math.min(yard.along, yard.across))
    let { along, across } = toLocal(point)
    // and off the ramp that rises from the beach over the first 2.6 m
    along = Math.max(along, 2.6 + radius * 0.8)
    const shape = Math.hypot((along - yard.centre) / yard.along, across / yard.across)
    if (shape <= limit) return toWorld(along, across)
    const k = limit / shape
    return toWorld(yard.centre + (along - yard.centre) * k, across * k)
  }

  const up = rig.screenUp
  const right = rig.screenRight
  // The camera's "further away" direction, in the island's own terms
  const away = {
    along: -(up.x * out.x + up.z * out.z),
    across: up.x * side.x + up.z * side.z,
  }

  const hero = settle(toWorld(Math.max(yard.centre + away.along * scene.reach, 4.2), away.across * scene.reach), footprints[scene.hero] ?? 2.2, 0.5)
  const at = (dx, dy, radius) => settle({ x: hero.x + right.x * dx + up.x * dy, z: hero.z + right.z * dx + up.z * dy }, radius)
  const toward = (from, to) => Math.atan2(to.x - from.x, to.z - from.z)

  // Measured from where the dock actually meets the beach
  const fromShore = (along, across) => ({
    x: island.shore.x - out.x * along + side.x * across,
    z: island.shore.z - out.z * along + side.z * across,
  })
  const dockHead = fromShore(0.4, 0)
  const plaza = scene.plazaAtHero ? hero : settle({ x: dockHead.x + (hero.x - dockHead.x) * 0.55, z: dockHead.z + (hero.z - dockHead.z) * 0.55 }, scene.plaza)
  const cameraFacing = Math.atan2(rig.direction.x, rig.direction.z)
  const facing = (point, how) =>
    how === 'camera' ? cameraFacing : how === 'hero' ? toward(point, hero) : how === 'sea' ? Math.atan2(out.x, out.z) : toward(point, plaza)

  // Lamps either side of the dock head; the sign beside the path, on the
  // side away from the hero. The sign may stand on the ramp: its posts reach
  // well into the ground.
  const lamps = [-1, 1].map(direction => fromShore(0.7, direction * 1.4))
  const heroSide = toLocal(hero).across
  const sign = fromShore(1.7, (heroSide >= 0 ? -1 : 1) * 3)
  // Things the props must keep clear of but never move
  const fixed = [{ ...sign, radius: 1.8 }, ...lamps.map(lamp => ({ ...lamp, radius: 0.5 }))]

  const items = []
  if (scene.hero) items.push({ id: scene.hero, ...hero, how: null })
  for (const [id, dx, dy, how] of scene.props) items.push({ id, ...at(dx, dy, footprints[id]), how })

  // Pulling things back onto the yard can push them into each other: nudge
  // apart anything closer than its footprint allows (the hero stays put)
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]
        const b = items[j]
        const dx = b.x - a.x
        const dz = b.z - a.z
        const distance = Math.hypot(dx, dz) || 0.01
        const needed = (footprints[a.id] ?? 1) + (footprints[b.id] ?? 1) + 0.15
        if (distance >= needed) continue
        const push = needed - distance
        const share = i === 0 && scene.hero ? 1 : 0.5
        b.x += (dx / distance) * push * share
        b.z += (dz / distance) * push * share
        if (share < 1) {
          a.x -= (dx / distance) * push * 0.5
          a.z -= (dz / distance) * push * 0.5
        }
      }
    }
    for (const item of items.slice(scene.hero ? 1 : 0)) {
      for (const obstacle of fixed) {
        const dx = item.x - obstacle.x
        const dz = item.z - obstacle.z
        const distance = Math.hypot(dx, dz) || 0.01
        const needed = obstacle.radius + (footprints[item.id] ?? 1) + 0.15
        if (distance >= needed) continue
        item.x += (dx / distance) * (needed - distance)
        item.z += (dz / distance) * (needed - distance)
      }
      Object.assign(item, settle(item, footprints[item.id] ?? 1))
    }
  }
  for (const item of items) item.rotation = item.how ? facing(item, item.how) : toward(item, plaza)


  const boards = (scene.boards ?? []).map(([dx, dy], index) => {
    const point = at(dx, dy, footprints.board)
    return { ...point, rotation: cameraFacing + (1 - index) * 0.1 }
  })

  // The path runs from the dock head across the plaza to the hero
  const heroFront = scene.hero && !scene.plazaAtHero
    ? { x: hero.x + Math.sin(toward(hero, plaza)) * footprints[scene.hero], z: hero.z + Math.cos(toward(hero, plaza)) * footprints[scene.hero] }
    : null
  const paths = {
    lines: [[dockHead, plaza], ...(heroFront ? [[plaza, heroFront]] : [])],
    clearings: [{ ...plaza, radius: scene.plaza }],
  }

  return { items, lamps, sign, boards, paths, plaza, hero }
}
