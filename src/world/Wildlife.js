import * as THREE from 'three'
import { isOpenWater, wreck } from './layout.js'
import { waveHeight } from './waves.js'
import { mesh, part } from './Structures.js'

const forward = new THREE.Vector3()
const right = new THREE.Vector3()
const point = new THREE.Vector3()
const kick = new THREE.Vector3()

const ease = t => t * t * (3 - 2 * t)
const clamp01 = t => Math.min(Math.max(t, 0), 1)

// Clear of every island by `margin` metres
// A few rare animals, each with its own moment: dolphins race a boat at
// full speed, a whale comes up at night far from land, and something under
// the wreck doesn't like being disturbed
export class Wildlife {
  constructor(app, splashes, logbook) {
    this.dolphins = new Dolphins(app, splashes, logbook)
    this.whale = new Whale(app, splashes, logbook)
    this.tentacle = new Tentacle(app, splashes, logbook)
  }

  update(delta) {
    this.dolphins.update(delta)
    this.whale.update(delta)
    this.tentacle.update(delta)
  }
}

// The bow's direction on the water and the starboard side
function boatAxes(boat) {
  forward.set(0, 0, -1).applyQuaternion(boat.object.quaternion).setY(0).normalize()
  right.set(-forward.z, 0, forward.x)
}

function createDolphin() {
  const body = new THREE.SphereGeometry(0.34, 10, 7)
  body.scale(1, 0.9, 3.4)
  const skin = '#6c8ca8'
  const fin = '#506f89'
  const group = new THREE.Group()
  group.add(
    mesh([
      part(body, skin),
      part(new THREE.ConeGeometry(0.1, 0.5, 6), skin, [0, -0.06, -1.3], [-Math.PI / 2, 0, 0]),
      part(new THREE.ConeGeometry(0.22, 0.5, 3).scale(0.3, 1, 1), fin, [0, 0.38, 0.15], [0.55, 0, 0]),
      // Flukes swept back in a V, and two small flippers
      part(new THREE.ConeGeometry(0.09, 0.5, 4).scale(1, 1, 0.35), fin, [0, 0.02, 1.1], [Math.PI / 2, 0, 0]),
      part(new THREE.ConeGeometry(0.16, 0.55, 3).scale(1, 1, 0.25), fin, [0.24, 0.02, 1.38], [Math.PI / 2, 0, -1.05, 'YXZ']),
      part(new THREE.ConeGeometry(0.16, 0.55, 3).scale(1, 1, 0.25), fin, [-0.24, 0.02, 1.38], [Math.PI / 2, 0, 1.05, 'YXZ']),
      part(new THREE.ConeGeometry(0.1, 0.4, 3).scale(1, 1, 0.3), fin, [0.3, -0.16, -0.35], [0.4, 0, -1.9]),
      part(new THREE.ConeGeometry(0.1, 0.4, 3).scale(1, 1, 0.3), fin, [-0.3, -0.16, -0.35], [0.4, 0, 1.9]),
    ])
  )
  group.rotation.order = 'YXZ'
  return group
}

// Three dolphins join a boat that has been at full speed in open water for
// a moment, ride along leaping, then peel away
class Dolphins {
  constructor(app, splashes, logbook) {
    this.app = app
    this.splashes = splashes
    this.logbook = logbook
    this.pod = [
      { across: -2.8, ahead: 1, phase: 0 },
      { across: 2.9, ahead: -0.2, phase: 2.1 },
      { across: -5.2, ahead: -2.8, phase: 4.3 },
    ].map(spot => ({ ...spot, model: createDolphin(), above: false }))
    for (const dolphin of this.pod) {
      dolphin.model.visible = false
      app.scene.add(dolphin.model)
    }
    this.time = 0
    this.boosting = 0
    this.cooldown = 8
    this.active = false
  }

