import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createStylizedMaterial } from './shading.js'
import { createRandom } from '../utils/noise.js'

// Each island's centrepiece and the furniture around it, built from simple
// shapes in the same wood-and-paint language as the docks. Everything stands
// on y = 0 and faces +Z.

const wood = '#a5683d'
const darkWood = '#6b4630'
const iron = '#2f2b33'
const stone = '#9a948a'
const white = '#f2efe8'
const red = '#d9483b'

const color = new THREE.Color()
const matrix = new THREE.Matrix4()
const quaternion = new THREE.Quaternion()
const euler = new THREE.Euler()

// A shape, coloured and moved into place: position [x, y, z], rotation
// [x, y, z] with an optional Euler order as a fourth entry
export function part(geometry, hex, position = [0, 0, 0], rotation = [0, 0, 0]) {
  geometry = geometry.index ? geometry.toNonIndexed() : geometry
  geometry.deleteAttribute('uv')
  matrix.compose(new THREE.Vector3(...position), quaternion.setFromEuler(euler.set(...rotation)), new THREE.Vector3(1, 1, 1))
  geometry.applyMatrix4(matrix)
  color.set(hex)
  const colors = new Float32Array(geometry.attributes.position.count * 3)
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d)
const cylinder = (top, bottom, h, sides = 8) => new THREE.CylinderGeometry(top, bottom, h, sides)

let material = null
let doubleSided = null
// Thin flat pieces (pennants) are seen from both sides
const pennantMaterial = () => (doubleSided ??= createStylizedMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }, { waterLine: false, key: 'double' }))

export function mesh(parts) {
  material ??= createStylizedMaterial({ vertexColors: true, flatShading: true }, { waterLine: false })
  const object = new THREE.Mesh(mergeGeometries(parts), material)
  object.castShadow = true
  object.receiveShadow = true
  return object
}

// A proper lighthouse: a tapering tower in red and white bands, a gallery
// with a railing, a glazed lamp room and a red cap. About 10 m tall.
export function createLighthouse() {
  const parts = [part(cylinder(2, 2.2, 0.6, 10), stone, [0, 0.3, 0])]
  const bands = 6
  const height = 7.2
  for (let i = 0; i < bands; i++) {
    const bottom = 0.6 + (i / bands) * height
    const top = bottom + height / bands
    const radius = t => 1.55 - (t / (height + 0.6)) * 0.6
    parts.push(part(cylinder(radius(top), radius(bottom), height / bands, 10), i % 2 ? white : red, [0, (bottom + top) / 2, 0]))
  }
  // A door and two small windows facing out
  parts.push(part(box(0.6, 1.1, 0.2), darkWood, [0, 1.15, 1.42]))
  parts.push(part(box(0.3, 0.42, 0.2), iron, [0, 3.6, 1.24]))
  parts.push(part(box(0.3, 0.42, 0.2), iron, [0, 5.6, 1.08]))
  // Gallery and railing
  parts.push(part(cylinder(1.45, 1.3, 0.2, 10), iron, [0, 7.9, 0]))
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    parts.push(part(box(0.06, 0.55, 0.06), iron, [Math.cos(angle) * 1.32, 8.25, Math.sin(angle) * 1.32]))
  }
  parts.push(part(new THREE.TorusGeometry(1.32, 0.04, 4, 20), iron, [0, 8.5, 0], [Math.PI / 2, 0, 0]))
  // Lamp room: dark frame around warm glass, then the cap and a finial
  parts.push(part(cylinder(0.8, 0.8, 1.1, 8), '#ffe6a8', [0, 8.6, 0]))
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8
    parts.push(part(box(0.07, 1.1, 0.07), iron, [Math.cos(angle) * 0.82, 8.6, Math.sin(angle) * 0.82]))
  }
  parts.push(part(new THREE.ConeGeometry(1.05, 0.9, 10), red, [0, 9.6, 0]))
  parts.push(part(new THREE.SphereGeometry(0.14, 6, 4), iron, [0, 10.1, 0]))
  const object = mesh(parts)
  object.userData.lamp = 8.6
  return object
}

