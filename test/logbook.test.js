import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

// The log keeps its entries in localStorage; Node has none, so a stand-in
const storage = new Map()
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
}

const { Logbook, discoveries } = await import('../src/world/Logbook.js')
const { arch, wreck } = await import('../src/world/layout.js')
const { archGate } = await import('../src/world/gates.js')

// Just enough of the app for the log: where the boat is, the time of day,
// and counters for the toasts and sounds it asks for
function createApp() {
  const app = {
    toasts: [],
    fanfares: 0,
    inputs: { enabled: true },
    sounds: { fanfare: () => app.fanfares++ },
    overlay: { toast: (text, title) => app.toasts.push({ text, title }) },
    world: { boat: { object: { position: { x: 0, y: 0, z: 0 } } }, dayCycle: { night: 0 } },
  }
  return app
}

beforeEach(() => storage.clear())

test('recording an entry notes it once, with one toast and one fanfare', () => {
  const app = createApp()
  const log = new Logbook(app)
  const heard = []
  log.onChange(id => heard.push(id))
  log.record('photo')
  log.record('photo')
  assert.ok(log.has('photo'))
  assert.equal(log.count, 1)
  assert.equal(app.toasts.length, 1)
  assert.match(app.toasts[0].title, new RegExp(`1 of ${discoveries.length}`))
  assert.equal(app.fanfares, 1)
  assert.deepEqual(heard, ['photo'])
})

test('restoring earlier progress is quiet', () => {
  const app = createApp()
  const log = new Logbook(app)
  log.restore('bottles')
  assert.ok(log.has('bottles'))
  assert.equal(app.toasts.length, 0)
  assert.equal(app.fanfares, 0)
})

test('unknown entries are ignored', () => {
  const log = new Logbook(createApp())
  log.record('nonsense')
  assert.equal(log.count, 0)
})

test('the log is remembered between visits', () => {
  new Logbook(createApp()).record('night')
  assert.ok(new Logbook(createApp()).has('night'))
})

// Moves the boat along a straight line, letting the log look each step
function sail(app, log, from, to, steps = 60) {
  for (let i = 0; i <= steps; i++) {
    app.world.boat.object.position.x = from[0] + ((to[0] - from[0]) * i) / steps
    app.world.boat.object.position.z = from[1] + ((to[1] - from[1]) * i) / steps
    log.update()
  }
}

test('sailing through the arch counts either way, round it does not', () => {
  const opening = archGate(arch)
  const behind = [opening.x - opening.normal.x * 6, opening.z - opening.normal.z * 6]
  const ahead = [opening.x + opening.normal.x * 6, opening.z + opening.normal.z * 6]
  for (const [from, to] of [[behind, ahead], [ahead, behind]]) {
    const app = createApp()
    const log = new Logbook(app)
    sail(app, log, from, to)
    assert.ok(log.has('arch'))
    storage.clear()
  }
  const app = createApp()
  const log = new Logbook(app)
  const across = { x: opening.normal.z, z: -opening.normal.x }
  sail(app, log, [behind[0] + across.x * 9, behind[1] + across.z * 9], [ahead[0] + across.x * 9, ahead[1] + across.z * 9])
  assert.ok(!log.has('arch'), 'went round the side of the arch')
})

test('the wreck, the edge of the map and the night are noticed while sailing', () => {
  const app = createApp()
  const log = new Logbook(app)
  Object.assign(app.world.boat.object.position, { x: wreck.x + 5, z: wreck.z })
  log.update()
  assert.ok(log.has('wreck'))
  Object.assign(app.world.boat.object.position, { x: 101, z: 0 })
  log.update()
  assert.ok(log.has('edge'))
  app.world.dayCycle.night = 1
  log.update()
  assert.ok(log.has('night'))
})

test('nothing is noticed while the boat is not being sailed (a panel is open)', () => {
  const app = createApp()
  app.inputs.enabled = false
  const log = new Logbook(app)
  Object.assign(app.world.boat.object.position, { x: wreck.x, z: wreck.z })
  app.world.dayCycle.night = 1
  log.update()
  assert.equal(log.count, 0)
})
