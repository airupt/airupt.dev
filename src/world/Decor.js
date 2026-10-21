import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d'
import { createRandom } from '../utils/noise.js'
import { instanceStatic } from './instancing.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createDockGeometry, DOCK_DECK, DOCK_INLAND, DOCK_LENGTH, DOCK_WIDTH } from './Dock.js'
import { createStylizedMaterial } from './shading.js'
import { footprints } from './IslandScenes.js'
import { sections } from '../content/portfolio.js'
import { createBench, createCampfire, createLighthouse, createLogSeat, createLookout, createLumber, createMailbox, createSignpostHub, createTent, createWorkbench } from './Structures.js'

const DOCK_TILES = 2
const DOCK_TILE = 2.5 // metres per collision box along the dock
const DOCK_HEIGHT = -0.55 // bottom of the collision boxes

const palms = ['palm-straight', 'palm-bend', 'palm-detailed-straight', 'palm-detailed-bend']

// Pieces built in code (see Structures.js) rather than loaded
const builders = {
  lantern: () => createLantern(),
  lighthouse: createLighthouse,
  lookout: createLookout,
  tent: createTent,
  campfire: createCampfire,
  'log-seat': createLogSeat,
  mailbox: createMailbox,
  bench: createBench,
  lumber: createLumber,
  workbench: createWorkbench,
}

// A lamp post in the same wood as the docks: a post, a little iron lantern
// frame with a pyramid cap. Its glowing glass (see Lights.js) sits in the
// frame at 1.38 m.
let lanternGeometry = null
function createLantern() {
  if (!lanternGeometry) {
    const part = (geometry, hex, x, y, z) => {
      geometry = geometry.index ? geometry.toNonIndexed() : geometry
      geometry.translate(x, y, z)
      geometry.deleteAttribute('uv')
      const color = new THREE.Color(hex)
      const colors = new Float32Array(geometry.attributes.position.count * 3)
      for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i)
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      return geometry
    }
    lanternGeometry = mergeGeometries([
      part(new THREE.BoxGeometry(0.13, 1.22, 0.13), '#6b4630', 0, 0.61, 0),
      part(new THREE.BoxGeometry(0.22, 0.05, 0.22), '#2f2b33', 0, 1.22, 0),
      part(new THREE.BoxGeometry(0.06, 0.3, 0.06), '#2f2b33', -0.1, 1.38, -0.1),
      part(new THREE.BoxGeometry(0.06, 0.3, 0.06), '#2f2b33', 0.1, 1.38, -0.1),
      part(new THREE.BoxGeometry(0.06, 0.3, 0.06), '#2f2b33', -0.1, 1.38, 0.1),
      part(new THREE.BoxGeometry(0.06, 0.3, 0.06), '#2f2b33', 0.1, 1.38, 0.1),
      part(new THREE.ConeGeometry(0.2, 0.16, 4).rotateY(Math.PI / 4), '#2f2b33', 0, 1.61, 0),
    ])
  }
  const mesh = new THREE.Mesh(lanternGeometry, lanternMaterial())
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
let lanternMaterialCache = null
const lanternMaterial = () => (lanternMaterialCache ??= createStylizedMaterial({ vertexColors: true, flatShading: true }, { waterLine: false }))

