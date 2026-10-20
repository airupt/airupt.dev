import * as THREE from 'three'
import { Sky } from './Sky.js'
import { Ocean } from './Ocean.js'
import { Islands } from './Islands.js'
import { Boat } from './Boat.js'
import { Zones } from './Zones.js'
import { Wake } from './Wake.js'
import { Models } from './Models.js'
import { Decor } from './Decor.js'
import { shared } from './shading.js'
import { Grass } from './Grass.js'
import { Foliage } from './Foliage.js'
import { DayCycle } from './DayCycle.js'
import { Lights } from './Lights.js'
import { Splashes } from './Splashes.js'
import { BoatEffects } from './BoatEffects.js'
import { Fish } from './Fish.js'
import { Birds } from './Birds.js'
import { profile, sections } from '../content/portfolio.js'

export class World {
  constructor(app) {
    this.app = app
    this.dayCycle = new DayCycle()
    this.models = new Models()
    this.sky = new Sky(app)
    this.ocean = new Ocean(app)
    this.islands = new Islands(app)
    this.grass = new Grass(app, this.islands)
    this.boat = new Boat(app)
    this.wake = new Wake(app, this.boat)
    this.splashes = new Splashes(app)
    this.boatEffects = new BoatEffects(this.boat, this.splashes)
    this.birds = new Birds(app, this.islands)
    this.zones = new Zones(app, this.islands)

    for (const island of this.islands.list) {
      const text = island.label === 'name' ? profile.name : sections.find(section => section.id === island.section)?.title
      if (!text) continue
      const anchor = new THREE.Vector3(island.x, island.top + 2.5, island.z)
      app.overlay.addLabel(text, anchor, island.label === 'name' ? 'home' : 'section', island.color)
    }
  }

  async load(onProgress) {
    await this.models.load('/models/world.glb', onProgress)
    this.decor = new Decor(this.app, this.islands, this.models, new Foliage(this.app))
    this.boat.setModel(this.models.get('boat'))
    this.lights = new Lights(this.app, this.decor, this.zones, this.boat)
    this.fish = new Fish(this.app, this.models, this.splashes, this.islands)
  }

  update(delta) {
    const focus = this.app.cameraRig.focus
    this.dayCycle.update(delta)
    this.lights?.update(delta, this.dayCycle.night)
    this.wake.setNight(this.dayCycle.night)
    shared.uTime.value = this.app.physics.renderTime
    // Wind time runs faster in stronger wind, so gusts speed up instead of just growing
    shared.uWindTime.value += delta * 0.1 * shared.uWindStrength.value
    this.boat.update(delta)
    this.wake.update(delta)
    this.boatEffects.update(delta)
    this.fish?.update(delta)
    this.splashes.setNight(this.dayCycle.night)
    this.splashes.update(delta)
    this.birds.update(delta)
    this.ocean.update(focus)
    this.sky.update(focus, this.app.cameraRig.distance)
    this.zones.update()
  }
}
