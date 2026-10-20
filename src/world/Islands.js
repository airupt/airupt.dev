import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { islands as layout, spawn } from './layout.js'
import { fbm, hash2, smoothstep } from '../utils/noise.js'

const raycaster = new THREE.Raycaster()
const rayOrigin = new THREE.Vector3()
const down = new THREE.Vector3(0, -1, 0)

const palette = {
  wetSand: new THREE.Color('#c9ad72'),
  sand: new THREE.Color('#efd69c'),
  grass: new THREE.Color('#7cc35b'),
  darkGrass: new THREE.Color('#5ea84a'),
  rock: new THREE.Color('#9b968b'),
}

const CELL = 1.8

// Heightfield island: a noisy dome that sinks under the sea at its edges
function createTerrain({ radius, height, seed }) {
  const extent = radius * 1.4
  const segments = Math.max(12, Math.round((extent * 2) / CELL))
  const geometry = new THREE.PlaneGeometry(extent * 2, extent * 2, segments, segments)
  geometry.rotateX(-Math.PI / 2)

  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i++) {
    // Jitter the grid so faces don't read as neat rows
    const x = position.getX(i) + (hash2(i, 1, seed) - 0.5) * CELL * 0.45
    const z = position.getZ(i) + (hash2(i, 2, seed) - 0.5) * CELL * 0.45

    const noise = fbm(x * 0.11 + seed, z * 0.11, seed)
    const distance = Math.hypot(x, z) / radius + (noise - 0.5) * 0.3
    const dome = Math.pow(Math.max(0, 1 - distance * distance), 1.2)
    const y = height * dome * (0.6 + noise * 0.8) - 0.6 - 2.5 * smoothstep(0.75, 1.3, distance)

    position.setXYZ(i, x, y, z)
  }

  return geometry
}

// One flat colour per face, picked from height and slope
function paint(geometry, seed) {
  const position = geometry.attributes.position
  const colors = new Float32Array(position.count * 3)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const normal = new THREE.Vector3()
  const color = new THREE.Color()

  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i)
    b.fromBufferAttribute(position, i + 1)
    c.fromBufferAttribute(position, i + 2)
    normal.subVectors(c, b).cross(a.clone().sub(b)).normalize()
    const height = (a.y + b.y + c.y) / 3

    if (height < -0.2) color.copy(palette.wetSand)
    else if (height < 0.5) color.copy(palette.sand)
    else if (normal.y < 0.75) color.copy(palette.rock)
    else color.copy(palette.grass).lerp(palette.darkGrass, hash2(i, 3, seed))

    color.multiplyScalar(0.96 + hash2(i, 4, seed) * 0.08)
    for (let j = 0; j < 3; j++) color.toArray(colors, (i + j) * 3)
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
}

export class Islands {
  constructor(app) {
    this.app = app
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 })
    this.list = layout.map(definition => this.create(definition))
  }

  create(definition) {
    const terrain = createTerrain(definition)

    const vertices = terrain.attributes.position.array
    const indices = Uint32Array.from(terrain.index.array)
    const body = this.app.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(definition.x, 0, definition.z)
    )
    this.app.physics.world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.6), body)

    const geometry = terrain.toNonIndexed()
    paint(geometry, definition.seed)

    const mesh = new THREE.Mesh(geometry, this.material)
    mesh.position.set(definition.x, 0, definition.z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.updateMatrixWorld()
    this.app.scene.add(mesh)

    let top = 0
    for (let i = 1; i < vertices.length; i += 3) top = Math.max(top, vertices[i])

    const island = { ...definition, mesh, top }
    this.findShore(island)
    return island
  }

  // Ground height and steepness at a world position, or null off the island
  surfaceAt(island, x, z) {
    raycaster.set(rayOrigin.set(x, 50, z), down)
    const hit = raycaster.intersectObject(island.mesh, false)[0]
    return hit ? { y: hit.point.y, normalY: hit.face.normal.y } : null
  }

  // Walks from the centre toward the start point until the ground meets the
  // sea. Docks and section buoys are placed from this point.
  findShore(island) {
    const dx = spawn.x - island.x
    const dz = spawn.z - island.z
    const length = Math.hypot(dx, dz) || 1
    island.out = { x: dx / length, z: dz / length }
    island.shore = { x: island.x, z: island.z }

    for (let distance = 0; distance < island.radius * 1.3; distance += 0.25) {
      const x = island.x + island.out.x * distance
      const z = island.z + island.out.z * distance
      const surface = this.surfaceAt(island, x, z)
      island.shore = { x, z }
      if (!surface || surface.y < 0.25) break
    }
  }
}
