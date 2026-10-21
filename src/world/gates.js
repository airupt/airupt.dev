// A gate is a line across the water the boat can pass through: the rock
// arch, a ring of the course. It has a centre, a direction it is passed in
// (`normal`, flat and unit length) and a half width.
//
// throughGate() is called every frame with the boat's position and what it
// returned last time; it reports the side the boat is on now and whether it
// just crossed from behind to in front, between the gate's ends. Far from
// the gate the side is forgotten, so going round it and back doesn't count.
export function throughGate(gate, x, z, lastSide = 0, reach = 8) {
  const dx = x - gate.x
  const dz = z - gate.z
  const along = dx * gate.normal.x + dz * gate.normal.z
  const across = Math.abs(dx * gate.normal.z - dz * gate.normal.x)
  // Exactly on the line still counts as the side it came from
  const side = Math.sign(along) || lastSide
  const through = lastSide < 0 && side > 0 && across < gate.halfWidth
  return { through, side: Math.hypot(dx, dz) < reach ? side : 0 }
}

// A gate facing along the direction from `from` to `to`
export function gateBetween(x, z, from, to, halfWidth) {
  const nx = to[0] - from[0]
  const nz = to[1] - from[1]
  const length = Math.hypot(nx, nz) || 1
  return { x, z, normal: { x: nx / length, z: nz / length }, halfWidth }
}

// The rock arch's opening, passable either way along `normal`. Its feet
// (see Rocks.addArch, thickness 1.4) are 3 m round on the west side and
// 2.4 m on the east, so the gap between them is off centre and 4.6 m wide.
export function archGate(arch) {
  const acrossX = Math.cos(arch.yaw)
  const acrossZ = -Math.sin(arch.yaw)
  const west = -arch.span / 2 + 3
  const east = arch.span / 2 - 2.4
  const middle = (west + east) / 2
  return {
    x: arch.x + acrossX * middle,
    z: arch.z + acrossZ * middle,
    normal: { x: Math.sin(arch.yaw), z: Math.cos(arch.yaw) },
    halfWidth: (east - west) / 2 - 0.3,
  }
}

// The ring course as a list of gates. Rings face along the line from the
// stop before them to the stop after; the arch faces whichever way the lap
// goes through it. The first stop is the start and finish.
export function courseGates(stops, arch, ringHalfWidth) {
  const opening = archGate(arch)
  const at = stop => (stop === 'arch' ? [opening.x, opening.z] : stop)
  return stops.map((stop, index) => {
    const before = at(stops[(index - 1 + stops.length) % stops.length])
    const after = at(stops[(index + 1) % stops.length])
    if (stop !== 'arch') return { kind: index === 0 ? 'start' : 'ring', ...gateBetween(stop[0], stop[1], before, after, ringHalfWidth) }
    const way = Math.sign((after[0] - before[0]) * opening.normal.x + (after[1] - before[1]) * opening.normal.z) || 1
    return { kind: 'arch', ...opening, normal: { x: opening.normal.x * way, z: opening.normal.z * way } }
  })
}
