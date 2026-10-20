// One set of waves drives both the ocean shader and buoyancy, so whatever
// floats sits exactly on the surface you see.
const waves = [
  { direction: [1, 0.25], amplitude: 0.32, length: 22, speed: 1.1 },
  { direction: [-0.35, 1], amplitude: 0.18, length: 11, speed: 1.5 },
  { direction: [0.6, -0.9], amplitude: 0.08, length: 5, speed: 2.2 },
]

const prepared = waves.map(({ direction, amplitude, length, speed }) => {
  const norm = Math.hypot(direction[0], direction[1])
  return { dx: direction[0] / norm, dz: direction[1] / norm, k: (2 * Math.PI) / length, amplitude, speed }
})

export function waveHeight(x, z, time) {
  let height = 0
  for (const wave of prepared) {
    height += wave.amplitude * Math.sin((wave.dx * x + wave.dz * z) * wave.k + time * wave.speed)
  }
  return height
}

const glsl = value => value.toFixed(6)

// The same sum as waveHeight(), written out as a GLSL function
export function waveHeightGLSL() {
  const terms = prepared.map(
    wave => `${glsl(wave.amplitude)} * sin((${glsl(wave.dx)} * p.x + ${glsl(wave.dz)} * p.y) * ${glsl(wave.k)} + time * ${glsl(wave.speed)})`
  )
  return `float waveHeight(vec2 p, float time) {\n  return ${terms.join('\n    + ')};\n}`
}
