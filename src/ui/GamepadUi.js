const FOCUSABLE = 'button, a[href], input'
const SCROLL_SPEED = 900 // pixels a second with the right stick pushed all the way

// Menus by gamepad: the D-pad (or left stick) moves a visible focus through
// whatever is open, A presses it, B goes back and the right stick scrolls.
// Covers the loader, the panel, the map, the log and the page view; photo
// mode handles its own buttons. The focus only shows while a gamepad is in
// use, and goes away again as soon as the mouse or keyboard is.
export class GamepadUi {
  constructor(app) {
    this.app = app
    app.inputs.onUi(name => this.press(name))
    const calm = () => document.body.classList.remove('is-gamepad')
    window.addEventListener('pointermove', calm)
    window.addEventListener('keydown', calm)
  }

  // What the gamepad is talking to right now, if anything
  get container() {
    const dialog = document.querySelector('dialog[open]')
    if (dialog) return dialog
    if (this.app.overlay.isClassicOpen) return document.querySelector('.classic')
    if (!this.app.overlay.started) return document.querySelector('#loader')
    return null
  }

  press(name) {
    if (this.app.photo?.active) return
    const container = this.container
    if (!container) return
    document.body.classList.add('is-gamepad')
    const focused = container.contains(document.activeElement) && document.activeElement.matches(FOCUSABLE) ? document.activeElement : null

    if (name === 'A') {
      // On the loader A sets sail even before anything has been focused
      ;(focused ?? container.querySelector('#start'))?.click()
    } else if (name === 'B') {
      this.back(container)
    } else if (name === 'UP' || name === 'LEFT') {
      this.move(container, focused, -1)
    } else if (name === 'DOWN' || name === 'RIGHT') {
      this.move(container, focused, 1)
    } else if ((name === 'VIEW' && container.id === 'map') || (name === 'MENU' && container.id === 'logbook')) {
      // The button that opened it closes it again
      container.close()
    }
  }

  back(container) {
    if (container.tagName === 'DIALOG') container.close()
    else if (container.classList.contains('classic') && !container.classList.contains('is-fallback')) this.app.overlay.hideClassic()
  }

  move(container, focused, step) {
    const items = [...container.querySelectorAll(FOCUSABLE)].filter(item => item.offsetParent !== null && !item.disabled)
    if (!items.length) return
    const index = focused ? items.indexOf(focused) : step > 0 ? -1 : items.length
    const next = items[(index + step + items.length) % items.length]
    next.focus({ preventScroll: true })
    next.scrollIntoView({ block: 'nearest' })
  }

  // The right stick scrolls whatever is long enough to scroll
  update(delta) {
    const amount = this.app.inputs.pad.ry
    if (!amount || this.app.photo?.active) return
    const container = this.container
    if (!container) return
    const scroller = [container, ...container.querySelectorAll('.panel-body, .map-layout, .logbook-body')].find(
      element => element.scrollHeight > element.clientHeight + 1 && getComputedStyle(element).overflowY !== 'visible'
    )
    if (scroller) scroller.scrollTop += amount * SCROLL_SPEED * delta
  }
}
