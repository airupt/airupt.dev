import { Buoy } from './Buoy.js'
import { spawn } from './layout.js'

const RADIUS = 9

// A zone sits just off each section island, on the side facing the start.
// Sailing into one offers to open that section.
export class Zones {
  constructor(app, islands) {
    this.app = app
    this.active = null
    this.list = []

    for (const island of islands.list) {
      if (!island.section) continue
      const dx = spawn.x - island.x
      const dz = spawn.z - island.z
      const length = Math.hypot(dx, dz)
      const x = island.x + (dx / length) * island.radius * 1.12
      const z = island.z + (dz / length) * island.radius * 1.12
      this.list.push({ section: island.section, x, z, buoy: new Buoy(app, { x, z, color: island.color }) })
    }

    app.inputs.on('interact', () => {
      if (this.active) app.overlay.openSection(this.active.section)
    })
  }

  update() {
    const boat = this.app.world.boat.object.position
    let nearest = null
    let nearestDistance = RADIUS

    for (const zone of this.list) {
      const distance = Math.hypot(zone.x - boat.x, zone.z - boat.z)
      if (distance < nearestDistance) {
        nearest = zone
        nearestDistance = distance
      }
    }

    if (nearest !== this.active) {
      this.active = nearest
      this.app.overlay.setPrompt(nearest?.section ?? null)
    }
  }
}
