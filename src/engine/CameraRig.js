import * as THREE from 'three'

const desired = new THREE.Vector3()
const viewDirection = new THREE.Vector3()
const POLAR = Math.PI * 0.3
const AZIMUTH = Math.PI * 0.25
const DEFAULT_ANGLES = Object.freeze({ polar: POLAR, azimuth: AZIMUTH })

// Fixed-angle follow camera looking down diagonally across the world, with a
// narrow field of view so the scene reads like a miniature. While sailing it
// never rotates, it only tracks the boat and zooms.
export class CameraRig {
  constructor(app) {
    this.app = app
    this.camera = new THREE.PerspectiveCamera(25, 1, 1, 600)
    this.direction = new THREE.Vector3().setFromSphericalCoords(1, POLAR, AZIMUTH)
    // Photo mode can swing the camera round and tilt it (set `orbit` to the
    // angles wanted); without it the view eases back to the fixed angle
    this.orbit = null
    this.angles = { polar: POLAR, azimuth: AZIMUTH }
    // Photo mode can also move the camera away from the boat, by this much
    this.pan = new THREE.Vector3()
    // The ground direction that points up the screen
    this.screenUp = new THREE.Vector3(-this.direction.x, 0, -this.direction.z).normalize()
    this.screenRight = new THREE.Vector3(-this.screenUp.z, 0, this.screenUp.x)
    this.limits = { min: 24, max: 80, start: 46 }
    this.distance = 112
    this.targetDistance = 112
    this.focus = new THREE.Vector3()
    this.lookAhead = new THREE.Vector3()
    // When set, the camera frames this point instead of following the boat
    this.override = null
    // Before the visit starts the camera drifts slowly over the archipelago
    this.attract = true
    this.attractTime = 0
    // Opening shot: while the boat is still near where it started, the
    // camera holds this framing of boat and home island
    this.establishing = null
    // A scripted move from wherever the camera is to a framing, eased, with
    // a callback part-way (the boat drops in while the camera arrives)
    this.flight = null

    this.baseFov = 25
    this.fovBoost = 0
    // Inside a zone the camera leans toward that island's scene, so arriving
    // frames the dock, plaza and hero instead of open water
    this.attention = null
    this.attentionWeight = 0
    this.attentionPoint = new THREE.Vector3()
    // A small lean toward something while the camera is framing (a hovered project board)
    this.nudge = new THREE.Vector3()
    this.nudgeTarget = new THREE.Vector3()
    // Shifts the picture (not the camera) so the focus sits off-centre, e.g.
    // beside an open panel: x and y as fractions of the screen size
    this.viewShift = new THREE.Vector2()
    this.viewShiftTarget = new THREE.Vector2()
    this.shakeAmount = 0
    this.shakeTime = 0

    window.addEventListener(
      'wheel',
      event => {
        if (!app.inputs?.enabled && !app.photo?.active) return
        this.zoomBy(Math.exp(event.deltaY * 0.001))
      },
      { passive: true }
    )

    // Two fingers on the scene pinch to zoom while sailing (photo mode
    // handles its own fingers)
    const fingers = new Map()
    const canvas = app.renderer.domElement
    canvas.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') fingers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    })
    canvas.addEventListener('pointermove', event => {
      const last = fingers.get(event.pointerId)
      if (!last) return
      if (fingers.size === 2 && app.inputs.enabled) {
        const [other] = [...fingers].filter(([id]) => id !== event.pointerId).map(([, finger]) => finger)
        const before = Math.hypot(last.x - other.x, last.y - other.y)
        const after = Math.hypot(event.clientX - other.x, event.clientY - other.y)
        if (before > 0 && after > 0) this.zoomBy(before / after)
      }
      last.x = event.clientX
      last.y = event.clientY
    })
    const lift = event => fingers.delete(event.pointerId)
    canvas.addEventListener('pointerup', lift)
    canvas.addEventListener('pointercancel', lift)
  }

  // The fixed viewing angle everything is designed around (a copy, free to change)
  get defaultAngles() {
    return { ...DEFAULT_ANGLES }
  }

  // A short jolt, e.g. when the boat hits a dock
  shake(amount) {
    this.shakeAmount = Math.min(this.shakeAmount + amount, 1.2)
  }