  update(delta) {
    const { boat } = this.app.world
    const input = this.app.inputs.state
    const position = boat.object.position
    this.cooldown -= delta
    // Full throttle and fast, boost or not: phones have no boost key
    const flatOut = input.throttle > 0.9 && boat.speed > 10.5 && isOpenWater(position.x, position.z, { margin: 10 })

    if (!this.active) {
      this.boosting = flatOut ? this.boosting + delta : 0
      if (this.boosting > 1.2 && this.cooldown <= 0) this.start()
      return
    }

    this.time += delta
    // They leave after a while, or as soon as the race is over
    if (!this.leaving && (this.time > 11 || !flatOut)) this.leaving = this.time
    if (this.time > 2 && boat.speed > 8) this.logbook.record('dolphins')

    boatAxes(boat)
    const yaw = Math.atan2(-forward.x, -forward.z)
    const time = this.app.physics.renderTime
    const arriving = ease(clamp01(this.time / 1.6))
    const going = this.leaving ? clamp01((this.time - this.leaving) / 2) : 0

    for (const dolphin of this.pod) {
      const ahead = dolphin.ahead - 14 * (1 - arriving) - going * 6
      const across = dolphin.across * (1 + going * 1.5)
      point.copy(position).addScaledVector(right, across).addScaledVector(forward, ahead)
      const surface = waveHeight(point.x, point.z, time)
      // Mostly just under the surface, arcing out every couple of seconds
      const swim = Math.sin(this.time * 2.6 + dolphin.phase)
      const leap = Math.pow(Math.max(swim, 0), 1.6) * 1.25 * (1 - going)
      const y = surface - 0.5 - going * 2 + leap
      const rise = (y - dolphin.model.position.y) / Math.max(delta, 1e-3)
      dolphin.model.position.set(point.x, y, point.z)
      dolphin.model.rotation.set(THREE.MathUtils.clamp(rise / Math.max(boat.speed, 4), -0.8, 0.8), yaw + Math.sin(this.time * 1.3 + dolphin.phase) * 0.08, 0)

      const above = y > surface - 0.1
      if (above !== dolphin.above) {
        point.y = surface
        this.splashes.emit(point, kick.copy(forward).multiplyScalar(boat.speed * 0.4), { count: 10, spread: 0.5, up: 1.6, size: 0.07, life: 0.6 })
        if (!above) this.app.sounds.play('splash', 0.18, 1.6 + Math.random() * 0.3, point)
      }
      dolphin.above = above
    }

    if (this.leaving && this.time - this.leaving > 2) this.stop()
  }

  start() {
    this.active = true
    this.time = 0
    this.leaving = 0
    for (const dolphin of this.pod) dolphin.model.visible = true
  }

  stop() {
    this.active = false
    this.boosting = 0
    this.cooldown = 40
    for (const dolphin of this.pod) dolphin.model.visible = false
  }
}

function createWhale() {
  const skin = '#4a6280'
  const pale = '#9aaabb'
  const body = new THREE.SphereGeometry(1, 12, 8)
  body.scale(1.5, 1.05, 5)
  const belly = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45)
  belly.scale(1.45, 1, 4.6)
  const group = new THREE.Group()
  group.add(
    mesh([
      part(body, skin),
      part(belly, pale, [0, -0.06, -0.2]),
      part(new THREE.BoxGeometry(1.6, 0.1, 0.6), skin, [1.5, -0.55, -1.6], [0, -0.5, -0.4]),
      part(new THREE.BoxGeometry(1.6, 0.1, 0.6), skin, [-1.5, -0.55, -1.6], [0, 0.5, 0.4]),
    ])
  )
  // The tail swings from the back of the body
  const tail = new THREE.Group()
  tail.position.set(0, 0, 4.4)
  tail.add(
    mesh([
      part(new THREE.CylinderGeometry(0.35, 0.6, 1.6, 8), skin, [0, 0, 0.7], [Math.PI / 2, 0, 0]),
      part(new THREE.BoxGeometry(4.2, 0.12, 1.2), skin, [0, 0, 1.7]),
      part(new THREE.BoxGeometry(1.4, 0.12, 0.8), skin, [1.5, 0, 2.4], [0, 0.5, 0]),
      part(new THREE.BoxGeometry(1.4, 0.12, 0.8), skin, [-1.5, 0, 2.4], [0, -0.5, 0]),
    ])
  )
  group.add(tail)
  group.rotation.order = 'YXZ'
  return { group, tail }
}

