import * as THREE from 'three'
import { waveHeight } from './waves.js'

const kinds = ['fish', 'fish', 'fish-large']

// Every few seconds a fish leaps out of the water somewhere near the boat,
// in open sea and inside the camera view
export class Fish {
  constructor(app, models, splashes, islands) {
    this.app = app
    this.splashes = splashes
    this.islands = islands
    this.timer = 4
    this.jumps = []
    this.pool = kinds.map(id => {
      const model = models.get(id)
      model.visible = false
      // Kenney's fish face -X (the tall thin end at +X is the tail), so they
      // are turned half round to face their jump; pitch around Z follows the arc
      model.rotation.order = 'YZX'
      app.scene.add(model)
      return model
    })
  }

  isOpenWater(x, z) {
    return this.islands.list.every(island => Math.hypot(island.x - x, island.z - z) > island.radius * 1.15)
  }

  spawn() {
    const model = this.pool.find(candidate => !candidate.visible)
    if (!model) return

    const focus = this.app.cameraRig.focus
    for (let tries = 0; tries < 8; tries++) {
      const angle = Math.random() * Math.PI * 2
      const distance = 6 + Math.random() * 10
      const x = focus.x + Math.cos(angle) * distance
      const z = focus.z + Math.sin(angle) * distance
      if (!this.isOpenWater(x, z)) continue

      const heading = Math.random() * Math.PI * 2
      this.jumps.push({
        model,
        start: new THREE.Vector3(x, 0, z),
        direction: new THREE.Vector3(Math.cos(heading), 0, -Math.sin(heading)),
        heading,
        length: 2.5 + Math.random() * 2,
        height: 1.3 + Math.random() * 1,
        duration: 0.9 + Math.random() * 0.4,
        t: 0,
      })
      model.visible = true
      return
    }
  }

  splash(position, loud) {
    this.splashes.emit(position, new THREE.Vector3(), { count: 14, spread: 1.2, up: 2.2, size: 0.07, life: 0.7 })
    if (loud) this.app.sounds.play('splash', 0.3, 1.3 + Math.random() * 0.3, position)
  }

  update(delta) {
    this.timer -= delta
    if (this.timer <= 0) {
      this.timer = 3 + Math.random() * 6
      this.spawn()
    }

    const time = this.app.physics.renderTime
    this.jumps = this.jumps.filter(jump => {
      const { model, start, direction, length, height, duration } = jump
      if (jump.t === 0) this.splash(start.clone().setY(waveHeight(start.x, start.z, time)), false)

      jump.t = Math.min(jump.t + delta / duration, 1)
      const t = jump.t
      const x = start.x + direction.x * length * t
      const z = start.z + direction.z * length * t
      const surface = waveHeight(x, z, time)
      model.position.set(x, surface - 0.3 + 4 * height * t * (1 - t), z)

      // Nose follows the arc: up on the way out, down on the way in
      const rise = (4 * height * (1 - 2 * t)) / duration
      model.rotation.set(0, jump.heading + Math.PI, -Math.atan2(rise, length / duration))

      if (t >= 1) {
        this.splash(model.position.clone().setY(surface), true)
        model.visible = false
        return false
      }
      return true
    })
  }
}
