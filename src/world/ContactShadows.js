import * as THREE from 'three'
import { MAP_EXTENT } from './layout.js'

const RESOLUTION = 1024 // texels across the whole archipelago (25 cm each)

// Soft dark patches baked into the ground wherever something stands on it,
// so a post, a barrel or a tree trunk looks planted rather than set down.
// `spots` are { x, z, radius } in metres; the patch reaches a little past
// the radius and is darkest under the middle.
export function bakeContactShadows(spots) {
  const size = RESOLUTION
  const metresPerTexel = (MAP_EXTENT * 2) / size
  const data = new Uint8Array(size * size)
  const toTexel = value => Math.floor((value + MAP_EXTENT) / metresPerTexel)

  for (const { x, z, radius } of spots) {
    const reach = radius * 1.35
    for (let tz = Math.max(0, toTexel(z - reach)); tz <= Math.min(size - 1, toTexel(z + reach)); tz++) {
      for (let tx = Math.max(0, toTexel(x - reach)); tx <= Math.min(size - 1, toTexel(x + reach)); tx++) {
        const dx = (tx + 0.5) * metresPerTexel - MAP_EXTENT - x
        const dz = (tz + 0.5) * metresPerTexel - MAP_EXTENT - z
        const t = Math.hypot(dx, dz) / reach
        if (t >= 1) continue
        // Smooth falloff: full under the object, fading to nothing at the edge
        const amount = (1 - t * t) * (1 - t * t)
        const index = tz * size + tx
        data[index] = Math.max(data[index], amount * 255)
      }
    }
  }

  const texture = new THREE.DataTexture(data, size, size, THREE.RedFormat)
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

export function createEmptyContactMap() {
  const texture = new THREE.DataTexture(new Uint8Array(1), 1, 1, THREE.RedFormat)
  texture.needsUpdate = true
  return texture
}

export const contactShadowGLSL = /* glsl */ `
  uniform sampler2D uContactMap;
  float sampleContact(vec2 world) {
    return texture2D(uContactMap, (world + ${MAP_EXTENT.toFixed(1)}) / ${(MAP_EXTENT * 2).toFixed(1)}).r;
  }
`
