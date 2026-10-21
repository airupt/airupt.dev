import { discoveries } from '../world/Logbook.js'
import { element } from './render.js'

// An icon from the sprite in index.html
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'icon')
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', `#icon-${name}`)
  svg.append(use)
  return svg
}

// The captain's log as a dialog: how much has been found and every
// discovery, the found ones in full and the rest as hints. Other parts can
// add a card above the list (the treasure map does).
export class LogbookView {
  constructor(app) {
    this.app = app
    this.dialog = document.querySelector('#logbook')
    this.body = this.dialog.querySelector('.logbook-body')
    this.button = document.querySelector('#open-log')
    this.cards = []

    this.button.addEventListener('click', () => this.open())
    app.inputs.on('log', () => this.open())
    this.dialog.addEventListener('close', () => app.overlay.setSailing(true))
    this.dialog.addEventListener('click', event => {
      if (event.target === this.dialog) this.dialog.close()
    })
    this.dialog.addEventListener('keydown', event => {
      if (event.code === 'KeyL') this.dialog.close()
    })
  }

  attach(logbook) {
    this.logbook = logbook
    logbook.onChange(() => this.refresh())
    this.refresh()
  }

  // A card is a function returning a node (or nothing), called on each render
  addCard(card) {
    this.cards.push(card)
  }

  refresh() {
    if (!this.logbook) return
    this.button.querySelector('span').textContent = `${this.logbook.count} / ${discoveries.length}`
    if (this.dialog.open) this.render()
  }

  open() {
    if (!this.logbook || document.querySelector('dialog[open]')) return
    this.render()
    this.dialog.showModal()
    this.app.overlay.setSailing(false)
    this.app.sounds.play('open', 0.4, 1.1)
  }

  render() {
    const { count } = this.logbook
    const progress = element('div', { class: 'log-progress' }, [
      element('p', {}, [element('strong', { text: String(count) }), ` of ${discoveries.length} found`]),
      element('div', { class: 'log-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(discoveries.length), 'aria-valuenow': String(count) }, [
        element('span', { style: `width: ${(count / discoveries.length) * 100}%` }),
      ]),
    ])
    const list = element(
      'ul',
      { class: 'log-list' },
      discoveries.map(([id, title, hint]) => {
        const found = this.logbook.has(id)
        const mark = element('span', { class: 'log-mark', 'aria-hidden': 'true' }, [found ? icon('check') : '?'])
        return element('li', { class: found ? 'log-entry is-found' : 'log-entry' }, [
          mark,
          element('span', { class: 'log-text', text: found ? title : hint }),
          found ? null : element('span', { class: 'visually-hidden', text: ' (not found yet)' }),
        ])
      })
    )
    this.body.replaceChildren(progress, ...this.cards.map(card => card()).filter(Boolean), list)
  }
}
