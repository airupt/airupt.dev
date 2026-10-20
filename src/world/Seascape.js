import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d'
import { createRandom } from '../utils/noise.js'
import { waveHeight } from './waves.js'
import { spawn } from './layout.js'

const rocks = ['rocks-a', 'rocks-b', 'rocks-c', 'rocks-sand-a', 'rocks-sand-b', 'rocks-sand-c']

// Sea stacks between the islands so open water always has something in it
const rockClusters = [
  [21, 31],
  [37, -2],
  [-14, -22],
  [-30, -30],
  [34, -26],
  [60, -35],
  [-62, -5],
  [-32, 62],
  [8, 70],
  [62, 12],
  [-70, 35],
]

// Boats riding at anchor near the islands: [model, x, z, heading]
const moorings = [
  ['sailboat', -6, 16, 2.2],
  ['fishing-boat', 16, -36, 0.6],
  ['houseboat', -26, 22, -1.1],
]

const wreck = { x: -38, z: -28, yaw: 0.9 }

// Pairs of flag buoys, like harbour channel markers, halfway along the route
// from the start to each section dock
const GATE_WIDTH = 7

export class Seascape {
  constructor(app, models, props, zones) {
    this.app = app
    this.markers = []
    const { world } = app.physics
    const random = createRandom(2024)

    for (const [cx, cz] of rockClusters) {
      const count = 2 + Math.floor(random() * 3)
      for (let i = 0; i < count; i++) {
        const x = cx + (random() - 0.5) * 6
        const z = cz + (random() - 0.5) * 6
        const scale = 0.3 + random() * 0.45
        const y = -0.5 - random() * 0.9
        const rock = models.get(rocks[Math.floor(random() * rocks.length)])
        rock.scale.multiplyScalar(scale)
        rock.position.set(x, y, z)
        rock.rotation.y = random() * Math.PI * 2
        app.scene.add(rock)

        const halfHeight = 1.8 * scale
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y + halfHeight, z))
        world.createCollider(RAPIER.ColliderDesc.cylinder(halfHeight, 2 * scale), body)
      }
    }

    for (const [id, x, z, yaw] of moorings) props.addFloater(models, id, x, z, yaw, { hull: 0.9, anchored: true, density: 60 })

    // A half-sunk wreck, listing to one side
    const ship = models.get('wreck')
    ship.scale.multiplyScalar(0.8)
    ship.position.set(wreck.x, -2.4, wreck.z)
    ship.rotation.set(0.12, wreck.yaw, 0.32)
    app.scene.add(ship)
    const shipBody = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(wreck.x, -0.5, wreck.z).setRotation(new THREE.Quaternion().setFromEuler(ship.rotation))
    )
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.8, 2.2, 4.2), shipBody)

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
