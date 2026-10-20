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
import { ZoneRings } from './ZoneRings.js'
import { Signs } from './Signs.js'
import { Props } from './Props.js'
import { Bottles } from './Bottles.js'
import { Smoke } from './Smoke.js'
import { Seascape } from './Seascape.js'
import { profile, sections } from '../content/portfolio.js'

const seeThroughPoint = new THREE.Vector3()

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
    this.boatEffects.onImpact = strength => app.cameraRig.shake(strength)
    this.boat.onRespawn = () => {
      app.overlay.wipe()
      this.wake.reset()
    }
    this.birds = new Birds(app, this.islands)
    this.zones = new Zones(app, this.islands)
    this.zoneRings = new ZoneRings(app, this.zones)

    for (const island of this.islands.list) {
      const text =
        island.label === 'name'
          ? profile.name
          : (sections.find(section => section.id === island.section)?.title ?? island.label)
      if (!text) continue
      const anchor = new THREE.Vector3(island.x, island.top + 2.5, island.z)
      const variant = island.label === 'name' ? 'home' : island.section ? 'section' : 'landmark'
      app.overlay.addLabel(text, anchor, variant, island.color)
    }
  }

  // Every so often Mount Airupt clears its throat: a gush of smoke, a rumble
  // and a small shake, both fading with distance from the volcano
  updateVolcano(delta) {
    if (!this.smoke || !this.app.overlay.started) return
    this.eruptionTimer = (this.eruptionTimer ?? 12) - delta
    if (this.eruptionTimer > 0) return
    this.eruptionTimer = 35 + Math.random() * 20

    const volcano = this.islands.list.find(island => island.volcano)
    const boat = this.boat.object.position
    const distance = Math.hypot(boat.x - volcano.x, boat.z - volcano.z)
    const closeness = THREE.MathUtils.clamp(1 - (distance - 25) / 90, 0, 1)
    this.smoke.burst(0)
    this.app.sounds.rumble(0.55 * closeness)
    this.app.cameraRig.shake(0.2 * closeness)
  }

  // Tells the shaders where the boat is on screen so whatever stands in
  // front of it can thin out (runs after the camera has moved)
  updateSeeThrough(camera) {
    const position = seeThroughPoint.copy(this.boat.object.position)
    const depth = -position.applyMatrix4(camera.matrixWorldInverse).z
    position.copy(this.boat.object.position).project(camera)
    const resolution = shared.uResolution.value
    shared.uSeeThroughCenter.value.set((position.x * 0.5 + 0.5) * resolution.x, (position.y * 0.5 + 0.5) * resolution.y)
    shared.uSeeThroughDepth.value = depth
    shared.uSeeThroughRadius.value = resolution.y * 0.13
  }

  async load(onProgress) {
    await this.models.load('/models/world.glb', onProgress)
    this.decor = new Decor(this.app, this.islands, this.models, new Foliage(this.app))
    this.boat.setModel(this.models.get('boat'))
    this.lights = new Lights(this.app, this.decor, this.zones, this.boat, this.islands)

    this.smoke = new Smoke(this.app)
    const volcano = this.islands.list.find(island => island.volcano)
    if (volcano) {
      const [bx, bz] = volcano.blobs[0]
      this.smoke.addEmitter(new THREE.Vector3(volcano.x + bx, volcano.top - 1.5, volcano.z + bz), {
        rate: 3,
        size: 1.6,
        rise: 22,
        life: 9,
        spread: 2,
        color: '#ebe6e1',
      })
    }
    for (const { id, model } of this.decor.placed) {
      if (id !== 'campfire') continue
      this.smoke.addEmitter(model.position.clone().add(new THREE.Vector3(0, 0.4, 0)), { rate: 2, size: 0.22, rise: 4, life: 3, color: '#d9d4cf' })
    }
    this.smoke.build()
    this.fish = new Fish(this.app, this.models, this.splashes, this.islands)
    this.props = new Props(this.app, this.models, this.islands)
    this.seascape = new Seascape(this.app, this.models, this.props, this.zones)
    this.bottles = new Bottles(this.app, this.models, this.splashes)

    // Signs are painted with the display font, so wait until it has loaded
    await document.fonts.load('800 96px "Bricolage Grotesque"')
    this.signs = new Signs(
      this.app,
      this.islands,
      this.islands.list
        .filter(island => island.section || island.label === 'name')
        .map(island => ({
          island,
          text: island.label === 'name' ? profile.name : sections.find(section => section.id === island.section).title,
          color: island.color ?? '#ff6b4a',
        }))
    )
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
    this.bottles?.update(delta)
    this.splashes.setNight(this.dayCycle.night)
    this.splashes.update(delta)
    this.birds.update(delta)
    this.smoke?.update(delta)
    this.updateVolcano(delta)
    this.seascape?.update()
    this.ocean.update(focus)
    this.sky.update(focus, this.app.cameraRig.distance)
    this.zones.update()
    this.zoneRings.update(delta)
  }
}