  flyTo(focus, distance, duration, cue = null) {
    this.flight = {
      fromFocus: this.focus.clone(),
      fromDistance: this.distance,
      focus: focus.clone(),
      distance,
      duration,
      cue,
      t: 0,
    }
  }

  zoomTo(distance) {
    this.targetDistance = THREE.MathUtils.clamp(distance, this.limits.min, this.limits.max)
  }

  // Zooming by hand lets go of the opening shot, which holds its own zoom
  zoomBy(factor) {
    this.establishing = null
    this.zoomTo(this.targetDistance * factor)
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
      desired.copy(this.override).add(this.nudge)
    } else {
      this.lookAhead.copy(boat.velocity).multiplyScalar(0.45)
      this.lookAhead.y = 0
      // Keep the boat a little below centre so more of the world shows ahead
      desired.copy(boat.object.position).add(this.lookAhead).addScaledVector(this.screenUp, this.distance * 0.08)

      this.attentionWeight += ((this.attention ? 1 : 0) - this.attentionWeight) * (1 - Math.exp(-1.5 * delta))
      if (this.attention) this.attentionPoint.copy(this.attention)
      if (this.attentionWeight > 0.001) desired.lerp(this.attentionPoint, this.attentionWeight * 0.55)
      desired.add(this.pan)

      if (this.establishing) {
        // Hold the opening framing until the boat has sailed a little way,
        // then hand over to following it
        const { focus, distance, origin } = this.establishing
        const travelled = Math.hypot(boat.object.position.x - origin.x, boat.object.position.z - origin.z)
        const hold = 1 - THREE.MathUtils.smoothstep(travelled, 3, 14)
        desired.lerp(focus, hold)
        this.targetDistance = THREE.MathUtils.lerp(this.limits.start, distance, hold)
        if (hold === 0) this.establishing = null
      }
    }
    desired.y = 0

    // The camera trails a little further behind under boost, which sells the speed
    const boosting = this.app.inputs.state.boost && Math.abs(boat.speed) > 10
    if (this.flight) {
      // Ease in and out, rising a little in the middle like a drone
      const flight = this.flight
      flight.t = Math.min(flight.t + delta / flight.duration, 1)
      const t = flight.t
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      this.focus.lerpVectors(flight.fromFocus, flight.focus, eased)
      this.distance = THREE.MathUtils.lerp(flight.fromDistance, flight.distance, eased) + Math.sin(Math.PI * eased) * 10
      if (flight.cue && t > 0.55) {
        flight.cue()
        flight.cue = null
      }
      if (t === 1) {
        this.flight = null
        this.targetDistance = this.distance
      }
    } else {
      this.focus.lerp(desired, 1 - Math.exp(-(boosting ? 2.2 : 3) * delta))
      this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-1.6 * delta))
    }

    // Zooming by keys or the right stick, while held
    const zoom = this.app.inputs.state.zoom
    if (zoom) this.zoomBy(Math.exp(zoom * 1.2 * delta))

    const goal = this.orbit ?? DEFAULT_ANGLES
    // The short way round when easing back after a full turn
    this.angles.azimuth = goal.azimuth + THREE.MathUtils.euclideanModulo(this.angles.azimuth - goal.azimuth + Math.PI, Math.PI * 2) - Math.PI
    const ease = 1 - Math.exp(-6 * delta)
    this.angles.polar += (goal.polar - this.angles.polar) * ease
    this.angles.azimuth += (goal.azimuth - this.angles.azimuth) * ease
    viewDirection.setFromSphericalCoords(1, this.angles.polar, this.angles.azimuth)
    this.camera.position.copy(this.focus).addScaledVector(viewDirection, this.distance)
    this.camera.lookAt(this.focus)

    if (!this.override) this.nudgeTarget.set(0, 0, 0)
    this.nudge.lerp(this.nudgeTarget, 1 - Math.exp(-3 * delta))
    this.viewShift.lerp(this.viewShiftTarget, 1 - Math.exp(-4 * delta))
    if (this.viewShift.lengthSq() > 1e-6) {
      const { width, height } = this.app.viewport
      this.camera.setViewOffset(width, height, this.viewShift.x * width, this.viewShift.y * height, width, height)
    } else if (this.camera.view?.enabled) {
      this.camera.clearViewOffset()
    }

    // Boosting at speed widens the view slightly, which reads as acceleration
    this.fovBoost += ((boosting ? 5 : 0) - this.fovBoost) * (1 - Math.exp(-3 * delta))
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
