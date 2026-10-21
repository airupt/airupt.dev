import * as THREE from 'three'
import { islands, spawn } from './layout.js'
import { islandHeight } from './terrain.js'
import { createStylizedMaterial } from './shading.js'
import { element } from '../ui/render.js'

const REACH = 10 // metres from the cay at which the chest comes up
const COINS = 28
const GRAVITY = 14
const gold = '#ffc93d'

const dummy = new THREE.Object3D()

// The payoff for the bottles. Each one is a piece of a treasure map; with
// all eight an X appears on the sandy cay in the reef's lagoon. Sail up to
// it and a chest rises out of the sand, opens and throws out coins, and the
// boat is painted gold.
export class Treasure {
  constructor(app, models, logbook) {
    this.app = app
    this.logbook = logbook
    this.spot = findSpot(islands.find(island => island.id === 'reef-cay'), app.cameraRig.screenUp)
    this.state = logbook.has('treasure') ? 'open' : 'buried'
    this.time = 0

    const group = new THREE.Group()
    group.position.copy(this.spot)
    app.scene.add(group)

    // The chest faces the camera, its lid hinged at the back
    this.chest = models.get('chest')
    this.chest.scale.setScalar(1.1)
    this.chest.rotation.y = Math.PI / 4
    this.lid = this.chest.getObjectByName('lid')
    group.add(this.chest)

    // Light from the gold inside, bright enough to bloom
    this.shine = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 0.7) }))
    this.shine.position.y = 0.72
    this.chest.add(this.shine)

    // An X painted on the sand, with a few glints over it
    const paint = createStylizedMaterial({ color: '#c8372d' }, { waterLine: false })
    this.mark = new THREE.Group()
    for (const angle of [Math.PI / 4, -Math.PI / 4]) {
      const stroke = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.32), paint)
      stroke.rotation.y = angle
      this.mark.add(stroke)
    }
    this.mark.position.y = 0.06
    group.add(this.mark)
    this.glints = Array.from({ length: 3 }, (_, index) => {
      const glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.4, 1.6) }))
      glint.userData.phase = index * 2.1
      group.add(glint)
      return glint
    })

    this.coins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 10), createStylizedMaterial({ color: gold }, { waterLine: false }), COINS)
    this.coins.visible = false
    this.coins.frustumCulled = false
    group.add(this.coins)
    this.flying = []

    this.place()
  }

  // Where everything rests for the current state
  place() {
    const open = this.state === 'open'
    const waiting = this.state === 'waiting'
    this.chest.visible = open
    this.chest.position.y = open ? -0.05 : -1.3
    this.lid.rotation.x = open ? -1.9 : 0
    this.shine.visible = open
    this.mark.visible = waiting
    for (const glint of this.glints) glint.visible = waiting
    this.app.map?.showTreasure(waiting)
  }

  update(delta) {
    this.time += delta
    if (this.state === 'buried' && this.logbook.has('bottles')) {
      this.state = 'waiting'
      this.place()
      this.app.overlay.toast('The map is complete: X marks a sandy cay in the lagoon. Sail over and see what is buried there.', 'Treasure map', { duration: 8000 })
    }

    if (this.state === 'waiting') {
      this.glints.forEach((glint, index) => {
        const t = this.time * 1.6 + glint.userData.phase
        glint.position.set(Math.cos(t * 0.7 + index) * 0.6, 0.5 + Math.sin(t) * 0.25, Math.sin(t * 0.9 + index) * 0.6)
        glint.scale.setScalar(0.6 + Math.max(Math.sin(t * 2.3), 0) * 1.2)
      })
      const boat = this.app.world.boat.object.position
      if (Math.hypot(boat.x - this.spot.x, boat.z - this.spot.z) < REACH) this.dig()
    }

    if (this.state === 'rising') this.updateRising(delta)
    if (this.flying.length) this.updateCoins(delta)
  }

  dig() {
    this.state = 'rising'
    this.rise = 0
    this.mark.visible = false
    for (const glint of this.glints) glint.visible = false
    this.chest.visible = true
    this.app.map?.showTreasure(false)
    this.app.world.splashes.emit(this.spot.clone().setY(this.spot.y + 0.2), new THREE.Vector3(), { count: 30, spread: 1.6, up: 3, size: 0.1, life: 1 })
    this.app.sounds.rumble(0.25)
    this.app.cameraRig.shake(0.15)
  }

  updateRising(delta) {
    this.rise += delta
    // Up out of the sand with a little overshoot, then the lid swings open
    const up = Math.min(this.rise / 1.2, 1)
    const eased = 1 + 2.2 * Math.pow(up - 1, 3) + 1.2 * Math.pow(up - 1, 2)
    this.chest.position.y = -1.3 + 1.25 * eased
    const opening = THREE.MathUtils.clamp((this.rise - 1.3) / 0.5, 0, 1)
    this.lid.rotation.x = -1.9 * (1 - Math.pow(1 - opening, 3))
    if (opening > 0 && !this.shine.visible) {
      this.shine.visible = true
      this.burst()
    }
    if (this.rise > 2.2) {
      this.state = 'open'
      this.logbook.record('treasure')
      this.app.world.boat.setPaint('gold')
      this.app.overlay.toast('Your boat is painted gold. You can switch back in the captain’s log.', 'Treasure!', { duration: 7000 })
    }
  }

  burst() {
    this.app.sounds.fanfare(0.22)
    this.app.sounds.play('glass', 0.6, 0.8)
    this.coins.visible = true
    this.flying = Array.from({ length: COINS }, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = 1 + Math.random() * 2.2
      return {
        position: new THREE.Vector3(0, 0.8, 0),
        velocity: new THREE.Vector3(Math.cos(angle) * speed, 4 + Math.random() * 3, Math.sin(angle) * speed),
        spin: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0),
        rate: 6 + Math.random() * 10,
      }
    })
  }

  updateCoins(delta) {
    this.flying.forEach((coin, index) => {
      coin.velocity.y -= GRAVITY * delta
      coin.position.addScaledVector(coin.velocity, delta)
      coin.spin.x += coin.rate * delta
      // Coins that land lie flat on the sand
      if (coin.position.y < 0.05) {
        coin.position.y = 0.05
        coin.velocity.set(0, 0, 0)
        coin.spin.set(0, coin.spin.y, 0)
        coin.rate = 0
      }
      dummy.position.copy(coin.position)
      dummy.rotation.copy(coin.spin)
      dummy.updateMatrix()
      this.coins.setMatrixAt(index, dummy.matrix)
    })
    this.coins.instanceMatrix.needsUpdate = true
    if (this.flying.every(coin => coin.rate === 0)) this.flying = []
  }

  // The treasure map card in the captain's log: the chart from above, aged,
  // one slice for every bottle found; complete, it shows the route and the X
  card() {
    const chart = this.app.map?.chartCanvas
    if (!chart) return null
    const pieces = this.app.world.bottles.collected.size
    const size = 360
    const canvas = element('canvas', { class: 'treasure-map', width: String(size), height: String(size), role: 'img' })
    const context = canvas.getContext('2d')
    const radius = size / 2 - 6
    const extent = this.app.map.extent

    // The chart, turned like the map dialog's and toned like old paper
    this.aged ??= ageChart(chart, size)
    context.save()
    context.beginPath()
    context.arc(size / 2, size / 2, radius, 0, Math.PI * 2)
    context.fillStyle = '#d8c39a'
    context.fill()
    context.clip()
    for (let piece = 0; piece < 8; piece++) {
      if (piece >= pieces) continue
      context.save()
      context.beginPath()
      context.moveTo(size / 2, size / 2)
      context.arc(size / 2, size / 2, radius, (piece / 8) * Math.PI * 2 - Math.PI / 2, ((piece + 1) / 8) * Math.PI * 2 - Math.PI / 2)
      context.closePath()
      context.clip()
      context.drawImage(this.aged, 0, 0)
      context.restore()
    }
    context.restore()

    // Torn edges between the slices still missing
    context.strokeStyle = 'rgb(90 60 30 / 0.45)'
    context.lineWidth = 2
    context.setLineDash([5, 5])
    for (let piece = 0; piece < 8; piece++) {
      const angle = (piece / 8) * Math.PI * 2 - Math.PI / 2
      context.beginPath()
      context.moveTo(size / 2, size / 2)
      context.lineTo(size / 2 + Math.cos(angle) * radius, size / 2 + Math.sin(angle) * radius)
      context.stroke()
    }
    context.setLineDash([])
    context.beginPath()
    context.arc(size / 2, size / 2, radius, 0, Math.PI * 2)
    context.strokeStyle = '#8b5a33'
    context.lineWidth = 6
    context.stroke()

    // On the chart, turned 45° as in the map dialog
    const toChart = (x, z) => {
      const scale = size / 2 / extent
      return [size / 2 + Math.SQRT1_2 * (x - z) * scale, size / 2 + Math.SQRT1_2 * (x + z) * scale]
    }
    if (pieces >= 8) {
      const [sx, sy] = toChart(spawn.x, spawn.z)
      const [tx, ty] = toChart(this.spot.x, this.spot.z)
      context.strokeStyle = '#7a2e1f'
      context.lineWidth = 3
      context.setLineDash([7, 7])
      context.beginPath()
      context.moveTo(sx, sy)
      context.quadraticCurveTo((sx + tx) / 2 + 30, (sy + ty) / 2 + 40, tx, ty)
      context.stroke()
      context.setLineDash([])
      context.strokeStyle = '#c8372d'
      context.lineWidth = 6
      context.lineCap = 'round'
      for (const [ax, ay, bx, by] of [[-9, -9, 9, 9], [-9, 9, 9, -9]]) {
        context.beginPath()
        context.moveTo(tx + ax, ty + ay)
        context.lineTo(tx + bx, ty + by)
        context.stroke()
      }
    }
    canvas.setAttribute('aria-label', `Treasure map, ${pieces} of 8 pieces found`)

    const found = this.logbook.has('treasure')
    const text = found
      ? 'You found the treasure in the lagoon.'
      : pieces >= 8
        ? 'The map is complete. X marks a sandy cay in the lagoon.'
        : `${pieces} of 8 pieces. Every bottle you find adds one.`
    const details = [element('h3', { text: 'Treasure map' }), element('p', { text })]
    if (found) details.push(this.paintSwitch())
    return element('div', { class: 'treasure-card' }, [canvas, element('div', {}, details)])
  }

  paintSwitch() {
    const boat = this.app.world.boat
    const option = (paint, label) => {
      const button = element('button', { class: 'paint-option', 'aria-pressed': String(boat.paint === paint), text: label })
      button.addEventListener('click', () => {
        boat.setPaint(paint)
        group.querySelectorAll('button').forEach(other => other.setAttribute('aria-pressed', String(other === button)))
      })
      return button
    }
    const group = element('div', { class: 'paint-switch', role: 'group', 'aria-label': 'Boat paint' }, [option('classic', 'Classic'), option('gold', 'Gold')])
    return group
  }
}

