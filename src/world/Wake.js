import * as THREE from 'three'
import { waveHeight } from './waves.js'

const MAX_POINTS = 40
const SPACING = 0.7 // metres between trail samples
const LIFETIME = 2.6 // seconds a sample stays visible
const STERN = new THREE.Vector3(0, 0, 1.4)

const stern = new THREE.Vector3()

// Foam ribbon trailing the boat. Samples are dropped every SPACING metres;
// each one widens and fades with age. Heights follow the waves every frame.
export class Wake {
  constructor(app, boat) {
    this.app = app
    this.boat = boat
    this.points = []

    const vertexCount = MAX_POINTS * 2
    this.positions = new Float32Array(vertexCount * 3)
    this.colors = new Float32Array(vertexCount * 4).fill(1)

    const indices = []
    for (let i = 0; i < MAX_POINTS - 1; i++) {
      const a = i * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage))
    geometry.setIndex(indices)

    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    )
    this.mesh.frustumCulled = false
    app.scene.add(this.mesh)
  }

  // White foam by day; at night the churned water glows like plankton
  setNight(night) {
    const glow = THREE.MathUtils.smoothstep(night, 0.4, 0.9)
    this.mesh.material.color.setRGB(1 - glow * 0.7, 1 + glow * 1.2, 1 + glow * 1.6)
  }

  update(delta) {
    for (const point of this.points) point.age += delta
    while (this.points.length && this.points.at(-1).age > LIFETIME) this.points.pop()

    stern.copy(STERN).applyQuaternion(this.boat.object.quaternion).add(this.boat.object.position)
    const strength = this.boat.inWater > 0 ? THREE.MathUtils.clamp((Math.abs(this.boat.speed) - 1) / 7, 0, 1) : 0

    const last = this.points[0]
    if (!last || Math.hypot(stern.x - last.x, stern.z - last.z) > SPACING) {
      this.points.unshift({ x: stern.x, z: stern.z, age: 0, strength })
      if (this.points.length > MAX_POINTS - 1) this.points.pop()
    }

    // The live stern position heads the ribbon so it stays attached to the boat
    const trail = [{ x: stern.x, z: stern.z, age: 0, strength }, ...this.points]
    const time = this.app.physics.renderTime
    const geometry = this.mesh.geometry

    const at = index => trail[THREE.MathUtils.clamp(index, 0, trail.length - 1)]

    for (let i = 0; i < MAX_POINTS; i++) {
      const point = at(i)
      const next = at(i + 1)
      const previous = at(i - 1)

      let dx = previous.x - next.x
      let dz = previous.z - next.z
      const length = Math.hypot(dx, dz) || 1
      dx /= length
      dz /= length

      const life = 1 - point.age / LIFETIME
      const width = 0.45 + point.age * 1.1
      const alpha = i < trail.length ? point.strength * life * life * 0.85 : 0
      // A few centimetres up so the ribbon clears the faceted surface between ocean vertices
      const y = waveHeight(point.x, point.z, time) + 0.12

      for (const side of [-1, 1]) {
        const vertex = i * 2 + (side === 1 ? 1 : 0)
        this.positions[vertex * 3] = point.x - dz * width * side
        this.positions[vertex * 3 + 1] = y
        this.positions[vertex * 3 + 2] = point.z + dx * width * side
        this.colors[vertex * 4 + 3] = alpha
      }
    }

    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
  }
}
