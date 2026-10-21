import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d'
import { applyBuoyancy } from './buoyancy.js'
import { createRandom } from '../utils/noise.js'
import { isOpenWater, worldRadius } from './layout.js'
import { DynamicInstances } from './instancing.js'

const box = new THREE.Box3()
const size = new THREE.Vector3()

// Floating cargo, each group with a reason to be there: crates lost by the
// fishing boat moored off Projects, and debris around the wreck
const flotsam = [
  { x: 22, z: -37, count: 2 },
  { x: 35, z: 36, count: 2 },
]

// Floating crates and barrels the boat can shove around
export class Props {
  constructor(app, models) {
    this.app = app
    this.floaters = []
    // Every floater of the same model is drawn in one call (built once all are added)
    this.instances = new DynamicInstances(app.scene)

    const random = createRandom(404)
    for (const cluster of flotsam) {
      for (let i = 0; i < cluster.count; i++) {
        const px = cluster.x + (random() - 0.5) * 5
        const pz = cluster.z + (random() - 0.5) * 5
        if (!isOpenWater(px, pz, { scale: 1.2 })) continue
        this.addFloater(models, random() < 0.6 ? 'barrel' : 'crate-bottles', px, pz, random() * Math.PI * 2)
      }
    }
  }

  // `hull` limits the floating box to the hull for tall models (masts, cabins);
  // anchored floaters drift back to where they were placed
  addFloater(models, id, x, z, yaw, { hull = null, anchored = false, density = 35 } = {}) {
    const { world } = this.app.physics
    const model = models.get(id)
    box.setFromObject(model).getSize(size)
    const half = { x: size.x / 2, y: (hull ?? size.y) / 2, z: size.z / 2 }

    // The model stands on y = 0; put its base at the bottom of the body box
    const object = new THREE.Group()
    model.position.y = -half.y
    object.add(model)
    object.position.set(x, 0.3, z)
    object.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    this.instances.register(object, model)

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, 0.3, z)
        .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw))
        .setLinearDamping(0.6)
        .setAngularDamping(1.2)
    )
    const desc =
      id === 'barrel'
        ? RAPIER.ColliderDesc.cylinder(half.y, Math.min(half.x, half.z))
        : RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
    world.createCollider(desc.setDensity(density).setRestitution(0.3), body)

    // Wide, low float points keep them upright but let them rock
    const points = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].map(([sx, sz]) => new THREE.Vector3(sx * half.x * 1.3, -half.y * 0.4, sz * half.z * 1.3))

    this.app.physics.sync(body, object)
    const floater = { body, points, restDepth: half.y * 0.45, anchor: anchored ? { x, z } : null }
    this.floaters.push(floater)
    this.app.physics.beforeStep.push((dt, time) => this.step(floater, dt, time))
  }

  step({ body, points, restDepth, anchor }, dt, time) {
    applyBuoyancy(body, points, dt, time, { restDepth, damping: 3 })

    if (anchor) {
      const translation = body.translation()
      const pull = 0.6 * body.mass() * dt
      body.applyImpulse({ x: (anchor.x - translation.x) * pull, y: 0, z: (anchor.z - translation.z) * pull }, true)
    }

    const translation = body.translation()
    const distance = Math.hypot(translation.x, translation.z)
    if (distance > worldRadius) {
      const push = ((distance - worldRadius) * 2 * body.mass() * dt) / distance
      body.applyImpulse({ x: -translation.x * push, y: 0, z: -translation.z * push }, true)
    }
  }
}
