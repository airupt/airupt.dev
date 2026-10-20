import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d'
import { createRandom } from '../utils/noise.js'
import { instanceStatic } from './instancing.js'

export const DOCK_TILES = 2
export const DOCK_TILE = 2.5 // metres per dock model
const DOCK_HEIGHT = -0.55 // posts sink into the sea, deck stays just above the waves

const palms = ['palm-straight', 'palm-bend', 'palm-detailed-straight', 'palm-detailed-bend']
const rocks = ['rocks-a', 'rocks-b', 'rocks-c', 'rocks-sand-a', 'rocks-sand-b', 'rocks-sand-c']

// Props around each island's dock: [model, metres inland from the shore, metres sideways]
const setPieces = {
  home: [
    ['signpost', 3, -2.5],
    ['flag', 4.5, 3],
    ['lantern', 1.8, 2],
  ],
  about: [
    ['tent', 5, 2],
    ['campfire', 3.5, -0.8],
    ['barrel', 2.5, 3.8],
    ['lantern', 1.8, -2.6],
  ],
  projects: [
    ['stall', 5, -3],
    ['cart', 4.5, 3.2],
    ['crate', 2.2, -1.2],
    ['crate-bottles', 2.6, 1.4],
    ['chest', 3.4, 0],
    ['barrel', 2, 4.2],
    // Room for the project boards (see ProjectBoards.js)
    ['reserve', 8.8, -5.7, 2.6],
    ['reserve', 8, -1.5, 2.6],
    ['reserve', 8.8, 2.7, 2.6],
  ],
  skills: [
    ['stall', 4.5, 2],
    ['crate', 2.5, -2],
    ['barrel', 2.4, -3.4],
    ['flag-pennant', 5.5, -1],
  ],
  contact: [
    ['tower', 7, 0],
    ['lantern', 2, -2.2],
    ['flag', 3.2, 3],
    ['signpost-single', 2, 2],
  ],
}

const bushColors = ['#4fae4a', '#3f9c47', '#6cc24f', '#58b85a']
const flowerColors = ['#ff7a59', '#ff9f43', '#ff6b8b']
const treeColors = ['#ff5a36', '#ff7b2e', '#3f9c47', '#4fae4a']

// Places props on the procedural islands: a dock facing the start point, a
// few hand-placed set pieces per section, then seeded scatter of palms,
// rocks, trees and bushes.
export class Decor {
  constructor(app, islands, models, foliage) {
    this.app = app
    this.islands = islands
    this.models = models
    this.foliage = foliage
    // Every placed model by id, so other systems can find lanterns, towers…
    this.placed = []
    this.group = new THREE.Group()
    app.scene.add(this.group)

    for (const island of islands.list) {
      const random = createRandom(island.seed * 7919)
      const occupied = []
      if (island.section || island.id === 'home') this.placeDock(island, occupied)
      for (const [id, along, across, radius] of setPieces[island.id] ?? []) this.placeSetPiece(island, id, along, across, occupied, radius)
      this.scatter(island, random, occupied)
    }

    foliage.build()
    // Models other systems attach things to (lights, smoke) stay separate
    const keep = new Set(['lantern', 'tower', 'campfire'])
    instanceStatic(this.group, this.placed.filter(({ id }) => !keep.has(id)).map(({ model }) => model))
  }

  add(id, x, y, z, rotation = 0, scale = 1) {
    const model = this.models.get(id)
    model.position.set(x, y, z)
    model.rotation.y = rotation
    model.scale.multiplyScalar(scale)
    this.group.add(model)
    this.placed.push({ id, model })
    return model
  }

