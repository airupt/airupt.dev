import * as THREE from 'three'

const desired = new THREE.Vector3()
const midpoint = new THREE.Vector3()

// Fixed-angle follow camera looking down diagonally across the world, with a
// narrow field of view so the scene reads like a miniature. It never rotates,
// it only tracks the boat and zooms.
export class CameraRig {
  constructor(app) {
    this.app = app
    this.camera = new THREE.PerspectiveCamera(25, 1, 1, 600)
    this.direction = new THREE.Vector3().setFromSphericalCoords(1, Math.PI * 0.3, Math.PI * 0.25)
    // The ground direction that points up the screen
    this.screenUp = new THREE.Vector3(-this.direction.x, 0, -this.direction.z).normalize()
    this.screenRight = new THREE.Vector3(-this.screenUp.z, 0, this.screenUp.x)
    this.limits = { min: 24, max: 80, start: 46 }
    this.distance = 100
    this.targetDistance = 100
    this.focus = new THREE.Vector3()
    this.lookAhead = new THREE.Vector3()
    // When set, the camera frames this point instead of following the boat
    this.override = null
    // Before the visit starts the camera drifts slowly over the archipelago
    this.attract = true
    this.attractTime = 0
    // Opening shot: while the boat is still near where it started, frame the
    // boat together with this point (the home island)
    this.establishing = null

    this.baseFov = 25
    this.fovBoost = 0
    this.shakeAmount = 0
    this.shakeTime = 0

    window.addEventListener(
      'wheel',
      event => {
        if (!app.inputs?.enabled) return
        this.zoomTo(this.targetDistance * Math.exp(event.deltaY * 0.001))
      },
      { passive: true }
    )
  }

  // A short jolt, e.g. when the boat hits a dock
  shake(amount) {
    this.shakeAmount = Math.min(this.shakeAmount + amount, 1.2)
  }

  zoomTo(distance) {
    this.targetDistance = THREE.MathUtils.clamp(distance, this.limits.min, this.limits.max)
  }

  resize(width, height) {
    this.camera.aspect = width / height
    // Portrait screens see less sideways, so widen the view a little
    this.baseFov = width < height ? 34 : 25
    this.camera.fov = this.baseFov + this.fovBoost
    this.camera.updateProjectionMatrix()
  }

  update(delta) {
    const boat = this.app.world.boat

    if (this.attract) {
      // Behind the loader: Mount Airupt and its plume, drifting gently, with
      // the volcano high in the frame so the title sits over open water
      this.attractTime += delta
      desired.copy(this.attractPoint ?? desired.set(0, 0, 0))
      desired.addScaledVector(this.screenUp, -8)
      desired.addScaledVector(this.screenRight, Math.sin(this.attractTime * 0.08) * 6)
    } else if (this.override) {
      desired.copy(this.override)
    } else {
      this.lookAhead.copy(boat.velocity).multiplyScalar(0.45)
      this.lookAhead.y = 0
      // Keep the boat a little below centre so more of the world shows ahead
      desired.copy(boat.object.position).add(this.lookAhead).addScaledVector(this.screenUp, this.distance * 0.08)

      if (this.establishing) {
        const { point, origin } = this.establishing
        const travelled = Math.hypot(boat.object.position.x - origin.x, boat.object.position.z - origin.z)
        const hold = 1 - THREE.MathUtils.smoothstep(travelled, 4, 14)
        desired.lerp(midpoint.copy(boat.object.position).lerp(point, 0.4), hold)
        if (hold === 0) this.establishing = null
      }
    }
    desired.y = 0

    this.focus.lerp(desired, 1 - Math.exp(-3 * delta))
    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-1.6 * delta))

    this.camera.position.copy(this.focus).addScaledVector(this.direction, this.distance)
    this.camera.lookAt(this.focus)

    // Boosting at speed widens the view slightly, which reads as acceleration
    const boosting = this.app.inputs.state.boost && Math.abs(boat.speed) > 10
    this.fovBoost += ((boosting ? 3 : 0) - this.fovBoost) * (1 - Math.exp(-3 * delta))
    const fov = this.baseFov + this.fovBoost
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }

    if (this.shakeAmount > 0.001) {
      this.shakeTime += delta * 40
      const offset = this.shakeAmount * 0.35
      this.camera.position.x += Math.sin(this.shakeTime * 1.3) * offset
      this.camera.position.y += Math.sin(this.shakeTime * 1.7 + 1) * offset
      this.camera.position.z += Math.sin(this.shakeTime * 1.1 + 2) * offset
      this.shakeAmount *= Math.exp(-7 * delta)
    }
  }
}
