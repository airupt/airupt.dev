import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createRandom } from '../utils/noise.js'

export const DOCK_LENGTH = 5
export const DOCK_WIDTH = 1.9
export const DOCK_DECK = 0.42 // top of the planks above the calm sea
export const DOCK_POST_TOP = 0.8 // the last pair of posts stands proud as bollards
// The dock starts this far inland so its first planks rest on the beach
export const DOCK_INLAND = 0.6

const planks = ['#c08552', '#b57a49', '#c98f5c', '#ad7344']
const beam = '#86573a'
const post = '#694530'

const color = new THREE.Color()

function paint(geometry, hex) {
  geometry = geometry.index ? geometry.toNonIndexed() : geometry
  color.set(hex)
  const array = new Float32Array(geometry.attributes.position.count * 3)
  for (let i = 0; i < array.length; i += 3) color.toArray(array, i)
  geometry.setAttribute('color', new THREE.BufferAttribute(array, 3))
  geometry.deleteAttribute('uv')
  return geometry
}

// A jetty built plank by plank, in the dock's own frame: x across, y up,
// z from the beach (0) out to sea. Planks all run across it with small gaps,
// two beams carry them and posts stand in the water every metre and a half.
// Slight random offsets keep it hand-made rather than machined.
export function createDockGeometry(seed) {
  const random = createRandom(seed)
  const parts = []

  const plankDepth = 0.26
  const gap = 0.05
  for (let z = 0.08; z + plankDepth < DOCK_LENGTH - 0.05; z += plankDepth + gap) {
    const width = DOCK_WIDTH - random() * 0.14
    const plank = new THREE.BoxGeometry(width, 0.08, plankDepth)
    plank.rotateY((random() - 0.5) * 0.04)
    plank.translate((random() - 0.5) * 0.08, DOCK_DECK - 0.04 - random() * 0.02, z + plankDepth / 2)
    parts.push(paint(plank, planks[Math.floor(random() * planks.length)]))
  }

  for (const side of [-1, 1]) {
    const stringer = new THREE.BoxGeometry(0.14, 0.16, DOCK_LENGTH)
    stringer.translate(side * (DOCK_WIDTH / 2 - 0.28), DOCK_DECK - 0.16, DOCK_LENGTH / 2)
    parts.push(paint(stringer, beam))
  }

  for (const z of [1.3, 2.85, DOCK_LENGTH - 0.12]) {
    const last = z > DOCK_LENGTH - 1
    for (const side of [-1, 1]) {
      const top = last ? DOCK_POST_TOP : DOCK_DECK + 0.04
      const bottom = -1.6
      const pile = new THREE.CylinderGeometry(0.1, 0.12, top - bottom, 6)
      pile.rotateY(random() * Math.PI)
      pile.translate(side * (DOCK_WIDTH / 2 + 0.03), (top + bottom) / 2, z)
      parts.push(paint(pile, post))
    }
  }

  return mergeGeometries(parts)
}
