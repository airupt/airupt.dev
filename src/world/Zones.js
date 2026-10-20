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
      const reach = DOCK_TILES * DOCK_TILE + 4
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
    // Aim at the island itself, a little toward its dock, and shift the
    // picture so it sits in the free space beside the panel: to the left of
    // a side panel, above a bottom sheet
    const target = new THREE.Vector3(zone.island.x * 0.75 + zone.x * 0.25, 0, zone.island.z * 0.75 + zone.z * 0.25)
    rig.override = target
    rig.zoomTo(rig.limits.min + 22 + zone.island.radius * 0.6)
    if (this.app.viewport.width > 720) rig.viewShiftTarget.set(0.22, 0)
    else rig.viewShiftTarget.set(0, 0.3)
  }

  release() {
    const rig = this.app.cameraRig
    rig.override = null
    rig.viewShiftTarget.set(0, 0)
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
      if (nearest) this.app.sounds.play('chime', 0.45)
      this.active = nearest
      this.app.overlay.setPrompt(nearest?.section ?? null)
    }
  }
}
