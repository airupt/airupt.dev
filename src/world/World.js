import * as THREE from 'three'
import { Sky } from './Sky.js'
import { Ocean } from './Ocean.js'
import { Islands } from './Islands.js'
import { Boat } from './Boat.js'
import { Zones } from './Zones.js'
import { TrailMap } from './TrailMap.js'
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
import { RockField } from './Rocks.js'
import { bakeContactShadows } from './ContactShadows.js'
import { Reactions } from './Reactions.js'
import { Guide } from './Guide.js'
import worldModels from '../assets/models/world.glb?url'
import { ProjectBoards } from './ProjectBoards.js'
import { Logbook } from './Logbook.js'
import { Treasure } from './Treasure.js'
import { Wildlife } from './Wildlife.js'
import { RingCourse } from './RingCourse.js'
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
    this.trail = new TrailMap(app, this.boat)
    this.ocean.useTrail(this.trail)
    this.splashes = new Splashes(app)
    this.boatEffects = new BoatEffects(this.boat, this.splashes)
    this.boatEffects.onImpact = strength => app.cameraRig.shake(strength)
    this.boat.onRespawn = () => {
      app.overlay.wipe()
      this.trail.reset()
    }
    this.birds = new Birds(app, this.islands)
    this.zones = new Zones(app, this.islands)
    this.zoneRings = new ZoneRings(app, this.zones, this.ocean.uniforms.uWaterMap.value)

    const volcano = this.islands.list.find(island => island.volcano)
    if (volcano) {
      app.cameraRig.attractPoint = new THREE.Vector3(volcano.x, 0, volcano.z)
      app.cameraRig.focus.copy(app.cameraRig.attractPoint).addScaledVector(app.cameraRig.screenUp, -8)
    }

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

    // Coming in to Mount Airupt's landing wakes it up
    const landing = this.islands.list.find(island => island.landing)
    if (landing) {
      const boat = this.boat.object.position
      const near = Math.hypot(boat.x - landing.shore.x, boat.z - landing.shore.z) < 10
      if (near && !this.atLanding && this.eruptionTimer < 30) this.eruptionTimer = 0
      if (near) this.logbook?.record('landing')
      this.atLanding = near
    }

    if (this.eruptionTimer > 0) return
    this.eruptionTimer = 35 + Math.random() * 20

    const volcano = this.islands.list.find(island => island.volcano)
    const boat = this.boat.object.position
    const distance = Math.hypot(boat.x - volcano.x, boat.z - volcano.z)
    const closeness = THREE.MathUtils.clamp(1 - (distance - 25) / 90, 0, 1)
    this.smoke.burst(0)
    if (closeness > 0.35) this.logbook?.record('eruption')
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
    await this.models.load(worldModels, onProgress)
    this.rocks = new RockField(this.app)
    this.decor = new Decor(this.app, this.islands, this.models, new Foliage(this.app), this.rocks)
    this.boat.setModel(this.models.get('boat'))
    this.lights = new Lights(this.app, this.decor, this.zones, this.boat, this.islands)

    this.smoke = new Smoke(this.app)
    const volcano = this.islands.list.find(island => island.volcano)
    if (volcano) {
      const [bx, bz] = volcano.blobs[0]
      // Rising off the lava lake
      const lava = this.lights.lava?.mesh.position ?? new THREE.Vector3(volcano.x + bx, volcano.top - 3.5, volcano.z + bz)
      this.smoke.addEmitter(lava.clone().setY(lava.y + 0.4), {
        rate: 5,
        size: 1.25,
        rise: 22,
        life: 9,
        spread: 2.4,
        color: '#f3f0ea',
        fade: '#8c8782',
      })
    }
    for (const { id, model } of this.decor.placed) {
      if (id !== 'campfire') continue
      this.smoke.addEmitter(model.position.clone().add(new THREE.Vector3(0, 0.4, 0)), { rate: 2, size: 0.22, rise: 4, life: 3, color: '#d9d4cf' })
    }
    this.smoke.build()
    this.fish = new Fish(this.app, this.models, this.splashes, this.islands)
    this.props = new Props(this.app, this.models, this.islands)
    this.seascape = new Seascape(this.app, this.models, this.props, this.rocks, this.islands, this.zones)
    this.rocks.build()
    this.props.instances.build()
    this.bottles = new Bottles(this.app, this.models, this.splashes)
    this.logbook = new Logbook(this.app)
    if (this.bottles.collected.size) this.logbook.restore('bottle')
    if (this.bottles.collected.size >= this.bottles.items.length) this.logbook.restore('bottles')
    this.bottles.onCollect = (count, total) => {
      this.logbook.record('bottle')
      if (count === total) this.logbook.record('bottles')
    }
    this.treasure = new Treasure(this.app, this.models, this.logbook)
    this.wildlife = new Wildlife(this.app, this.splashes, this.logbook)
    this.ringCourse = new RingCourse(this.app, this.logbook)

    // Signs and boards are painted with the site fonts, so wait until they have loaded
    await Promise.all([document.fonts.load('800 96px "Bricolage Grotesque"'), document.fonts.load('600 30px "Figtree"')])
    this.projectBoards = new ProjectBoards(this.app, this.islands)
    this.signs = new Signs(
      this.app,
      this.islands,
      this.islands.list
        .filter(island => island.section || island.label === 'name' || island.landing)
        .map(island => ({
          island,
          text: island.label === 'name' ? profile.name : island.section ? sections.find(section => section.id === island.section).title : island.label,
          color: island.color ?? (island.volcano ? '#ff8a3d' : '#ff6b4a'),
        }))
    )

    this.reactions = new Reactions(this.app, this)
    this.guide = new Guide(this.app, this.zones, this.reactions)

    // Now everything stands where it will stay: darken the ground under it
    this.islands.uniforms.uContactMap.value = bakeContactShadows([
      ...this.decor.contacts,
      ...this.signs.contacts,
      ...(this.projectBoards.contacts ?? []),
    ])
  }

  update(delta) {
    const focus = this.app.cameraRig.focus
    this.dayCycle.update(delta)
    this.lights?.update(delta, this.dayCycle.night)
    this.ocean.setNight(this.dayCycle.night)
    this.zoneRings.setNight(this.dayCycle.night)
    shared.uTime.value = this.app.physics.renderTime
    // Wind time runs faster in stronger wind, so gusts speed up instead of just growing
    shared.uWindTime.value += delta * 0.1 * shared.uWindStrength.value
    this.boat.update(delta)
    this.trail.update(delta)
    this.boatEffects.update(delta)
    this.fish?.update(delta)
    this.bottles?.update(delta)
    this.splashes.setNight(this.dayCycle.night)
    this.splashes.update(delta)
    this.birds.update(delta)
    this.smoke?.update(delta)
    this.updateVolcano(delta)
    this.projectBoards?.update(delta)
    this.signs?.update(delta)
    this.reactions?.update(delta)
    this.logbook?.update()
    this.treasure?.update(delta)
    this.wildlife?.update(delta)
    this.ringCourse?.update(delta)
    this.guide?.update(delta)
    this.props?.instances.update()
    this.ocean.update(focus)
    this.sky.update(focus, this.app.cameraRig.distance)
    this.zones.update()
    this.zoneRings.update(delta)
  }
}
