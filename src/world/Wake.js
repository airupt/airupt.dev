import * as THREE from 'three'
import { waveHeight } from './waves.js'
import { shared } from './shading.js'

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
    geometry.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(vertexCount).map((_, i) => i % 2), 1))
    geometry.setIndex(indices)

    // Foam, not paint: the two outer edges (the V of a real wake) are the
    // brightest, the middle is thinner, and noise breaks it into patches
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uNoise: shared.uNoise },
      vertexShader: /* glsl */ `
        attribute vec4 color;
        attribute float aSide;
        varying float vAlpha;
        varying float vSide;
        varying vec2 vWorld;
        void main() {
          vAlpha = color.a;
          vSide = aSide;
          vWorld = position.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform sampler2D uNoise;
        varying float vAlpha;
        varying float vSide;
        varying vec2 vWorld;
        void main() {
          float profile = mix(0.3, 1.0, pow(abs(vSide * 2.0 - 1.0), 3.0));
          float foam = texture2D(uNoise, vWorld * 0.17).r * 0.6 + texture2D(uNoise, vWorld * 0.6).g * 0.4;
          float breakup = smoothstep(0.32, 0.62, foam + vAlpha * 0.35);
          gl_FragColor = vec4(uColor, vAlpha * profile * breakup);
          #include <colorspace_fragment>
        }
      `,
    })

    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.frustumCulled = false
    app.scene.add(this.mesh)
  }

  // White foam by day; at night the churned water glows like plankton
  setNight(night) {
    const glow = THREE.MathUtils.smoothstep(night, 0.4, 0.9)
    this.mesh.material.uniforms.uColor.value.setRGB(1 - glow * 0.7, 1 + glow * 1.2, 1 + glow * 1.6)
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
