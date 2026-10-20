import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d'
import { createRandom } from '../utils/noise.js'
import { createSparBuoy } from './Structures.js'
import { Buoy } from './Buoy.js'
import { arch, rockClusters, spawn } from './layout.js'
import { instanceStatic } from './instancing.js'

// Boats riding at anchor near the islands: [model, x, z, heading]
const moorings = [
  ['sailboat', -6, 16, 2.2],
  ['fishing-boat', 26, -41, 0.6],
  ['houseboat', -26, 28, -1.1],
]

// Out in open water between Contact and Skills, a reward for exploring
const wreck = { x: 31, z: 41, yaw: 0.9 }

// A pair of channel marks halfway along the run from the start to each
// section's dock: sail between them and you are on your way there
const CHANNEL_WIDTH = 9

export class Seascape {
  constructor(app, models, props, rockField, islands, zones) {
    this.app = app
    this.markers = []
    const { world } = app.physics
    const random = createRandom(2024)
    const group = new THREE.Group()
    app.scene.add(group)
    const statics = []

    // One tall stack and a few lower rocks around it
    for (const [cx, cz] of rockClusters) {
      const count = 2 + Math.floor(random() * 3)
      for (let i = 0; i < count; i++) {
        const tall = i === 0
        const angle = random() * Math.PI * 2
        const distance = tall ? 0 : 1.8 + random() * 2.2
        rockField.add(cx + Math.cos(angle) * distance, 0, cz + Math.sin(angle) * distance, {
          width: tall ? 1.8 + random() * 1 : 0.9 + random() * 0.9,
          height: tall ? 1.8 + random() * 2 : 0.3 + random() * 0.8,
          mossy: tall && random() < 0.5,
        })
      }
    }

    rockField.addArch(arch.x, arch.z, arch.yaw, { span: arch.span, thickness: 1.4 })

    // Rocks breaking the surface along the reef's rim
    for (const island of islands.list.filter(candidate => candidate.reef)) {
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + random() * 0.6
        const distance = island.radius * (0.45 + random() * 0.15)
        rockField.add(island.x + Math.cos(angle) * distance, 0, island.z + Math.sin(angle) * distance, {
          width: 0.8 + random() * 0.8,
          height: 0.2 + random() * 0.5,
        })
      }
    }

    for (const [id, x, z, yaw] of moorings) props.addFloater(models, id, x, z, yaw, { hull: 0.9, anchored: true, density: 60 })

    // A half-sunk wreck, listing to one side
    const ship = models.get('wreck')
    ship.scale.multiplyScalar(0.8)
    ship.position.set(wreck.x, -2.4, wreck.z)
    ship.rotation.set(0.12, wreck.yaw, 0.32)
    group.add(ship)
    statics.push(ship)
    const shipBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(wreck.x, -0.5, wreck.z).setRotation(new THREE.Quaternion().setFromEuler(ship.rotation))
    )
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.8, 2.2, 4.2), shipBody)

    instanceStatic(group, statics)

    const isOpenWater = (x, z) => islands.list.every(island => Math.hypot(island.x - x, island.z - z) > island.radius * 1.15)
    for (const zone of zones.list) {
      const dx = zone.x - spawn.x
      const dz = zone.z - spawn.z
      const length = Math.hypot(dx, dz)
      // Facing along the run, red is to port (left), green to starboard
      const across = { x: -dz / length, z: dx / length }
      for (const t of [0.5, 0.42, 0.58]) {
        const midX = spawn.x + dx * t
        const midZ = spawn.z + dz * t
        const spots = [
          ['port', midX + across.x * (CHANNEL_WIDTH / 2), midZ + across.z * (CHANNEL_WIDTH / 2)],
          ['starboard', midX - across.x * (CHANNEL_WIDTH / 2), midZ - across.z * (CHANNEL_WIDTH / 2)],
        ]
        if (!spots.every(([, x, z]) => isOpenWater(x, z))) continue
        // Real floating buoys on a tether: the boat can bump them aside
        for (const [side, x, z] of spots) {
          const model = new THREE.Group()
          const mark = createSparBuoy(side)
          mark.position.y = -0.3
          model.add(mark)
          this.markers.push(new Buoy(app, { x, z, model }))
        }
        break
      }
    }
  }
}
