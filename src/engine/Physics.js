import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

export const STEP = 1 / 60
const MAX_STEPS = 4

// Copies a rigid body's transform onto a mesh, interpolating between the last
// two physics steps so motion stays smooth on high refresh rate screens.
class BodySync {
  constructor(body, object) {
    this.body = body
    this.object = object
    this.previous = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }
    this.current = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }
    this.reset()
  }

  read(target) {
    const translation = this.body.translation()
    const rotation = this.body.rotation()
    target.position.set(translation.x, translation.y, translation.z)
    target.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
  }

  capture() {
    this.previous.position.copy(this.current.position)
    this.previous.quaternion.copy(this.current.quaternion)
    this.read(this.current)
  }

  reset() {
    this.read(this.current)
    this.previous.position.copy(this.current.position)
    this.previous.quaternion.copy(this.current.quaternion)
  }

  apply(alpha) {
    this.object.position.lerpVectors(this.previous.position, this.current.position, alpha)
    this.object.quaternion.slerpQuaternions(this.previous.quaternion, this.current.quaternion, alpha)
  }
}

// Fixed timestep simulation. Systems hook into beforeStep to apply their own
// forces (buoyancy, thrust) at a stable rate regardless of frame rate.
export class Physics {
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.world.timestep = STEP
    this.time = 0
    this.alpha = 0
    this.accumulator = 0
    this.beforeStep = []
    this.synced = []
  }

  sync(body, object) {
    const sync = new BodySync(body, object)
    this.synced.push(sync)
    return sync
  }

  update(delta) {
    this.accumulator += delta
    let steps = 0

    while (this.accumulator >= STEP) {
      if (steps === MAX_STEPS) {
        this.accumulator = 0
        break
      }
      for (const callback of this.beforeStep) callback(STEP, this.time)
      this.world.step()
      this.time += STEP
      for (const sync of this.synced) sync.capture()
      this.accumulator -= STEP
      steps++
    }

    this.alpha = this.accumulator / STEP
    for (const sync of this.synced) sync.apply(this.alpha)
  }

  // Simulation time matching the interpolated transforms on screen
  get renderTime() {
    return this.time - STEP + this.alpha * STEP
  }
}
