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
}

const gamepadActions = { interact: 0, reset: 3 }
const DEADZONE = 0.15

const clamp = value => Math.min(Math.max(value, -1), 1)
const deadzone = value => (Math.abs(value) < DEADZONE ? 0 : value)

export class Inputs {
  constructor(app) {
    this.app = app
    this.enabled = false
    this.pressed = new Set()
    this.listeners = {}
    this.state = { throttle: 0, steer: 0, boost: false }
    this.touch = { x: 0, y: 0, active: false }
    this.gamepadPressed = {}
    this.lastDevice = app.viewport.isTouch ? 'touch' : 'keyboard'

    window.addEventListener('keydown', event => this.onKey(event, true))
    window.addEventListener('keyup', event => this.onKey(event, false))
    window.addEventListener('blur', () => this.pressed.clear())

    const joystick = document.querySelector('#joystick')
    if (joystick) this.bindJoystick(joystick)
  }

  on(action, callback) {
    ;(this.listeners[action] ??= []).push(callback)
  }

  emit(action) {
    if (!this.enabled) return
    for (const callback of this.listeners[action] ?? []) callback()
  }

  onKey(event, down) {
    // Letting go always counts, even inside a panel, or the key would stay
    // held down once the panel closes
    if (!down) {
      this.pressed.delete(event.code)
      return
    }
    // Keys typed inside the panel or classic view must not steer the boat
    if (event.target.closest?.('dialog, .classic, input, textarea')) return

    if (!event.repeat) {
      for (const [action, codes] of Object.entries(actions)) {
        if (codes.includes(event.code)) this.emit(action)
      }
    }
    this.pressed.add(event.code)
    this.lastDevice = 'keyboard'

    const isSteeringKey = Object.values(axes).some(codes => codes.includes(event.code))
    if (isSteeringKey && this.enabled) event.preventDefault()
  }

  isDown(axis) {
    return axes[axis].some(code => this.pressed.has(code))
  }

  update() {
    let throttle = Number(this.isDown('forward')) - Number(this.isDown('backward'))
    let steer = Number(this.isDown('right')) - Number(this.isDown('left'))
    let boost = this.isDown('boost')

    const gamepad = navigator.getGamepads?.().find(Boolean)
    if (gamepad) {
      const triggers = (gamepad.buttons[7]?.value ?? 0) - (gamepad.buttons[6]?.value ?? 0)
      const stick = -deadzone(gamepad.axes[1] ?? 0)
      const padSteer = deadzone(gamepad.axes[0] ?? 0)
      if (triggers || stick || padSteer) {
        throttle = triggers || stick
        steer = padSteer
        this.lastDevice = 'gamepad'
      }
      boost ||= Boolean(gamepad.buttons[5]?.pressed)

      for (const [action, index] of Object.entries(gamepadActions)) {
        const pressed = Boolean(gamepad.buttons[index]?.pressed)
        if (pressed && !this.gamepadPressed[action]) this.emit(action)
        this.gamepadPressed[action] = pressed
      }
    }

    if (this.touch.active) {
      ;({ throttle, steer } = this.touchSteering())
    }

    if (!this.enabled) {
      throttle = 0
      steer = 0
      boost = false
    }

    this.state.throttle = clamp(throttle)
    this.state.steer = clamp(steer)
    this.state.boost = boost
  }

  // Steering from the on-screen stick (see helm.js)
  touchSteering() {
    const boat = this.app.world?.boat
    if (Math.hypot(this.touch.x, this.touch.y) < DEADZONE || !boat) return { throttle: 0, steer: 0 }
    const q = boat.object.quaternion
    // The bow's direction on the water: (0, 0, -1) turned by the boat's rotation
    const heading = { x: -2 * (q.x * q.z + q.w * q.y), z: -(1 - 2 * (q.x * q.x + q.y * q.y)) }
    const { screenUp, screenRight } = this.app.cameraRig
    return helmToward(this.touch, heading, { up: screenUp, right: screenRight }, boat.speed)
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
