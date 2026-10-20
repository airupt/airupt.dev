import { islands, worldRadius } from '../world/layout.js'
import { profile, sections } from '../content/portfolio.js'

const SVG = 'http://www.w3.org/2000/svg'

function svg(tag, attributes = {}) {
  const node = document.createElementNS(SVG, tag)
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value)
  return node
}

// Chart of the archipelago. It is turned 45° to match the diagonal camera, so
// "up" on the map is "up" on screen. Choosing an island sails you there.
export class MapView {
  constructor(app) {
    this.app = app
    this.dialog = document.querySelector('#map')
    const chart = this.dialog.querySelector('.map-chart')

    const root = svg('svg', { viewBox: '-115 -115 230 230', role: 'img', 'aria-label': 'Map of the islands' })
    root.append(svg('circle', { r: worldRadius + 6, class: 'map-sea' }))
    root.append(svg('circle', { r: worldRadius, class: 'map-edge' }))

    const content = svg('g', { transform: 'rotate(45)' })
    root.append(content)
    const list = this.dialog.querySelector('.map-list')

    for (const island of islands) {
      const group = svg('g', { transform: `translate(${island.x} ${island.z})` })
      group.append(svg('circle', { r: island.radius * 0.95, class: 'map-sand' }))
      group.append(svg('circle', { r: island.radius * 0.7, class: 'map-land' }))
      content.append(group)

      const title = island.label === 'name' ? profile.name : sections.find(section => section.id === island.section)?.title
      if (!title) continue

      if (island.color) group.append(svg('circle', { r: 3.2, class: 'map-pin', fill: island.color }))
      const label = svg('text', { class: 'map-label', transform: `rotate(-45) translate(0 ${-island.radius - 4})` })
      label.textContent = title
      group.append(label)

      // The visible buttons sit in a list beside the chart, which keeps them keyboard friendly
      const button = document.createElement('button')
      button.className = 'button map-button'
      button.textContent = title
      if (island.color) button.style.setProperty('--pin', island.color)
      button.addEventListener('click', () => this.sailTo(island))
      list.append(button)
    }

    this.boat = svg('path', { d: 'M 0 -5 L 3.5 4 L -3.5 4 Z', class: 'map-boat' })
    content.append(this.boat)
    chart.append(root)

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
      // Arrive at the dock end, bow pointing at the island
      this.app.world.boat.teleport(zone.x, zone.z, Math.atan2(zone.x - island.x, zone.z - island.z))
    } else {
      this.app.world.boat.respawn()
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
