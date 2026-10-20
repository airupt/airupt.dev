import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
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

    await RAPIER.init()
    this.overlay.setProgress(0.2)

    this.viewport = new Viewport()
    this.ticker = new Ticker()
    this.inputs = new Inputs(this)
    this.scene = new THREE.Scene()
    this.physics = new Physics()
    this.cameraRig = new CameraRig(this)
    this.world = new World(this)
    this.sounds = new Sounds(this)
    this.map = new MapView(this)

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

    await Promise.all([
      this.world.load(progress => this.overlay.setProgress(0.2 + progress * 0.7)),
      this.sounds.load(),
    ])

    // Compile every shader now rather than the first time each thing comes into view
    await this.renderer.compileAsync(this.scene, this.cameraRig.camera)
    this.overlay.setProgress(1)

    this.overlay.ready(() => {
      this.inputs.enabled = true
      this.sounds.start()
      this.cameraRig.attract = false
      this.cameraRig.zoomTo(this.cameraRig.limits.start)
      this.world.boat.drop()
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
