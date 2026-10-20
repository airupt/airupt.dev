import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d'
import { createRandom } from '../utils/noise.js'
import { waveHeight } from './waves.js'
import { spawn } from './layout.js'
import { instanceStatic } from './instancing.js'

// Sea stacks between the islands so open water always has something in it
const rockClusters = [
  [21, 31],
  [37, -2],
  [-14, -22],
  [-30, -30],
  [34, -26],
  [-62, -5],
  [-32, 62],
  [8, 70],
  [62, 12],
  [-70, 35],
]

// A natural arch out west, wide enough to sail through
const arch = { x: -64, z: 22, yaw: 0.5 }

// Boats riding at anchor near the islands: [model, x, z, heading]
const moorings = [
  ['sailboat', -6, 16, 2.2],
  ['fishing-boat', 16, -36, 0.6],
  ['houseboat', -26, 22, -1.1],
]

// Out in open water between Contact and Skills, a reward for exploring
const wreck = { x: 31, z: 41, yaw: 0.9 }

// Pairs of flag buoys, like harbour channel markers, halfway along the route
// from the start to each section dock
const GATE_WIDTH = 7

export class Seascape {
  constructor(app, models, props, zones, rockField, islands) {
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

    rockField.addArch(arch.x, arch.z, arch.yaw, { span: 10, thickness: 1.4 })

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

    for (const zone of zones.list) {
      const midX = (zone.x + spawn.x) / 2
      const midZ = (zone.z + spawn.z) / 2
      const dx = zone.x - midX
      const dz = zone.z - midZ
      const length = Math.hypot(dx, dz) || 1
      for (const side of [-1, 1]) {
        const marker = models.get('buoy-flag')
        marker.scale.multiplyScalar(0.85)
        marker.userData.x = midX + (-dz / length) * GATE_WIDTH * side
        marker.userData.z = midZ + (dx / length) * GATE_WIDTH * side
        marker.userData.phase = random() * 6
        app.scene.add(marker)
        this.markers.push(marker)
      }
    }
  }

  // Channel markers only bob; they are not part of the physics
  update() {
    const time = this.app.physics.renderTime
    for (const marker of this.markers) {
      const { x, z, phase } = marker.userData
      marker.position.set(x, waveHeight(x, z, time) - 0.15, z)
      marker.rotation.set(Math.sin(time * 1.3 + phase) * 0.12, phase, Math.cos(time * 1.1 + phase) * 0.12)
    }
  }
}
