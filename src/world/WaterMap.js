import * as THREE from 'three'
import { islandHeight } from './Islands.js'
import { MAP_EXTENT } from './layout.js'

export const MAP_SIZE = 512
const DEPTH_RANGE = 3 // metres of depth mapped to 0..1
const COAST_RANGE = 24 // metres of distance to land mapped to 0..1

// Bakes the sea floor of the whole archipelago into one texture at boot:
//  R = water depth (0 at the shoreline, 1 for deep water)
//  G = distance to the nearest land
// The ocean shader reads it to colour shallow water and to draw foam lines
// that follow the real coastline rather than circles around island centres.
// `rocks` are [x, z, radius] spots of rock in open water: they get a little
// ring of turquoise shallows around them
export function bakeWaterMap(islands, rocks = []) {
  const size = MAP_SIZE
  const metresPerTexel = (MAP_EXTENT * 2) / size
  const heights = new Float32Array(size * size).fill(-DEPTH_RANGE)

  for (const [rx, rz, radius] of rocks) {
    const reach = radius * 2.6
    for (let tz = Math.max(0, Math.floor((rz - reach + MAP_EXTENT) / metresPerTexel)); tz <= Math.min(size - 1, Math.ceil((rz + reach + MAP_EXTENT) / metresPerTexel)); tz++) {
      for (let tx = Math.max(0, Math.floor((rx - reach + MAP_EXTENT) / metresPerTexel)); tx <= Math.min(size - 1, Math.ceil((rx + reach + MAP_EXTENT) / metresPerTexel)); tx++) {
        const distance = Math.hypot((tx + 0.5) * metresPerTexel - MAP_EXTENT - rx, (tz + 0.5) * metresPerTexel - MAP_EXTENT - rz) / radius
        // Just under the surface at the rock (no land, so no surf pad: the
        // rocks get their own foam where they meet the water)
        const height = -0.15 - Math.pow(Math.max(distance - 0.55, 0) / 2, 0.8) * DEPTH_RANGE * 1.1
        const index = tz * size + tx
        heights[index] = Math.max(heights[index], height)
      }
    }
  }

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

  // Exact Euclidean distance to land (Felzenszwalb & Huttenlocher), so foam
  // lines stay round instead of turning into octagons like a chamfer metric
  const distance = new Float32Array(size * size)
  for (let i = 0; i < distance.length; i++) distance[i] = heights[i] > 0 ? 0 : 1e12
  const line = new Float32Array(size)
  const result = new Float32Array(size)
  const hull = new Int32Array(size)
  const bounds = new Float32Array(size + 1)
  const transform = () => {
    let k = 0
    hull[0] = 0
    bounds[0] = -Infinity
    bounds[1] = Infinity
    for (let q = 1; q < size; q++) {
      let s = (line[q] + q * q - (line[hull[k]] + hull[k] * hull[k])) / (2 * q - 2 * hull[k])
      while (s <= bounds[k]) {
        k--
        s = (line[q] + q * q - (line[hull[k]] + hull[k] * hull[k])) / (2 * q - 2 * hull[k])
      }
      k++
      hull[k] = q
      bounds[k] = s
      bounds[k + 1] = Infinity
    }
    k = 0
    for (let q = 0; q < size; q++) {
      while (bounds[k + 1] < q) k++
      result[q] = (q - hull[k]) ** 2 + line[hull[k]]
    }
  }
  for (let x = 0; x < size; x++) {
    for (let z = 0; z < size; z++) line[z] = distance[z * size + x]
    transform()
    for (let z = 0; z < size; z++) distance[z * size + x] = result[z]
  }
  for (let z = 0; z < size; z++) {
    line.set(distance.subarray(z * size, (z + 1) * size))
    transform()
    for (let x = 0; x < size; x++) distance[z * size + x] = Math.sqrt(result[x])
  }

  // A light blur takes the staircase of the texel grid out of the contours
  const blurred = new Float32Array(distance.length)
  for (let pass = 0; pass < 2; pass++) {
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        let sum = 0
        let count = 0
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx
            const nz = z + dz
            if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue
            sum += distance[nz * size + nx]
            count++
          }
        }
        blurred[z * size + x] = sum / count
      }
    }
    distance.set(blurred)
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
