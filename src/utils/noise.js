// Deterministic hash in [0, 1)
export function hash2(x, z, seed = 0) {
  const value = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123
  return value - Math.floor(value)
}

const fade = t => t * t * (3 - 2 * t)

// Smooth value noise in [0, 1]
export function valueNoise(x, z, seed = 0) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const u = fade(x - xi)
  const v = fade(z - zi)
  const a = hash2(xi, zi, seed)
  const b = hash2(xi + 1, zi, seed)
  const c = hash2(xi, zi + 1, seed)
  const d = hash2(xi + 1, zi + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

// A few octaves of value noise, normalised to [0, 1]
export function fbm(x, z, seed = 0, octaves = 3) {
  let value = 0
  let amplitude = 0.5
  let frequency = 1
  let total = 0
  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * frequency, z * frequency, seed + i * 17) * amplitude
    total += amplitude
    amplitude *= 0.5
    frequency *= 2
  }
  return value / total
}

// Seeded PRNG (mulberry32) so world decoration is identical on every visit
export function createRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}
