import { keyFor } from '../engine/bindings.js'

// Photo mode: the interface steps aside and the camera is yours. Turn it
// round and tilt it down to the waves, move it across the water, zoom, pick
// the light, soften or sharpen the miniature blur, hide the boat, lay a
// framing grid over the view. The shutter shows the picture with Save and
// Share, and a small airupt.dev mark in its corner. Every control works
// with the mouse, touch, the keyboard and a gamepad (see bindings.js).
const TILT = { min: Math.PI * 0.1, max: Math.PI * 0.44 }
const BLUR_STEP = 1.5
// The light buttons in order, at these times of day (see DayCycle)
const LIGHTS = [0.93, 0.25, 0.45, 0.5, 0.72]
// How far from the middle of the world the camera may wander, in metres
const ROAM = 110
export class PhotoMode {
  constructor(app) {
    this.app = app
    this.active = false
    this.held = new Set()
    this.pointers = new Map()
    this.bar = document.querySelector('#photo-bar')
    this.hint = this.bar.querySelector('.photo-hint')
    this.lights = [...this.bar.querySelectorAll('[data-light]')]
    this.zoom = this.bar.querySelector('#photo-zoom')
    this.blur = this.bar.querySelector('#photo-blur')
    this.boatButton = this.bar.querySelector('#photo-boat')
    this.gridButton = this.bar.querySelector('#photo-grid')
    this.grid = document.querySelector('#photo-grid-lines')
    this.flash = document.querySelector('#photo-flash')
    this.preview = document.querySelector('#photo-preview')
    this.shareButton = this.preview.querySelector('[data-share]')

    document.querySelector('#open-photo').addEventListener('click', () => this.enter())
    app.inputs.on('photo', () => this.enter())
    this.bar.querySelector('#photo-shutter').addEventListener('click', () => this.capture())
    this.bar.querySelector('#photo-reset').addEventListener('click', () => this.resetView())
    this.bar.querySelector('#photo-exit').addEventListener('click', () => this.exit())
    this.lights.forEach((button, index) => button.addEventListener('click', () => this.setLight(index)))
    this.boatButton.addEventListener('click', () => this.toggleBoat())
    this.gridButton.addEventListener('click', () => this.toggleGrid())
    this.preview.querySelector('[data-save]').addEventListener('click', () => this.save())
    this.shareButton.addEventListener('click', () => this.share())
    this.preview.querySelector('[data-close]').addEventListener('click', () => this.closePreview())

    // The zoom slider runs from far on the left to near on the right
    this.zoom.addEventListener('input', () => {
      const { min, max } = app.cameraRig.limits
      app.cameraRig.zoomTo(max - Number(this.zoom.value) * (max - min))
    })
    this.blur.addEventListener('input', () => this.setBlur(Number(this.blur.value)))

    // P both opens and closes it, so it is handled here rather than as an
    // input action (one key press would otherwise do both)
    window.addEventListener('keydown', event => this.keydown(event))
    window.addEventListener('keyup', event => this.held.delete(event.code))
    window.addEventListener('blur', () => this.held.clear())
    app.inputs.onUi(name => this.button(name))

    // On the scene: drag to turn, right-drag (or shift-drag) to move, and
    // two fingers to move and pinch to zoom
    const canvas = app.renderer.domElement
    canvas.addEventListener('contextmenu', event => this.active && event.preventDefault())
    canvas.addEventListener('pointerdown', event => {
      if (!this.active) return
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, moves: event.button === 2 || event.shiftKey })
      canvas.setPointerCapture(event.pointerId)
    })
    canvas.addEventListener('pointermove', event => this.drag(event))
    const release = event => this.pointers.delete(event.pointerId)
    canvas.addEventListener('pointerup', release)
    canvas.addEventListener('pointercancel', release)
  }

  enter() {
    // Only from sailing: not over the loader, a dialog or the page view
    if (this.active || !this.app.inputs.enabled) return
    this.active = true
    const { world, cameraRig: rig, inputs, postProcessing } = this.app
    // Time stands still, and goes back to where it was afterwards
    this.speed = world.dayCycle.speed
    this.progress = world.dayCycle.progress
    this.usualBlur = postProcessing.finish.uniforms.uBlur.value
    world.dayCycle.speed = 0
    // The opening shot holds the zoom while it lasts; it lets go here and
    // picks up again afterwards, as does the zoom the visitor sails with
    this.establishing = rig.establishing
    this.distance = rig.targetDistance
    rig.establishing = null
    rig.orbit = { ...rig.angles }
    // The left stick moves the camera here rather than stepping through buttons
    inputs.stickMenus = false
    this.showLight()
    this.setBlur(this.usualBlur)
    document.body.classList.add('is-photo')
    this.bar.hidden = false
    this.app.overlay.setSailing(false)
    this.showHint()
    // Keys work from anywhere; the bar takes focus without lighting up a tooltip
    this.bar.focus({ preventScroll: true })
  }

  exit() {
    if (!this.active) return
    this.active = false
    this.closePreview()
    const { world, cameraRig: rig, inputs } = this.app
    world.dayCycle.speed = this.speed
    world.dayCycle.progress = this.progress
    rig.orbit = null
    rig.pan.set(0, 0, 0)
    rig.establishing = this.establishing
    rig.zoomTo(this.distance)
    inputs.stickMenus = true
    this.setBlur(this.usualBlur)
    if (!world.boat.object.visible) this.toggleBoat()
    if (!this.grid.hidden) this.toggleGrid()
    this.pointers.clear()
    this.held.clear()
    document.body.classList.remove('is-photo')
    this.bar.hidden = true
    this.app.overlay.setSailing(true)
  }

  // How it works, for whatever the visitor is holding
  showHint() {
    const device = this.app.inputs.lastDevice
    const key = action => keyFor(action, device)
    this.hint.textContent =
      device === 'touch'
        ? 'Drag to turn the camera, two fingers to move and zoom.'
        : device === 'gamepad'
          ? `${key('turn')} turns, ${key('move')} moves, ${key('zoom')} zoom. ${key('shutter')} takes the photo.`
          : `Drag or the ${key('turn').toLowerCase()} turn, right-drag or ${key('move')} moves, scroll zooms. ${key('shutter')} takes the photo.`
    this.hint.hidden = false
    clearTimeout(this.hintTimer)
    this.hintTimer = setTimeout(() => (this.hint.hidden = true), 9000)
  }

  // Every frame while shooting: held keys and the gamepad's sticks and
  // triggers move, turn and zoom, and the zoom slider follows the camera
  update(delta) {
    if (!this.active || !this.preview.hidden) return
    const { pad } = this.app.inputs
    const rig = this.app.cameraRig
    const key = code => (this.held.has(code) ? 1 : 0)
    const right = pad.lx + key('KeyD') - key('KeyA')
    const down = pad.ly + key('KeyS') - key('KeyW')
    // Faster the further out the camera is, so it always crosses the view in about the same time
    const speed = rig.distance * 0.45 * delta
    if (right || down) this.move(right * speed, down * speed)
    if (pad.rx || pad.ry) this.turn(-pad.rx * 2.2 * delta, pad.ry * 1.2 * delta)
    if (pad.lt > 0.1 || pad.rt > 0.1) this.app.cameraRig.zoomBy(Math.exp((pad.lt - pad.rt) * 1.4 * delta))

    const { min, max } = rig.limits
    const zoom = String(Math.round(((max - rig.targetDistance) / (max - min)) * 100) / 100)
    if (this.zoom.value !== zoom && document.activeElement !== this.zoom) this.zoom.value = zoom
  }

  // Moves the camera over the water by metres to the right and down the
  // screen, never further from the middle of the world than ROAM
  move(right, down) {
    const rig = this.app.cameraRig
    const { azimuth } = rig.angles
    const pan = rig.pan
    pan.x += Math.cos(azimuth) * right + Math.sin(azimuth) * down
    pan.z += Math.cos(azimuth) * down - Math.sin(azimuth) * right
    const boat = this.app.world.boat.object.position
    const x = boat.x + pan.x
    const z = boat.z + pan.z
    const reach = Math.hypot(x, z)
    if (reach > ROAM) {
      pan.x -= (x / reach) * (reach - ROAM)
      pan.z -= (z / reach) * (reach - ROAM)
    }
    this.hint.hidden = true
  }

  turn(azimuth, polar) {
    const orbit = this.app.cameraRig.orbit
    orbit.azimuth += azimuth
    orbit.polar = Math.min(Math.max(orbit.polar + polar, TILT.min), TILT.max)
    this.hint.hidden = true
  }

  setLight(index) {
    this.light = (index + LIGHTS.length) % LIGHTS.length
    this.app.world.dayCycle.progress = LIGHTS[this.light]
    this.showLight()
  }

  // The button nearest the time of day is the one lit up
  showLight() {
    const progress = this.app.world.dayCycle.progress
    const gap = time => Math.min(Math.abs(time - progress), 1 - Math.abs(time - progress))
    this.light = LIGHTS.reduce((best, time, index) => (gap(time) < gap(LIGHTS[best]) ? index : best), 0)
    this.lights.forEach((button, index) => button.setAttribute('aria-pressed', String(index === this.light)))
  }

  setBlur(value) {
    const blur = Math.min(Math.max(value, Number(this.blur.min)), Number(this.blur.max))
    this.app.postProcessing.finish.uniforms.uBlur.value = blur
    this.blur.value = String(blur)
  }

  toggleBoat() {
    const boat = this.app.world.boat.object
    boat.visible = !boat.visible
    this.boatButton.setAttribute('aria-pressed', String(boat.visible))
  }

  toggleGrid() {
    this.grid.hidden = !this.grid.hidden
    this.gridButton.setAttribute('aria-pressed', String(!this.grid.hidden))
  }

  resetView() {
    const rig = this.app.cameraRig
    rig.orbit = rig.defaultAngles
    rig.pan.set(0, 0, 0)
  }

  keydown(event) {
    // A held key repeats only what can go on and on: turning, light, zoom, blur
    const repeats = /^(Arrow|Bracket|Equal|Minus|Key[QE]$)/.test(event.code) || /^[[\]=+\-_]$/.test(event.key)
    if (event.repeat && !repeats) return
    if (!this.active) {
      if (event.code === 'KeyP' && !event.target.closest?.('input, textarea')) this.enter()
      return
    }
    if (!this.preview.hidden) {
      if (event.code === 'Escape') this.closePreview()
      else if (event.code === 'KeyS') this.save()
      else if (event.code === 'KeyD' && !this.shareButton.hidden) this.share()
      return
    }
    // By the key's place or its character, whichever the keyboard gives
    const is = (code, ...keys) => event.code === code || keys.includes(event.key)
    const onSlider = event.target.closest?.('input')
    const turn = { ArrowLeft: [0.12, 0], ArrowRight: [-0.12, 0], ArrowUp: [0, -0.06], ArrowDown: [0, 0.06] }[event.code]
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) this.held.add(event.code)
    else if (event.code === 'Escape' || event.code === 'KeyP') this.exit()
    else if (turn && !onSlider) {
      event.preventDefault()
      this.turn(...turn)
    } else if (is('BracketRight', ']')) this.setLight(this.light + 1)
    else if (is('BracketLeft', '[')) this.setLight(this.light - 1)
    else if (is('Equal', '=', '+')) this.app.cameraRig.zoomBy(1 / 1.12)
    else if (is('Minus', '-', '_')) this.app.cameraRig.zoomBy(1.12)
    else if (event.code === 'KeyE') this.setBlur(Number(this.blur.value) + BLUR_STEP)
    else if (event.code === 'KeyQ') this.setBlur(Number(this.blur.value) - BLUR_STEP)
    else if (event.code === 'KeyH') this.toggleBoat()
    else if (event.code === 'KeyG') this.toggleGrid()
    else if (event.code === 'KeyR') this.resetView()
    else if ((event.code === 'Space' || event.code === 'Enter') && !event.target.closest?.('button')) {
      event.preventDefault()
      this.capture()
    }
  }

  // Gamepad buttons (sticks and triggers are read every frame in update)
  button(name) {
    if (!this.active) return
    if (!this.preview.hidden) {
      if (name === 'A') this.save()
      else if (name === 'X' && !this.shareButton.hidden) this.share()
      else if (name === 'B') this.closePreview()
      return
    }
    if (name === 'A') this.capture()
    else if (name === 'B') this.exit()
    else if (name === 'X') this.toggleBoat()
    else if (name === 'Y') this.resetView()
    else if (name === 'RB') this.toggleGrid()
    else if (name === 'LEFT' || name === 'RIGHT') this.setLight(this.light + (name === 'RIGHT' ? 1 : -1))
    else if (name === 'UP' || name === 'DOWN') this.setBlur(Number(this.blur.value) + (name === 'UP' ? BLUR_STEP : -BLUR_STEP))
  }

  drag(event) {
    const last = this.pointers.get(event.pointerId)
    if (!this.active || !last) return
    const rig = this.app.cameraRig
    const dx = event.clientX - last.x
    const dy = event.clientY - last.y
    // Metres of water per pixel where the camera looks, so the ground stays under the pointer
    const metres = (2 * rig.distance * Math.tan((rig.camera.fov * Math.PI) / 360)) / this.app.viewport.height
    const grab = (x, y) => this.move(-x * metres, (-y * metres) / Math.cos(rig.angles.polar))
    if (this.pointers.size === 1) {
      if (last.moves) grab(dx, dy)
      else this.turn(-dx * 0.006, -dy * 0.004)
    } else if (this.pointers.size === 2) {
      const [other] = [...this.pointers].filter(([id]) => id !== event.pointerId).map(([, pointer]) => pointer)
      const before = Math.hypot(last.x - other.x, last.y - other.y)
      const after = Math.hypot(event.clientX - other.x, event.clientY - other.y)
      if (before > 0 && after > 0) this.app.cameraRig.zoomBy(before / after)
      // The middle of the two fingers moves half as far as this one did
      grab(dx / 2, dy / 2)
    }
    this.pointers.set(event.pointerId, { ...last, x: event.clientX, y: event.clientY })
  }

  async capture() {
    const { app } = this
    // Draw a fresh frame and copy it straight away, before the browser
    // clears the canvas for the next one
    app.postProcessing.render(0)
    const source = app.renderer.domElement
    const canvas = document.createElement('canvas')
    canvas.width = source.width
    canvas.height = source.height
    const context = canvas.getContext('2d')
    context.drawImage(source, 0, 0)
    await this.stamp(context, canvas.width, canvas.height)

    this.flash.classList.remove('is-active')
    void this.flash.offsetWidth // restart the animation
    this.flash.classList.add('is-active')
    app.sounds.play('click', 0.6, 0.8)
    app.world.logbook?.record('photo')

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob || !this.active) return
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = URL.createObjectURL(blob)
    this.file = new File([blob], 'airupt-dev.png', { type: 'image/png' })
    this.preview.querySelector('img').src = this.url
    this.shareButton.hidden = !navigator.canShare?.({ files: [this.file] })
    this.preview.hidden = false
    document.body.classList.add('is-previewing')
    this.preview.querySelector('[data-save]').focus({ preventScroll: true })
  }

  save() {
    const link = document.createElement('a')
    link.href = this.url
    link.download = 'airupt-dev.png'
    link.click()
  }

  async share() {
    try {
      await navigator.share({ files: [this.file], text: 'Sailing round airupt.dev' })
    } catch {
      // Cancelled, or sharing files isn't allowed here
    }
  }

  closePreview() {
    this.preview.hidden = true
    document.body.classList.remove('is-previewing')
    if (this.active) this.bar.focus({ preventScroll: true })
  }

  // The round avatar and the address in the lower right corner
  async stamp(context, width, height) {
    const size = Math.round(Math.min(width, height) * 0.045)
    const margin = Math.round(size * 0.6)
    context.font = `800 ${Math.round(size * 0.62)}px "Bricolage Grotesque", system-ui, sans-serif`
    const text = 'airupt.dev'
    const x = width - margin - context.measureText(text).width
    const y = height - margin - size / 2

    this.avatar ??= await new Promise(resolve => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => resolve(null)
      image.src = '/avatar.png'
    })
    context.save()
    context.shadowColor = 'rgb(8 22 44 / 0.6)'
    context.shadowBlur = size * 0.4
    if (this.avatar) context.drawImage(this.avatar, x - size * 1.3, y - size / 2, size, size)
    context.fillStyle = '#fffaf0'
    context.textBaseline = 'middle'
    context.fillText(text, x, y)
    context.restore()
  }
}