const bushColors = ['#4fae4a', '#3f9c47', '#6cc24f', '#58b85a']
const flowerColors = ['#ff6b8b', '#ff8fa8', '#ffc145', '#e8487a']
// Broadleaf greens (orange crowns read as autumn on a tropical island)
const treeColors = ['#3f9c47', '#4fae4a', '#3a8f45', '#58b85a', '#2f8a4a']

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
    // Where things stand on the ground, for the baked contact shadows
    this.contacts = []
    this.group = new THREE.Group()
    app.scene.add(this.group)

    this.docks = []
    for (const island of islands.list) {
      const random = createRandom(island.seed * 7919)
      const occupied = []
      if (island.section || island.id === 'home' || island.landing) this.placeDock(island, occupied)
      if (island.plan) this.placeScene(island, occupied)
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
    const keep = new Set(['lantern', 'lighthouse', 'campfire', 'mailbox', 'lookout', 'signpost-hub'])
    instanceStatic(this.group, this.placed.filter(({ id }) => !keep.has(id)).map(({ model }) => model))
  }

  add(id, x, y, z, rotation = 0, scale = 1) {
    const model = builders[id]?.() ?? this.models.get(id)
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
    const lantern = this.add('lantern', shore.x + out.x * reach + out.z * across, DOCK_DECK, shore.z + out.z * reach - out.x * across, rotation, 0.85)
    lantern.userData.overWater = true

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

  // Where a point sits on the island's level yard: under 1 inside it
  yardShapeAt(island, x, z) {
    const yard = island.yardShape
    const { out } = yard
    const dx = x - island.x
    const dz = z - island.z
    const along = yard.shore - (dx * out.x + dz * out.z)
    const across = dx * out.z - dz * out.x
    return Math.hypot((along - yard.centre) / yard.along, across / yard.across)
  }

  // Would something tall here stand between the camera and the yard?
  blocksView(island, x, z) {
    const { plaza } = island.plan
    const { screenUp, screenRight } = this.app.cameraRig
    const dx = x - plaza.x
    const dz = z - plaza.z
    const towardCamera = -(dx * screenUp.x + dz * screenUp.z)
    const sideways = Math.abs(dx * screenRight.x + dz * screenRight.z)
    return towardCamera > 0 && towardCamera < 16 && sideways < 7
  }

  // How much the ground rises and falls across a footprint of this radius
  slopeAt(island, x, z, radius) {
    const heights = [[radius, 0], [-radius, 0], [0, radius], [0, -radius]]
      .map(([dx, dz]) => this.islands.surfaceAt(island, x + dx, z + dz)?.y)
      .filter(y => y !== undefined)
    return heights.length < 4 ? Infinity : Math.max(...heights) - Math.min(...heights)
  }

  // The lowest ground under a footprint of this radius, so nothing on a slope
  // hangs over the downhill side
  groundAt(island, x, z, radius) {
    let lowest = Infinity
    for (const [dx, dz] of [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]]) {
      const surface = this.islands.surfaceAt(island, x + dx, z + dz)
      if (surface) lowest = Math.min(lowest, surface.y)
    }
    return lowest
  }

  // The island's scene (see IslandScenes.js): hero, props, dock-head lamps.
  // The sign and project boards are built elsewhere; here they only keep
  // their ground clear.
  placeScene(island, occupied) {
    const { items, lamps, sign, boards } = island.plan
    for (const { id, x, z, rotation } of items) {
      const radius = footprints[id] ?? 1
      const y = this.groundAt(island, x, z, radius * 0.6) - 0.05
      if (id === 'signpost-hub') {
        const model = this.createHub(island)
        model.position.set(x, y, z)
        this.group.add(model)
        this.placed.push({ id, model })
      } else {
        this.add(id, x, y, z, rotation)
      }
      occupied.push({ x, z, radius })
      this.contacts.push({ x, z, radius: radius * 0.8 })
    }
    for (const { x, z } of lamps) {
      this.add('lantern', x, this.groundAt(island, x, z, 0.2) - 0.03, z)
      occupied.push({ x, z, radius: 0.6 })
      this.contacts.push({ x, z, radius: 0.3 })
    }
    occupied.push({ ...sign, radius: 2.6 })
    for (const board of boards) occupied.push({ ...board, radius: footprints.board })
  }

  // The home signpost points an arrow at every section island, in its colour
  createHub(island) {
    const arrows = this.islands.list
      .filter(other => other.section)
      .map(other => [Math.atan2(-(other.z - island.z), other.x - island.x), other.color, sections.find(section => section.id === other.section)?.title ?? other.section, other.section])
    return createSignpostHub(arrows)
  }

  scatter(island, random, occupied) {
    const isFree = (x, z, radius) => occupied.every(spot => Math.hypot(spot.x - x, spot.z - z) > spot.radius + radius)
    // Nothing tall grows on an inhabited island's level yard, nor between it
    // and the camera, so arriving shows the dock, sign, plaza and hero clearly
    const inYard = (x, z) => island.plan && (this.yardShapeAt(island, x, z) < 1.05 || this.blocksView(island, x, z))

    const tryPlace = (count, minRadius, maxRadius, accept, place) => {
      for (let placed = 0, tries = 0; placed < count && tries < count * 12; tries++) {
        const angle = random() * Math.PI * 2
        const distance = island.radius * (minRadius + random() * (maxRadius - minRadius))
        const x = island.x + Math.cos(angle) * distance
        const z = island.z + Math.sin(angle) * distance
        const surface = this.islands.surfaceAt(island, x, z)
        if (!surface || !accept(surface, x, z) || !isFree(x, z, 1.4)) continue
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
      (surface, x, z) =>
        surface.y > (island.sparse ? 0.15 : 0.4) && surface.normalY > 0.8 && !(island.volcano && surface.y > 5) && !inYard(x, z) && this.slopeAt(island, x, z, 0.7) < 0.35,
      (x, y, z) => {
        this.add(palms[Math.floor(random() * palms.length)], x, this.groundAt(island, x, z, 0.45) - 0.1, z, random() * Math.PI * 2, 0.75 + random() * 0.4)
        this.contacts.push({ x, z, radius: 0.5 })
      }
    )

    tryPlace(
      amount(Math.max(1, Math.round(island.radius * 0.2))),
      0.7,
      1.0,
      surface => surface.y > -0.8,
      (x, y, z) => {
        const width = 1 + random() * 1.3
        this.rocks.add(x, this.groundAt(island, x, z, width * 0.4) - 0.2, z, { width, height: 0.5 + random() * 0.9, mossy: y > 0.6 })
        this.contacts.push({ x, z, radius: width * 0.55 })
      }
    )

    const pick = list => list[Math.floor(random() * list.length)]
    // Nothing grows on the volcano's ash cone
    const onGrass = surface => surface.y > 0.6 && surface.normalY > 0.75 && !(island.volcano && surface.y > 5)

    tryPlace(island.sparse ? 0 : Math.round(island.radius * 0.15), 0.1, 0.6, (surface, x, z) => onGrass(surface) && !inYard(x, z), (x, y, z) => {
      this.foliage.addTree(new THREE.Vector3(x, this.groundAt(island, x, z, 0.4) - 0.1, z), 2.2 + random() * 1.2, 1.3 + random() * 0.6, pick(treeColors), random)
      this.contacts.push({ x, z, radius: 0.55 })
    })

    tryPlace(island.sparse ? 0 : Math.round(island.radius * 0.6), 0.1, 0.85, onGrass, (x, y, z) => {
      const size = 0.55 + random() * 0.6
      const ground = this.groundAt(island, x, z, size * 0.6)
      // Sunk a little so the lump grows out of the ground on every side
      this.foliage.addCluster(new THREE.Vector3(x, ground + size * 0.35, z), size, pick(bushColors))
      this.contacts.push({ x, z, radius: size * 0.85 })
      // Now and then a bush in flower: small blossoms dotted over its crown
      if (random() < 0.18) {
        const color = pick(flowerColors)
        for (let i = 0; i < 10; i++) {
          const angle = random() * Math.PI * 2
          const lift = 0.3 + random() * 0.6
          const reach = Math.sqrt(1 - lift * lift) * size * 0.95
          const blossom = new THREE.Vector3(x + Math.cos(angle) * reach, ground + size * 0.35 + lift * size * 0.86, z + Math.sin(angle) * reach)
          this.foliage.addCluster(blossom, size * 0.1, color)
        }
      }
    })

  }
}
