import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { Ticker } from './Ticker.js'
import { Viewport } from './Viewport.js'
import { Inputs } from './Inputs.js'
import { Physics } from './Physics.js'
import { CameraRig } from './CameraRig.js'
import { World } from '../world/World.js'

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

    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.NeutralToneMapping
    this.resize()
    this.viewport.onResize(() => this.resize())

    await this.world.load(progress => this.overlay.setProgress(0.2 + progress * 0.8))

    this.ticker.add(() => this.inputs.update(), 0)
    this.ticker.add(delta => this.physics.update(delta), 10)
    this.ticker.add(delta => this.world.update(delta), 20)
    this.ticker.add(delta => this.cameraRig.update(delta), 30)
    this.ticker.add(() => this.overlay.update(), 40)
    this.ticker.add(() => this.render(), 100)
    this.ticker.start()

    this.overlay.ready(() => {
      this.inputs.enabled = true
      this.cameraRig.zoomTo(this.cameraRig.limits.start)
    })
  }

  resize() {
    const { width, height, pixelRatio } = this.viewport
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(width, height, false)
    this.cameraRig.resize(width, height)
  }

  render() {
    if (this.paused) return
    this.renderer.render(this.scene, this.cameraRig.camera)
  }
}
