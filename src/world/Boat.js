import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d'
import { applyBuoyancy } from './buoyancy.js'
import { spawn, worldRadius } from './layout.js'
import { createStylizedMaterial } from './shading.js'

const PAINT_KEY = 'airupt-paint'
const goldMaterials = new Map()

// Gold leaf by brightness: shadows go bronze, highlights pale gold
const GOLD = [
  [0, [74, 44, 10]],
  [0.45, [201, 138, 28]],
  [0.75, [242, 198, 74]],
  [1, [255, 244, 194]],
].map(([at, rgb]) => [at, new THREE.Color().setRGB(...rgb.map(value => value / 255), THREE.SRGBColorSpace)])

// The model's colour texture redrawn in gold, keeping every detail by its brightness
function gilded(texture) {
  const image = texture.image
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  const data = pixels.data
  const color = new THREE.Color()
  for (let i = 0; i < data.length; i += 4) {
    const light = (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11) / 255
    const upper = GOLD.findIndex(([at]) => at >= light)
    const [fromAt, from] = GOLD[Math.max(upper - 1, 0)]
    const [toAt, to] = GOLD[upper]
    color.copy(from).lerp(to, toAt > fromAt ? (light - fromAt) / (toAt - fromAt) : 0)
    const srgb = color.clone().convertLinearToSRGB()
    data[i] = srgb.r * 255
    data[i + 1] = srgb.g * 255
    data[i + 2] = srgb.b * 255
  }
  context.putImageData(pixels, 0, 0)
  const result = new THREE.CanvasTexture(canvas)
  for (const key of ['flipY', 'colorSpace', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'channel']) result[key] = texture[key]
  return result
}

function readPaint() {
  try {
    return localStorage.getItem(PAINT_KEY) === 'gold' ? 'gold' : 'classic'
  } catch {
    return 'classic'
  }
}

function savePaint(paint) {
  try {
    localStorage.setItem(PAINT_KEY, paint)
  } catch {
    // Private mode: the paint just isn't remembered
  }
}

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
  lean: 0.3,
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
    this.beachedTime = 0
    // Where the boat was last properly afloat: x, z and its yaw
    this.afloat = new THREE.Vector3(spawn.x, spawn.z, spawn.yaw)

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
  }

  setModel(model) {
    // Kenney models stand on y = 0; line the keel up with the bottom of the hull box
    model.position.y = -HULL.y
    model.rotation.y = MODEL_ROTATION
    this.lean.clear()
    this.lean.add(model)
    this.setPaint(readPaint())
  }

  // The model's own colours, or gold: the treasure's reward
  setPaint(paint) {
    this.paint = paint
    savePaint(paint)
    this.lean.traverse(child => {
      if (!child.isMesh) return
      child.userData.classic ??= child.material
      const classic = child.userData.classic
      if (paint === 'gold' && !goldMaterials.has(classic)) {
        goldMaterials.set(classic, createStylizedMaterial(classic.map ? { map: gilded(classic.map) } : { color: '#f2c64a' }))
      }
      child.material = paint === 'gold' ? goldMaterials.get(classic) : classic
    })
  }

  step(dt, time) {
    const body = this.body
    const mass = body.mass()
    const input = this.app.inputs.state
    const translation = body.translation()
    const rotation = body.rotation()
    const linvel = body.linvel()

    this.inWater = applyBuoyancy(body, FLOAT_POINTS, dt, time, { restDepth: 0.22, damping: 5 })

    // Coming in alongside a dock: glide to the berth, the waves still
    // lifting the hull, then drift free again
    if (this.mooring) {
      const mooring = this.mooring
      mooring.t = Math.min(mooring.t + dt / mooring.duration, 1)
      const t = mooring.t * mooring.t * (3 - 2 * mooring.t)
      const now = body.translation()
      body.setTranslation({ x: mooring.from.x + (mooring.x - mooring.from.x) * t, y: now.y, z: mooring.from.z + (mooring.z - mooring.from.z) * t }, true)
      quaternion.slerpQuaternions(mooring.fromRotation, mooring.rotation, t)
      body.setRotation(quaternion, true)
      const velocity = body.linvel()
      body.setLinvel({ x: 0, y: velocity.y, z: 0 }, true)
      body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      if (mooring.t === 1) this.mooring = null
      return
    }

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

    // Run up a beach and stuck there: slip back to where it left the water,
    // a few metres out and facing the sea. Phones have no reset key.
    if (this.inWater > 0.5) this.afloat.set(translation.x, translation.z, Math.atan2(-forward.x, -forward.z))
    const still = Math.hypot(linvel.x, linvel.z) < 1
    this.beachedTime = this.inWater === 0 && still ? this.beachedTime + dt : 0
    if (this.beachedTime > 1.5) {
      const [x, z, yaw] = this.afloat.toArray()
      this.teleport(x + Math.sin(yaw) * 5, z + Math.cos(yaw) * 5, yaw + Math.PI)
    }
  }

  // Glide alongside a dock (bow toward yaw) over a moment
  moor(x, z, yaw, duration = 0.7) {
    const from = this.body.translation()
    const rotation = this.body.rotation()
    this.mooring = {
      x,
      z,
      from: { x: from.x, z: from.z },
      fromRotation: new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
      rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      duration,
      t: 0,
    }
  }

  // Jump straight to a spot (map travel), hidden behind the same wipe as a respawn
  teleport(x, z, yaw) {
    this.mooring = null
    this.onRespawn?.()
    this.body.setTranslation({ x, y: 0.4, z }, true)
    this.body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.sync.reset()
    this.beachedTime = 0
  }

  respawn() {
    this.mooring = null
    this.onRespawn?.()
    this.body.setTranslation({ x: spawn.x, y: 0.4, z: spawn.z }, true)
    this.body.setRotation(spawnRotation, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.sync.reset()
    this.capsizedTime = 0
    this.beachedTime = 0
  }

  update(delta) {
    const linvel = this.body.linvel()
    this.velocity.set(linvel.x, linvel.y, linvel.z)

    const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / 10, 0, 1)
    const targetLean = -this.app.inputs.state.steer * tuning.lean * speedFactor
    this.lean.rotation.z += (targetLean - this.lean.rotation.z) * (1 - Math.exp(-4 * delta))
    // Under boost the bow lifts a few degrees and the boat sits back on its stern
    const boosting = this.app.inputs.state.boost && this.app.inputs.state.throttle > 0 && this.speed > 6
    this.lean.rotation.x += ((boosting ? 0.075 : 0) - this.lean.rotation.x) * (1 - Math.exp(-3 * delta))
  }
}
