import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d'
import { islands as layout } from './layout.js'
import { fbm, hash2, smoothstep } from '../utils/noise.js'
import { facingDirection, islandHeight } from './terrain.js'
import { createStylizedMaterial } from './shading.js'
import { bakePathMap, pathMapGLSL } from './Paths.js'
import { planIsland } from './IslandScenes.js'
import { contactShadowGLSL, createEmptyContactMap } from './ContactShadows.js'

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
  ash: new THREE.Color('#6e6058'),
  scorched: new THREE.Color('#4f4440'),
}

const CELL = 0.95
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

    // On the volcano, grass gives way to ash over a ragged band of height
    // rather than along one line of triangles
    const ashiness = island.volcano ? smoothstep(4.6, 6.6, height + (fbm(a.x * 0.3, a.z * 0.3, 7) - 0.5) * 2.4) : 0
    const volcanic = ashiness > 0.55
    // Steep faces are bare rock; everything gentler above the beach is grass
    // (bare earth only shows where paths are worn in, see Paths.js)
    const isRock = normal.y < 0.64
    const isGrass = !volcanic && !isRock && height >= 0.5
    // Sand faces just below the grass get a sparse fringe of blades
    const isFringe = !volcanic && !isRock && height >= 0.1 && height < 0.5
    if (height < -0.2) color.copy(palette.wetSand)
    else if (height < 0.5) color.copy(palette.sand).lerp(palette.drySand, variation)
    else if (volcanic) color.copy(height > 11 ? palette.scorched : palette.ash).lerp(palette.darkRock, variation * 0.4)
    // Rock is warm and light up high, cooler and darker toward the sea
    else if (isRock) {
      color.copy(palette.darkRock).lerp(palette.rock, smoothstep(0.5, 5, height) * 0.8 + variation * 0.2)
      // Darker where the sea wets the foot of a cliff, lighter at its sunny lip
      color.multiplyScalar(0.72 + smoothstep(-0.4, 2.5, height) * 0.43)
    }
    // Steeper grass (terrace risers, banks) a shade darker
    else {
      color.copy(palette.grass).lerp(palette.darkGrass, Math.min(variation + smoothstep(0.85, 0.7, normal.y) * 0.6, 1))
      // Dusted with ash toward the volcano's bare cone
      color.lerp(palette.ash, ashiness * 0.75)
    }

    color.multiplyScalar(0.96 + hash2(i, 4, seed) * 0.08)
    // Blades thin out as the ash takes over
    if (isGrass) grass.push({ a: a.clone(), b: b.clone(), c: c.clone(), color: color.clone(), density: 1 - ashiness * 1.6 })
    if (isFringe) grass.push({ a: a.clone(), b: b.clone(), c: c.clone(), color: palette.grass.clone().lerp(palette.drySand, 0.3) })
    for (let j = 0; j < 3; j++) color.toArray(colors, (i + j) * 3)
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
}

export class Islands {
  constructor(app) {
    this.app = app
    this.material = createStylizedMaterial({ vertexColors: true, flatShading: true }, { key: 'island', extend: shader => this.extend(shader) })
    this.list = layout.map(definition => this.create(definition))
    this.uniforms = {
      uPathMap: { value: bakePathMap(this.list) },
      uEarth: { value: new THREE.Color('#dcb47c') },
      uDarkEarth: { value: new THREE.Color('#c9a06a') },
      // Baked once the props are placed (see World.load)
      uContactMap: { value: createEmptyContactMap() },
    }
  }

  // Worn footpaths blended into the ground per pixel, so their edges are
  // soft and wobbly instead of following the terrain's triangles
  extend(shader) {
    Object.assign(shader.uniforms, this.uniforms)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uEarth;\nuniform vec3 uDarkEarth;\n${pathMapGLSL}\n${contactShadowGLSL}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float bare = samplePathMap(vStylizedWorld.xz) * smoothstep(0.15, 0.45, vStylizedWorld.y);
        vec3 earth = mix(uEarth, uDarkEarth, texture2D(uNoise, vStylizedWorld.xz * 0.45).r);
        diffuseColor.rgb = mix(diffuseColor.rgb, earth, bare);
        // Darker where something stands, so it looks planted
        diffuseColor.rgb *= 1.0 - sampleContact(vStylizedWorld.xz) * 0.42;`
      )
      // Trodden earth is pale and dusty: on a slope it keeps more light than
      // grass would, so a trail never reads as a dark trench
      .replace('// STYLIZED_SHADE', 'shade *= 1.0 - samplePathMap(vStylizedWorld.xz) * 0.45;')
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

    let top = -Infinity
    for (let i = 1; i < vertices.length; i += 3) top = Math.max(top, vertices[i])
    // A reef lies wholly under the opaque sea: only the sea map shows it
    mesh.visible = top > 0

    // Grass triangles are in island space; offsetting them gives world space
    const island = { ...definition, mesh, top, grass }
    this.findShore(island)
    island.plan = planIsland(island, this.app.cameraRig)
    island.paths = island.plan?.paths ?? { lines: [], clearings: [] }
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
