import * as THREE from 'three'
import { arch, ringCourse } from './layout.js'
import { courseGates, throughGate } from './gates.js'
import { createLightColumn } from './lightColumn.js'
import { mesh } from './Structures.js'
import { waveHeight } from './waves.js'

const RADIUS = 3.3 // the opening the boat passes through
const TUBE = 0.26
const HEIGHT = 2 // ring centre above the sea: the bottom dips into the water
const SINK = 7 // how far a passed ring sinks: right under, out of sight
const GIVE_UP = 40 // seconds without the next gate and the run is off
const BEST_KEY = 'airupt-course-best'
const GOLD = '#ffb84a'

const projected = new THREE.Vector3()
const dummy = new THREE.Object3D()
const point = new THREE.Vector3()

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

// A ring's geometry, painted in twelve stripes of two colours
function createRingGeometry(colors) {
  const geometry = new THREE.TorusGeometry(RADIUS + TUBE, TUBE, 8, 36).toNonIndexed()
  geometry.deleteAttribute('uv')
  const position = geometry.attributes.position
  const values = new Float32Array(position.count * 3)
  const color = new THREE.Color()
  for (let i = 0; i < position.count; i += 3) {
    const x = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3
    const y = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3
    const stripe = Math.floor(((Math.atan2(y, x) / (Math.PI * 2) + 1) % 1) * 12)
    color.set(colors[stripe % 2])
    for (let k = 0; k < 3; k++) color.toArray(values, (i + k) * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3))
  return geometry
}

// A chevron pointing along +Z, made of two bars meeting at the tip
function createChevron() {
  const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD).multiplyScalar(2.6) })
  const group = new THREE.Group()
  for (const side of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 1.5), material)
    bar.position.set(side * 0.5, 0, -0.1)
    bar.rotation.y = side * -0.8
    group.add(bar)
  }
  return group
}