// The cay's coast wanders with noise, so its sand is found rather than
// assumed: the highest point, then a little toward the camera (clear of the
// palm growing there) if that is still dry sand
function findSpot(cay, screenUp) {
  let best = { x: 0, z: 0, y: -Infinity }
  const reach = cay.radius * 1.3
  for (let x = -reach; x <= reach; x += 0.25) {
    for (let z = -reach; z <= reach; z += 0.25) {
      const y = islandHeight(cay, x, z)
      if (y > best.y) best = { x, z, y }
    }
  }
  const x = best.x - screenUp.x * 0.8
  const z = best.z - screenUp.z * 0.8
  const y = islandHeight(cay, x, z)
  return y > 0.2 ? new THREE.Vector3(cay.x + x, y, cay.z + z) : new THREE.Vector3(cay.x + best.x, best.y, cay.z + best.z)
}

// The overhead chart turned 45° and toned to old paper, made once
function ageChart(chart, size) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  context.translate(size / 2, size / 2)
  context.rotate(Math.PI / 4)
  context.drawImage(chart, -size / 2, -size / 2, size, size)
  const image = context.getImageData(0, 0, size, size)
  const data = image.data
  for (let i = 0; i < data.length; i += 4) {
    const grey = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11
    data[i] = Math.min(255, grey * 0.9 + 70)
    data[i + 1] = Math.min(255, grey * 0.78 + 52)
    data[i + 2] = Math.min(255, grey * 0.55 + 30)
  }
  context.putImageData(image, 0, 0)
  return canvas
}
