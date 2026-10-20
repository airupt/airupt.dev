import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { createRandom } from '../utils/noise.js'

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

// Places Kenney props on the procedural islands: a dock facing the start
// point, a few hand-placed set pieces per section, then seeded scatter.
export class Decor {
  constructor(app, islands, models) {
    this.app = app
    this.islands = islands
    this.models = models
    this.group = new THREE.Group()
    app.scene.add(this.group)

    for (const island of islands.list) {
      const random = createRandom(island.seed * 7919)
      const occupied = []
      if (island.section || island.id === 'home') this.placeDock(island, occupied)
      for (const [id, along, across] of setPieces[island.id] ?? []) this.placeSetPiece(island, id, along, across, occupied)
      this.scatter(island, random, occupied)
    }
  }

  add(id, x, y, z, rotation = 0, scale = 1) {
    const model = this.models.get(id)
    model.position.set(x, y, z)
    model.rotation.y = rotation
    model.scale.multiplyScalar(scale)
    this.group.add(model)
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

  placeSetPiece(island, id, along, across, occupied) {
    const { shore, out } = island
    const x = shore.x - out.x * along + out.z * across
    const z = shore.z - out.z * along - out.x * across
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
      surface => surface.y > 0.4 && surface.normalY > 0.8,
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

    tryPlace(
      Math.round(island.radius * 0.7),
      0.1,
      0.8,
      surface => surface.y > 0.6 && surface.normalY > 0.75,
      (x, y, z) => this.add('grass-plant', x, y, z, random() * Math.PI * 2, 1 + random() * 0.8)
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
