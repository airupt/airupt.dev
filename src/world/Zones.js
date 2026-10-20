import { Buoy } from './Buoy.js'
import { DOCK_TILE, DOCK_TILES } from './Decor.js'

const RADIUS = 9

// Each section island has a zone at the end of its dock, marked by a buoy
// in the section colour. Sailing into it offers to open that section.
export class Zones {
  constructor(app, islands) {
    this.app = app
    this.active = null
    this.list = []

    for (const island of islands.list) {
      if (!island.section) continue
      const { shore, out } = island
      const reach = DOCK_TILES * DOCK_TILE + 1.5
      const x = shore.x + out.x * reach
      const z = shore.z + out.z * reach
      // Buoy sits beside the dock end so the boat can pull right up to it
      const buoy = new Buoy(app, { x: x + out.z * 3, z: z - out.x * 3, color: island.color })
      this.list.push({ section: island.section, x, z, buoy })
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
