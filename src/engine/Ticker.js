// Calls registered callbacks once per frame, lowest order first.
export class Ticker {
  constructor() {
    this.callbacks = []
    this.delta = 1 / 60
    this.elapsed = 0
    this.last = 0
    this.loop = this.loop.bind(this)
  }

  add(callback, order = 0) {
    this.callbacks.push({ callback, order })
    this.callbacks.sort((a, b) => a.order - b.order)
  }

  start() {
    this.last = performance.now()
    requestAnimationFrame(this.loop)
  }

  loop(now) {
    // Clamp so returning to a background tab doesn't produce one huge step
    this.delta = Math.min((now - this.last) / 1000, 0.1)
    this.last = now
    this.elapsed += this.delta
    for (const { callback } of this.callbacks) callback(this.delta, this.elapsed)
    requestAnimationFrame(this.loop)
  }
}
