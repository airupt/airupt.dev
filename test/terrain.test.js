import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dryGround, islandHeight, facingDirection } from '../src/world/terrain.js'
import { archGate } from '../src/world/gates.js'
import { arch, bottleSpots, islands, moorings, ringCourse, rockClusters, spawn, wreck } from '../src/world/layout.js'

// Highest ground of any island at a world position (-10 out at sea)
function groundAt(x, z, list = islands) {
  let height = -10
  for (const island of list) {
    const dx = x - island.x
    const dz = z - island.z
    if (Math.hypot(dx, dz) > island.radius * 1.3) continue
    height = Math.max(height, islandHeight(island, dx, dz))
  }
  return height
}

// Highest ground within `clearance` metres of a point
function highestNear(x, z, clearance) {
  let height = groundAt(x, z)
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2
    height = Math.max(height, groundAt(x + Math.cos(angle) * clearance, z + Math.sin(angle) * clearance))
  }
  return height
}

const OPEN_WATER = -1

test('everything placed out at sea sits in open water', () => {
  const placed = [
    ...bottleSpots.map(([x, z], index) => [`bottle ${index + 1}`, x, z, 1.5]),
    ...rockClusters.map(([x, z], index) => [`sea stack ${index + 1}`, x, z, 3]),
    ...moorings.map(([model, x, z]) => [model, x, z, 4]),
    ['wreck', wreck.x, wreck.z, 4],
    ['rock arch', arch.x, arch.z, arch.span / 2 + 1],
    ['start', spawn.x, spawn.z, 2],
    ...ringCourse.filter(stop => stop !== 'arch').map(([x, z], index) => [`ring ${index + 1}`, x, z, 5]),
  ]
  for (const [name, x, z, clearance] of placed) {
    const height = highestNear(x, z, clearance)
    assert.ok(height < OPEN_WATER, `${name} at (${x}, ${z}) has ground at ${height.toFixed(2)} m within ${clearance} m`)
  }
})

const docked = islands.filter(island => island.section || island.label === 'name' || island.landing)

test('every island with a dock has land at its heart and a shore on its dock side', () => {
  for (const island of docked) {
    const out = facingDirection(island)
    assert.ok(islandHeight(island, 0, 0) > 0.5, `${island.id} has no land at its centre`)
    let shore = null
    for (let distance = 0; distance < island.radius * 1.3; distance += 0.25) {
      if (islandHeight(island, out.x * distance, out.z * distance) < 0) {
        shore = distance
        break
      }
    }
    assert.ok(shore !== null && shore >= 2, `${island.id} has no shore on its dock side`)
  }
})

test('the coast stays calm on the dock side, so docks and berths keep their place', () => {
  for (const island of docked) {
    const out = facingDirection(island)
    const unwarped = { ...island, warp: 0, yardShape: undefined }
    for (let distance = 2; distance < island.radius; distance += 0.5) {
      const x = out.x * distance
      const z = out.z * distance
      const difference = Math.abs(islandHeight(island, x, z) - islandHeight(unwarped, x, z))
      assert.ok(difference < 0.05, `${island.id} shifts by ${difference.toFixed(2)} m at ${distance} m out along its dock`)
    }
  }
})

test('no two islands run into each other', () => {
  const solid = islands.filter(island => !island.reef)
  for (const [i, a] of solid.entries()) {
    for (const b of solid.slice(i + 1)) {
      const reach = a.radius * 1.3 + b.radius * 1.3
      if (Math.hypot(a.x - b.x, a.z - b.z) > reach) continue
      for (let x = -a.radius * 1.3; x <= a.radius * 1.3; x += 1) {
        for (let z = -a.radius * 1.3; z <= a.radius * 1.3; z += 1) {
          if (islandHeight(a, x, z) <= 0) continue
          const other = groundAt(a.x + x, a.z + z, [b])
          assert.ok(other <= 0, `${a.id} and ${b.id} share land at (${a.x + x}, ${a.z + z})`)
        }
      }
    }
  }
})

test('the ring course runs through open water from gate to gate', () => {
  const opening = archGate(arch)
  const stops = ringCourse.map(stop => (stop === 'arch' ? [opening.x, opening.z] : stop))
  stops.forEach(([ax, az], index) => {
    const [bx, bz] = stops[(index + 1) % stops.length]
    const length = Math.hypot(bx - ax, bz - az)
    for (let t = 0; t <= 1; t += 1 / length) {
      const height = highestNear(ax + (bx - ax) * t, az + (bz - az) * t, 2.5)
      assert.ok(height < OPEN_WATER, `land within 2.5 m between gate ${index + 1} and the next`)
    }
  })
  for (const [x, z] of ringCourse.filter(stop => stop !== 'arch')) {
    for (const [rx, rz] of rockClusters) assert.ok(Math.hypot(rx - x, rz - z) > 9, `ring at (${x}, ${z}) is too close to the sea stacks`)
    assert.ok(Math.hypot(x, z) < 90, `ring at (${x}, ${z}) is too near the edge of the world`)
  }
})

test('the treasure stands on dry sand on the reef cay', () => {
  const cay = islands.find(island => island.id === 'reef-cay')
  for (const toward of [{ x: 0.7, z: 0.7 }, { x: -1, z: 0 }, { x: 0, z: 1 }]) {
    const spot = dryGround(cay, toward, 0.8)
    assert.ok(spot.y > 0.2, `the chest would stand at ${spot.y.toFixed(2)} m`)
    assert.ok(islandHeight(cay, spot.x, spot.z) > 0.2)
  }
})