// An open timber lookout: four posts with cross braces, a railed platform,
// a pitched roof and a ladder up one side. About 6 m tall.
export function createLookout() {
  const parts = []
  const half = 1.1
  const deck = 3.6
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    parts.push(part(box(0.22, deck + 1.2, 0.22), darkWood, [sx * half, (deck + 1.2) / 2, sz * half]))
  }
  // X braces on two sides
  const brace = Math.hypot(half * 2, deck) - 0.3
  const angle = Math.atan2(half * 2, deck)
  for (const sz of [-1, 1]) {
    parts.push(part(box(0.1, brace, 0.1), wood, [0, deck / 2, sz * half], [0, 0, angle]))
    parts.push(part(box(0.1, brace, 0.1), wood, [0, deck / 2, sz * half], [0, 0, -angle]))
  }
  // Platform with planks and a railing
  parts.push(part(box(half * 2 + 0.6, 0.14, half * 2 + 0.6), wood, [0, deck, 0]))
  for (const [x, z, w, d] of [[0, -half - 0.25, half * 2 + 0.6, 0.08], [0, half + 0.25, half * 2 + 0.6, 0.08], [-half - 0.25, 0, 0.08, half * 2 + 0.6], [half + 0.25, 0, 0.08, half * 2 + 0.6]]) {
    parts.push(part(box(w, 0.08, d), wood, [x, deck + 0.85, z]))
    parts.push(part(box(w, 0.06, d), wood, [x, deck + 0.45, z]))
  }
  // Roof on the posts
  parts.push(part(new THREE.ConeGeometry(2.3, 1.2, 4), '#b5452f', [0, deck + 1.8, 0], [0, Math.PI / 4, 0]))
  // Ladder up the front
  parts.push(part(box(0.08, deck + 0.4, 0.08), wood, [-0.3, (deck + 0.4) / 2, half + 0.45], [0.12, 0, 0]))
  parts.push(part(box(0.08, deck + 0.4, 0.08), wood, [0.3, (deck + 0.4) / 2, half + 0.45], [0.12, 0, 0]))
  for (let y = 0.4; y < deck; y += 0.4) parts.push(part(box(0.6, 0.06, 0.08), wood, [0, y, half + 0.65 - y * 0.12]))
  // A cross beam under the roof for the bell to hang from
  parts.push(part(box(half * 2 + 0.2, 0.1, 0.1), darkWood, [0, deck + 1.32, 0]))

  const group = new THREE.Group()
  group.add(mesh(parts))
  // The bell swings from its pivot when someone arrives (see Reactions.js)
  const bell = new THREE.Group()
  bell.position.set(0, deck + 1.27, 0)
  bell.add(mesh([
    part(cylinder(0.03, 0.03, 0.12, 6), iron, [0, -0.06, 0]),
    part(new THREE.CylinderGeometry(0.16, 0.3, 0.42, 10, 1, true), '#d8a33a', [0, -0.33, 0]),
    part(cylinder(0.16, 0.16, 0.04, 10), '#d8a33a', [0, -0.13, 0]),
    part(new THREE.SphereGeometry(0.06, 6, 4), iron, [0, -0.52, 0]),
  ]))
  group.add(bell)
  group.userData.bell = bell
  return group
}

// An A-frame canvas tent with a darker opening at the front
export function createTent() {
  const shape = new THREE.Shape()
  shape.moveTo(-1.1, 0)
  shape.lineTo(1.1, 0)
  shape.lineTo(0, 1.55)
  shape.closePath()
  const canvas = new THREE.ExtrudeGeometry(shape, { depth: 2.4, bevelEnabled: false })
  canvas.translate(0, 0, -1.2)
  const opening = new THREE.Shape()
  opening.moveTo(-0.45, 0)
  opening.lineTo(0.45, 0)
  opening.lineTo(0, 0.95)
  opening.closePath()
  return mesh([
    part(canvas, '#e8a65a'),
    part(new THREE.ShapeGeometry(opening), '#5a3a2a', [0, 0, 1.21]),
    part(cylinder(0.04, 0.04, 1.8), darkWood, [0, 0.9, 1.3]),
    part(cylinder(0.04, 0.04, 1.8), darkWood, [0, 0.9, -1.3]),
  ])
}

