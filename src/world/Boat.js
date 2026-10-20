import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d'
import { applyBuoyancy } from './buoyancy.js'
import { spawn, worldRadius } from './layout.js'

// Hull box half extents; the boat faces -Z
const HULL = { x: 0.85, y: 0.32, z: 1.85 }

const FLOAT_POINTS = [
  new THREE.Vector3(-0.72, -0.32, -1.5),
  new THREE.Vector3(0.72, -0.32, -1.5),
  new THREE.Vector3(-0.72, -0.32, 1.5),
  new THREE.Vector3(0.72, -0.32, 1.5),
]

// Turns the loaded model so its bow points along -Z
const MODEL_ROTATION = Math.PI

// Thrust pushes from the stern, a little under the centre, so the bow lifts
const THRUST_POINT = new THREE.Vector3(0, -0.15, 1.6)

const tuning = {
  acceleration: 10,
  boostAcceleration: 16,
  reverseAcceleration: 5,
  drag: 0.05, // quadratic; top speed ≈ sqrt(acceleration / drag)
  grip: 3, // how quickly sideways sliding dies out
  turnRate: 1.6, // rad/s once moving
  lean: 0.22,
}

const spawnRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spawn.yaw)

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
        .setRotation(spawnRotation)
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
    this.hide()
  }

  setModel(model) {
    // Kenney models stand on y = 0; line the keel up with the bottom of the hull box
    model.position.y = -HULL.y
    model.rotation.y = MODEL_ROTATION
    this.lean.clear()
    this.lean.add(model)
  }

  step(dt, time) {
    if (this.hidden) {
      this.inWater = 0
      return
    }
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
      // Firm enough that waves rocking the hull don't slowly turn the boat
      const blend = 1 - Math.exp(-9 * water * dt)
      body.setAngvel({ x: angvel.x, y: angvel.y + (targetYaw - angvel.y) * blend, z: angvel.z }, true)
    }

    // Airborne off a ramp or wave: ease the hull back toward level so jumps
    // end in a landing rather than a backflip
    if (this.inWater === 0) {
      up.set(0, 1, 0).applyQuaternion(quaternion)
      const angvel = body.angvel()
      const level = 6 * dt
      const damp = 1 - Math.exp(-3 * dt)
      // up × worldUp = (-up.z, 0, up.x) is the axis that turns the hull back upright
      body.setAngvel(
        {
          x: angvel.x - angvel.x * damp - up.z * level,
          y: angvel.y,
          z: angvel.z - angvel.z * damp + up.x * level,
        },
        true
      )
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

  // Before the intro the boat is parked out of sight, so it can arrive on cue
  hide() {
    this.hidden = true
    this.object.visible = false
    this.body.setEnabled(false)
  }

  // Intro: the boat falls into the sea from a little height and splashes down
  drop() {
    this.hidden = false
    this.object.visible = true
    this.body.setEnabled(true)
    this.body.setTranslation({ x: spawn.x, y: 4, z: spawn.z }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setRotation(spawnRotation, true)
    this.body.setAngvel({ x: 0.4, y: 0, z: 0.25 }, true)
    this.sync.reset()
  }

  // Jump straight to a spot (map travel), hidden behind the same wipe as a respawn
  teleport(x, z, yaw) {
    this.onRespawn?.()
    this.body.setTranslation({ x, y: 0.4, z }, true)
    this.body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.sync.reset()
  }

  respawn() {
    this.onRespawn?.()
    this.body.setTranslation({ x: spawn.x, y: 0.4, z: spawn.z }, true)
    this.body.setRotation(spawnRotation, true)
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
