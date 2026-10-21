import { profile, sections } from '../content/portfolio.js'
import { islands } from '../world/layout.js'
import { renderSection, renderClassic, isBrandName } from './render.js'

// Each section takes the colour of its island's buoy
const sectionColors = Object.fromEntries(islands.filter(island => island.section).map(island => [island.section, island.color]))

// Controls legend per input device: [keys, label] groups shown as keycaps
const controls = {
  keyboard: [
    [['W', 'A', 'S', 'D'], 'Sail'],
    [['Shift'], 'Boost'],
    [['E'], 'Explore'],
    [['M'], 'Map'],
    [['L'], 'Log'],
    [['P'], 'Photo'],
  ],
  gamepad: [
    [['Stick'], 'Sail'],
    [['RB'], 'Boost'],
    [['A'], 'Explore'],
  ],
  touch: [[[], 'Point the stick where to sail, tap a prompt to explore']],
}

const interactKey = { keyboard: 'E', gamepad: 'A' }

// All HTML on top of the canvas: loader, HUD, island labels, section panel
// and the classic (no-3D) view. It runs before the 3D code has downloaded;
// the Experience attaches itself as `app` once it exists.
export class Overlay {
  constructor() {
    this.app = null
    this.projected = null
    this.started = false
    this.activeSection = null
    this.device = null
    this.labels = []

    this.loader = document.querySelector('#loader')
    this.progress = this.loader.querySelector('.loader-progress')
    this.startButton = document.querySelector('#start')
    this.hud = document.querySelector('#hud')
    // Island labels fade out before they reach the brand and bottle chips
    this.hudEdge = 0
    const hudTop = this.hud.querySelector('.hud-top-left')
    new ResizeObserver(() => (this.hudEdge = hudTop.getBoundingClientRect().bottom)).observe(hudTop)
    this.controls = document.querySelector('#controls')
    this.prompt = document.querySelector('#prompt')
    this.promptButton = document.querySelector('#prompt-button')
    this.promptKey = document.querySelector('#prompt-key')
    // Touch has no key to name, so an arrow badge takes the key's place
    this.promptTap = document.querySelector('#prompt-tap')
    this.promptText = document.querySelector('#prompt-text')
    this.joystick = document.querySelector('#joystick')
    this.panel = document.querySelector('#panel')
    this.panelBody = this.panel.querySelector('.panel-body')
    this.panelTitle = this.panel.querySelector('#panel-title')
    this.classic = document.querySelector('#classic')
    this.labelsRoot = document.querySelector('#labels')

    for (const element of document.querySelectorAll('[data-profile]')) {
      element.textContent = profile[element.dataset.profile] ?? ''
    }
    // When the name is the brand itself, the small brand line above the
    // title would only repeat it: the mark moves into the title instead
    const loaderBrand = this.loader.querySelector('.brand')
    if (isBrandName(profile.name)) {
      loaderBrand.hidden = true
      this.loader.querySelector('.loader-title').prepend(loaderBrand.querySelector('.brand-mark').cloneNode(true))
    }
    document.title = `${profile.name} · ${profile.role}`

    this.classic.append(renderClassic(profile, sections, sectionColors, () => this.hideClassic()))
    for (const button of document.querySelectorAll('[data-open-classic]')) {
      button.addEventListener('click', () => this.showClassic())
    }

    // Same as pressing E: the boat comes alongside, then the section opens
    this.promptButton.addEventListener('click', () => {
      const zones = this.app?.world?.zones
      if (zones?.active) zones.open()
      else if (this.activeSection) this.openSection(this.activeSection)
    })
    this.panel.addEventListener('close', () => {
      this.app?.sounds.play('close', 0.5)
      this.app?.world.projectBoards?.highlight(null)
      this.onSectionClose?.()
      this.setSailing(true)
    })

    // Esc leaves the page view for the sea (unless there is no sea to go to)
    window.addEventListener('keydown', event => {
      if (event.code === 'Escape' && this.isClassicOpen && !this.classic.classList.contains('is-fallback')) this.hideClassic()
    })

    this.soundToggle = document.querySelector('#sound-toggle')
    this.soundToggle.addEventListener('click', () => this.toggleSound())
    this.panel.addEventListener('click', event => {
      if (event.target === this.panel) this.panel.close()
    })
  }

  toggleSound() {
    this.app.sounds.setMuted(!this.app.sounds.muted)
    this.updateSoundToggle()
  }

  setProgress(value) {
    const percent = Math.round(value * 100)
    this.progress.setAttribute('aria-valuenow', percent)
    // The Set sail button fills up as the world loads
    this.startButton.style.setProperty('--progress', `${percent}%`)
  }

  // Message card that slides in at the bottom left and leaves on its own.
  // Messages that arrive while one is showing wait their turn.
  toast(text, title, { duration = 7000 } = {}) {
    this.toasts ??= []
    this.toasts.push({ text, title, duration })
    if (!this.toastShowing) this.nextToast()
  }

  nextToast() {
    const next = this.toasts.shift()
    const toast = document.querySelector('#toast')
    this.toastShowing = Boolean(next)
    if (!next) return
    toast.querySelector('.toast-title').textContent = next.title
    toast.querySelector('.toast-text').textContent = next.text
    toast.classList.add('is-visible')
    // A queued message cuts the current one shorter
    setTimeout(() => {
      toast.classList.remove('is-visible')
      setTimeout(() => this.nextToast(), 450)
    }, this.toasts.length ? Math.min(next.duration, 4000) : next.duration)
  }

