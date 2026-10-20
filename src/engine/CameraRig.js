import * as THREE from 'three'

const desired = new THREE.Vector3()

// Fixed-angle follow camera: it never rotates, it only tracks the boat and
// zooms. A steady horizon keeps the sailing comfortable.
export class CameraRig {
  constructor(app) {
    this.app = app
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 450)
    this.direction = new THREE.Vector3(0, 1, 1.25).normalize()
    this.limits = { min: 14, max: 50, start: 26 }
    this.distance = 80
    this.targetDistance = 80
    this.focus = new THREE.Vector3()
    this.lookAhead = new THREE.Vector3()

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
    // Portrait screens see less sideways, so pull back a little
    this.camera.fov = width < height ? 52 : 40
    this.camera.updateProjectionMatrix()
  }

  update(delta) {
    const boat = this.app.world.boat

    this.lookAhead.copy(boat.velocity).multiplyScalar(0.45)
    this.lookAhead.y = 0
    desired.copy(boat.object.position).add(this.lookAhead)
    desired.y = 0

    this.focus.lerp(desired, 1 - Math.exp(-3 * delta))
    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-1.8 * delta))

    this.camera.position.copy(this.focus).addScaledVector(this.direction, this.distance)
    this.camera.lookAt(this.focus)
  }
}