// A fire pit: a ring of stones around crossed logs. The flame light sits
// just above the logs (see Lights.js).
export function createCampfire() {
  const random = createRandom(31)
  const parts = []
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2
    const size = 0.17 + random() * 0.07
    parts.push(part(new THREE.IcosahedronGeometry(size, 0), stone, [Math.cos(angle) * 0.72, size * 0.55, Math.sin(angle) * 0.72], [random(), random(), random()]))
  }
  for (let i = 0; i < 3; i++) {
    // Tilted first, then turned around the pit
    parts.push(part(cylinder(0.07, 0.08, 0.95, 6), darkWood, [0, 0.14, 0], [Math.PI / 2 - 0.25, (i / 3) * Math.PI * 2, 0, 'YXZ']))
  }
  parts.push(part(cylinder(0.5, 0.55, 0.04, 10), '#3a2a24', [0, 0.02, 0]))
  const object = mesh(parts)
  object.userData.flame = 0.3
  return object
}

// A log to sit on by the fire
export function createLogSeat() {
  return mesh([
    part(cylinder(0.2, 0.22, 1.3, 7), wood, [0, 0.2, 0], [0, 0, Math.PI / 2]),
    part(cylinder(0.16, 0.16, 0.02, 7), '#d7b07c', [0.66, 0.2, 0], [0, 0, Math.PI / 2]),
    part(cylinder(0.16, 0.16, 0.02, 7), '#d7b07c', [-0.66, 0.2, 0], [0, 0, Math.PI / 2]),
  ])
}