  placeDock(island, occupied) {
    const { shore, out } = island
    const rotation = Math.atan2(out.x, out.z)
    const { world } = this.app.physics

    for (let i = 0; i < DOCK_TILES; i++) {
      const distance = (i + 0.5) * DOCK_TILE - 0.6
      const x = shore.x + out.x * distance
      const z = shore.z + out.z * distance
      this.add('dock', x, DOCK_HEIGHT, z, rotation)
      occupied.push({ x, z, radius: DOCK_TILE })

      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(x, DOCK_HEIGHT + 0.65, z)
          .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation))
      )
      world.createCollider(RAPIER.ColliderDesc.cuboid(DOCK_TILE / 2, 0.65, DOCK_TILE / 2), body)
    }
  }

  placeSetPiece(island, id, along, across, occupied, radius) {
    const { shore, out } = island
    const x = shore.x - out.x * along + out.z * across
    const z = shore.z - out.z * along - out.x * across
    // A reserved spot only keeps scattered plants away; something else builds there
    if (id === 'reserve') {
      occupied.push({ x, z, radius })
      return
    }
    const surface = this.islands.surfaceAt(island, x, z)
    if (!surface) return
    this.add(id, x, surface.y, z, Math.atan2(out.x, out.z))
    occupied.push({ x, z, radius: id === 'tower' ? 3 : 1.6 })
  }

  scatter(island, random, occupied) {
    const isFree = (x, z, radius) => occupied.every(spot => Math.hypot(spot.x - x, spot.z - z) > spot.radius + radius)

    const tryPlace = (count, minRadius, maxRadius, accept, place) => {
      for (let placed = 0, tries = 0; placed < count && tries < count * 12; tries++) {
        const angle = random() * Math.PI * 2
        const distance = island.radius * (minRadius + random() * (maxRadius - minRadius))
        const x = island.x + Math.cos(angle) * distance
        const z = island.z + Math.sin(angle) * distance
        const surface = this.islands.surfaceAt(island, x, z)
        if (!surface || !accept(surface) || !isFree(x, z, 1.4)) continue
        place(x, surface.y, z)
        occupied.push({ x, z, radius: 1.4 })
        placed++
      }
    }

    tryPlace(
      Math.round(island.radius * 0.45),
      0.15,
      0.75,
      surface => surface.y > 0.4 && surface.normalY > 0.8 && !(island.volcano && surface.y > 5),
      (x, y, z) => this.add(palms[Math.floor(random() * palms.length)], x, y - 0.1, z, random() * Math.PI * 2, 0.75 + random() * 0.4)
    )

    tryPlace(
      Math.max(1, Math.round(island.radius * 0.2)),
      0.7,
      1.0,
      surface => surface.y > -0.8,
      (x, y, z) => {
        const scale = 0.25 + random() * 0.35
        this.add(rocks[Math.floor(random() * rocks.length)], x, y - 0.3, z, random() * Math.PI * 2, scale)
        this.addRockCollider(x, y, z, scale)
      }
    )

    const pick = list => list[Math.floor(random() * list.length)]
    // Nothing grows on the volcano's ash cone
    const onGrass = surface => surface.y > 0.6 && surface.normalY > 0.75 && !(island.volcano && surface.y > 5)

    tryPlace(Math.round(island.radius * 0.15), 0.1, 0.6, onGrass, (x, y, z) => {
      this.foliage.addTree(new THREE.Vector3(x, y - 0.1, z), 2.2 + random() * 1.2, 1.3 + random() * 0.6, pick(treeColors), random)
    })

    tryPlace(Math.round(island.radius * 0.6), 0.1, 0.85, onGrass, (x, y, z) => {
      const size = 0.55 + random() * 0.6
      const color = random() < 0.22 ? pick(flowerColors) : pick(bushColors)
      this.foliage.addCluster(new THREE.Vector3(x, y + size * 0.45, z), size, color)
    })

    tryPlace(Math.round(island.radius * 0.25), 0.1, 0.8, onGrass, (x, y, z) =>
      this.add('grass-plant', x, y, z, random() * Math.PI * 2, 1 + random() * 0.8)
    )
  }

  addRockCollider(x, y, z, scale) {
    const { world } = this.app.physics
    const radius = 2.1 * scale
    const halfHeight = 1.6 * scale
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + halfHeight - 0.3, z))
    world.createCollider(RAPIER.ColliderDesc.cylinder(halfHeight, radius), body)
  }
}
