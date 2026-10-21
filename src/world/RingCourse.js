import * as THREE from 'three'
import { ringCourse } from './layout.js'
import { mesh } from './Structures.js'
import { waveHeight } from './waves.js'

const RADIUS = 2.8 // the opening the boat passes through
const TUBE = 0.26
const HEIGHT = 2 // ring centre above the sea: the bottom dips into the water
const GIVE_UP = 40 // seconds without the next ring and the run is off
const BEST_KEY = 'airupt-course-best'

const projected = new THREE.Vector3()

function readBest() {
  try {
    const best = Number.parseFloat(localStorage.getItem(BEST_KEY))
    return Number.isFinite(best) ? best : null
  } catch {
    return null
  }
}

function saveBest(best) {
  try {
    localStorage.setItem(BEST_KEY, String(best))
  } catch {
    // Private mode: the best time just isn't remembered
  }
}

const format = seconds => `${seconds.toFixed(1)} s`

// A ring standing on the water in painted stripes, facing along `normal`
function createRing(colors) {
  const geometry = new THREE.TorusGeometry(RADIUS + TUBE, TUBE, 8, 36).toNonIndexed()
  geometry.deleteAttribute('uv')
  const position = geometry.attributes.position
  const values = new Float32Array(position.count * 3)
  const color = new THREE.Color()
  // Twelve stripes round the ring, picked by each triangle's angle
  for (let i = 0; i < position.count; i += 3) {
    const x = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3
    const y = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3
    const stripe = Math.floor(((Math.atan2(y, x) / (Math.PI * 2) + 1) % 1) * 12)
    color.set(colors[stripe % 2])
    for (let k = 0; k < 3; k++) color.toArray(values, (i + k) * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3))
  return mesh([geometry])
}

