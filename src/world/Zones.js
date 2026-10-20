import * as THREE from 'three'
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
      this.list.push({ section: island.section, island, x, z, buoy })
    }

    app.inputs.on('interact', () => this.open())
    app.overlay.onSectionOpen = id => this.frame(id)
    app.overlay.onSectionClose = () => this.release()
  }

  open() {
    if (this.active) this.app.overlay.openSection(this.active.section)
  }

  // While a section is open the camera glides over to its island
  frame(id) {
    const zone = this.list.find(candidate => candidate.section === id)
    if (!zone) return
    const rig = this.app.cameraRig
    this.returnDistance = rig.targetDistance
    const distance = rig.limits.min + 18
    const target = new THREE.Vector3((zone.x + zone.island.x) / 2, 0, (zone.z + zone.island.z) / 2)
    // Shift the view so the island sits beside the panel rather than under it:
    // panel on the right on wide screens, a bottom sheet on narrow ones
    if (this.app.viewport.width > 720) target.addScaledVector(rig.screenRight, distance * 0.2)
    else target.addScaledVector(rig.screenUp, -distance * 0.22)
    rig.override = target
    rig.zoomTo(distance)
  }

  release() {
    const rig = this.app.cameraRig
    rig.override = null
    if (this.returnDistance) rig.zoomTo(this.returnDistance)
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
