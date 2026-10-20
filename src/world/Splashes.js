import * as THREE from 'three'
import { waveHeight } from './waves.js'

const MAX = 500
const GRAVITY = 9.8

const matrix = new THREE.Matrix4()
const scale = new THREE.Vector3()
const identity = new THREE.Quaternion()

// Pool of water droplets thrown by the bow, by landings, by jumping fish.
// One instanced mesh; each droplet shrinks as it falls and dies in the sea.
export class Splashes {
  constructor(app) {
    this.app = app
    this.particles = []
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial(), MAX)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    app.scene.add(this.mesh)
  }

  emit(origin, velocity, { count = 8, spread = 1.5, up = 2.5, size = 0.09, life = 0.9 } = {}) {
    for (let i = 0; i < count && this.particles.length < MAX; i++) {
      this.particles.push({
        position: origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)),
        velocity: velocity
          .clone()
          .add(new THREE.Vector3((Math.random() - 0.5) * spread * 2, up * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * spread * 2)),
        age: 0,
        life: life * (0.6 + Math.random() * 0.6),
        size: size * (0.6 + Math.random() * 0.8),
      })
    }
  }

  // Same palette shift as the wake: white by day, glowing at night
  setNight(night) {
    const glow = THREE.MathUtils.smoothstep(night, 0.4, 0.9)
    this.mesh.material.color.setRGB(1 - glow * 0.7, 1 + glow * 1.2, 1 + glow * 1.6)
  }

  update(delta) {
    const time = this.app.physics.renderTime
    let count = 0

    this.particles = this.particles.filter(particle => {
      particle.age += delta
      particle.velocity.y -= GRAVITY * delta
      particle.position.addScaledVector(particle.velocity, delta)
      const underwater = particle.age > 0.1 && particle.position.y < waveHeight(particle.position.x, particle.position.z, time) - 0.1
      if (particle.age > particle.life || underwater) return false

      const fade = Math.sqrt(1 - particle.age / particle.life)
      matrix.compose(particle.position, identity, scale.setScalar(particle.size * fade))
      this.mesh.setMatrixAt(count++, matrix)
      return true
    })

    this.mesh.count = count
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