// A lap of rings round the home island. Sail through the chequered one to
// start the clock, then each ring in turn (the next one glows, and an arrow
// at the screen edge points to it when it is out of view), and back through
// the chequered one to finish. The best time is kept in this browser.
export class RingCourse {
  constructor(app, logbook) {
    this.app = app
    this.logbook = logbook
    this.best = readBest()
    this.state = 'idle'
    this.time = 0

    this.rings = ringCourse.map(([x, z], index) => {
      const [px, pz] = ringCourse[(index - 1 + ringCourse.length) % ringCourse.length]
      const [nx, nz] = ringCourse[(index + 1) % ringCourse.length]
      const normal = new THREE.Vector3(nx - px, 0, nz - pz).normalize()
      const model = createRing(index === 0 ? ['#f4f1ea', '#1d2433'] : ['#e8543a', '#f4f1ea'])
      model.position.set(x, HEIGHT, z)
      model.rotation.y = Math.atan2(normal.x, normal.z)
      app.scene.add(model)
      return { x, z, normal, model, side: 0 }
    })

    // The glow round whichever ring is next
    this.halo = new THREE.Mesh(
      new THREE.TorusGeometry(RADIUS + TUBE * 2.2, 0.1, 6, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb84a').multiplyScalar(3) })
    )

    this.hud = document.querySelector('#course')
    this.label = this.hud.querySelector('.course-label')
    this.share = this.hud.querySelector('.course-share')
    this.arrow = document.querySelector('#course-arrow')
    this.share.addEventListener('click', () => this.shareTime())
    this.setNext(0)
  }

  setNext(index) {
    this.next = index
    this.rings[index].model.add(this.halo)
    for (const ring of this.rings) ring.side = 0
  }

  update(delta) {
    const boat = this.app.world.boat.object.position
    const time = this.app.physics.renderTime
    for (const ring of this.rings) ring.model.position.y = HEIGHT + waveHeight(ring.x, ring.z, time) * 0.6
    this.halo.scale.setScalar(1 + Math.sin(this.app.physics.renderTime * 4) * 0.04)

    // A jump (map travel, a respawn) calls the run off
    const jumped = this.last && this.last.distanceTo(boat) > 8
    this.last ??= new THREE.Vector3()
    this.last.copy(boat)

    if (this.state === 'running') {
      this.time += delta
      this.sinceRing += delta
      if (jumped || this.sinceRing > GIVE_UP) return this.stop()
      this.label.textContent = `Ring ${this.next === 0 ? this.rings.length : this.next} of ${this.rings.length} · ${format(this.time)}`
    }

    if (this.passed(this.rings[this.next], boat)) {
      if (this.state !== 'running') this.begin()
      else if (this.next === 0) this.finish()
      else this.ringPassed()
    }
    this.updateArrow()
  }

  // Through the ring's opening in the direction of the lap
  passed(ring, boat) {
    const dx = boat.x - ring.x
    const dz = boat.z - ring.z
    const along = dx * ring.normal.x + dz * ring.normal.z
    const across = Math.abs(dx * ring.normal.z - dz * ring.normal.x)
    const side = Math.sign(along)
    const through = ring.side < 0 && side > 0 && across < RADIUS - 0.2
    ring.side = Math.hypot(dx, dz) < 8 ? side : 0
    return through
  }

  begin() {
    this.state = 'running'
    this.time = 0
    this.sinceRing = 0
    this.hud.hidden = false
    this.share.hidden = true
    clearTimeout(this.hideTimer)
    this.app.sounds.bell(0.2, null, { pitch: 660 })
    this.setNext(1)
  }

  ringPassed() {
    this.sinceRing = 0
    this.app.sounds.bell(0.18, null, { pitch: 660 * Math.pow(2, this.next / 12) })
    this.setNext((this.next + 1) % this.rings.length)
  }

  finish() {
    const record = this.best === null || this.time < this.best
    if (record) {
      this.best = this.time
      saveBest(this.time)
    }
    this.result = this.time
    this.label.textContent = record ? `${format(this.time)} · best time!` : `${format(this.time)} · best ${format(this.best)}`
    this.share.hidden = false
    this.share.textContent = 'Share'
    this.app.sounds.fanfare(0.2)
    this.logbook.record('course')
    this.state = 'idle'
    this.setNext(0)
    this.hideTimer = setTimeout(() => (this.hud.hidden = true), 9000)
  }

  stop() {
    this.state = 'idle'
    this.hud.hidden = true
    this.setNext(0)
  }

  async shareTime() {
    const text = `I sailed the ring course on airupt.dev in ${format(this.result)}. Can you beat it?`
    const url = 'https://airupt.dev'
    try {
      if (navigator.share) {
        await navigator.share({ text, url })
        return
      }
      await navigator.clipboard.writeText(`${text} ${url}`)
      this.share.textContent = 'Copied!'
    } catch {
      // Sharing was cancelled or isn't allowed here
    }
  }

  // While running, an arrow at the edge of the screen points to the next
  // ring whenever it is out of view
  updateArrow() {
    if (this.state !== 'running') {
      this.arrow.hidden = true
      return
    }
    const ring = this.rings[this.next]
    const camera = this.app.cameraRig.camera
    projected.set(ring.x, HEIGHT, ring.z).project(camera)
    const { width, height } = this.app.viewport
    let x = projected.x
    let y = projected.y
    if (projected.z > 1) {
      x = -x
      y = -y
    }
    const inView = projected.z < 1 && Math.abs(x) < 0.9 && Math.abs(y) < 0.85
    this.arrow.hidden = inView
    if (inView) return
    // Pushed out to the edge along the direction from the centre
    const scale = 1 / Math.max(Math.abs(x) / 0.88, Math.abs(y) / 0.8)
    const left = (x * scale * 0.5 + 0.5) * width
    const top = (-y * scale * 0.5 + 0.5) * height
    const angle = Math.atan2(-y, x)
    this.arrow.style.transform = `translate(${left}px, ${top}px) translate(-50%, -50%) rotate(${angle}rad)`
  }
}
