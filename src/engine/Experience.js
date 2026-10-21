import * as THREE from 'three'
import { Ticker } from './Ticker.js'
import { Viewport } from './Viewport.js'
import { Inputs } from './Inputs.js'
import { Physics } from './Physics.js'
import { CameraRig } from './CameraRig.js'
import { Sounds } from './Sounds.js'
import { PostProcessing } from './PostProcessing.js'
import { World } from '../world/World.js'
import { shared } from '../world/shading.js'
import { MapView } from '../ui/MapView.js'
import { LogbookView } from '../ui/LogbookView.js'
import { PhotoMode } from '../ui/PhotoMode.js'
import { Quality } from './Quality.js'

// Owns the renderer and wires every system together. Systems receive this
// object and read what they need from it instead of importing each other.
export class Experience {
  constructor(canvas, overlay) {
    this.canvas = canvas
    this.paused = overlay.isClassicOpen
    this.overlay = overlay
    overlay.app = this
  }

  async start() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' })
    } catch {
      this.overlay.showClassic({ fallback: true })
      return
    }

    // Rapier's WASM is compiled while this chunk downloads (see vite-plugin-wasm)
    this.overlay.setProgress(0.2)

    this.viewport = new Viewport()
    this.ticker = new Ticker()
    this.inputs = new Inputs(this)
    this.inputs.on('sound', () => this.overlay.toggleSound())
    this.inputs.on('page', () => this.overlay.showClassic())
    this.scene = new THREE.Scene()
    this.physics = new Physics()
    this.cameraRig = new CameraRig(this)
    this.world = new World(this)
    this.sounds = new Sounds(this)
    this.map = new MapView(this)
    this.logbookView = new LogbookView(this)
    this.photo = new PhotoMode(this)

    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    // Colours are art-directed in the stylised shader; tone mapping would only wash them out
    this.renderer.toneMapping = THREE.NoToneMapping
    this.postProcessing = new PostProcessing(this)
    this.quality = new Quality(this)
    this.quality.apply()
    this.viewport.onResize(() => this.resize())

    // The sea and islands render behind the loader while models and sounds
    // stream in, with the camera drifting over the archipelago
    this.ticker.add(() => this.inputs.update(), 0)
    this.ticker.add(delta => this.physics.update(delta), 10)
    this.ticker.add(delta => this.world.update(delta), 20)
    this.ticker.add(delta => this.cameraRig.update(delta), 30)
    this.ticker.add(() => this.world.updateSeeThrough(this.cameraRig.camera), 31)
    this.ticker.add(delta => this.sounds.update(delta), 35)
    this.ticker.add(() => this.overlay.update(), 40)
    this.ticker.add(() => this.map.update(), 41)
    this.ticker.add(delta => this.render(delta), 100)
    this.ticker.add(delta => this.inputs.enabled && this.quality.update(delta), 110)
    this.ticker.start()
    requestAnimationFrame(() => this.overlay.showLiveScene())

    // Audio is fetched alongside but never holds up the start (see Sounds)
    this.sounds.load()
    await this.world.load(progress => this.overlay.setProgress(0.2 + progress * 0.7))
    this.logbookView.attach(this.world.logbook)
    this.logbookView.addCard(() => this.world.treasure.card())

    // Compile every shader now rather than the first time each thing comes into view
    await this.renderer.compileAsync(this.scene, this.cameraRig.camera)
    this.map.capture()
    this.overlay.setProgress(1)

    this.overlay.ready(() => {
      this.inputs.enabled = true
      this.sounds.start()
      this.cameraRig.attract = false
      // One continuous move from the volcano down to the opening shot: the
      // whole home island with the boat, already afloat at its start, in the
      // lower third
      const rig = this.cameraRig
      const home = this.world.islands.list.find(island => island.label === 'name')
      // A portrait screen is too narrow for both, so it favours the boat and the dock bay
      const portrait = this.viewport.width < this.viewport.height
      const focus = new THREE.Vector3(home.x, 0, home.z)
        .addScaledVector(rig.screenRight, portrait ? 9.5 : 3.5)
        .addScaledVector(rig.screenUp, portrait ? 3 : 4.5)
      const distance = portrait ? 70 : 66
      rig.establishing = { focus, distance, origin: this.world.boat.object.position.clone() }
      rig.flyTo(focus, distance, 3.2)
    })
  }

  resize() {
    const { width, height } = this.viewport
    // The tilt-shift blur hides softness, so post-processing can run below full retina resolution
    const pixelRatio = Math.min(this.viewport.pixelRatio, this.quality.pixelRatioCap)
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(width, height, false)
    this.postProcessing.resize(width, height, pixelRatio)
    this.cameraRig.resize(width, height)
    shared.uResolution.value.set(width * pixelRatio, height * pixelRatio)
  }

  render(delta) {
    if (this.paused) return
    this.postProcessing.render(delta)
  }
}
