import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d'
import { createRandom } from '../utils/noise.js'
import { instanceStatic } from './instancing.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createDockGeometry, DOCK_DECK, DOCK_INLAND, DOCK_LENGTH, DOCK_WIDTH } from './Dock.js'
import { createStylizedMaterial } from './shading.js'

export const DOCK_TILES = 2
export const DOCK_TILE = 2.5 // metres per collision box along the dock
export const DOCK_HEIGHT = -0.55 // bottom of the collision boxes

const palms = ['palm-straight', 'palm-bend', 'palm-detailed-straight', 'palm-detailed-bend']

// Props around each island's dock: [model, metres inland from the shore,
// metres sideways]. Each island is one small scene built around its plaza
// (see `paths` in layout.js), and props turn to face that plaza. Keep clear
// of the section sign at [2.5, 4] and of the footpaths.
const setPieces = {
  home: [
    ['signpost', 3, -2.5],
    ['flag', 4.5, 3],
    ['lantern', 1.6, 1.6],
  ],
  // A camp: a roofed hut and a tent around the campfire
  about: [
    ['hut-roof', 7, -1.5],
    ['tent', 5.2, 3],
    ['campfire', 3.6, 0.5],
    ['barrel', 6.4, 4.4],
    ['lantern', 1.6, -1.8],
  ],
  // A little market square: a stall with its stock stacked beside it, a cart
  // across the square, the boards behind on their own path
  projects: [
    ['stall', 4.8, -3.4],
    ['crate', 3.5, -4.9],
    ['crate-bottles', 2.4, -4.5],
    ['cart', 5.8, 2.6],
    ['barrel', 6.7, 3.7],
    ['lantern', 1.2, -1.6],
    // Room for the project boards (see ProjectBoards.js)
    ['reserve', 8.8, -5.7, 2.6],
    ['reserve', 8, -1.5, 2.6],
    ['reserve', 8.8, 2.7, 2.6],
  ],
  // A workshop yard: the anvil bench out in the yard, stores against the
  // stall, the lookout up the path
  skills: [
    ['lookout', 7, 0],
    ['anvil', 3.3, -1.4],
    ['stall', 4.6, 2.6],
    ['crate', 2.4, -2.9],
    ['barrel', 3.2, -3.6],
    ['flag-pennant', 5.6, -3.4],
    ['lantern', 1.6, 1.8],
  ],
  // The lighthouse at the end of the path, a pointer to it by the dock
  contact: [
    ['tower', 7, 0],
    ['lantern', 1.6, -1.8],
    ['flag', 3.4, 3],
    ['signpost-single', 2.2, 1.3],
  ],
}

// Set pieces that look the same from every side keep a random turn
const roundPieces = new Set(['tower', 'lookout', 'barrel', 'lantern', 'campfire', 'flag', 'flag-pennant'])

const bushColors = ['#4fae4a', '#3f9c47', '#6cc24f', '#58b85a']
const flowerColors = ['#ff7a59', '#ff9f43', '#ff6b8b']
const treeColors = ['#ff5a36', '#ff7b2e', '#3f9c47', '#4fae4a']

// Places props on the procedural islands: a dock facing the start point, a
// few hand-placed set pieces per section, then seeded scatter of palms,
// rocks, trees and bushes.
export class Decor {
  constructor(app, islands, models, foliage, rocks) {
    this.app = app
    this.rocks = rocks
    this.islands = islands
    this.models = models
    this.foliage = foliage
    // Every placed model by id, so other systems can find lanterns, towers…
    this.placed = []
    this.group = new THREE.Group()
    app.scene.add(this.group)

    this.docks = []
    for (const island of islands.list) {
      const random = createRandom(island.seed * 7919)
      const occupied = []
      if (island.section || island.id === 'home') this.placeDock(island, occupied)
      for (const [id, along, across, radius] of setPieces[island.id] ?? []) this.placeSetPiece(island, id, along, across, occupied, radius)
      // Nothing grows on the footpaths, and trees keep a little back from
      // them so their crowns don't hang over the trail
      for (const line of island.paths.lines) {
        for (let i = 1; i < line.length; i++) {
          const length = Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z)
          for (let t = 0; t <= length; t += 0.8) {
            const f = t / length
            occupied.push({ x: line[i - 1].x + (line[i].x - line[i - 1].x) * f, z: line[i - 1].z + (line[i].z - line[i - 1].z) * f, radius: 1.2 })
          }
        }
      }
      for (const { x, z, radius } of island.paths.clearings) occupied.push({ x, z, radius: radius + 1 })
      this.scatter(island, random, occupied)
    }