// At night, out in open water, a whale comes up ahead of the boat, blows,
// cruises a little, then dives with its tail in the air
class Whale {
  constructor(app, splashes, logbook) {
    this.app = app
    this.splashes = splashes
    this.logbook = logbook
    const { group, tail } = createWhale()
    this.model = group
    this.tail = tail
    group.visible = false
    app.scene.add(group)
    this.timer = 15
    this.active = false
    this.heading = new THREE.Vector3()
    this.start = new THREE.Vector3()
  }

  update(delta) {
    const { world, cameraRig } = this.app
    if (!this.active) {
      if (world.dayCycle.night < 0.7 || !this.app.inputs.enabled) return
      this.timer -= delta
      if (this.timer > 0) return
      this.timer = 6
      this.trySpawn(world.boat.object.position, cameraRig)
      return
    }

    this.time += delta
    const t = this.time
    const time = this.app.physics.renderTime
    const travelled = 1.4 * t
    point.copy(this.start).addScaledVector(this.heading, travelled)
    const surface = waveHeight(point.x, point.z, time)

    // Up to the surface, along it, then a dive with the tail in the air
    const rise = ease(clamp01(t / 1.6))
    const dive = clamp01((t - 4.6) / 2.4)
    const y = surface - 2.8 + 2.55 * rise - dive * dive * 4.5 + Math.sin(t * 1.4) * 0.08
    this.model.position.set(point.x, y, point.z)
    this.model.rotation.x = -0.55 * ease(dive)
    // Negative turns the flukes up
    this.tail.rotation.x = -0.9 * Math.sin(Math.PI * clamp01((t - 4.9) / 2)) + Math.sin(t * 1.6) * 0.06

    // The blow: a column of spray from the blowhole
    if (t > 1.1 && t < 1.8) {
      point.set(0, 1, -2.4).applyEuler(this.model.rotation).add(this.model.position)
      point.y = Math.max(point.y, surface)
      this.splashes.emit(point, null, { count: 3, spread: 0.25, up: 7, size: 0.12, life: 1.3 })
      if (!this.blown) {
        this.blown = true
        this.app.sounds.play('splash', 0.35, 0.45, point)
        this.app.sounds.rumble(0.08)
        this.logbook.record('whale')
      }
    }

    // The flukes slap under with a big splash
    if (t > 6.4 && !this.slapped) {
      this.slapped = true
      this.tail.getWorldPosition(point)
      point.y = surface
      this.splashes.emit(point, null, { count: 40, spread: 2.2, up: 3.4, size: 0.12, life: 1.1 })
      this.app.sounds.play('splash', 0.5, 0.6, point)
    }

    if (t > 8.5) {
      this.active = false
      this.model.visible = false
      this.timer = 50
    }
  }

  // In front of the boat on screen, crossing it, all in open water
  trySpawn(boat, rig) {
    const side = Math.random() < 0.5 ? -1 : 1
    this.start.copy(boat).addScaledVector(rig.screenUp, 11).addScaledVector(rig.screenRight, side * 7)
    this.heading.copy(rig.screenRight).multiplyScalar(-side)
    for (const distance of [0, 6, 12]) {
      point.copy(this.start).addScaledVector(this.heading, distance)
      if (!isOpenWater(point.x, point.z, { margin: 12 })) return
    }
    this.active = true
    this.time = 0
    this.blown = false
    this.slapped = false
    this.model.visible = true
    this.model.rotation.set(0, Math.atan2(-this.heading.x, -this.heading.z), 0)
  }
}

const SEGMENTS = 12
const SEGMENT_LENGTH = 0.55

function createTentacle() {
  const skin = '#9b3f68'
  const sucker = '#f1c7d2'
  const root = new THREE.Group()
  const segments = []
  let parent = root
  for (let i = 0; i < SEGMENTS; i++) {
    const bottom = 0.52 * (1 - i / SEGMENTS) + 0.06
    const top = 0.52 * (1 - (i + 1) / SEGMENTS) + 0.06
    const segment = new THREE.Group()
    segment.position.y = i === 0 ? 0 : SEGMENT_LENGTH
    // Suckers along the inside of the curl (+Z)
    segment.add(
      mesh([
        part(new THREE.CylinderGeometry(top, bottom, SEGMENT_LENGTH, 8), skin, [0, SEGMENT_LENGTH / 2, 0]),
        part(new THREE.SphereGeometry(bottom * 0.38, 6, 4), sucker, [0, SEGMENT_LENGTH * 0.3, bottom * 0.85]),
        part(new THREE.SphereGeometry(bottom * 0.3, 6, 4), sucker, [0, SEGMENT_LENGTH * 0.75, bottom * 0.8]),
      ])
    )
    parent.add(segment)
    segments.push(segment)
    parent = segment
  }
  return { root, segments }
}

