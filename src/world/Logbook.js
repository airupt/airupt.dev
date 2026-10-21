import { arch, islands, worldRadius, wreck } from './layout.js'

const STORAGE_KEY = 'airupt-log'

// Everything there is to find, in the order the log lists it:
// [id, what the log says once found, a hint until then]
export const discoveries = [
  ['bottle', 'Found a message in a bottle', 'Something glints on the water.'],
  ['bottles', 'Found all eight bottles', 'Eight bottles drift around these islands.'],
  ['treasure', 'Dug up the treasure', 'Every bottle holds a piece of a treasure map.'],
  ['islands', 'Docked at every island', 'Come alongside the dock of all four section islands.'],
  ['landing', 'Landed on Mount Airupt', 'The volcano has a little landing of its own.'],
  ['eruption', 'Felt Mount Airupt erupt', 'Be close by when the volcano clears its throat.'],
  ['arch', 'Sailed through the rock arch', 'Out past the About island, the rocks make a gate.'],
  ['reef', 'Slipped into the lagoon', 'A ring of reef in the east hides a lagoon.'],
  ['wreck', 'Found the shipwreck', 'An old ship went down somewhere out at sea.'],
  ['kraken', 'Woke what sleeps by the wreck', "Don't linger by the wreck…"],
  ['dolphins', 'Raced the dolphins', 'Go full speed in open water and you may get company.'],
  ['whale', 'Saw the whale', 'Something big comes up at night, far from land.'],
  ['night', 'Sailed by night', 'Stay out until the lighthouse comes on.'],
  ['edge', 'Reached the edge of the map', 'Sail as far as the sea will let you.'],
  ['course', 'Finished the ring course', 'A starting ring floats near the home island.'],
  ['photo', 'Took a photo', 'Try the camera button up in the corner.'],
]

function readFound() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

function saveFound(found) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...found]))
  } catch {
    // Private mode: the log just starts fresh next time
  }
}

// The captain's log: things to find around the archipelago. Other parts of
// the world call record() when one happens; the few that are only about
// where the boat is get checked here every frame.
export class Logbook {
  constructor(app) {
    this.app = app
    this.found = readFound()
    this.listeners = []
    this.reef = islands.find(island => island.reef)
    this.archSide = 0
  }

  get count() {
    return discoveries.filter(([id]) => this.found.has(id)).length
  }

  has(id) {
    return this.found.has(id)
  }

  onChange(callback) {
    this.listeners.push(callback)
  }

  // Progress made before the log existed (bottles found on an earlier
  // visit): noted quietly, without a toast
  restore(id) {
    this.add(id)
  }

  record(id) {
    const entry = this.add(id)
    if (!entry) return
    this.app.sounds.fanfare()
    this.app.overlay.toast(entry[1], `Captain's log · ${this.count} of ${discoveries.length}`, { duration: 4500 })
  }

  // Notes an entry once; returns it, or nothing if it was already there
  add(id) {
    if (this.found.has(id)) return null
    const entry = discoveries.find(([key]) => key === id)
    if (!entry) return null
    this.found.add(id)
    saveFound(this.found)
    for (const callback of this.listeners) callback(id)
    return entry
  }

  update() {
    if (!this.app.inputs.enabled) return
    const { boat, dayCycle } = this.app.world
    const { x, z } = boat.object.position

    // Through the arch: across the line between its feet, between the feet
    const dx = x - arch.x
    const dz = z - arch.z
    const along = dx * Math.cos(arch.yaw) - dz * Math.sin(arch.yaw)
    const side = Math.sign(dx * Math.sin(arch.yaw) + dz * Math.cos(arch.yaw))
    if (side && this.archSide && side !== this.archSide && Math.abs(along) < arch.span / 2 - 1) this.record('arch')
    this.archSide = Math.hypot(dx, dz) < arch.span ? side : 0

    if (Math.hypot(x - wreck.x, z - wreck.z) < 14) this.record('wreck')
    if (this.reef && Math.hypot(x - this.reef.x, z - this.reef.z) < this.reef.radius * 0.5) this.record('reef')
    if (Math.hypot(x, z) > worldRadius) this.record('edge')
    if (dayCycle.night > 0.85) this.record('night')
  }
}