    // Every jetty in one draw
    const docks = new THREE.Mesh(mergeGeometries(this.docks), createStylizedMaterial({ vertexColors: true, flatShading: true }))
    docks.castShadow = true
    docks.receiveShadow = true
    app.scene.add(docks)

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

    const geometry = createDockGeometry(island.seed)
    geometry.rotateY(rotation)
    geometry.translate(shore.x - out.x * DOCK_INLAND, 0, shore.z - out.z * DOCK_INLAND)
    this.docks.push(geometry)

    // A lantern at the far end, for boats coming in after dark
    const reach = DOCK_LENGTH - DOCK_INLAND - 0.55
    const across = -(DOCK_WIDTH / 2 - 0.3)
    this.add('lantern', shore.x + out.x * reach + out.z * across, DOCK_DECK, shore.z + out.z * reach - out.x * across, rotation, 0.85)

    for (let i = 0; i < DOCK_TILES; i++) {
      const distance = (i + 0.5) * DOCK_TILE - DOCK_INLAND
      const x = shore.x + out.x * distance
      const z = shore.z + out.z * distance
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
    // Face the island's plaza (or, without one, the dock), a little off square
    const target = island.paths.clearings[0] ?? island.shore
    const jitter = (Math.sin(x * 12.9 + z * 78.2) * 0.5) * 0.35
    const rotation = roundPieces.has(id) ? Math.sin(x * 3.1 + z) * Math.PI : Math.atan2(target.x - x, target.z - z) + jitter
    this.add(id, x, surface.y - 0.05, z, rotation)
    occupied.push({ x, z, radius: ['tower', 'hut-roof', 'lookout'].includes(id) ? 3 : 1.6 })
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

    // Sandbars and the like get a palm or two and nothing else
    const amount = count => (island.sparse ? Math.min(count, 1) : count)

    tryPlace(
      amount(Math.round(island.radius * 0.45)),
      0.15,
      0.75,
      surface => surface.y > (island.sparse ? 0.15 : 0.4) && surface.normalY > 0.8 && !(island.volcano && surface.y > 5),
      (x, y, z) => this.add(palms[Math.floor(random() * palms.length)], x, y - 0.1, z, random() * Math.PI * 2, 0.75 + random() * 0.4)
    )

    tryPlace(
      amount(Math.max(1, Math.round(island.radius * 0.2))),
      0.7,
      1.0,
      surface => surface.y > -0.8,
      (x, y, z) => this.rocks.add(x, y - 0.25, z, { width: 1 + random() * 1.3, height: 0.5 + random() * 0.9, mossy: y > 0.6 })
    )

    const pick = list => list[Math.floor(random() * list.length)]
    // Nothing grows on the volcano's ash cone
    const onGrass = surface => surface.y > 0.6 && surface.normalY > 0.75 && !(island.volcano && surface.y > 5)

    tryPlace(island.sparse ? 0 : Math.round(island.radius * 0.15), 0.1, 0.6, onGrass, (x, y, z) => {
      this.foliage.addTree(new THREE.Vector3(x, y - 0.1, z), 2.2 + random() * 1.2, 1.3 + random() * 0.6, pick(treeColors), random)
    })

    tryPlace(island.sparse ? 0 : Math.round(island.radius * 0.6), 0.1, 0.85, onGrass, (x, y, z) => {
      const size = 0.55 + random() * 0.6
      const color = random() < 0.22 ? pick(flowerColors) : pick(bushColors)
      this.foliage.addCluster(new THREE.Vector3(x, y + size * 0.45, z), size, color)
    })

    tryPlace(island.sparse ? 0 : Math.round(island.radius * 0.25), 0.1, 0.8, onGrass, (x, y, z) =>
      this.add('grass-plant', x, y, z, random() * Math.PI * 2, 1 + random() * 0.8)
    )
  }
}
