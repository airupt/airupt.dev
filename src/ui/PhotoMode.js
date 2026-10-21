// Photo mode: the interface steps aside and the camera is yours. Drag to
// swing it round the boat and tilt it (from looking straight down to skimming
// the water), scroll or pinch to zoom, and pick the light of day on a
// slider. The shutter shows the picture, with Save and Share, and a small
// airupt.dev mark in its corner.
const TILT = { min: Math.PI * 0.1, max: Math.PI * 0.44 }

export class PhotoMode {
  constructor(app) {
    this.app = app
    this.active = false
    this.bar = document.querySelector('#photo-bar')
    this.time = this.bar.querySelector('#photo-time')
    this.zoom = this.bar.querySelector('#photo-zoom')
    this.hint = this.bar.querySelector('.photo-hint')
    this.flash = document.querySelector('#photo-flash')
    this.preview = document.querySelector('#photo-preview')
    this.pointers = new Map()

    document.querySelector('#open-photo').addEventListener('click', () => this.enter())
    this.bar.querySelector('#photo-shutter').addEventListener('click', () => this.capture())
    this.bar.querySelector('#photo-reset').addEventListener('click', () => this.resetView())
    this.bar.querySelector('#photo-exit').addEventListener('click', () => this.exit())
    this.preview.querySelector('[data-save]').addEventListener('click', () => this.save())
    this.preview.querySelector('[data-share]').addEventListener('click', () => this.share())
    this.preview.querySelector('[data-close]').addEventListener('click', () => this.closePreview())

    // P both opens and closes it, so it is handled here rather than as an
    // input action (one key press would otherwise do both)
    window.addEventListener('keydown', event => {
      if (!this.active) {
        if (event.code === 'KeyP' && app.inputs.enabled && !event.target.closest?.('input, textarea')) this.enter()
        return
      }
      if (event.code === 'Escape') this.preview.hidden ? this.exit() : this.closePreview()
      else if (event.code === 'KeyP') this.exit()
      else if ((event.code === 'Space' || event.code === 'Enter') && this.preview.hidden && !event.target.closest?.('button')) {
        event.preventDefault()
        this.capture()
      }
    })

    this.time.addEventListener('input', () => (app.world.dayCycle.progress = Number(this.time.value)))
    this.zoom.addEventListener('input', () => app.cameraRig.zoomTo(Number(this.zoom.value)))

    // Dragging on the scene turns the camera; two fingers pinch to zoom
    const canvas = app.renderer.domElement
    canvas.addEventListener('pointerdown', event => {
      if (!this.active) return
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      canvas.setPointerCapture(event.pointerId)
    })
    canvas.addEventListener('pointermove', event => this.drag(event))
    const release = event => this.pointers.delete(event.pointerId)
    canvas.addEventListener('pointerup', release)
    canvas.addEventListener('pointercancel', release)
  }

  drag(event) {
    const last = this.pointers.get(event.pointerId)
    if (!this.active || !last) return
    const rig = this.app.cameraRig
    if (this.pointers.size === 1) {
      const orbit = rig.orbit
      orbit.azimuth -= (event.clientX - last.x) * 0.006
      orbit.polar = Math.min(Math.max(orbit.polar - (event.clientY - last.y) * 0.004, TILT.min), TILT.max)
      this.hideHint()
    } else if (this.pointers.size === 2) {
      const [other] = [...this.pointers].filter(([id]) => id !== event.pointerId).map(([, position]) => position)
      const before = Math.hypot(last.x - other.x, last.y - other.y)
      const after = Math.hypot(event.clientX - other.x, event.clientY - other.y)
      if (before > 0 && after > 0) {
        rig.zoomTo(rig.targetDistance * (before / after))
        this.zoom.value = String(rig.targetDistance)
      }
    }
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }

  enter() {
    if (this.active || !this.app.overlay.started || document.querySelector('dialog[open]')) return
    this.active = true
    const { dayCycle } = this.app.world
    const rig = this.app.cameraRig
    this.speed = dayCycle.speed
    dayCycle.speed = 0
    this.time.value = String(dayCycle.progress)
    this.zoom.min = String(rig.limits.min)
    this.zoom.max = String(rig.limits.max)
    this.zoom.value = String(rig.targetDistance)
    rig.orbit = { ...rig.angles }
    document.body.classList.add('is-photo')
    this.bar.hidden = false
    this.app.overlay.setSailing(false)
    // How it works, the first few times
    this.hint.hidden = false
    clearTimeout(this.hintTimer)
    this.hintTimer = setTimeout(() => this.hideHint(), 6000)
    this.bar.querySelector('#photo-shutter').focus({ preventScroll: true })
  }

  exit() {
    if (!this.active) return
    this.active = false
    this.closePreview()
    this.app.world.dayCycle.speed = this.speed
    this.app.cameraRig.orbit = null
    this.pointers.clear()
    document.body.classList.remove('is-photo')
    this.bar.hidden = true
    this.app.overlay.setSailing(true)
  }

  resetView() {
    this.app.cameraRig.orbit = this.app.cameraRig.defaultAngles
  }

  hideHint() {
    this.hint.hidden = true
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
    if (!blob) return
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = URL.createObjectURL(blob)
    this.file = new File([blob], 'airupt-dev.png', { type: 'image/png' })
    this.preview.querySelector('img').src = this.url
    this.preview.querySelector('[data-share]').hidden = !navigator.canShare?.({ files: [this.file] })
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
