// Two levels. "low" drops bloom, renders at 1× pixel ratio and uses a
// smaller shadow map. Touch devices and small CPUs start low; anyone whose
// frame rate sags for a few seconds is moved down automatically.
// `?quality=low` or `?quality=high` in the URL forces a level.
export class Quality {
  constructor(app) {
    this.app = app
    const forced = new URLSearchParams(window.location.search).get('quality')
    this.forced = forced === 'low' || forced === 'high'
    const weak = app.viewport.isTouch || (navigator.hardwareConcurrency ?? 8) <= 4
    this.level = this.forced ? forced : weak ? 'low' : 'high'

    this.sampleTime = 0
    this.sampleFrames = 0
    this.slowWindows = 0
  }

  get pixelRatioCap() {
    return this.level === 'high' ? 1.5 : 1
  }

  apply() {
    const { app } = this
    app.postProcessing.bloom.enabled = this.level === 'high'
    const shadow = app.world.sky.sun.shadow
    const size = this.level === 'high' ? 2048 : 1024
    if (shadow.mapSize.x !== size) {
      shadow.mapSize.set(size, size)
      shadow.map?.dispose()
      shadow.map = null
    }
    app.resize()
  }

  // Called every frame once the visit has started
  update(delta) {
    if (this.forced || this.level === 'low') return
    this.sampleTime += delta
    this.sampleFrames++
    if (this.sampleTime < 2) return

    const fps = this.sampleFrames / this.sampleTime
    this.sampleTime = 0
    this.sampleFrames = 0
    this.slowWindows = fps < 40 ? this.slowWindows + 1 : 0
    if (this.slowWindows >= 2) {
      this.level = 'low'
      this.apply()
    }
  }
}
