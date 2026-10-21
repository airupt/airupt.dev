import { BUTTON } from './bindings.js'
import { helmToward } from './helm.js'

// KeyboardEvent.code is layout independent, so WASD also covers ZQSD on AZERTY.
const axes = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  boost: ['ShiftLeft', 'ShiftRight', 'Space'],
}

const actions = {
  interact: ['KeyE', 'Enter'],
  reset: ['KeyR'],
  map: ['KeyM'],
  log: ['KeyL'],
  sound: ['KeyN'],
  page: ['KeyV'],
  lapShare: ['KeyC'],
}
const zoomKeys = { in: ['Equal', 'NumpadAdd'], out: ['Minus', 'NumpadSubtract'] }

// Gamepad buttons that act while sailing (see bindings.js for the names)
const gamepadActions = Object.entries({
  interact: BUTTON.A,
  reset: BUTTON.Y,
  map: BUTTON.VIEW,
  log: BUTTON.MENU,
  photo: BUTTON.X,
  sound: BUTTON.LB,
  page: BUTTON.R3,
  lapShare: BUTTON.UP,
})
// Buttons passed on to menus as they are (directions repeat, see repeat())
const menuButtons = Object.entries(BUTTON).filter(([name]) => !['UP', 'DOWN', 'LEFT', 'RIGHT'].includes(name))
const DEADZONE = 0.15
// A push this firm (or any button) means the visitor has picked up the gamepad
const DELIBERATE = 0.5
// A held D-pad or stick direction repeats in menus: first after this long,
// then at this interval
const REPEAT_DELAY = 0.4
const REPEAT_EVERY = 0.12

const clamp = value => Math.min(Math.max(value, -1), 1)
const deadzone = value => (Math.abs(value) < DEADZONE ? 0 : value)

// Scratch objects for steering by stick, reused every frame
const stick = { x: 0, y: 0 }
const heading = { x: 0, z: 0 }
const screen = { up: null, right: null }