// A lap of the whole archipelago (see layout.js). Sail through the
// chequered ring to start the clock. The next gate glows gold with a chevron
// over it and a column of light that shows from far off; when it is out of
// view an arrow at the screen edge points to it. Rings you pass sink away.
// Back through the chequered ring finishes; the best time is kept.
export class RingCourse {
  constructor(app, logbook) {
    this.app = app
    this.logbook = logbook
    this.best = readBest()
    this.state = 'idle'
    this.time = 0

    // Clipping the ring itself still counts: at speed, near enough is good
    this.gates = courseGates(ringCourse, arch, RADIUS + TUBE).map(gate => ({ ...gate, side: 0, sink: 0, passed: false }))
    const rings = this.gates.filter(gate => gate.kind === 'ring')
    rings.forEach((gate, index) => (gate.instance = index))

    // The chequered start on its own, the striped rings in one draw call, and
    // the gold one standing in for whichever ring is next
    this.start = mesh([createRingGeometry(['#f4f1ea', '#1d2433'])])
    const striped = mesh([createRingGeometry(['#e8543a', '#f4f1ea'])])
    this.striped = new THREE.InstancedMesh(striped.geometry, striped.material, rings.length)
    this.striped.castShadow = true
    this.striped.receiveShadow = true
    this.glowing = new THREE.Mesh(
      createRingGeometry([GOLD, '#fff6dc']),
      new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.8, 1.8, 1.8) })
    )
    this.chevron = createChevron()
    this.chevron.scale.setScalar(1.25)
    const column = createLightColumn(GOLD, { radius: 2.2, base: 3.2, height: 26 })
    this.column = column.mesh
    this.columnMaterial = column.material
    app.scene.add(this.start, this.striped, this.glowing, this.chevron, this.column)

    this.hud = document.querySelector('#course')
    this.label = this.hud.querySelector('.course-label')
    this.share = this.hud.querySelector('.course-share')
    this.arrow = document.querySelector('#course-arrow')
    this.share.addEventListener('click', () => this.shareTime())

    this.next = 0
    this.pulse = 0
    // Placed once now so the instanced rings get bounds that cover them all
    this.place(0, 0)
    this.striped.computeBoundingSphere()
  }

  get target() {
    return this.gates[this.next]
  }

  // Each ring rides the swell, passed ones sink away; the next gate glows
  place(time, delta) {
    const target = this.target
    for (const gate of this.gates) {
      if (gate.kind === 'arch') continue
      gate.sink += ((gate.passed ? 1 : 0) - gate.sink) * (1 - Math.exp(-(gate.passed ? 3 : 1.5) * delta))
      const glowing = gate === target
      dummy.position.set(gate.x, HEIGHT + waveHeight(gate.x, gate.z, time) * 0.6 - gate.sink * SINK, gate.z)
      dummy.rotation.set(0, Math.atan2(gate.normal.x, gate.normal.z), 0)
      dummy.scale.setScalar(glowing && gate.kind === 'ring' ? 0 : 1 - gate.sink * 0.25)
      dummy.updateMatrix()
      if (gate.kind === 'start') {
        this.start.position.copy(dummy.position)
        this.start.rotation.copy(dummy.rotation)
      } else {
        this.striped.setMatrixAt(gate.instance, dummy.matrix)
      }
      if (glowing) {
        this.glowing.position.copy(dummy.position)
        this.glowing.rotation.copy(dummy.rotation)
      }
    }
    this.striped.instanceMatrix.needsUpdate = true

    // The gold ring pops as it becomes the next one, and sits just outside
    // the start ring when the start is what's next
    this.pulse = Math.max(this.pulse - delta * 2.5, 0)
    const pop = 1 + this.pulse * 0.25 + Math.sin(time * 4) * 0.03
    this.glowing.visible = target.kind !== 'arch'
    this.glowing.scale.setScalar(target.kind === 'start' ? pop * 1.08 : pop)

    // The chevron floats over the gate (over the arch's top there, where the
    // camera can see it), pointing the way through
    const lift = target.kind === 'arch' ? 7.4 : HEIGHT + RADIUS + 1.6
    this.chevron.position.set(target.x, lift + Math.sin(time * 3) * 0.25, target.z)
    this.chevron.rotation.set(0, Math.atan2(target.normal.x, target.normal.z), 0)

    // The light column fades as you come close, so it never stands in the way
    this.column.position.set(target.x, 0, target.z)
    const boat = this.app.world.boat.object.position
    const distance = Math.hypot(boat.x - target.x, boat.z - target.z)
    this.columnMaterial.uniforms.uStrength.value = 0.6 * THREE.MathUtils.clamp((distance - 12) / 25, 0, 1)
  }

  update(delta) {
    // Kept out of the opening shot: the course appears once you set sail
    const shown = this.app.overlay.started
    this.start.visible = this.striped.visible = this.chevron.visible = this.column.visible = shown
    if (!shown) {
      this.glowing.visible = false
      return
    }
    const boat = this.app.world.boat.object.position
    this.place(this.app.physics.renderTime, delta)
    // Photo mode stops the clock with everything else
    if (this.app.photo?.active) return

    // A jump (map travel, a respawn) calls the run off
    const jumped = this.last && this.last.distanceTo(boat) > 8
    this.last ??= new THREE.Vector3()
    this.last.copy(boat)

    if (this.state === 'running') {
      this.time += delta
      this.sinceGate += delta
      if (jumped || this.sinceGate > GIVE_UP) return this.stop()
      const gate = this.next === 0 ? this.gates.length : this.next
      this.show(`Gate ${gate} of ${this.gates.length} · ${format(this.time)}`)
    }

    const target = this.target
    const { through, side } = throughGate(target, boat.x, boat.z, target.side, target.kind === 'arch' ? 10 : 8)
    target.side = side
    if (through) {
      if (this.state !== 'running') this.begin()
      else if (this.next === 0) this.finish()
      else this.passGate()
    }
    this.updateArrow()
  }

  // Only touch the page when the text actually changes
  show(text) {
    if (text === this.shown) return
    this.shown = text
    this.label.textContent = text
  }

  setNext(index) {
    this.next = index
    this.target.side = 0
    this.pulse = 1
  }

  // Spray across the gate as the boat goes through
  burst(gate) {
    const splashes = this.app.world.splashes
    for (let i = -3; i <= 3; i++) {
      point.set(gate.x + gate.normal.z * i * 0.9, 0.2, gate.z - gate.normal.x * i * 0.9)
      splashes.emit(point, new THREE.Vector3(), { count: 3, spread: 0.4, up: 2.6, size: 0.09, life: 0.8 })
    }
  }

  begin() {
    if (!this.explained) {
      this.explained = true
      this.app.overlay.toast('A lap of the whole archipelago: sail through each gold gate in turn, and back through the chequered ring to finish.', 'Ring course', { duration: 6500 })
    }
    this.state = 'running'
    this.time = 0
    this.sinceGate = 0
    this.hud.hidden = false
    this.share.hidden = true
    clearTimeout(this.hideTimer)
    for (const gate of this.gates) gate.passed = false
    this.burst(this.gates[0])
    this.app.sounds.bell(0.2, null, { pitch: 660 })
    this.setNext(1)
  }

  passGate() {
    const gate = this.target
    gate.passed = gate.kind === 'ring'
    this.sinceGate = 0
    this.burst(gate)
    this.app.sounds.bell(0.18, null, { pitch: 660 * Math.pow(2, (this.next % 12) / 12) })
    this.setNext((this.next + 1) % this.gates.length)
  }

  finish() {
    const record = this.best === null || this.time < this.best
    if (record) {
      this.best = this.time
      saveBest(this.time)
    }
    this.result = this.time
    this.show(record ? `${format(this.time)} · best time!` : `${format(this.time)} · best ${format(this.best)}`)
    this.share.hidden = false
    this.share.textContent = 'Share'
    this.burst(this.gates[0])
    this.app.sounds.fanfare(0.2)
    this.logbook.record('course')
    this.reset()
    this.hideTimer = setTimeout(() => (this.hud.hidden = true), 9000)
  }

  stop() {
    this.hud.hidden = true
    this.reset()
  }

  // Back to waiting at the start, the sunk rings rising again
  reset() {
    this.state = 'idle'
    for (const gate of this.gates) gate.passed = false
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
  // gate whenever it is out of view
  updateArrow() {
    if (this.state !== 'running') {
      this.arrow.hidden = true
      return
    }
    const target = this.target
    projected.set(target.x, HEIGHT, target.z).project(this.app.cameraRig.camera)
    const { width, height } = this.app.viewport
    // Pixels from the middle of the screen; behind the camera flips it
    const flip = projected.z > 1 ? -1 : 1
    const dx = projected.x * flip * (width / 2)
    const dy = -projected.y * flip * (height / 2)
    // The arrow keeps clear of the HUD along the top and the legend below
    const room = { x: width / 2 - 44, up: height / 2 - 100, down: height / 2 - 110 }
    const inView = flip > 0 && Math.abs(dx) < room.x && dy > -room.up && dy < room.down
    this.arrow.hidden = inView
    if (inView) return
    const scale = Math.min(room.x / Math.abs(dx || 1e-6), (dy < 0 ? room.up : room.down) / Math.abs(dy || 1e-6))
    const left = width / 2 + dx * scale
    const top = height / 2 + dy * scale
    this.arrow.style.transform = `translate(${left}px, ${top}px) translate(-50%, -50%) rotate(${Math.atan2(dy, dx)}rad)`
  }
}
