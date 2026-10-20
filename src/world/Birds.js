import * as THREE from 'three'
import { createStylizedMaterial } from './shading.js'
import { createRandom } from '../utils/noise.js'

// A low-poly gull built in code: a pointed body and two swept wings that
// hinge at the shoulders. Wing tips are darker, as on real gulls.
function createGull(material) {
  const gull = new THREE.Group()

  const body = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), material)
  body.scale.set(0.14, 0.12, 0.5)
  gull.add(body)

  const head = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), material)
  head.position.set(0, 0.06, -0.42)
  gull.add(head)

  const wingGeometry = new THREE.BufferGeometry()
  wingGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, -0.18, 0, 0, 0.16, 0.55, 0.04, 0.02, 0.55, 0.04, 0.02, 0, 0, 0.16, 0.95, 0, 0.28], 3)
  )
  const white = [1, 1, 1]
  const grey = [0.55, 0.58, 0.62]
  const tip = [0.18, 0.2, 0.24]
  wingGeometry.setAttribute('color', new THREE.Float32BufferAttribute([...white, ...white, ...grey, ...grey, ...white, ...tip], 3))
  wingGeometry.computeVertexNormals()

  const wings = [1, -1].map(side => {
    const wing = new THREE.Mesh(wingGeometry, material)
    wing.scale.x = side
    const shoulder = new THREE.Group()
    shoulder.position.x = side * 0.08
    shoulder.add(wing)
    gull.add(shoulder)
    return { shoulder, side }
  })

  gull.traverse(child => {
    child.castShadow = true
  })
  return { gull, wings }
}

// Gulls circling the islands, flapping in bursts and gliding in between.
// Their shadows sweeping over the water sell the height.
export class Birds {
  constructor(app, islands) {
    this.app = app
    this.time = 0
    const material = createStylizedMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide }, { waterLine: false, key: 'gull' })
    // Body parts have no vertex colours, so give them white ones
    const random = createRandom(77)

    const homes = islands.list.filter(island => island.radius >= 9)
    this.flock = []
    for (let i = 0; i < 8; i++) {
      const island = homes[i % homes.length]
      const { gull, wings } = createGull(material)
      gull.traverse(child => {
        if (child.isMesh && !child.geometry.attributes.color) {
          child.geometry = child.geometry.clone()
          const count = child.geometry.attributes.position.count
          child.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(count * 3).fill(1), 3))
        }
      })
      gull.scale.setScalar(1.3)
      app.scene.add(gull)
      this.flock.push({
        gull,
        wings,
        center: new THREE.Vector2(island.x, island.z),
        radius: island.radius + 3 + random() * 8,
        height: 8 + random() * 5,
        speed: (0.18 + random() * 0.15) * (random() < 0.5 ? -1 : 1),
        angle: random() * Math.PI * 2,
        phase: random() * 10,
      })
    }
  }

  update(delta) {
    this.time += delta
    for (const bird of this.flock) {
      bird.angle += bird.speed * delta
      const x = bird.center.x + Math.cos(bird.angle) * bird.radius
      const z = bird.center.y + Math.sin(bird.angle) * bird.radius
      const y = bird.height + Math.sin(this.time * 0.7 + bird.phase) * 0.6
      bird.gull.position.set(x, y, z)

      // Face along the circle and bank into the turn
      const direction = Math.sign(bird.speed)
      bird.gull.rotation.set(0, -bird.angle + (direction > 0 ? Math.PI : 0), 0)
      bird.gull.rotateZ(direction * 0.35)

      // Flap for a few seconds, then glide with the wings held slightly up
      const flapping = Math.sin(this.time * 0.6 + bird.phase) > -0.2
      const flap = flapping ? Math.sin(this.time * 9 + bird.phase) * 0.55 : 0.12
      for (const { shoulder, side } of bird.wings) shoulder.rotation.z = side * flap
    }
  }
}
