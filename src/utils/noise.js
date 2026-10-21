// Deterministic hash in [0, 1)
export function hash2(x, z, seed = 0) {
  const value = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453123
  return value - Math.floor(value)
}

const fade = t => t * t * (3 - 2 * t)

// Smooth value noise in [0, 1]
function valueNoise(x, z, seed = 0) {
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

// Value noise that wraps around every `period` lattice cells, so a texture
// built from it tiles seamlessly
function tileableValueNoise(x, z, period, seed) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const u = fade(x - xi)
  const v = fade(z - zi)
  const wrap = n => ((n % period) + period) % period
  const a = hash2(wrap(xi), wrap(zi), seed)
  const b = hash2(wrap(xi + 1), wrap(zi), seed)
  const c = hash2(wrap(xi), wrap(zi + 1), seed)
  const d = hash2(wrap(xi + 1), wrap(zi + 1), seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

// RGBA noise baked once at boot so shaders do one texture fetch instead of
// noise maths: R and G are two independent tileable fBm fields, B is white noise
export function createNoiseData(size = 256, period = 8, octaves = 4) {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const channels = [11, 29].map(seed => {
        let value = 0
        let amplitude = 0.5
        let total = 0
        for (let octave = 0; octave < octaves; octave++) {
          const scale = period * 2 ** octave
          value += tileableValueNoise((x / size) * scale, (y / size) * scale, scale, seed + octave) * amplitude
          total += amplitude
          amplitude *= 0.5
        }
        return value / total
      })
      const index = (y * size + x) * 4
      data[index] = channels[0] * 255
      data[index + 1] = channels[1] * 255
      data[index + 2] = hash2(x, y, 7) * 255
      data[index + 3] = 255
    }
  }
  return { data, size }
}

export function smoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1)
  return t * t * (3 - 2 * t)
}
