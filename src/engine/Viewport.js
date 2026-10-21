export class Viewport {
  constructor() {
    this.listeners = []
    this.measure()
    window.addEventListener('resize', () => {
      this.measure()
      for (const listener of this.listeners) listener(this)
    })
  }

  measure() {
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.pixelRatio = Math.min(window.devicePixelRatio, 2)
    // ?touch=1 forces the touch interface, for testing on a desktop browser
    this.forceTouch = new URLSearchParams(window.location.search).has('touch')
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || this.forceTouch
  }

  onResize(listener) {
    this.listeners.push(listener)
  }
}
