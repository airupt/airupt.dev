import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { applyBuoyancy } from './buoyancy.js'
import { spawn, worldRadius } from './layout.js'

// Hull box half extents; the boat faces -Z
const HULL = { x: 0.7, y: 0.3, z: 1.5 }

const FLOAT_POINTS = [
  new THREE.Vector3(-0.6, -0.3, -1.2),
  new THREE.Vector3(0.6, -0.3, -1.2),
  new THREE.Vector3(-0.6, -0.3, 1.2),
  new THREE.Vector3(0.6, -0.3, 1.2),
]

// Thrust pushes from the stern, a little under the centre, so the bow lifts
const THRUST_POINT = new THREE.Vector3(0, -0.15, 1.3)

const tuning = {
  acceleration: 10,
  boostAcceleration: 16,
  reverseAcceleration: 5,
  drag: 0.05, // quadratic; top speed ≈ sqrt(acceleration / drag)
  grip: 3, // how quickly sideways sliding dies out
  turnRate: 1.6, // rad/s once moving
  lean: 0.22,
}

const quaternion = new THREE.Quaternion()
const forward = new THREE.Vector3()
const right = new THREE.Vector3()
const up = new THREE.Vector3()
const point = new THREE.Vector3()

function createPlaceholderModel() {
  const outline = new THREE.Shape()
  outline.moveTo(-0.7, -1.45)
  outline.lineTo(0.7, -1.45)
  outline.lineTo(0.75, 0.3)
  outline.lineTo(0, 1.75)
  outline.lineTo(-0.75, 0.3)
  outline.closePath()

  const hullGeometry = new THREE.ExtrudeGeometry(outline, { depth: 0.55, bevelEnabled: false })
  hullGeometry.rotateX(-Math.PI / 2) // outline y → -z (bow forward), extrusion → +y
  hullGeometry.translate(0, -0.3, 0)

  const hull = new THREE.Mesh(hullGeometry, new THREE.MeshStandardMaterial({ color: '#f4f4f0', flatShading: true }))
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.45, 0.8),
    new THREE.MeshStandardMaterial({ color: '#ff6b4a', flatShading: true })
  )
  cabin.position.set(0, 0.45, 0.25)

  const model = new THREE.Group()
  model.add(hull, cabin)
  model.traverse(child => (child.castShadow = true))
  return model
}

export class Boat {
  constructor(app) {
    this.app = app
    this.velocity = new THREE.Vector3()
    this.speed = 0
    this.inWater = 0
    this.capsizedTime = 0

    const { world } = app.physics
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, 0.4, spawn.z)
        .setLinearDamping(0.1)
        .setAngularDamping(0.8)
        .setCanSleep(false)
    )
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(HULL.x, HULL.y, HULL.z).setDensity(100).setFriction(0.3).setRestitution(0.2),
      this.body
    )

    this.object = new THREE.Group() // follows the physics body
    this.lean = new THREE.Group() // cosmetic banking in turns
    this.object.add(this.lean)
    this.lean.add(createPlaceholderModel())
    app.scene.add(this.object)

    this.sync = app.physics.sync(this.body, this.object)
    app.physics.beforeStep.push((dt, time) => this.step(dt, time))
    app.inputs.on('reset', () => this.respawn())
  }

  setModel(model) {
    this.lean.clear()
    this.lean.add(model)
  }

  step(dt, time) {
    const body = this.body
    const mass = body.mass()
    const input = this.app.inputs.state
    const translation = body.translation()
    const rotation = body.rotation()
    const linvel = body.linvel()

    this.inWater = applyBuoyancy(body, FLOAT_POINTS, dt, time, { restDepth: 0.22, damping: 5 })

    quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
    forward.set(0, 0, -1).applyQuaternion(quaternion).setY(0).normalize()
    right.set(-forward.z, 0, forward.x)

    const forwardSpeed = linvel.x * forward.x + linvel.z * forward.z
    const lateralSpeed = linvel.x * right.x + linvel.z * right.z
    this.speed = forwardSpeed

    if (this.inWater > 0) {
      const water = this.inWater
      let acceleration = input.boost ? tuning.boostAcceleration : tuning.acceleration
      if (input.throttle < 0) acceleration = tuning.reverseAcceleration

      const thrust = input.throttle * acceleration * mass * water * dt
      point.copy(THRUST_POINT).applyQuaternion(quaternion).add(translation)
      body.applyImpulseAtPoint({ x: forward.x * thrust, y: 0, z: forward.z * thrust }, point, true)

      const drag = -forwardSpeed * Math.abs(forwardSpeed) * tuning.drag * mass * water * dt
      const grip = -lateralSpeed * tuning.grip * mass * water * dt
      body.applyImpulse({ x: forward.x * drag + right.x * grip, y: 0, z: forward.z * drag + right.z * grip }, true)

      // A rudder needs flow: steering strengthens with speed and flips in reverse
      const direction = forwardSpeed < -0.5 ? -1 : 1
      const authority = THREE.MathUtils.clamp(Math.abs(forwardSpeed) / 4, 0.3, 1)
      const targetYaw = -input.steer * tuning.turnRate * authority * direction
      const angvel = body.angvel()
      const blend = 1 - Math.exp(-5 * water * dt)
      body.setAngvel({ x: angvel.x, y: angvel.y + (targetYaw - angvel.y) * blend, z: angvel.z }, true)
    }

    // Soft border: past the world edge the sea gently pushes you back
    const distance = Math.hypot(translation.x, translation.z)
    if (distance > worldRadius) {
      const push = ((distance - worldRadius) * 4 * mass * dt) / distance
      body.applyImpulse({ x: -translation.x * push, y: 0, z: -translation.z * push }, true)
    }

    up.set(0, 1, 0).applyQuaternion(quaternion)
    this.capsizedTime = up.y < 0.3 ? this.capsizedTime + dt : 0
    if (this.capsizedTime > 2 || translation.y < -5) this.respawn()
  }

  respawn() {
    this.body.setTranslation({ x: spawn.x, y: 0.4, z: spawn.z }, true)
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.sync.reset()
    this.capsizedTime = 0
  }

  update(delta) {
    const linvel = this.body.linvel()
    this.velocity.set(linvel.x, linvel.y, linvel.z)

    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 10, 0, 1)
    const targetLean = -this.app.inputs.state.steer * tuning.lean * speedFactor
    this.lean.rotation.z += (targetLean - this.lean.rotation.z) * (1 - Math.exp(-4 * delta))
  }
}
