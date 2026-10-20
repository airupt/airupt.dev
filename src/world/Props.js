import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d'
import { applyBuoyancy } from './buoyancy.js'
import { createRandom } from '../utils/noise.js'
import { worldRadius } from './layout.js'
import { createStylizedMaterial } from './shading.js'
import { DynamicInstances } from './instancing.js'

const box = new THREE.Box3()
const size = new THREE.Vector3()

// Jump ramps in open water; each rises along `direction`. One lies on the
// first run from the start toward Projects, so the first press of W finds it.
export const ramps = [
  { x: 11.5, z: -18, width: 5, direction: [-0.214, -0.977] },
  { x: -20, z: 30, width: 3.5, direction: [0.866, 0.5] },
  { x: 52, z: 8, width: 3.5, direction: [-0.3, 0.95] },
]

const RAMP = { length: 6, low: -0.7, high: 1.5, bottom: -1.6 }

// Weathered planks for the ramp deck and sides
function createPlankTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  context.fillStyle = '#b9834f'
  context.fillRect(0, 0, 64, 64)
  context.fillStyle = '#8f6038'
  for (let x = 0; x < 64; x += 16) context.fillRect(x, 0, 2, 64)
  context.fillStyle = 'rgba(255, 240, 220, 0.12)'
  for (let x = 4; x < 64; x += 16) context.fillRect(x, 0, 5, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(0.6, 0.6)
  return texture
}

// Hazard stripes, only on the lip at the top of the ramp
function createStripeTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 16
  const context = canvas.getContext('2d')
  context.fillStyle = '#d0652f'
  context.fillRect(0, 0, 128, 16)
  context.fillStyle = '#f6ead8'
  for (let x = -16; x < 128; x += 24) {
    context.beginPath()
    context.moveTo(x, 16)
    context.lineTo(x + 12, 16)
    context.lineTo(x + 28, 0)
    context.lineTo(x + 16, 0)
    context.fill()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
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

// Floating cargo, each group with a reason to be there: crates lost by the
// fishing boat moored off Projects, and debris around the wreck
const flotsam = [
  { x: 22, z: -37, count: 3 },
  { x: 35, z: 36, count: 2 },
]

// Floating crates and barrels the boat can shove around, and jump ramps
export class Props {
  constructor(app, models, islands) {
    this.app = app
    this.floaters = []
    // Every floater of the same model is drawn in one call (built once all are added)
    this.instances = new DynamicInstances(app.scene)
    const { world } = app.physics

    const rampMaterial = createStylizedMaterial({ map: createPlankTexture(), flatShading: true })
    const lipMaterial = createStylizedMaterial({ map: createStripeTexture(), flatShading: true })
    for (const { x, z, width, direction } of ramps) {
      const geometry = createRampGeometry(width)
      const ramp = new THREE.Mesh(geometry, rampMaterial)
      ramp.position.set(x, 0, z)
      ramp.rotation.y = Math.atan2(direction[0], direction[1])
      ramp.castShadow = true
      ramp.receiveShadow = true
      app.scene.add(ramp)

      const lip = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, 0.14, 0.45), lipMaterial)
      lip.position.set(0, RAMP.high + 0.02, RAMP.length / 2 - 0.22)
      lip.castShadow = true
      ramp.add(lip)

      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(x, 0, z).setRotation(new THREE.Quaternion().setFromEuler(ramp.rotation))
      )
      world.createCollider(RAPIER.ColliderDesc.convexHull(geometry.attributes.position.array).setFriction(0.05), body)
    }

    const random = createRandom(404)
    const isOpenWater = (px, pz) => islands.list.every(island => Math.hypot(island.x - px, island.z - pz) > island.radius * 1.2)
    for (const cluster of flotsam) {
      for (let i = 0; i < cluster.count; i++) {
        const px = cluster.x + (random() - 0.5) * 5
        const pz = cluster.z + (random() - 0.5) * 5
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
