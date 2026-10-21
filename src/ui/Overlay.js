import { profile, sections } from '../content/portfolio.js'
import { islands } from '../world/layout.js'
import { renderSection, renderClassic, isBrandName } from './render.js'
import { keyFor } from '../engine/bindings.js'

// Each section takes the colour of its island's buoy
const sectionColors = Object.fromEntries(islands.filter(island => island.section).map(island => [island.section, island.color]))

// Controls legend per input device: the actions (see bindings.js) with
// their keys shown as keycaps
const legend = [
  ['sail', 'Sail'],
  ['boost', 'Boost'],
  ['interact', 'Explore'],
  ['map', 'Map'],
  ['log', 'Log'],
  ['photo', 'Photo'],
  ['reset', 'Reset'],
]

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
    this.toasts = []

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
    this.boost = document.querySelector('#boost')
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

    this.labelControls()

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
    this.toasts.push({ text, title, duration })
    if (!this.toastShowing) this.nextToast()
  }

  // Messages also wait while the HUD is out of sight (the loader, a dialog,
  // photo mode, the page view) and come once the visitor is sailing again
  nextToast() {
    const toast = document.querySelector('#toast')
    this.toastShowing = this.toasts.length > 0 && Boolean(this.app?.inputs?.enabled)
    if (!this.toastShowing) return
    const next = this.toasts.shift()
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
        onStart()
        this.joystick.hidden = this.device !== 'touch'
        this.boost.hidden = this.joystick.hidden
        this.updateSoundToggle()
        this.showControls()
        this.nextToast()
      },
      { once: true }
    )
  }

  updateSoundToggle() {
    const on = !this.app.sounds.muted
    this.soundToggle.setAttribute('aria-pressed', String(on))
    this.soundToggle.dataset.label = on ? 'Sound on' : 'Sound off'
    this.labelControl(this.soundToggle)
  }

  // Tooltips say what a control does and its key on the device in use:
  // "Map · M" with a keyboard, "Map · View" with a gamepad
  labelControl(element) {
    const key = keyFor(element.dataset.action, this.device)
    element.dataset.tooltip = key ? `${element.dataset.label} · ${key}` : element.dataset.label
  }

  labelControls() {
    for (const element of document.querySelectorAll('[data-action]')) this.labelControl(element)
  }

  // The legend shows for a while at the start, and again when the visitor
  // picks up another device, then leaves once they have had time to read it
  showControls() {
    this.controls.classList.remove('is-faded')
    clearTimeout(this.controlsTimer)
    this.controlsTimer = setTimeout(() => this.controls.classList.add('is-faded'), 9000)
  }

  get isClassicOpen() {
    return !this.classic.hidden
  }

  setSailing(enabled) {
    if (!this.app?.inputs) return
    this.app.inputs.enabled = enabled && this.started && this.classic.hidden && !document.querySelector('dialog[open]') && !this.app.photo?.active
    if (this.app.inputs.enabled && !this.toastShowing) this.nextToast()
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
    const key = keyFor('interact', this.device)
    this.promptKey.hidden = !key
    this.promptKey.textContent = key
    this.promptTap.hidden = Boolean(key)
    this.promptText.textContent = `Explore ${title}`
    this.prompt.style.setProperty('--prompt-color', sectionColors[id] ?? 'var(--accent)')
  }

  showClassic({ fallback = false } = {}) {
    this.classic.hidden = false
    this.classic.classList.toggle('is-fallback', fallback)
    document.body.classList.add('is-classic')
    // The page takes the keys (arrows and space scroll it); what is behind it can't be reached
    this.hud.inert = true
    this.loader.inert = true
    this.classic.focus({ preventScroll: true })
    if (this.app) this.app.paused = true
    this.app?.sounds?.setSuspended(true)
    this.setSailing(false)
  }

  hideClassic() {
    this.classic.hidden = true
    document.body.classList.remove('is-classic')
    this.hud.inert = false
    this.loader.inert = false
    document.activeElement?.blur()
    if (this.app) this.app.paused = false
    this.app?.sounds?.setSuspended(false)
    this.setSailing(true)
  }

  renderControls(device) {
    const items = device === 'touch' ? [[null, 'Point the stick where to sail, hold the bolt to boost']] : legend
    const groups = items.map(([action, label]) => {
      const group = document.createElement('span')
      group.className = 'controls-group'
      // W A S D is four keys; a gamepad's "Left stick" is one control
      const key = keyFor(action, device)
      for (const name of !key ? [] : device === 'gamepad' ? [key] : key.split(' ')) {
        const cap = document.createElement('kbd')
        cap.className = 'key'
        cap.textContent = name
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
      const switched = this.device !== null
      this.device = device
      this.hud.dataset.device = device
      document.documentElement.dataset.device = device
      this.renderControls(device)
      this.setPrompt(this.activeSection)
      this.labelControls()
      // The touch stick shows for fingers only (a laptop can have a touch screen too)
      this.joystick.hidden = !this.started || device !== 'touch'
      this.boost.hidden = this.joystick.hidden
      if (switched && this.started) this.showControls()
      if (this.app.photo?.active) this.app.photo.showHint()
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
      // Up close the painted sign on the island takes over; labels guide from afar
      const distance = camera.position.distanceTo(label.position)
      const clear = (y - 32 - this.hudEdge) / 24
      // Only touch the page when something actually changed (the camera often holds still)
      const transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`
      const opacity = Math.min(Math.max((distance - 70) / 18, 0), 1, Math.max(clear, 0)).toFixed(2)
      if (transform !== label.transform) label.element.style.transform = label.transform = transform
      if (opacity !== label.opacity) label.element.style.opacity = label.opacity = opacity
    }
  }
}
