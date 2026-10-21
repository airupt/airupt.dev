import * as THREE from 'three'
import { Buoy } from './Buoy.js'
import { DOCK_INLAND, DOCK_LENGTH, DOCK_WIDTH } from './Dock.js'

const RADIUS = 7.5

// Each section island has a berth alongside its dock, marked by a buoy in
// the section colour just off the dock's end. Sailing up to it offers to
// open that section; opening it brings the boat in alongside the dock.
export class Zones {
  constructor(app, islands) {
    this.app = app
    this.active = null
    this.list = []

    const toCamera = app.cameraRig.direction
    for (const island of islands.list) {
      if (!island.section) continue
      const { shore, out } = island
      // The berth is on the camera's side of the dock, so the dock never
      // stands in front of the moored boat
      const side = Math.sign(out.z * toCamera.x - out.x * toCamera.z) || 1
      const across = { x: out.z * side, z: -out.x * side }
      const offset = DOCK_WIDTH / 2 + 1.45
      const reach = (DOCK_LENGTH - DOCK_INLAND) * 0.55
      const x = shore.x + out.x * reach + across.x * offset
      const z = shore.z + out.z * reach + across.z * offset
      // Moored parallel to the dock, bow out to sea, ready to leave
      const yaw = Math.atan2(-out.x, -out.z)
      // The buoy stands off the dock's end, a few metres to the side of the
      // moored boat's way out, so leaving the berth never runs into it
      const buoyReach = DOCK_LENGTH - DOCK_INLAND + 3.4
      const buoyAcross = offset + 3.4
      const buoy = new Buoy(app, { x: shore.x + out.x * buoyReach + across.x * buoyAcross, z: shore.z + out.z * buoyReach + across.z * buoyAcross, color: island.color })
      this.list.push({ section: island.section, island, x, z, yaw, buoy })
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
      const distance = Math.hypot(zone.x - boat.x, zone.z - boat.z)
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
