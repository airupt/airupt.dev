import * as THREE from 'three'
import { islandHeight } from './Islands.js'

export const MAP_SIZE = 512
export const MAP_EXTENT = 128 // metres from the centre to each edge
const DEPTH_RANGE = 3 // metres of depth mapped to 0..1
const COAST_RANGE = 24 // metres of distance to land mapped to 0..1

// Bakes the sea floor of the whole archipelago into one texture at boot:
//  R = water depth (0 at the shoreline, 1 for deep water)
//  G = distance to the nearest land
// The ocean shader reads it to colour shallow water and to draw foam lines
// that follow the real coastline rather than circles around island centres.
export function bakeWaterMap(islands) {
  const size = MAP_SIZE
  const metresPerTexel = (MAP_EXTENT * 2) / size
  const heights = new Float32Array(size * size).fill(-DEPTH_RANGE)

  for (const island of islands) {
    const reach = island.radius * 1.3
    const minX = Math.max(0, Math.floor((island.x - reach + MAP_EXTENT) / metresPerTexel))
    const maxX = Math.min(size - 1, Math.ceil((island.x + reach + MAP_EXTENT) / metresPerTexel))
    const minZ = Math.max(0, Math.floor((island.z - reach + MAP_EXTENT) / metresPerTexel))
    const maxZ = Math.min(size - 1, Math.ceil((island.z + reach + MAP_EXTENT) / metresPerTexel))
    for (let tz = minZ; tz <= maxZ; tz++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const x = (tx + 0.5) * metresPerTexel - MAP_EXTENT - island.x
        const z = (tz + 0.5) * metresPerTexel - MAP_EXTENT - island.z
        const index = tz * size + tx
        heights[index] = Math.max(heights[index], islandHeight(island, x, z))
      }
    }
  }

  // Distance to land with a two-pass chamfer transform (good enough for foam)
  const distance = new Float32Array(size * size)
  for (let i = 0; i < distance.length; i++) distance[i] = heights[i] > 0 ? 0 : 1e9
  const diagonal = Math.SQRT2
  const relax = (index, neighbour, cost) => {
    if (distance[neighbour] + cost < distance[index]) distance[index] = distance[neighbour] + cost
  }
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const i = z * size + x
      if (x > 0) relax(i, i - 1, 1)
      if (z > 0) {
        relax(i, i - size, 1)
        if (x > 0) relax(i, i - size - 1, diagonal)
        if (x < size - 1) relax(i, i - size + 1, diagonal)
      }
    }
  }
  for (let z = size - 1; z >= 0; z--) {
    for (let x = size - 1; x >= 0; x--) {
      const i = z * size + x
      if (x < size - 1) relax(i, i + 1, 1)
      if (z < size - 1) {
        relax(i, i + size, 1)
        if (x < size - 1) relax(i, i + size + 1, diagonal)
        if (x > 0) relax(i, i + size - 1, diagonal)
      }
    }
  }

  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < heights.length; i++) {
    data[i * 4] = Math.min(Math.max(-heights[i] / DEPTH_RANGE, 0), 1) * 255
    data[i * 4 + 1] = Math.min((distance[i] * metresPerTexel) / COAST_RANGE, 1) * 255
    data[i * 4 + 3] = 255
  }

  const texture = new THREE.DataTexture(data, size, size)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

export const waterMapGLSL = /* glsl */ `
  uniform sampler2D uWaterMap;
  // x: depth 0..1, y: metres to the nearest land
  vec2 sampleWaterMap(vec2 world) {
    vec4 texel = texture2D(uWaterMap, (world + ${MAP_EXTENT.toFixed(1)}) / ${(MAP_EXTENT * 2).toFixed(1)});
    return vec2(texel.r, texel.g * ${COAST_RANGE.toFixed(1)});
  }
`
