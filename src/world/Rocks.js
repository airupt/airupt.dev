import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createRandom, fbm } from '../utils/noise.js'
import { createStylizedMaterial } from './shading.js'

const light = new THREE.Color('#c2b8a6')
const dark = new THREE.Color('#7a746c')
const moss = new THREE.Color('#7fae5a')
const wet = new THREE.Color('#5f5a54')

const a = new THREE.Vector3()
const b = new THREE.Vector3()
const c = new THREE.Vector3()
const normal = new THREE.Vector3()
const color = new THREE.Color()

// Flat colour per face, like the island rock: lighter and warmer on faces
// turned to the sky, darker on the sides, darkest just above the water where
// the sea keeps it wet. Some tops carry a little moss.
function paintRock(geometry, random, mossy) {
  if (geometry.index) geometry = geometry.toNonIndexed()
  const position = geometry.attributes.position
  const colors = new Float32Array(position.count * 3)
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i)
    b.fromBufferAttribute(position, i + 1)
    c.fromBufferAttribute(position, i + 2)
    normal.subVectors(c, b).cross(a.clone().sub(b)).normalize()
    const height = (a.y + b.y + c.y) / 3
    color.copy(dark).lerp(light, Math.min(Math.max(normal.y * 0.7 + 0.35 + (random() - 0.5) * 0.25, 0), 1))
    if (height < 0.35) color.lerp(wet, 0.5)
    if (mossy && normal.y > 0.75 && random() < 0.7) color.lerp(moss, 0.75)
    for (let j = 0; j < 3; j++) color.toArray(colors, (i + j) * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

// Pushes every vertex in or out by smooth noise, so shared corners stay
// joined and the shape reads as one weathered lump
function roughen(geometry, seed, amount, frequency) {
  const position = geometry.attributes.position
  const point = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i)
    const push = (fbm(point.x * frequency + seed, point.z * frequency + point.y * 0.7, seed) - 0.5) * 2 * amount
    point.addScaledVector(point.clone().setY(point.y * 0.3).normalize(), push)
    position.setXYZ(i, point.x, point.y, point.z)
  }
}

// A rock standing in the sea, base well below the waterline.
// width: across at the waterline, height: above the water
export function createRockGeometry(seed, { width = 2, height = 2, mossy = false } = {}) {
  const random = createRandom(seed)
  // Detail 1 merges into few large facets: low-poly, but not a crystal
  const geometry = new THREE.IcosahedronGeometry(1, 1)
  roughen(geometry, seed, 0.28, 0.9)
  geometry.scale(width / 2, (height + 1.5) / 2, (width / 2) * (0.7 + random() * 0.5))
  // Tapers toward the top like a sea stack
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i++) {
    const t = (position.getY(i) / ((height + 1.5) / 2) + 1) / 2
    const taper = 1 - t * 0.35
    position.setX(i, position.getX(i) * taper)
    position.setZ(i, position.getZ(i) * taper)
  }
  geometry.translate(0, (height + 1.5) / 2 - 1.5, 0)
  geometry.rotateY(random() * Math.PI * 2)
  return paintRock(geometry, random, mossy)
}

// A natural arch the boat can sail under, built like the real thing: a
// crooked bridge of big weathered blocks, heavy where it meets the sea and
// thinner over the top, no two blocks the same. span: metres between the
// centres of its feet.
export function createArchGeometry(seed, { span = 8, thickness = 1.3 } = {}) {
  const random = createRandom(seed)
  const radius = span / 2
  const blocks = []
  const count = 9
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    // Not a perfect half circle: a little flattened and lopsided
    const angle = Math.PI * (1 - t)
    const x = Math.cos(angle) * radius * (1 + (random() - 0.5) * 0.08)
    const y = Math.sin(angle) * radius * 0.92 + (t > 0.5 ? 0.35 : 0) - 0.8
    const feet = Math.pow(1 - Math.sin(angle), 1.5)
    const size = thickness * (0.95 + feet * 1.25 + random() * 0.3) * (x < 0 ? 1.12 : 1)
    const block = new THREE.IcosahedronGeometry(1, 1)
    roughen(block, seed + i * 13, 0.32, 0.9)
    block.scale(size * (0.9 + random() * 0.3), size * (0.75 + random() * 0.25), size * (0.85 + random() * 0.3))
    block.rotateY(random() * Math.PI)
    block.rotateZ((random() - 0.5) * 0.6)
    block.translate(x, y, (random() - 0.5) * 0.5)
    blocks.push(block)
  }
  // The feet run on down into the sea
  for (const side of [-1, 1]) {
    const foot = new THREE.IcosahedronGeometry(1, 1)
    roughen(foot, seed + side * 7, 0.3, 0.8)
    foot.scale(thickness * 2.1, thickness * 2.4, thickness * 1.9)
    foot.translate(side * radius * 1.02, -1.6, 0)
    blocks.push(foot)
  }
  const geometry = mergeGeometries(blocks.map(block => (block.index ? block.toNonIndexed() : block)))
  return paintRock(geometry, random, true)
}

// Collects every rock in the world (shore boulders, sea stacks, the arch)
// and draws them as one mesh, with simple colliders for the boat
export class RockField {
  constructor(app) {
    this.app = app
    this.parts = []
  }

  collider(x, y, z, radius, halfHeight) {
    const { world } = this.app.physics
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z))
    world.createCollider(RAPIER.ColliderDesc.cylinder(halfHeight, radius), body)
  }

  // A rock whose waterline (or ground line) is at y
  add(x, y, z, { width, height, mossy = false, solid = true }) {
    const seed = Math.abs(Math.round(x * 131 + z * 71)) % 100000
    const geometry = createRockGeometry(seed, { width, height, mossy })
    geometry.translate(x, y, z)
    this.parts.push(geometry)
    if (solid) this.collider(x, y + height / 2 - 0.5, z, width * 0.42, (height + 1) / 2)
  }

  addArch(x, z, yaw, { span = 8, thickness = 1.3 } = {}) {
    const geometry = createArchGeometry(Math.round(x * 31 + z * 17), { span, thickness })
    geometry.rotateY(yaw)
    geometry.translate(x, 0, z)
    this.parts.push(geometry)
    // Only the feet stop the boat; the opening between them is clear.
    // Fallen blocks lie around the outside of each foot.
    for (const side of [-1, 1]) {
      const footX = x + Math.cos(yaw) * side * (span / 2)
      const footZ = z - Math.sin(yaw) * side * (span / 2)
      this.collider(footX, 1, footZ, thickness * (side < 0 ? 2.15 : 1.7), 3)
      for (let i = 0; i < 2; i++) {
        const along = side * (thickness * 2.2 + i * 1.3)
        const across = (i - 0.5) * 2.2
        this.add(x + Math.cos(yaw) * (side * span / 2 + along) + Math.sin(yaw) * across, 0, z - Math.sin(yaw) * (side * span / 2 + along) + Math.cos(yaw) * across, {
          width: 1 + i * 0.4,
          height: 0.3 + i * 0.4,
        })
      }
    }
  }

  build() {
    const mesh = new THREE.Mesh(mergeGeometries(this.parts), createStylizedMaterial({ vertexColors: true, flatShading: true }))
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.app.scene.add(mesh)
    this.parts = []
  }
}
