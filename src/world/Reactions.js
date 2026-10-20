import * as THREE from 'three'

const STORAGE_KEY = 'airupt-visited'

function readVisited() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

function saveVisited(visited) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...visited]))
  } catch {
    // Private mode: the garland just starts empty next time
  }
}

// What each island does when you sail up to it, so arriving feels like
// being noticed: the Skills bell rings, the Contact post box raises its flag
// and the lighthouse flashes, the About campfire roars up. Opening a section
// hangs its pennant on the garland by the home signpost.
export class Reactions {
  constructor(app, world) {
    this.app = app
    this.world = world
    const find = id => world.decor.placed.find(placed => placed.id === id)?.model
    this.bell = find('lookout')?.userData.bell
    this.flag = find('mailbox')?.userData.flag
    this.pennants = find('signpost-hub')?.userData.pennants ?? {}
    this.time = { bell: Infinity, flag: Infinity }
    this.dropping = new Map()

    this.visited = readVisited()
    for (const id of this.visited) if (this.pennants[id]) this.pennants[id].visible = true
  }

  arrive(island) {
    const hero = island.plan?.hero
    const position = hero ? new THREE.Vector3(hero.x, 1, hero.z) : null
    switch (island.section) {
      case 'skills':
        this.time.bell = 0
        this.app.sounds.bell(0.22, position)
        break
      case 'contact':
        this.time.flag = 0
        this.world.lights.flash()
        this.app.sounds.play('click', 0.4, 0.7, position)
        break
      case 'about':
        this.world.lights.flare()
        // The campfire's smoke is the emitter after the volcano's
        this.world.smoke.burst(1)
        break
    }
  }

  // A section was opened: its pennant drops onto the garland
  visit(section) {
    if (this.visited.has(section)) return
    this.visited.add(section)
    saveVisited(this.visited)
    const pennant = this.pennants[section]
    if (!pennant) return
    pennant.visible = true
    this.dropping.set(pennant, 0)
  }

  update(delta) {
    if (this.bell && this.time.bell < 4) {
      this.time.bell += delta
      const t = this.time.bell
      this.bell.rotation.z = Math.sin(t * 9) * Math.exp(-t * 1.4) * 0.55
    }
    if (this.flag && this.time.flag < 1.5) {
      this.time.flag += delta
      // Up with a little overshoot, then it stays up
      const t = Math.min(this.time.flag / 0.6, 1)
      const swing = 1 - Math.cos(t * Math.PI * 2.5) * Math.exp(-t * 4) * (1 - t)
      this.flag.rotation.x = (Math.PI / 2) * (1 - Math.min(swing, 1.08))
    }
    for (const [pennant, time] of this.dropping) {
      const t = Math.min(time + delta * 1.5, 1)
      this.dropping.set(pennant, t)
      pennant.scale.set(1, t < 1 ? Math.sin(t * Math.PI * 0.5) * (1 + Math.sin(t * 12) * (1 - t) * 0.3) : 1, 1)
      if (t === 1) this.dropping.delete(pennant)
    }
  }
}