// A tall signpost with one arrow per section, each in its colour, turned
// toward that island and lettered with its name on both faces:
// [angle around the post, colour, name]
export function createSignpostHub(arrows) {
  const length = 2.1
  const half = 0.26
  const parts = [part(box(0.22, 3.6, 0.22), darkWood, [0, 1.8, 0]), part(new THREE.ConeGeometry(0.2, 0.3, 4), darkWood, [0, 3.75, 0], [0, Math.PI / 4, 0])]
  const labels = []

  // All names on one canvas, one row each
  const rowHeight = 96
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = rowHeight * arrows.length
  const context = canvas.getContext('2d')
  context.textBaseline = 'middle'
  // Light letters in a dark rim, so the names read on every arrow colour
  context.fillStyle = '#fffaf0'
  context.strokeStyle = '#1a2233'
  context.lineWidth = 12
  context.lineJoin = 'round'
  arrows.forEach(([, , name], index) => {
    let size = 72
    do {
      context.font = `800 ${size}px "Bricolage Grotesque", system-ui, sans-serif`
      size -= 2
    } while (context.measureText(name).width > canvas.width - 36)
    const y = rowHeight * (index + 0.5) + 2
    context.strokeText(name, 18, y)
    context.fillText(name, 18, y)
  })
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4

  arrows.forEach(([angle, hex], index) => {
    const y = 3.2 - index * 0.62
    const arrow = new THREE.Shape()
    arrow.moveTo(0, -half)
    arrow.lineTo(length - 0.3, -half)
    arrow.lineTo(length, 0)
    arrow.lineTo(length - 0.3, half)
    arrow.lineTo(0, half)
    arrow.closePath()
    const board = new THREE.ExtrudeGeometry(arrow, { depth: 0.06, bevelEnabled: false })
    board.translate(0.08, 0, -0.03)
    // Board points along +X; turn it to its island
    parts.push(part(board, hex, [0, y, 0], [0, angle, 0]))

    // The name on each face, reading from the post outward on the front
    for (const face of [1, -1]) {
      const label = new THREE.PlaneGeometry(length - 0.45, half * 1.6)
      const uv = label.attributes.uv
      for (let i = 0; i < uv.count; i++) {
        const u = face > 0 ? uv.getX(i) : 1 - uv.getX(i)
        uv.setXY(i, u, 1 - (index + 1 - uv.getY(i)) / arrows.length)
      }
      label.translate(0.08 + (length - 0.45) / 2 + 0.04, 0, 0.032 * face)
      label.rotateY(angle)
      label.translate(0, y, 0)
      // The back face points the other way
      if (face < 0) {
        const normal = label.attributes.normal
        for (let i = 0; i < normal.count; i++) normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i))
        const index = label.index.array
        for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]]
      }
      labels.push(label)
    }
  })

  // A garland strung from the post to a short pole: a pennant for every
  // section you've opened appears on it (see Reactions.js)
  const pole = new THREE.Vector3(-2.3, 0, 0.9)
  parts.push(part(box(0.12, 2.5, 0.12), darkWood, [pole.x, 1.25, pole.z]))
  const from = new THREE.Vector3(0, 3.1, 0)
  const to = new THREE.Vector3(pole.x, 2.4, pole.z)
  const sag = t => from.clone().lerp(to, t).add(new THREE.Vector3(0, -Math.sin(Math.PI * t) * 0.45, 0))
  for (let i = 0; i < 6; i++) {
    const a = sag(i / 6)
    const b = sag((i + 1) / 6)
    const rope = new THREE.CylinderGeometry(0.015, 0.015, a.distanceTo(b), 4)
    rope.translate(0, a.distanceTo(b) / 2, 0)
    rope.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()))
    rope.translate(a.x, a.y, a.z)
    parts.push(part(rope, '#3a2a24'))
  }
  const pennants = {}
  const pennantShape = new THREE.Shape()
  pennantShape.moveTo(-0.16, 0)
  pennantShape.lineTo(0.16, 0)
  pennantShape.lineTo(0, -0.4)
  pennantShape.closePath()

  const group = new THREE.Group()
  group.add(mesh(parts))
  arrows.forEach(([, hex, , id], index) => {
    const spot = sag((index + 1) / (arrows.length + 1))
    const pennant = mesh([part(new THREE.ShapeGeometry(pennantShape), hex)])
    pennant.material = pennantMaterial()
    pennant.position.copy(spot)
    // Flat along the rope, hanging down from it
    pennant.rotation.y = Math.atan2(-(to.z - from.z), to.x - from.x)
    pennant.visible = false
    group.add(pennant)
    pennants[id] = pennant
  })
  group.userData.pennants = pennants
  const lettering = new THREE.Mesh(
    mergeGeometries(labels),
    createStylizedMaterial({ map: texture, transparent: true, alphaTest: 0.5 }, { waterLine: false, key: 'hub-labels' })
  )
  group.add(lettering)
  return group
}

// A post box for the Contact island
export function createMailbox() {
  const top = new THREE.CylinderGeometry(0.22, 0.22, 0.5, 10, 1, false, 0, Math.PI)
  const group = new THREE.Group()
  group.add(mesh([
    part(box(0.1, 1.05, 0.1), darkWood, [0, 0.52, 0]),
    part(box(0.44, 0.26, 0.5), red, [0, 1.16, 0]),
    // Half a cylinder lying front to back makes the rounded lid
    part(top, red, [0, 1.29, 0], [Math.PI / 2, 0, Math.PI / 2, 'ZXY']),
  ]))
  // The flag lies flat until there's post, then swings up (see Reactions.js)
  const flag = new THREE.Group()
  flag.position.set(0.25, 1.12, 0.12)
  flag.rotation.x = Math.PI / 2
  flag.add(mesh([part(box(0.03, 0.32, 0.03), iron, [0, 0.16, 0]), part(box(0.03, 0.12, 0.16), '#f5c542', [0, 0.28, -0.08])]))
  group.add(flag)
  group.userData.flag = flag
  return group
}

