import { createLightColumn } from './lightColumn.js'
import { keyFor } from '../engine/bindings.js'

const STORAGE_KEY = 'airupt-guided'

function readSeen() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

// Helps a first-time visitor find their way: a soft column of light in the
// section colour rises from every buoy you haven't visited yet (visible from
// across the sea, gone once that section has been opened), and a couple of
// short tips arrive at the right moments.
export class Guide {
  constructor(app, zones, reactions) {
    this.app = app
    this.reactions = reactions
    this.time = 0
    this.tipsShown = readSeen() ? 2 : 0

    this.beacons = zones.list.map(zone => {
      const { mesh, material } = createLightColumn(zone.island.color)
      mesh.position.set(zone.buoy.anchor.x, 0, zone.buoy.anchor.z)
      app.scene.add(mesh)
      return { zone, mesh, material }
    })
  }

  update(delta) {
    if (!this.app.overlay.started) return
    this.time += delta
    const boat = this.app.world.boat.object.position

    for (const { zone, mesh, material } of this.beacons) {
      const visited = this.reactions.visited.has(zone.section)
      // Fades out as you arrive, so it never stands in the way up close
      const distance = Math.hypot(boat.x - mesh.position.x, boat.z - mesh.position.z)
      const target = visited ? 0 : 0.55 * Math.min(Math.max((distance - 10) / 20, 0), 1)
      const strength = material.uniforms.uStrength
      strength.value += (target - strength.value) * (1 - Math.exp(-2 * delta))
      mesh.visible = strength.value > 0.01
    }

    // Tips for a first visit: where to go, then the map
    if (this.tipsShown === 0 && this.time > 6) {
      this.tipsShown = 1
      this.app.overlay.toast('Each island is a part of the portfolio. Sail to a glowing buoy and come alongside the dock.', 'Where to?')
    }
    if (this.tipsShown === 1 && this.reactions.visited.size > 0 && !document.querySelector('dialog[open]')) {
      this.tipsShown = 2
      const key = keyFor('map', this.app.inputs.lastDevice)
      this.app.overlay.toast(key ? `Press ${key} for the map: it can sail you straight to any island.` : 'Tap the map button to sail straight to any island.', 'Nice!')
      try {
        localStorage.setItem(STORAGE_KEY, '1')
      } catch {
        // Private mode: the tips show again next time, which is fine
      }
    }
  }
}
