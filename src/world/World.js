import * as THREE from 'three'
import { Sky } from './Sky.js'
import { Ocean } from './Ocean.js'
import { Islands } from './Islands.js'
import { Boat } from './Boat.js'
import { Zones } from './Zones.js'
import { profile, sections } from '../content/portfolio.js'

export class World {
  constructor(app) {
    this.app = app
    this.sky = new Sky(app)
    this.ocean = new Ocean(app)
    this.islands = new Islands(app)
    this.boat = new Boat(app)
    this.zones = new Zones(app, this.islands)

    for (const island of this.islands.list) {
      const text = island.label === 'name' ? profile.name : sections.find(section => section.id === island.section)?.title
      if (!text) continue
      const anchor = new THREE.Vector3(island.x, island.top + 2.5, island.z)
      app.overlay.addLabel(text, anchor, island.label === 'name' ? 'home' : 'section', island.color)
    }
  }

  async load(onProgress) {
    // Models and sounds get loaded here once the asset packs are in
    onProgress(1)
  }

  update(delta) {
    const focus = this.app.cameraRig.focus
    this.boat.update(delta)
    this.ocean.update(focus)
    this.sky.update(focus, this.app.cameraRig.distance)
    this.zones.update()
  }
}