// A bench to look out over the sea from
export function createBench() {
  const parts = [part(box(1.6, 0.08, 0.42), wood, [0, 0.46, 0]), part(box(1.6, 0.3, 0.06), wood, [0, 0.72, -0.19], [-0.15, 0, 0])]
  for (const x of [-0.65, 0.65]) {
    parts.push(part(box(0.08, 0.46, 0.38), darkWood, [x, 0.23, 0]))
  }
  return mesh(parts)
}

// Channel marks as sailors know them: a red can to port, a green cone to
// starboard, each banded in white
export function createSparBuoy(side = 'port') {
  const colour = side === 'port' ? red : '#2f9e5a'
  return mesh([
    part(cylinder(0.32, 0.38, 0.5, 8), colour, [0, 0.05, 0]),
    part(cylinder(0.16, 0.3, 0.45, 8), white, [0, 0.52, 0]),
    part(cylinder(0.1, 0.16, 0.4, 8), colour, [0, 0.94, 0]),
    side === 'port' ? part(cylinder(0.2, 0.2, 0.32, 8), colour, [0, 1.3, 0]) : part(new THREE.ConeGeometry(0.22, 0.36, 8), colour, [0, 1.32, 0]),
  ])
}

// A stack of sawn planks on two bearers, and a couple of logs waiting beside it
export function createLumber() {
  const random = createRandom(57)
  const parts = [part(box(0.16, 0.12, 1.1), darkWood, [-0.7, 0.06, 0]), part(box(0.16, 0.12, 1.1), darkWood, [0.7, 0.06, 0])]
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 4 - layer; i++) {
      const z = (i - (3 - layer) / 2) * 0.27
      parts.push(part(box(2 - random() * 0.2, 0.09, 0.24), layer % 2 ? '#c08552' : wood, [(random() - 0.5) * 0.1, 0.17 + layer * 0.1, z]))
    }
  }
  parts.push(part(cylinder(0.14, 0.15, 1.6, 7), darkWood, [0.2, 0.15, 0.85], [0, 0, Math.PI / 2]))
  parts.push(part(cylinder(0.12, 0.13, 1.4, 7), darkWood, [-0.1, 0.13, 1.15], [0, 0.2, Math.PI / 2, 'YXZ']))
  return mesh(parts)
}

// A carpenter's workbench: a thick top on four legs with a shelf, a vice at
// one end, a hammer and a mallet lying on it
export function createWorkbench() {
  const parts = [part(box(1.5, 0.1, 0.62), wood, [0, 0.86, 0]), part(box(1.3, 0.05, 0.5), darkWood, [0, 0.3, 0])]
  for (const [x, z] of [[-0.66, -0.24], [0.66, -0.24], [-0.66, 0.24], [0.66, 0.24]]) parts.push(part(box(0.09, 0.86, 0.09), darkWood, [x, 0.43, z]))
  // The vice: an iron jaw and its screw
  parts.push(part(box(0.18, 0.16, 0.2), iron, [0.62, 0.99, 0.3]))
  parts.push(part(cylinder(0.025, 0.025, 0.3, 6), iron, [0.62, 0.95, 0.48], [Math.PI / 2, 0, 0]))
  // Hammer and mallet on the top
  parts.push(part(box(0.05, 0.04, 0.34), wood, [-0.2, 0.93, 0.05], [0, 0.4, 0]))
  parts.push(part(box(0.14, 0.07, 0.06), iron, [-0.27, 0.95, -0.1], [0, 0.4, 0]))
  parts.push(part(box(0.05, 0.04, 0.3), wood, [0.15, 0.93, -0.1], [0, -0.3, 0]))
  parts.push(part(cylinder(0.06, 0.06, 0.16, 8), '#c08552', [0.2, 0.96, 0.05], [0, -0.3, Math.PI / 2, 'YXZ']))
  // A box of nails under the top
  parts.push(part(box(0.3, 0.16, 0.24), '#b57a49', [-0.35, 0.4, 0]))
  return mesh(parts)
}
