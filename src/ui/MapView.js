import * as THREE from 'three'
import { islands, worldRadius } from '../world/layout.js'
import { profile, sections } from '../content/portfolio.js'
import { shared } from '../world/shading.js'

const SVG = 'http://www.w3.org/2000/svg'
const EXTENT = 112 // metres from the centre to each edge of the chart

function svg(tag, attributes = {}) {
  const node = document.createElementNS(SVG, tag)
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value)
  return node
}

function titleOf(island) {
  if (island.label === 'name') return profile.name
  return sections.find(section => section.id === island.section)?.title ?? island.label
}

// Chart of the archipelago: a picture of the real world taken from straight
// above at boot, turned 45° so "up" on the chart is "up" on screen.
// Choosing a place sails you there.
export class MapView {
  constructor(app) {
    this.app = app
    this.dialog = document.querySelector('#map')
    this.chart = this.dialog.querySelector('.map-chart')
    const list = this.dialog.querySelector('.map-list')

    this.root = svg('svg', { viewBox: `${-EXTENT} ${-EXTENT} ${EXTENT * 2} ${EXTENT * 2}`, role: 'img', 'aria-label': 'Map of the islands' })
    this.content = svg('g', { transform: 'rotate(45)' })
    this.root.append(this.content)
    this.picture = svg('image', { x: -EXTENT, y: -EXTENT, width: EXTENT * 2, height: EXTENT * 2 })
    this.content.append(this.picture)
    this.content.append(svg('circle', { r: worldRadius, class: 'map-edge' }))

    for (const island of islands) {
      const title = titleOf(island)
      if (!title) continue
      const group = svg('g', { transform: `translate(${island.x} ${island.z})` })
      if (island.color) group.append(svg('circle', { r: 3.4, class: 'map-pin', fill: island.color }))
      const label = svg('text', { class: 'map-label', transform: `rotate(-45) translate(0 ${-island.radius * 0.75 - 4})` })
      label.textContent = title
      group.append(label)
      this.content.append(group)

      // Travel buttons live in a list beside the chart, which keeps them keyboard friendly
      const button = document.createElement('button')
      button.className = 'button map-button'
      button.textContent = title
      button.style.setProperty('--pin', island.color ?? (island.volcano ? '#4f4440' : 'var(--ink)'))
      button.addEventListener('click', () => this.sailTo(island))
      list.append(button)
    }

    this.boat = svg('path', { d: 'M 0 -5 L 3.6 4 L -3.6 4 Z', class: 'map-boat' })
    this.content.append(this.boat)
    this.chart.append(this.root)

    this.dialog.addEventListener('close', () => app.overlay.setSailing(true))
    this.dialog.addEventListener('click', event => {
      if (event.target === this.dialog) this.dialog.close()
    })
    this.dialog.addEventListener('keydown', event => {
      if (event.code === 'KeyM') this.dialog.close()
    })
    document.querySelector('#open-map').addEventListener('click', () => this.open())
    app.inputs.on('map', () => this.open())
  }

  // Renders the whole archipelago once from straight above into an image
  capture() {
    const { renderer, scene, world } = this.app
    const size = 1024
    const target = new THREE.WebGLRenderTarget(size, size, { samples: 4 })
    target.texture.colorSpace = THREE.SRGBColorSpace

    const camera = new THREE.OrthographicCamera(-EXTENT, EXTENT, EXTENT, -EXTENT, 1, 400)
    camera.position.set(0, 200, 0)
    camera.up.set(0, 0, -1) // screen down = +z, matching SVG's y axis
    camera.lookAt(0, 0, 0)

    // No fog or sky from up here, the boat should not punch holes in things,
    // and the shadow box has to cover the whole map for this one frame
    const saved = {
      near: shared.uFogNear.value,
      far: shared.uFogFar.value,
      seeThrough: shared.uSeeThroughCenter.value.clone(),
    }
    shared.uFogNear.value = 1e5
    shared.uFogFar.value = 1e5 + 1
    shared.uSeeThroughCenter.value.set(-1e5, -1e5)
    world.sky.dome.visible = false
    world.ocean.uniforms.uGlint.value = 0
    const shadowCamera = world.sky.sun.shadow.camera
    const shadowBounds = [shadowCamera.left, shadowCamera.right, shadowCamera.top, shadowCamera.bottom]
    Object.assign(shadowCamera, { left: -EXTENT, right: EXTENT, top: EXTENT, bottom: -EXTENT })
    shadowCamera.updateProjectionMatrix()
    world.sky.sun.position.copy(shared.uSunDirection.value).multiplyScalar(150)
    world.sky.sun.target.position.set(0, 0, 0)
    world.sky.sun.target.updateMatrixWorld()

    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    const pixels = new Uint8Array(size * size * 4)
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels)
    renderer.setRenderTarget(null)

    shared.uFogNear.value = saved.near
    shared.uFogFar.value = saved.far
    shared.uSeeThroughCenter.value.copy(saved.seeThrough)
    world.sky.dome.visible = true
    world.ocean.uniforms.uGlint.value = 3
    ;[shadowCamera.left, shadowCamera.right, shadowCamera.top, shadowCamera.bottom] = shadowBounds
    shadowCamera.updateProjectionMatrix()
    target.dispose()

    // Pixels come back bottom row first
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    const image = context.createImageData(size, size)
    for (let row = 0; row < size; row++) {
      image.data.set(pixels.subarray(row * size * 4, (row + 1) * size * 4), (size - 1 - row) * size * 4)
    }
    context.putImageData(image, 0, 0)
    this.picture.setAttribute('href', canvas.toDataURL('image/jpeg', 0.85))
  }

  open() {
    if (this.dialog.open || document.querySelector('#panel').open) return
    this.dialog.showModal()
    this.app.overlay.setSailing(false)
    this.app.sounds.play('click', 0.5, 1.1)
  }

  sailTo(island) {
    this.dialog.close()
    const zone = this.app.world.zones.list.find(candidate => candidate.island.id === island.id)
    if (zone) {
      // Arrive at the zone, bow pointing at the island
      this.app.world.boat.teleport(zone.x, zone.z, Math.atan2(zone.x - island.x, zone.z - island.z))
    } else if (island.label === 'name') {
      this.app.world.boat.respawn()
    } else {
      // Landmarks without a dock: arrive offshore on the side facing the start
      const length = Math.hypot(island.x, island.z) || 1
      const distance = island.radius + 8
      const x = island.x - (island.x / length) * distance
      const z = island.z - (island.z / length) * distance
      this.app.world.boat.teleport(x, z, Math.atan2(x - island.x, z - island.z))
    }
  }

  update() {
    if (!this.dialog.open) return
    const { position, quaternion } = this.app.world.boat.object
    // Heading on the ground plane, as an SVG rotation (0 = toward -z)
    const yaw = Math.atan2(2 * (quaternion.w * quaternion.y + quaternion.x * quaternion.z), 1 - 2 * (quaternion.y ** 2 + quaternion.x ** 2))
    this.boat.setAttribute('transform', `translate(${position.x} ${position.z}) rotate(${(-yaw * 180) / Math.PI})`)
  }
}
