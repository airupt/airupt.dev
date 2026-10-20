import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d'
import { islands as layout, spawn } from './layout.js'
import { fbm, hash2, smoothstep } from '../utils/noise.js'
import { createStylizedMaterial } from './shading.js'

const raycaster = new THREE.Raycaster()
const rayOrigin = new THREE.Vector3()
const down = new THREE.Vector3(0, -1, 0)

const palette = {
  wetSand: new THREE.Color('#c9ad72'),
  sand: new THREE.Color('#edd29b'),
  drySand: new THREE.Color('#e6c98a'),
  grass: new THREE.Color('#7cc35b'),
  darkGrass: new THREE.Color('#5ea84a'),
  rock: new THREE.Color('#b8ad9a'),
  darkRock: new THREE.Color('#7c776f'),
  dirt: new THREE.Color('#b49a64'),
  ash: new THREE.Color('#6e6058'),
  scorched: new THREE.Color('#4f4440'),
}

const CELL = 1.8
const TERRACE_STEP = 1.1

// Which way an island's beach and dock face: its own `facing`, or the start point
export function facingDirection(island) {
  if (island.facing) return { x: island.facing[0], z: island.facing[1] }
  const dx = spawn.x - island.x
  const dz = spawn.z - island.z
  const length = Math.hypot(dx, dz) || 1
  return { x: dx / length, z: dz / length }
}

// Ground height at a point given relative to the island centre. Mesh vertices
// and the baked sea map both come from here, so they always agree.
//  - every blob is a dome; the island is the highest dome at each point
//  - the side facing the start slopes gently into a beach, the far side rises
//    into a cliff
//  - terraced islands step their slopes; the volcano is a cone with a crater
export function islandHeight(island, x, z) {
  const toward = facingDirection(island)
  const facing = (x * toward.x + z * toward.z) / (Math.hypot(x, z) || 1)
  const beach = smoothstep(0.1, 0.9, facing)
  const cliff = 1 - smoothstep(-0.8, -0.1, facing)

  const noise = fbm(x * 0.11 + island.seed, z * 0.11, island.seed)
  let elevation = 0
  let nearest = Infinity

  island.blobs.forEach(([bx, bz, radius, height], index) => {
    const distance = Math.hypot(x - bx, z - bz) / radius + (noise - 0.5) * 0.3
    nearest = Math.min(nearest, distance)
    let dome
    if (island.volcano && index === 0) {
      // Concave flanks rising to a steep summit, like a real stratovolcano
      dome = Math.pow(Math.max(0, 1 - distance), 1.4)
      // The crater: a bowl sunk into the summit
      dome -= 0.45 * (1 - smoothstep(0.08, 0.24, distance))
    } else {
      dome = Math.pow(Math.max(0, 1 - distance * distance), 1.2 + beach * 0.9 - cliff * 0.5)
    }
    elevation = Math.max(elevation, height * (1 + cliff * 0.3) * dome)
  })

  let y = elevation * (island.volcano ? 0.9 + noise * 0.2 : 0.6 + noise * 0.8)

  if (island.terraces) {
    const level = Math.floor(y / TERRACE_STEP) * TERRACE_STEP
    const stepped = level + smoothstep(0.7, 1, (y - level) / TERRACE_STEP) * TERRACE_STEP
    y += (stepped - y) * 0.85 * smoothstep(0.4, 1.2, y)
  }

  return y - 0.6 - 2.5 * smoothstep(0.75 + cliff * 0.12, 1.3 - cliff * 0.18, nearest)
}

function createTerrain(island) {
  const extent = island.radius * 1.3
  const segments = Math.max(12, Math.round((extent * 2) / CELL))
  const geometry = new THREE.PlaneGeometry(extent * 2, extent * 2, segments, segments)
  geometry.rotateX(-Math.PI / 2)

  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i++) {
    // Jitter the grid so faces don't read as neat rows
    const x = position.getX(i) + (hash2(i, 1, island.seed) - 0.5) * CELL * 0.45
    const z = position.getZ(i) + (hash2(i, 2, island.seed) - 0.5) * CELL * 0.45
    position.setXYZ(i, x, islandHeight(island, x, z), z)
  }

  return geometry
}

// One flat colour per face, picked from height and slope. Grass faces are
// collected (positions and colour) so blades can be grown on them later.
function paint(geometry, island, grass) {
  const position = geometry.attributes.position
  const colors = new Float32Array(position.count * 3)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const normal = new THREE.Vector3()
  const color = new THREE.Color()
  const { seed } = island

  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i)
    b.fromBufferAttribute(position, i + 1)
    c.fromBufferAttribute(position, i + 2)
    normal.subVectors(c, b).cross(a.clone().sub(b)).normalize()
    const height = (a.y + b.y + c.y) / 3
    const variation = hash2(i, 3, seed)

    const volcanic = island.volcano && height > 5.5
    // Only truly steep faces are bare rock; moderately steep ones are dry earth
    const isGrass = !volcanic && height >= 0.5 && normal.y >= 0.75
    const isRock = normal.y < 0.62
    if (height < -0.2) color.copy(palette.wetSand)
    else if (height < 0.5) color.copy(palette.sand).lerp(palette.drySand, variation)
    else if (volcanic) color.copy(height > 11 ? palette.scorched : palette.ash).lerp(palette.darkRock, variation * 0.4)
    // Rock is warm and light up high, cooler and darker toward the sea
    else if (isRock) color.copy(palette.darkRock).lerp(palette.rock, smoothstep(0.5, 5, height) * 0.8 + variation * 0.2)
    else if (!isGrass) color.copy(palette.dirt).lerp(palette.grass, variation * 0.35)
    else color.copy(palette.grass).lerp(palette.darkGrass, variation)

    color.multiplyScalar(0.96 + hash2(i, 4, seed) * 0.08)
    if (isGrass) grass.push({ a: a.clone(), b: b.clone(), c: c.clone(), color: color.clone() })
    for (let j = 0; j < 3; j++) color.toArray(colors, (i + j) * 3)
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
}

export class Islands {
  constructor(app) {
    this.app = app
    this.material = createStylizedMaterial({ vertexColors: true, flatShading: true })
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
    const grass = []
    paint(geometry, definition, grass)

    const mesh = new THREE.Mesh(geometry, this.material)
    mesh.position.set(definition.x, 0, definition.z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.updateMatrixWorld()
    this.app.scene.add(mesh)

    let top = 0
    for (let i = 1; i < vertices.length; i += 3) top = Math.max(top, vertices[i])

    // Grass triangles are in island space; offsetting them gives world space
    const island = { ...definition, mesh, top, grass }
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
    island.out = facingDirection(island)
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
