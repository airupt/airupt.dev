import * as THREE from 'three'
import { Buoy } from './Buoy.js'
import { harbourLayout } from './harbour.js'

const RADIUS = 7.5

// Each section island has a berth alongside its dock, marked by a buoy in
// the section colour just off the dock's end. Sailing up to it offers to
// open that section; opening it brings the boat in alongside the dock.
export class Zones {
  constructor(app, islands) {
    this.app = app
    this.active = null
    this.list = []

    for (const island of islands.list) {
      if (!island.section) continue
      const { berth, buoy } = harbourLayout(island.shore, island.out, app.cameraRig.direction)
      this.list.push({ section: island.section, island, x: berth.x, z: berth.z, yaw: berth.yaw, buoy: new Buoy(app, { ...buoy, color: island.color }) })
    }

    app.inputs.on('interact', () => this.open())
    app.overlay.onSectionOpen = id => this.frame(id)
    app.overlay.onSectionClose = () => this.release()
  }

  open() {
    if (!this.active) return
    const { x, z, yaw, section } = this.active
    this.app.world.boat.moor(x, z, yaw)
    this.app.overlay.openSection(section)
  }

  // While a section is open the camera glides over to its island
  frame(id) {
    this.app.world.reactions?.visit(id)
    const zone = this.list.find(candidate => candidate.section === id)
    if (!zone) return
    const rig = this.app.cameraRig
    this.returnDistance = rig.targetDistance
    // Aim at the island itself, a little toward its dock, and shift the
    // picture so it sits in the free space beside the panel: to the left of
    // a side panel, above a bottom sheet
    const target = new THREE.Vector3(zone.island.x * 0.75 + zone.x * 0.25, 0, zone.island.z * 0.75 + zone.z * 0.25)
    rig.override = target
    const distance = rig.limits.min + 22 + zone.island.radius * 0.6
    const { width } = this.app.viewport
    if (width > 720) {
      // Centre the island in whatever room the panel leaves, and pull back
      // a little when that room is narrow so the whole island still fits
      const panel = document.querySelector('#panel')
      const free = Math.max(width - panel.offsetWidth - 24, width * 0.3)
      rig.viewShiftTarget.set(0.5 - free / 2 / width, 0)
      rig.zoomTo(distance * Math.max(1, (0.55 * width) / free))
    } else {
      rig.viewShiftTarget.set(0, 0.3)
      rig.zoomTo(distance)
    }
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
      // Near the berth or the buoy: the ring on the water is drawn round the buoy
      const { anchor } = zone.buoy
      const distance = Math.min(Math.hypot(zone.x - boat.x, zone.z - boat.z), Math.hypot(anchor.x - boat.x, anchor.z - boat.z))
      if (distance < nearestDistance) {
        nearest = zone
        nearestDistance = distance
      }
    }

    if (nearest !== this.active) {
      if (nearest) {
        this.app.sounds.play('chime', 0.45)
        this.app.world.signs?.pop(nearest.island)
        this.app.world.reactions?.arrive(nearest.island)
      }
      this.active = nearest
      this.app.overlay.setPrompt(nearest?.section ?? null)
      const plaza = nearest?.island.plan?.plaza
      this.app.cameraRig.attention = plaza ? new THREE.Vector3(plaza.x, 0, plaza.z) : null
    }
  }
}
