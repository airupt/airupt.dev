import { test } from 'node:test'
import assert from 'node:assert/strict'
import { archGate, courseGates, gateBetween, throughGate } from '../src/world/gates.js'
import { arch, ringCourse } from '../src/world/layout.js'

// A gate at the origin, passed going +z, 2 m either side
const gate = gateBetween(0, 0, [0, -10], [0, 10], 2)

// Steps a boat along a path and says whether it went through
function sail(target, points) {
  let side = 0
  let passed = 0
  for (const [x, z] of points) {
    const result = throughGate(target, x, z, side)
    side = result.side
    if (result.through) passed++
  }
  return passed
}

const line = (from, to, steps = 40) =>
  Array.from({ length: steps + 1 }, (_, i) => [from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps])

test('sailing through a gate the right way counts once', () => {
  assert.equal(sail(gate, line([0.5, -6], [0.5, 6])), 1)
})

test('the wrong way, round the side or from far off does not count', () => {
  assert.equal(sail(gate, line([0, 6], [0, -6])), 0, 'backwards')
  assert.equal(sail(gate, line([3, -6], [3, 6])), 0, 'outside the gate')
  assert.equal(sail(gate, [[0, -20], [0, 20]]), 0, 'a jump across from far away')
})

test('the arch opening sits between its feet and is passable', () => {
  const opening = archGate(arch)
  assert.ok(opening.halfWidth > 1.5 && opening.halfWidth < arch.span / 2, `half width ${opening.halfWidth}`)
  assert.ok(Math.hypot(opening.x - arch.x, opening.z - arch.z) < 1, 'the opening is near the middle of the arch')
  assert.ok(Math.abs(Math.hypot(opening.normal.x, opening.normal.z) - 1) < 1e-9)
  const { x, z, normal } = opening
  assert.equal(sail(opening, line([x - normal.x * 6, z - normal.z * 6], [x + normal.x * 6, z + normal.z * 6])), 1)
})

test('the course starts at the chequered ring, passes the arch the way the lap goes, and every gate faces along it', () => {
  const gates = courseGates(ringCourse, arch, 2.6)
  assert.equal(gates.length, ringCourse.length)
  assert.equal(gates[0].kind, 'start')
  assert.equal(gates.filter(gate => gate.kind === 'arch').length, ringCourse.filter(stop => stop === 'arch').length)
  gates.forEach((gate, index) => {
    const before = gates[(index - 1 + gates.length) % gates.length]
    const after = gates[(index + 1) % gates.length]
    const along = (after.x - before.x) * gate.normal.x + (after.z - before.z) * gate.normal.z
    assert.ok(along > 0, `gate ${index} faces against the lap`)
    assert.ok(Math.abs(Math.hypot(gate.normal.x, gate.normal.z) - 1) < 1e-9)
  })
})

test('a lap straight from gate to gate goes through every one, in order', () => {
  const gates = courseGates(ringCourse, arch, 2.6)
  const sides = gates.map(() => 0)
  let next = 1
  // From a little behind the start, through each gate's middle in turn
  const start = gates[0]
  const path = [
    [start.x - start.normal.x * 5, start.z - start.normal.z * 5],
    [start.x + start.normal.x * 3, start.z + start.normal.z * 3],
  ]
  for (const gate of [...gates.slice(1), gates[0]]) {
    path.push([gate.x - gate.normal.x * 3, gate.z - gate.normal.z * 3], [gate.x + gate.normal.x * 3, gate.z + gate.normal.z * 3])
  }
  const points = path.flatMap((point, index) => (index ? line(path[index - 1], point, 60).slice(1) : [point]))
  let laps = 0
  let started = false
  for (const [x, z] of points) {
    const target = started ? next : 0
    const result = throughGate(gates[target], x, z, sides[target])
    sides[target] = result.side
    if (!result.through) continue
    if (!started) started = true
    else if (target === 0) laps++
    else next = (next + 1) % gates.length
  }
  assert.ok(started, 'the start gate was never crossed')
  assert.equal(laps, 1, `stuck before gate ${next}`)
})
