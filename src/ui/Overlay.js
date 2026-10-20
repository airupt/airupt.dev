import * as THREE from 'three'
import { profile, sections } from '../content/portfolio.js'
import { renderSection, renderClassic } from './render.js'

const projected = new THREE.Vector3()

const hints = {
  keyboard: 'WASD or arrow keys to sail · Shift to boost · E to explore · R to reset',
  gamepad: 'Stick or triggers to sail · RB to boost · A to explore',
  touch: 'Drag the joystick to sail',
}

// All HTML on top of the canvas: loader, HUD, island labels, section panel
// and the classic (no-3D) view.
export class Overlay {
  constructor(app) {
    this.app = app
    this.started = false
    this.activeSection = null
    this.device = null
    this.labels = []

    this.loader = document.querySelector('#loader')
    this.progress = this.loader.querySelector('.loader-bar')
    this.startButton = document.querySelector('#start')
    this.hud = document.querySelector('#hud')
    this.hint = document.querySelector('#hint')
    this.prompt = document.querySelector('#prompt')
    this.promptButton = document.querySelector('#prompt-button')
    this.joystick = document.querySelector('#joystick')
    this.panel = document.querySelector('#panel')
    this.panelBody = this.panel.querySelector('.panel-body')
    this.classic = document.querySelector('#classic')
    this.labelsRoot = document.querySelector('#labels')

    for (const element of document.querySelectorAll('[data-profile]')) {
      element.textContent = profile[element.dataset.profile] ?? ''
    }
    document.title = `${profile.name} · ${profile.role}`

    this.classic.append(renderClassic(profile, sections, () => this.hideClassic()))
    for (const button of document.querySelectorAll('[data-open-classic]')) {
      button.addEventListener('click', () => this.showClassic())
    }

    this.promptButton.addEventListener('click', () => {
      if (this.activeSection) this.openSection(this.activeSection)
    })
    this.panel.addEventListener('close', () => this.setSailing(true))
    this.panel.addEventListener('click', event => {
      if (event.target === this.panel) this.panel.close()
    })
  }

  setProgress(value) {
    const percent = Math.round(value * 100)
    this.progress.style.setProperty('--progress', `${percent}%`)
    this.progress.setAttribute('aria-valuenow', percent)
  }

  ready(onStart) {
    this.startButton.disabled = false
    this.startButton.textContent = 'Set sail'
    this.startButton.addEventListener(
      'click',
      () => {
        this.started = true
        this.loader.classList.add('is-hidden')
        this.hud.hidden = false
        this.joystick.hidden = !this.app.viewport.isTouch
        onStart()
        setTimeout(() => this.hint.classList.add('is-faded'), 15000)
      },
      { once: true }
    )
  }

  setSailing(enabled) {
    if (!this.app.inputs) return
    this.app.inputs.enabled = enabled && this.started && this.classic.hidden && !this.panel.open
  }

  openSection(id) {
    const section = sections.find(candidate => candidate.id === id)
    // Enter on the prompt button fires both the interact key and a click
    if (!section || this.panel.open) return
    this.panelBody.replaceChildren(renderSection(section, profile, 'panel'))
    this.panel.showModal()
    this.setSailing(false)
  }

  setPrompt(id) {
    this.activeSection = id
    this.prompt.hidden = !id
    if (!id) return
    const title = sections.find(section => section.id === id)?.title ?? id
    this.promptButton.textContent = this.device === 'keyboard' ? `Press E · Explore ${title}` : `Explore ${title}`
  }

  showClassic({ fallback = false } = {}) {
    this.classic.hidden = false
    this.classic.classList.toggle('is-fallback', fallback)
    document.body.classList.add('is-classic')
    this.app.paused = true
    this.setSailing(false)
  }

  hideClassic() {
    this.classic.hidden = true
    document.body.classList.remove('is-classic')
    document.activeElement?.blur()
    this.app.paused = false
    this.setSailing(true)
  }

  addLabel(text, position, variant, color) {
    const element = document.createElement('div')
    element.className = `label label-${variant}`
    element.textContent = text
    if (color) element.style.setProperty('--label-color', color)
    this.labelsRoot.append(element)
    this.labels.push({ element, position })
  }

  update() {
    const device = this.app.inputs.lastDevice
    if (device !== this.device) {
      this.device = device
      this.hint.textContent = hints[device]
      this.setPrompt(this.activeSection)
    }

    const camera = this.app.cameraRig.camera
    const { width, height } = this.app.viewport
    for (const label of this.labels) {
      projected.copy(label.position).project(camera)
      const visible = projected.z < 1 && Math.abs(projected.x) < 1.2 && Math.abs(projected.y) < 1.2
      label.element.classList.toggle('is-hidden', !visible)
      if (!visible) continue
      const x = (projected.x * 0.5 + 0.5) * width
      const y = (-projected.y * 0.5 + 0.5) * height
      label.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
    }
  }
}
