import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d'
import { applyBuoyancy } from './buoyancy.js'
import { createRandom } from '../utils/noise.js'
import { worldRadius } from './layout.js'
import { createStylizedMaterial } from './shading.js'

const box = new THREE.Box3()
const size = new THREE.Vector3()

// Jump ramps in open water; each rises along `direction`
const ramps = [
  { x: 27, z: -4, width: 5, direction: [-0.6, -0.8] },
  { x: -24, z: 31, width: 3.5, direction: [0.7, -0.7] },
  { x: 30, z: 40, width: 3.5, direction: [0.95, 0.3] },
]

const RAMP = { length: 6, low: -0.7, high: 1.5, bottom: -1.6 }

// Orange and white hazard stripes, mapped in world units across the ramp
function createStripeTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  context.fillStyle = '#ff7b2e'
  context.fillRect(0, 0, 64, 64)
  context.fillStyle = '#fff4e6'
  for (let i = -64; i < 64; i += 32) {
    context.beginPath()
    context.moveTo(i, 64)
    context.lineTo(i + 16, 64)
    context.lineTo(i + 80, 0)
    context.lineTo(i + 64, 0)
    context.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(0.5, 0.5)
  return texture
}

// A wedge seen from the side, extruded across the ramp's width. Its front
// edge sits under water so the hull slides on without catching.
function createRampGeometry(width) {
  const profile = new THREE.Shape()
  profile.moveTo(0, RAMP.bottom)
  profile.lineTo(RAMP.length, RAMP.bottom)
  profile.lineTo(RAMP.length, RAMP.high)
  profile.lineTo(0, RAMP.low)
  profile.closePath()
  const geometry = new THREE.ExtrudeGeometry(profile, { depth: width, bevelEnabled: false })
  geometry.rotateY(-Math.PI / 2) // profile x → world +z (up the ramp), extrusion → across
  geometry.translate(width / 2, 0, -RAMP.length / 2)
  return geometry
}

// Clusters of floating cargo near the islands
const flotsam = [
  { x: 24, z: -32, count: 4 },
  { x: -24, z: -6, count: 3 },
  { x: -36, z: 40, count: 4 },
  { x: 36, z: 12, count: 3 },
  { x: 10, z: 32, count: 3 },
]

// Floating crates and barrels the boat can shove around, and jump ramps
export class Props {
  constructor(app, models, islands) {
    this.app = app
    this.floaters = []
    const { world } = app.physics

    const rampMaterial = createStylizedMaterial({ map: createStripeTexture(), flatShading: true })
    for (const { x, z, width, direction } of ramps) {
      const geometry = createRampGeometry(width)
      const ramp = new THREE.Mesh(geometry, rampMaterial)
      ramp.position.set(x, 0, z)
      ramp.rotation.y = Math.atan2(direction[0], direction[1])
      ramp.castShadow = true
      ramp.receiveShadow = true
      app.scene.add(ramp)

      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0, z).setRotation(new THREE.Quaternion().setFromEuler(ramp.rotation))
      )
      world.createCollider(RAPIER.ColliderDesc.convexHull(geometry.attributes.position.array).setFriction(0.05), body)
    }

    const random = createRandom(404)
    const isOpenWater = (px, pz) => islands.list.every(island => Math.hypot(island.x - px, island.z - pz) > island.radius * 1.2)
    for (const cluster of flotsam) {
      for (let i = 0; i < cluster.count; i++) {
        const px = cluster.x + (random() - 0.5) * 8
        const pz = cluster.z + (random() - 0.5) * 8
        if (!isOpenWater(px, pz)) continue
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
    this.app.scene.add(object)

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
    const floater = { body, points, restDepth: half.y * 0.7, anchor: anchored ? { x, z } : null }
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