export class Inputs {
  constructor(app) {
    this.app = app
    this.enabled = false
    this.pressed = new Set()
    this.listeners = {}
    this.uiListeners = []
    // zoom: -1 to 1, in or out while held (keys, the right stick)
    this.state = { throttle: 0, steer: 0, boost: false, zoom: 0 }
    this.touch = { x: 0, y: 0, active: false, boost: false }
    // The gamepad's sticks and triggers this frame, for photo mode and menus
    this.pad = { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0 }
    this.buttonsDown = []
    this.pressedNow = []
    this.held = { UP: null, DOWN: null, LEFT: null, RIGHT: null }
    // In menus the left stick steps through buttons like the D-pad (photo
    // mode turns this off: there it moves the camera)
    this.stickMenus = true
    this.lastDevice = app.viewport.isTouch ? 'touch' : 'keyboard'

    window.addEventListener('keydown', event => this.onKey(event, true))
    window.addEventListener('keyup', event => this.onKey(event, false))
    window.addEventListener('blur', () => this.pressed.clear())
    // A click with the mouse means keyboard and mouse again, a finger on
    // the screen means touch (a laptop can have both)
    window.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') this.lastDevice = 'touch'
      else if (event.pointerType === 'mouse' && !app.viewport.forceTouch) this.lastDevice = 'keyboard'
    })

    const joystick = document.querySelector('#joystick')
    if (joystick) this.bindJoystick(joystick)
    const boost = document.querySelector('#boost')
    if (boost) this.bindBoost(boost)
  }

  on(action, callback) {
    ;(this.listeners[action] ??= []).push(callback)
  }

  emit(action) {
    if (!this.enabled) return
    for (const callback of this.listeners[action] ?? []) callback()
  }

  // Gamepad buttons while not sailing (a menu, photo mode, the page view):
  // the callback gets the button's name from bindings.js, or UP, DOWN, LEFT
  // or RIGHT from the D-pad or left stick, repeating while held
  onUi(callback) {
    this.uiListeners.push(callback)
  }

  emitUi(name) {
    for (const callback of this.uiListeners) callback(name)
  }

  onKey(event, down) {
    // Letting go always counts, even inside a panel, or the key would stay
    // held down once the panel closes
    if (!down) {
      this.pressed.delete(event.code)
      return
    }
    this.lastDevice = 'keyboard'
    // Keys typed inside the panel or classic view must not steer the boat
    if (event.target.closest?.('dialog, .classic, input, textarea')) return

    // Enter on a focused button presses that button, and only that
    const onButton = event.code === 'Enter' && event.target.closest?.('button, a')
    if (!event.repeat && !onButton) {
      for (const [action, codes] of Object.entries(actions)) {
        if (codes.includes(event.code)) this.emit(action)
      }
    }
    this.pressed.add(event.code)

    const isSteeringKey = Object.values(axes).some(codes => codes.includes(event.code))
    if (isSteeringKey && this.enabled) event.preventDefault()
  }

  isDown(axis) {
    return axes[axis].some(code => this.pressed.has(code))
  }

  update(delta) {
    let throttle = Number(this.isDown('forward')) - Number(this.isDown('backward'))
    let steer = Number(this.isDown('right')) - Number(this.isDown('left'))
    let boost = this.isDown('boost')
    let zoom = Number(zoomKeys.out.some(code => this.pressed.has(code))) - Number(zoomKeys.in.some(code => this.pressed.has(code)))

    // The first standard gamepad, or failing that any
    const gamepads = navigator.getGamepads?.() ?? []
    const gamepad = Array.prototype.find.call(gamepads, pad => pad?.mapping === 'standard') ?? Array.prototype.find.call(gamepads, Boolean)
    if (gamepad) {
      const helm = this.readGamepad(gamepad, delta)
      // The keyboard wins over a stick that drifts a little off centre
      if (helm && !throttle && !steer && !boost) ({ throttle, steer, boost } = helm)
      zoom ||= this.pad.ry
    } else if (this.padConnected) {
      // Unplugged with a stick pushed: nothing stays held
      for (const axis in this.pad) this.pad[axis] = 0
      this.buttonsDown.length = 0
    }
    this.padConnected = Boolean(gamepad)

    if (this.touch.active) {
      ;({ throttle, steer } = this.stickSteering(this.touch.x, this.touch.y))
    }
    if (this.touch.boost) {
      boost = true
      // The boost button alone still pushes ahead
      if (!this.touch.active) throttle = 1
    }

    if (!this.enabled) {
      throttle = 0
      steer = 0
      boost = false
      zoom = 0
    }

    this.state.throttle = clamp(throttle)
    this.state.steer = clamp(steer)
    this.state.boost = boost
    this.state.zoom = clamp(zoom)
  }

  // Sticks, triggers and buttons. While sailing the left stick points where
  // to go on screen (as the touch stick does), RT or RB boosts and LT backs
  // up; buttons fire their actions. Otherwise everything goes to the menus.
  readGamepad(gamepad, delta) {
    const value = index => gamepad.buttons[index]?.value ?? 0
    const down = index => Boolean(gamepad.buttons[index]?.pressed)
    const pad = this.pad
    pad.lx = deadzone(gamepad.axes[0] ?? 0)
    pad.ly = deadzone(gamepad.axes[1] ?? 0)
    pad.rx = deadzone(gamepad.axes[2] ?? 0)
    pad.ry = deadzone(gamepad.axes[3] ?? 0)
    pad.lt = value(BUTTON.LT)
    pad.rt = value(BUTTON.RT)

    // Which buttons went down since the last frame
    const pressed = this.pressedNow
    let used = pad.lx || pad.ly || pad.rx || pad.ry || pad.lt > 0.1 || pad.rt > 0.1
    let deliberate = Math.max(Math.abs(pad.lx), Math.abs(pad.ly), Math.abs(pad.rx), Math.abs(pad.ry), pad.lt, pad.rt) > DELIBERATE
    for (let index = 0; index < gamepad.buttons.length; index++) {
      const isDown = down(index)
      pressed[index] = isDown && !this.buttonsDown[index]
      this.buttonsDown[index] = isDown
      used ||= pressed[index]
      deliberate ||= pressed[index]
    }
    if (deliberate) this.lastDevice = 'gamepad'

    if (!this.enabled) {
      for (const [name, index] of menuButtons) {
        if (pressed[index]) this.emitUi(name)
      }
      // Directions from the D-pad or the left stick, repeating while held
      const useStick = this.stickMenus
      this.repeat('UP', down(BUTTON.UP) || (useStick && pad.ly < -0.5), delta)
      this.repeat('DOWN', down(BUTTON.DOWN) || (useStick && pad.ly > 0.5), delta)
      this.repeat('LEFT', down(BUTTON.LEFT) || (useStick && pad.lx < -0.5), delta)
      this.repeat('RIGHT', down(BUTTON.RIGHT) || (useStick && pad.lx > 0.5), delta)
      return null
    }

    // A direction held while sailing doesn't count in the menu it opens
    // until it has been let go
    for (const name in this.held) this.held[name] = Infinity
    for (const [action, index] of gamepadActions) {
      if (pressed[index]) this.emit(action)
    }
    if (!used && !down(BUTTON.RB)) return null
    const boost = pad.rt > 0.3 || down(BUTTON.RB)
    // LT backs straight up, steering with the stick like a car in reverse
    if (pad.lt > 0.2) return { throttle: -pad.lt, steer: pad.lx, boost: false }
    const { throttle, steer } = this.stickSteering(pad.lx, pad.ly)
    // Boost with the stick at rest still pushes ahead
    return { throttle: boost && !throttle ? 1 : throttle, steer, boost }
  }

  // A menu direction fires when first held, then again every so often
  repeat(name, held, delta) {
    if (!held) this.held[name] = null
    else if (this.held[name] === null) {
      this.held[name] = REPEAT_DELAY
      this.emitUi(name)
    } else if ((this.held[name] -= delta) <= 0) {
      this.held[name] = REPEAT_EVERY
      this.emitUi(name)
    }
  }

  // A stick pushed toward a direction on screen (see helm.js)
  stickSteering(x, y) {
    const boat = this.app.world?.boat
    if (Math.hypot(x, y) < DEADZONE || !boat) return { throttle: 0, steer: 0 }
    const q = boat.object.quaternion
    // The bow's direction on the water: (0, 0, -1) turned by the boat's rotation
    heading.x = -2 * (q.x * q.z + q.w * q.y)
    heading.z = -(1 - 2 * (q.x * q.x + q.y * q.y))
    stick.x = x
    stick.y = y
    screen.up = this.app.cameraRig.screenUp
    screen.right = this.app.cameraRig.screenRight
    return helmToward(stick, heading, screen, boat.speed)
  }

  // The touch boost button: boost while a finger is on it
  bindBoost(element) {
    const set = value => event => {
      event.preventDefault()
      this.touch.boost = value
      element.classList.toggle('is-active', value)
    }
    element.addEventListener('pointerdown', set(true))
    element.addEventListener('pointerup', set(false))
    element.addEventListener('pointercancel', set(false))
    element.addEventListener('pointerleave', set(false))
    element.addEventListener('contextmenu', event => event.preventDefault())
  }

  bindJoystick(element) {
    const knob = element.querySelector('.joystick-knob')
    let pointerId = null
    let center = { x: 0, y: 0, radius: 1 }

    const move = event => {
      let x = (event.clientX - center.x) / center.radius
      let y = (event.clientY - center.y) / center.radius
      const length = Math.hypot(x, y)
      if (length > 1) {
        x /= length
        y /= length
      }
      this.touch.x = x
      this.touch.y = y
      this.touch.active = true
      knob.style.transform = `translate(${x * center.radius * 0.55}px, ${y * center.radius * 0.55}px)`
    }

    const end = event => {
      if (event.pointerId !== pointerId) return
      pointerId = null
      this.touch.active = false
      this.touch.x = 0
      this.touch.y = 0
      knob.style.transform = ''
    }

    element.addEventListener('pointerdown', event => {
      pointerId = event.pointerId
      const rect = element.getBoundingClientRect()
      center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, radius: rect.width / 2 }
      this.lastDevice = 'touch'
      move(event)
      try {
        element.setPointerCapture(pointerId)
      } catch {
        // Capture can fail for synthetic or already-released pointers; dragging still works
      }
    })
    element.addEventListener('pointermove', event => {
      if (event.pointerId === pointerId) move(event)
    })
    element.addEventListener('pointerup', end)
    element.addEventListener('pointercancel', end)
  }
}
