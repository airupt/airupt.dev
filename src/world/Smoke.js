import * as THREE from 'three'
import { createStylizedMaterial, shared } from './shading.js'

const matrix = new THREE.Matrix4()
const rotation = new THREE.Quaternion()
const euler = new THREE.Euler()
const scale = new THREE.Vector3()
const position = new THREE.Vector3()
const color = new THREE.Color()

// Low-poly smoke: faceted puffs that rise, swell, drift with the wind and
// shrink away. They are lit like everything else, so they pick up the
// tinted shadows and the colours of the time of day.
export class Smoke {
  constructor(app) {
    this.app = app
    this.emitters = []
    this.puffs = []
    this.capacity = 0
  }

  // rate: puffs per second, size: start radius, rise: how far they climb,
  // color → fade: the colour a puff starts with and turns to as it rises
  addEmitter(origin, { rate, size, rise, life, color, fade = color, spread = 0.4 }) {
    this.emitters.push({
      origin: origin.clone(),
      rate,
      size,
      rise,
      life,
      color: new THREE.Color(color),
      fade: new THREE.Color(fade),
      spread,
      budget: Math.random(),
      burst: 0,
    })
    // Room for the steady plume plus a burst
    this.capacity += Math.ceil(rate * life * 2.5) + 2
  }

  // A thick, fast gush of bigger puffs from one emitter for a moment
  burst(index) {
    const emitter = this.emitters[index]
    if (emitter) emitter.burst = 1
  }

  build() {
    // Smoke is thin: its shadowed side only takes part of the shadow tint
    const material = createStylizedMaterial(
      { color: '#ffffff', flatShading: true },
      { waterLine: false, key: 'smoke', extend: shader => (shader.fragmentShader = shader.fragmentShader.replace('// STYLIZED_SHADE', 'shade *= 0.55;')) }
    )
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), material, this.capacity)
    this.mesh.count = 0
    // No cast shadows: a tall plume threw a long hard stripe across the sea
    this.mesh.frustumCulled = false
    this.app.scene.add(this.mesh)

    // Start with the plume already formed rather than growing from nothing
    for (let t = 0; t < 8; t += 1 / 30) this.update(1 / 30)
  }

  update(delta) {
    if (!this.mesh) return
    const wind = shared.uWindDirection.value
    const windStrength = shared.uWindStrength.value

    for (const emitter of this.emitters) {
      emitter.budget += emitter.rate * (1 + emitter.burst * 4) * delta
      while (emitter.budget >= 1) {
        emitter.budget -= 1
        this.puffs.push({
          emitter,
          position: emitter.origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * emitter.spread, 0, (Math.random() - 0.5) * emitter.spread)),
          spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
          age: 0,
          life: emitter.life * (0.8 + Math.random() * 0.4),
          scale: (0.75 + Math.random() * 0.5) * (1 + emitter.burst * 0.8),
          speed: 1 + emitter.burst * 0.9,
        })
      }
      emitter.burst = Math.max(0, emitter.burst - delta / 1.6)
    }

    let count = 0
    this.puffs = this.puffs.filter(puff => {
      puff.age += delta
      const t = puff.age / puff.life
      if (t >= 1 || count >= this.capacity) return false
      const { emitter } = puff

      // Fast at first, slowing as it rises; the wind bends the column over
      const rise = (emitter.rise / puff.life) * (1.3 - t) * puff.speed * delta
      puff.position.y += rise
      puff.position.x += wind.x * windStrength * 2.2 * delta * t
      puff.position.z += wind.y * windStrength * 2.2 * delta * t

      const size = emitter.size * puff.scale * (0.5 + t * 1.6) * Math.min(1, (1 - t) * 4)
      euler.set(puff.spin.x + t, puff.spin.y + t * 0.5, puff.spin.z)
      matrix.compose(position.copy(puff.position), rotation.setFromEuler(euler), scale.setScalar(size))
      this.mesh.setMatrixAt(count, matrix)
      this.mesh.setColorAt(count, color.copy(emitter.color).lerp(emitter.fade, Math.min(t * 1.4, 1)))
      count++
      return true
    })

    this.mesh.count = count
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
}