// Linger by the wreck and a tentacle comes up out of the water beside it,
// sways, and slaps down toward the boat
class Tentacle {
  constructor(app, splashes, logbook) {
    this.app = app
    this.splashes = splashes
    this.logbook = logbook
    const { root, segments } = createTentacle()
    this.root = root
    this.segments = segments
    root.visible = false
    app.scene.add(root)
    this.lingering = 0
    this.cooldown = 0
    this.active = false
    this.tip = new THREE.Vector3()
  }

  update(delta) {
    const { boat } = this.app.world
    const position = boat.object.position
    this.cooldown -= delta
    if (!this.active) {
      const near = Math.hypot(position.x - wreck.x, position.z - wreck.z) < 13 && Math.abs(boat.speed) < 7
      this.lingering = near && this.app.inputs.enabled ? this.lingering + delta : 0
      if (this.lingering > 2.5 && this.cooldown <= 0) this.start(position)
      return
    }

    this.time += delta
    const t = this.time
    const time = this.app.physics.renderTime
    const surface = waveHeight(this.root.position.x, this.root.position.z, time)

    // Bubbles first, then up, a sway, the slap, and back down
    if (t < 1.1 && Math.random() < delta * 12) {
      point.set(this.root.position.x + (Math.random() - 0.5) * 1.5, surface, this.root.position.z + (Math.random() - 0.5) * 1.5)
      this.splashes.emit(point, null, { count: 3, spread: 0.3, up: 1, size: 0.06, life: 0.5 })
    }
    const rise = ease(clamp01((t - 1.1) / 1.1))
    const sink = ease(clamp01((t - 5.2) / 1.2))
    this.root.position.y = surface - 6.5 + 6.3 * rise - 6 * sink
    if (t > 1.6) this.logbook.record('kraken')

    const slam = ease(clamp01((t - 4) / 0.55))
    this.segments.forEach((segment, index) => {
      const sway = Math.sin(t * 2.4 - index * 0.55) * 0.22 * (1 - slam)
      const curl = 0.05 + index * 0.012
      segment.rotation.x = curl + sway + slam * (index < 3 ? 0.22 : 0.09)
      segment.rotation.z = Math.sin(t * 1.7 - index * 0.4) * 0.08 * (1 - slam)
    })

    if (slam >= 1 && !this.slapped) {
      this.slapped = true
      this.segments.at(-1).getWorldPosition(this.tip)
      this.tip.y = waveHeight(this.tip.x, this.tip.z, time)
      this.splashes.emit(this.tip, null, { count: 46, spread: 2.4, up: 3.8, size: 0.12, life: 1.1 })
      this.app.sounds.play('bump', 0.7, 0.6, this.tip)
      this.app.sounds.play('splash', 0.5, 0.75, this.tip)
      this.app.cameraRig.shake(0.35)
    }

    if (t > 6.6) {
      this.active = false
      this.root.visible = false
      this.cooldown = 35
      this.lingering = 0
    }
  }

  // By the wreck, on the boat's side of it and far enough off that the slap
  // lands in the water just short of the boat
  start(boat) {
    const dx = boat.x - wreck.x
    const dz = boat.z - wreck.z
    const length = Math.hypot(dx, dz) || 1
    const out = Math.max(length - 7.5, 0)
    this.root.position.set(wreck.x + (dx / length) * out, -6, wreck.z + (dz / length) * out)
    this.root.rotation.set(0, Math.atan2(dx, dz), 0)
    this.root.visible = true
    this.active = true
    this.slapped = false
    this.time = 0
    this.app.sounds.rumble(0.18)
  }
}
