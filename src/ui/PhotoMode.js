// Photo mode: the interface steps aside, the day stands still at whatever
// light you pick, and the shutter saves the view as a picture with a small
// airupt.dev mark (on phones it opens the share sheet instead)
export class PhotoMode {
  constructor(app) {
    this.app = app
    this.active = false
    this.bar = document.querySelector('#photo-bar')
    this.time = this.bar.querySelector('#photo-time')
    this.zoom = this.bar.querySelector('#photo-zoom')
    this.flash = document.querySelector('#photo-flash')

    document.querySelector('#open-photo').addEventListener('click', () => this.enter())
    this.bar.querySelector('#photo-shutter').addEventListener('click', () => this.capture())
    this.bar.querySelector('#photo-exit').addEventListener('click', () => this.exit())
    // P both opens and closes it, so it is handled here rather than as an
    // input action (one key press would otherwise do both)
    window.addEventListener('keydown', event => {
      if (!this.active) {
        if (event.code === 'KeyP' && app.inputs.enabled && !event.target.closest?.('input, textarea')) this.enter()
        return
      }
      if (event.code === 'Escape' || event.code === 'KeyP') this.exit()
      else if (event.code === 'Space' || event.code === 'Enter') {
        if (event.target.closest?.('button')) return
        event.preventDefault()
        this.capture()
      }
    })

    this.time.addEventListener('input', () => (app.world.dayCycle.progress = Number(this.time.value)))
    this.zoom.addEventListener('input', () => app.cameraRig.zoomTo(Number(this.zoom.value)))
  }

  enter() {
    if (this.active || !this.app.overlay.started || document.querySelector('dialog[open]')) return
    this.active = true
    const { dayCycle } = this.app.world
    this.speed = dayCycle.speed
    dayCycle.speed = 0
    this.time.value = String(dayCycle.progress)
    const { limits } = this.app.cameraRig
    this.zoom.min = String(limits.min)
    this.zoom.max = String(limits.max)
    this.zoom.value = String(this.app.cameraRig.targetDistance)
    document.body.classList.add('is-photo')
    this.bar.hidden = false
    this.app.overlay.setSailing(false)
    this.bar.querySelector('#photo-shutter').focus({ preventScroll: true })
  }

  exit() {
    if (!this.active) return
    this.active = false
    this.app.world.dayCycle.speed = this.speed
    document.body.classList.remove('is-photo')
    this.bar.hidden = true
    this.app.overlay.setSailing(true)
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
    const file = new File([blob], 'airupt-dev.png', { type: 'image/png' })
    const touch = app.viewport.isTouch
    if (touch && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: 'Sailing round airupt.dev' })
        return
      } catch {
        // Cancelled: fall back to saving it
      }
    }
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'airupt-dev.png'
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 4000)
  }

  // The round avatar and the address in the lower right corner
  async stamp(context, width, height) {
    const size = Math.round(Math.min(width, height) * 0.045)
    const margin = Math.round(size * 0.6)
    const font = `800 ${Math.round(size * 0.62)}px "Bricolage Grotesque", system-ui, sans-serif`
    context.font = font
    const text = 'airupt.dev'
    const textWidth = context.measureText(text).width
    const x = width - margin - textWidth
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
    if (this.avatar) context.drawImage(this.avatar, x - size - size * 0.3, y - size / 2, size, size)
    context.fillStyle = '#fffaf0'
    context.textBaseline = 'middle'
    context.fillText(text, x, y)
    context.restore()
  }
}