  // Quick wave of colour across the screen to hide a jump cut (respawn)
  wipe() {
    this.wipeElement ??= Object.assign(document.createElement('div'), { className: 'wipe' })
    if (!this.wipeElement.isConnected) document.body.append(this.wipeElement)
    this.wipeElement.classList.remove('is-active')
    void this.wipeElement.offsetWidth // restart the animation
    this.wipeElement.classList.add('is-active')
  }

  // Once the scene is drawing, the loader becomes a light frame over it
  showLiveScene() {
    this.loader.classList.add('is-live')
  }

  ready(onStart) {
    this.startButton.disabled = false
    this.startButton.textContent = 'Set sail'
    this.loader.classList.add('is-ready')
    this.startButton.addEventListener(
      'click',
      () => {
        this.started = true
        this.loader.classList.add('is-hidden')
        document.body.classList.add('is-sailing')
        this.hud.hidden = false
        this.joystick.hidden = !this.app.viewport.isTouch
        onStart()
        this.updateSoundToggle()
        // The legend leaves once the visitor has had time to read it and get moving
        setTimeout(() => this.controls.classList.add('is-faded'), 9000)
      },
      { once: true }
    )
  }

  updateSoundToggle() {
    const on = !this.app.sounds.muted
    this.soundToggle.setAttribute('aria-pressed', String(on))
    this.soundToggle.dataset.tooltip = on ? 'Sound on · N' : 'Sound off · N'
  }

  get isClassicOpen() {
    return !this.classic.hidden
  }

  setSailing(enabled) {
    if (!this.app?.inputs) return
    this.app.inputs.enabled = enabled && this.started && this.classic.hidden && !document.querySelector('dialog[open]') && !this.app.photo?.active
  }

  openSection(id) {
    const section = sections.find(candidate => candidate.id === id)
    // Enter on the prompt button fires both the interact key and a click
    if (!section || this.panel.open) return
    // The title moves up beside the close button, outside the scrolling part
    const content = renderSection(section, profile, 'panel', sectionColors[id])
    content.querySelector(':scope > h2').remove()
    content.setAttribute('aria-labelledby', 'panel-title')
    this.panelTitle.textContent = section.title
    this.panelBody.replaceChildren(content)
    // Pointing at a project card lights up its board on the island behind
    this.panelBody.querySelectorAll('.project').forEach((card, index) => {
      const highlight = value => this.app?.world.projectBoards?.highlight(value)
      card.addEventListener('pointerenter', () => highlight(index))
      card.addEventListener('pointerleave', () => highlight(null))
      card.addEventListener('focusin', () => highlight(index))
      card.addEventListener('focusout', () => highlight(null))
    })
    this.panelBody.scrollTop = 0
    this.panel.style.setProperty('--section-color', sectionColors[id] ?? 'var(--accent)')
    this.panel.showModal()
    this.app.sounds.play('open', 0.5)
    this.onSectionOpen?.(id)
    this.setSailing(false)
  }

  setPrompt(id) {
    this.activeSection = id
    this.prompt.hidden = !id
    if (!id) return
    const title = sections.find(section => section.id === id)?.title ?? id
    const key = interactKey[this.device]
    this.promptKey.hidden = !key
    this.promptKey.textContent = key ?? ''
    this.promptTap.hidden = Boolean(key)
    this.promptText.textContent = `Explore ${title}`
    this.prompt.style.setProperty('--prompt-color', sectionColors[id] ?? 'var(--accent)')
  }

  showClassic({ fallback = false } = {}) {
    this.classic.hidden = false
    this.classic.classList.toggle('is-fallback', fallback)
    document.body.classList.add('is-classic')
    if (this.app) this.app.paused = true
    this.app?.sounds?.setSuspended(true)
    this.setSailing(false)
  }

  hideClassic() {
    this.classic.hidden = true
    document.body.classList.remove('is-classic')
    document.activeElement?.blur()
    if (this.app) this.app.paused = false
    this.app?.sounds?.setSuspended(false)
    this.setSailing(true)
  }

  renderControls(device) {
    const groups = (controls[device] ?? controls.keyboard).map(([keys, label]) => {
      const group = document.createElement('span')
      group.className = 'controls-group'
      for (const key of keys) {
        const cap = document.createElement('kbd')
        cap.className = 'key'
        cap.textContent = key
        group.append(cap)
      }
      const text = document.createElement('span')
      text.textContent = label
      group.append(text)
      return group
    })
    this.controls.replaceChildren(...groups)
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
      this.hud.dataset.device = device
      this.renderControls(device)
      this.setPrompt(this.activeSection)
    }

    const camera = this.app.cameraRig.camera
    const { width, height } = this.app.viewport
    for (const label of this.labels) {
      // Scratch vector borrowed from the first label, so this file needs no three.js import
      const projected = (this.projected ??= label.position.clone())
      projected.copy(label.position).project(camera)
      const visible = projected.z < 1 && Math.abs(projected.x) < 1.2 && Math.abs(projected.y) < 1.2
      label.element.classList.toggle('is-hidden', !visible)
      if (!visible) continue
      const x = (projected.x * 0.5 + 0.5) * width
      const y = (-projected.y * 0.5 + 0.5) * height
      label.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
      // Up close the painted sign on the island takes over; labels guide from afar
      const distance = camera.position.distanceTo(label.position)
      const clear = (y - 32 - this.hudEdge) / 24
      label.element.style.opacity = Math.min(Math.max((distance - 70) / 18, 0), 1, Math.max(clear, 0))
    }
  }
}
