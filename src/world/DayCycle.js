import * as THREE from 'three'
import { shared } from './shading.js'

const DURATION = 6 * 60 // seconds for a full day

const presets = {
  day: {
    light: '#fff1de', intensity: 1.15, shadow: '#4d57ff', bounce: '#38d6e6',
    fogA: '#bff6ff', fogB: '#8f9dff', sun: [-0.5, 0.75, 0.42], night: 0,
  },
  sunset: {
    light: '#ffb08a', intensity: 1.2, shadow: '#7a3cff', bounce: '#ff9a7a',
    fogA: '#ffd2a6', fogB: '#ff79a8', sun: [-0.8, 0.52, -0.2], night: 0.45,
  },
  night: {
    light: '#8fa2ff', intensity: 1.05, shadow: '#2c2f86', bounce: '#3a5cc4',
    fogA: '#2b4686', fogB: '#121842', sun: [0.35, 0.8, -0.45], night: 1,
  },
  dawn: {
    light: '#ffc4ad', intensity: 1.1, shadow: '#b8409a', bounce: '#ff9fc4',
    fogA: '#ffd9ec', fogB: '#a6b6ff', sun: [0.8, 0.4, 0.35], night: 0.3,
  },
}

// Fraction of the day where each preset is fully reached; blends in between
const keyframes = [
  [0, 'day'],
  [0.4, 'day'],
  [0.5, 'sunset'],
  [0.6, 'night'],
  [0.82, 'night'],
  [0.92, 'dawn'],
  [1, 'day'],
]

const parsed = Object.fromEntries(
  Object.entries(presets).map(([name, preset]) => [
    name,
    {
      ...preset,
      light: new THREE.Color(preset.light),
      shadow: new THREE.Color(preset.shadow),
      bounce: new THREE.Color(preset.bounce),
      fogA: new THREE.Color(preset.fogA),
      fogB: new THREE.Color(preset.fogB),
      sun: new THREE.Vector3(...preset.sun).normalize(),
    },
  ])
)

const smooth = t => t * t * (3 - 2 * t)

// Drives every shared lighting uniform from a looping time of day. Visits
// start in the afternoon so the first look is always a sunny one; `?time=0.6`
// in the URL starts at another time (0 to 1) for testing.
export class DayCycle {
  constructor() {
    const requested = Number.parseFloat(new URLSearchParams(window.location.search).get('time'))
    this.progress = Number.isFinite(requested) ? requested % 1 : 0.18
    this.speed = 1
    this.night = 0
    this.apply()
  }

  update(delta) {
    this.progress = (this.progress + (delta * this.speed) / DURATION) % 1
    this.apply()
  }

  apply() {
    let index = 0
    while (keyframes[index + 1][0] <= this.progress) index++
    const [startStop, startName] = keyframes[index]
    const [endStop, endName] = keyframes[index + 1]
    const t = smooth((this.progress - startStop) / (endStop - startStop))
    const a = parsed[startName]
    const b = parsed[endName]

    shared.uLightColor.value.copy(a.light).lerp(b.light, t)
    shared.uLightIntensity.value = THREE.MathUtils.lerp(a.intensity, b.intensity, t)
    shared.uShadowColor.value.copy(a.shadow).lerp(b.shadow, t)
    shared.uBounceColor.value.copy(a.bounce).lerp(b.bounce, t)
    shared.uFogColorA.value.copy(a.fogA).lerp(b.fogA, t)
    shared.uFogColorB.value.copy(a.fogB).lerp(b.fogB, t)
    shared.uSunDirection.value.copy(a.sun).lerp(b.sun, t).normalize()
    this.night = THREE.MathUtils.lerp(a.night, b.night, t)
  }
}
