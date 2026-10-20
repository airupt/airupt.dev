import * as THREE from 'three'
import { MAP_EXTENT, paths } from './layout.js'
import { fbm, smoothstep } from '../utils/noise.js'

const HALF_WIDTH = 0.42 // metres either side of a trail's centre line
const EDGE = 0.22 // how soft and wobbly the edge of bare earth is
const RESOLUTION = 1024 // texels across the whole archipelago (25 cm each)

function distanceToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax
  const dz = bz - az
  const t = Math.min(Math.max(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1), 0), 1)
  return Math.hypot(px - ax - dx * t, pz - az - dz * t)
}

// Turns an island's path layout into world-space shapes, once its shore is known
export function placePaths(island) {
  const layout = paths[island.id] ?? paths[island.section]
  if (!layout) return { lines: [], clearings: [] }
  const { shore, out } = island
  const toWorld = (along, across) => ({
    x: shore.x - out.x * along + out.z * across,
    z: shore.z - out.z * along - out.x * across,
  })
  return {
    lines: (layout.lines ?? []).map(line => line.map(([along, across]) => toWorld(along, across))),
    clearings: (layout.clearings ?? []).map(([along, across, radius]) => ({ ...toWorld(along, across), radius })),
  }
}

// How much bare earth there is at a world position, 0..1, with a ragged edge
export function pathAmount(shapes, x, z) {
  let distance = Infinity
  for (const line of shapes.lines) {
    for (let i = 1; i < line.length; i++) {
      distance = Math.min(distance, distanceToSegment(x, z, line[i - 1].x, line[i - 1].z, line[i].x, line[i].z) - HALF_WIDTH)
    }
  }
  for (const { x: cx, z: cz, radius } of shapes.clearings) distance = Math.min(distance, Math.hypot(x - cx, z - cz) - radius)
  if (distance > EDGE * 2) return 0
  const wobble = (fbm(x * 0.9, z * 0.9, 5) - 0.5) * EDGE * 2
  return 1 - smoothstep(-EDGE, EDGE, distance + wobble)
}

// The same mask baked into one texture for the ground shader
export function bakePathMap(islands) {
  const size = RESOLUTION
  const metresPerTexel = (MAP_EXTENT * 2) / size
  const data = new Uint8Array(size * size)
  for (const island of islands) {
    const shapes = island.paths
    if (!shapes.lines.length && !shapes.clearings.length) continue
    const reach = island.radius * 1.3
    const toTexel = value => Math.floor((value + MAP_EXTENT) / metresPerTexel)
    for (let tz = Math.max(0, toTexel(island.z - reach)); tz <= Math.min(size - 1, toTexel(island.z + reach)); tz++) {
      for (let tx = Math.max(0, toTexel(island.x - reach)); tx <= Math.min(size - 1, toTexel(island.x + reach)); tx++) {
        const amount = pathAmount(shapes, (tx + 0.5) * metresPerTexel - MAP_EXTENT, (tz + 0.5) * metresPerTexel - MAP_EXTENT)
        if (amount > 0) data[tz * size + tx] = Math.max(data[tz * size + tx], amount * 255)
      }
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

export const pathMapGLSL = /* glsl */ `
  uniform sampler2D uPathMap;
  float samplePathMap(vec2 world) {
    return texture2D(uPathMap, (world + ${MAP_EXTENT.toFixed(1)}) / ${(MAP_EXTENT * 2).toFixed(1)}).r;
  }
`
