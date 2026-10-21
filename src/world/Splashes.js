import * as THREE from 'three'
import { waveHeight } from './waves.js'

const MAX = 500
const GRAVITY = 9.8

const matrix = new THREE.Matrix4()
const scale = new THREE.Vector3()
const identity = new THREE.Quaternion()

// Pool of water droplets thrown by the bow, by landings, by jumping fish.
// One instanced mesh; each droplet shrinks as it falls and dies in the sea.
// The droplets are made once and reused, so a spray makes no garbage.
export class Splashes {
  constructor(app) {
    this.app = app
    this.pool = Array.from({ length: MAX }, () => ({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), age: 0, life: 0, size: 0 }))
    // The first `count` droplets in the pool are flying
    this.count = 0
    this.mesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial(), MAX)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    app.scene.add(this.mesh)
  }

  // Droplets from a point, thrown up and out at random on top of `velocity` (if any)
  emit(origin, velocity = null, { count = 8, spread = 1.5, up = 2.5, size = 0.09, life = 0.9 } = {}) {
    for (let i = 0; i < count && this.count < MAX; i++) {
      const droplet = this.pool[this.count++]
      droplet.position.set(origin.x + (Math.random() - 0.5) * 0.3, origin.y, origin.z + (Math.random() - 0.5) * 0.3)
      droplet.velocity.set((Math.random() - 0.5) * spread * 2, up * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * spread * 2)
      if (velocity) droplet.velocity.add(velocity)
      droplet.age = 0
      droplet.life = life * (0.6 + Math.random() * 0.6)
      droplet.size = size * (0.6 + Math.random() * 0.8)
    }
  }

  // Same palette shift as the wake: white by day, glowing at night
  setNight(night) {
    const glow = THREE.MathUtils.smoothstep(night, 0.4, 0.9)
    this.mesh.material.color.setRGB(1 - glow * 0.7, 1 + glow * 1.2, 1 + glow * 1.6)
  }

  update(delta) {
    const time = this.app.physics.renderTime
    let kept = 0
    for (let i = 0; i < this.count; i++) {
      const droplet = this.pool[i]
      droplet.age += delta
      droplet.velocity.y -= GRAVITY * delta
      droplet.position.addScaledVector(droplet.velocity, delta)
      const underwater = droplet.age > 0.1 && droplet.position.y < waveHeight(droplet.position.x, droplet.position.z, time) - 0.1
      if (droplet.age > droplet.life || underwater) continue

      const fade = Math.sqrt(1 - droplet.age / droplet.life)
      matrix.compose(droplet.position, identity, scale.setScalar(droplet.size * fade))
      this.mesh.setMatrixAt(kept, matrix)
      // Live droplets move to the front of the pool, spent ones to the back
      this.pool[i] = this.pool[kept]
      this.pool[kept++] = droplet
    }
    this.count = kept
    this.mesh.count = kept
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
