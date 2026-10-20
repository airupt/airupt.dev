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
function part(geometry, hex, position = [0, 0, 0], rotation = [0, 0, 0]) {
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
function mesh(parts) {
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
  return mesh(parts)
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

// A tall signpost with one arrow per section, each in its colour and
// turned toward that island: [angle around the post, colour] pairs
export function createSignpostHub(arrows) {
  const parts = [part(box(0.18, 3, 0.18), darkWood, [0, 1.5, 0]), part(new THREE.ConeGeometry(0.16, 0.25, 4), darkWood, [0, 3.12, 0], [0, Math.PI / 4, 0])]
  arrows.forEach(([angle, hex], index) => {
    const y = 2.6 - index * 0.38
    const arrow = new THREE.Shape()
    arrow.moveTo(0, -0.14)
    arrow.lineTo(0.95, -0.14)
    arrow.lineTo(1.2, 0)
    arrow.lineTo(0.95, 0.14)
    arrow.lineTo(0, 0.14)
    arrow.closePath()
    const board = new THREE.ExtrudeGeometry(arrow, { depth: 0.05, bevelEnabled: false })
    board.translate(0.05, 0, -0.025)
    // Board points along +X; turn it to its island
    parts.push(part(board, hex, [0, y, 0], [0, angle, 0]))
  })
  return mesh(parts)
}

// A post box for the Contact island
export function createMailbox() {
  const top = new THREE.CylinderGeometry(0.22, 0.22, 0.5, 10, 1, false, 0, Math.PI)
  return mesh([
    part(box(0.1, 1.05, 0.1), darkWood, [0, 0.52, 0]),
    part(box(0.44, 0.26, 0.5), red, [0, 1.16, 0]),
    // Half a cylinder lying front to back makes the rounded lid
    part(top, red, [0, 1.29, 0], [Math.PI / 2, 0, Math.PI / 2, 'ZXY']),
    part(box(0.06, 0.24, 0.04), '#f5c542', [0.24, 1.38, 0.1]),
  ])
}

// A bench to look out over the sea from
export function createBench() {
  const parts = [part(box(1.6, 0.08, 0.42), wood, [0, 0.46, 0]), part(box(1.6, 0.3, 0.06), wood, [0, 0.72, -0.19], [-0.15, 0, 0])]
  for (const x of [-0.65, 0.65]) {
    parts.push(part(box(0.08, 0.46, 0.38), darkWood, [x, 0.23, 0]))
  }
  return mesh(parts)
}

// A striped spar buoy with a cone on top: plainly a sea mark, not a figure
export function createSparBuoy() {
  return mesh([
    part(cylinder(0.32, 0.38, 0.5, 8), red, [0, 0.05, 0]),
    part(cylinder(0.16, 0.3, 0.45, 8), white, [0, 0.52, 0]),
    part(cylinder(0.1, 0.16, 0.4, 8), red, [0, 0.94, 0]),
    part(new THREE.ConeGeometry(0.2, 0.3, 8), iron, [0, 1.3, 0]),
  ])
}
