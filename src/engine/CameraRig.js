import * as THREE from 'three'

const desired = new THREE.Vector3()

// Fixed-angle follow camera looking down diagonally across the world, with a
// narrow field of view so the scene reads like a miniature. It never rotates,
// it only tracks the boat and zooms.
export class CameraRig {
  constructor(app) {
    this.app = app
    this.camera = new THREE.PerspectiveCamera(25, 1, 1, 600)
    this.direction = new THREE.Vector3().setFromSphericalCoords(1, Math.PI * 0.3, Math.PI * 0.25)
    this.limits = { min: 24, max: 80, start: 42 }
    this.distance = 120
    this.targetDistance = 120
    this.focus = new THREE.Vector3()
    this.lookAhead = new THREE.Vector3()
    // When set, the camera frames this point instead of following the boat
    this.override = null

    window.addEventListener(
      'wheel',
      event => {
        if (!app.inputs?.enabled) return
        this.zoomTo(this.targetDistance * Math.exp(event.deltaY * 0.001))
      },
      { passive: true }
    )
  }

  zoomTo(distance) {
    this.targetDistance = THREE.MathUtils.clamp(distance, this.limits.min, this.limits.max)
  }

  resize(width, height) {
    this.camera.aspect = width / height
    // Portrait screens see less sideways, so widen the view a little
    this.camera.fov = width < height ? 34 : 25
    this.camera.updateProjectionMatrix()
  }

  update(delta) {
    const boat = this.app.world.boat

    if (this.override) {
      desired.copy(this.override)
    } else {
      this.lookAhead.copy(boat.velocity).multiplyScalar(0.45)
      this.lookAhead.y = 0
      desired.copy(boat.object.position).add(this.lookAhead)
    }
    desired.y = 0

    this.focus.lerp(desired, 1 - Math.exp(-3 * delta))
    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-1.6 * delta))

    this.camera.position.copy(this.focus).addScaledVector(this.direction, this.distance)
    this.camera.lookAt(this.focus)
  }
}
