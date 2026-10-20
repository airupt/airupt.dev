import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createStylizedMaterial } from './shading.js'
import { createRandom } from '../utils/noise.js'
import { DOCK_HEIGHT, DOCK_TILE, DOCK_TILES } from './Decor.js'

const FLOCK = 8
const DOCK_TOP = 0.76 // the Kenney dock deck sits this high above the sea
const SHOULDER = 0.08

// Body, head and two wings merged into one geometry. `aWing` marks wing
// vertices (-1 left, 1 right, 0 body) so the shader can flap them.
function createGullGeometry() {
  const tag = (geometry, wing, color) => {
    const count = geometry.attributes.position.count
    geometry.setAttribute('aWing', new THREE.Float32BufferAttribute(new Array(count).fill(wing), 1))
    if (!geometry.attributes.color) geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(count * 3).fill(color), 3))
    geometry.deleteAttribute('uv')
    return geometry.index ? geometry.toNonIndexed() : geometry
  }

  const body = new THREE.OctahedronGeometry(1, 0)
  body.scale(0.14, 0.12, 0.5)
  const head = new THREE.OctahedronGeometry(0.11, 0)
  head.translate(0, 0.06, -0.42)

  const wings = [1, -1].map(side => {
    const wing = new THREE.BufferGeometry()
    const s = side
    // Two triangles from the shoulder out to a swept-back tip
    wing.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [s * SHOULDER, 0, -0.18, s * SHOULDER, 0, 0.16, s * 0.63, 0.04, 0.02, s * 0.63, 0.04, 0.02, s * SHOULDER, 0, 0.16, s * 1.03, 0, 0.28],
        3
      )
    )
    const white = [1, 1, 1]
    const grey = [0.55, 0.58, 0.62]
    const tip = [0.18, 0.2, 0.24]
    wing.setAttribute('color', new THREE.Float32BufferAttribute([...white, ...white, ...grey, ...grey, ...white, ...tip], 3))
    wing.computeVertexNormals()
    return tag(wing, side, 1)
  })

  return mergeGeometries([tag(body, 0, 1), tag(head, 0, 1), ...wings])
}

// Gulls circling the islands, flapping in bursts and gliding in between,
// plus pairs resting on the end of every dock that take off when the boat
// comes close and drift back later. All one instanced draw; wings flap in
// the vertex shader.
export class Birds {
  constructor(app, islands) {
    this.app = app
    this.time = 0

    // Two gulls on the end of each dock
    this.perched = []
    for (const island of islands.list) {
      if (!island.section && island.label !== 'name') continue
      const reach = DOCK_TILES * DOCK_TILE - 0.9
      for (const side of [-0.5, 0.5]) {
        this.perched.push({
          home: new THREE.Vector3(
            island.shore.x + island.out.x * reach + island.out.z * side,
            DOCK_HEIGHT + DOCK_TOP + 0.65,
            island.shore.z + island.out.z * reach - island.out.x * side
          ),
          heading: Math.atan2(island.out.x, island.out.z) + side,
          state: 'perched',
          timer: 0,
          position: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
        })
      }
    }
    const COUNT = FLOCK + this.perched.length

    const geometry = createGullGeometry()
    this.flaps = new THREE.InstancedBufferAttribute(new Float32Array(COUNT), 1)
    geometry.setAttribute('aFlap', this.flaps)

    const material = createStylizedMaterial(
      { vertexColors: true, flatShading: true, side: THREE.DoubleSide },
      {
        waterLine: false,
        key: 'gull',
        extend: shader => {
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>\nattribute float aWing;\nattribute float aFlap;`)
            .replace(
              '#include <begin_vertex>',
              `#include <begin_vertex>
              if (aWing != 0.0) {
                // Hinge each wing at its shoulder, both sides lifting together
                float angle = aWing * aFlap;
                float x = transformed.x - aWing * ${SHOULDER.toFixed(3)};
                transformed.x = x * cos(angle) - transformed.y * sin(angle) + aWing * ${SHOULDER.toFixed(3)};
                transformed.y = x * sin(angle) + transformed.y * cos(angle);
              }`
            )
        },
      }
    )

    this.mesh = new THREE.InstancedMesh(geometry, material, COUNT)
    this.mesh.castShadow = true
    this.mesh.frustumCulled = false
    app.scene.add(this.mesh)

    const random = createRandom(77)
    const homes = islands.list.filter(island => island.radius >= 9)
    this.flock = Array.from({ length: FLOCK }, (_, i) => {
      const island = homes[i % homes.length]
      return {
        center: new THREE.Vector2(island.x, island.z),
        radius: island.radius + 3 + random() * 8,
        height: 12 + random() * 5,
        speed: (0.18 + random() * 0.15) * (random() < 0.5 ? -1 : 1),
        angle: random() * Math.PI * 2,
        phase: random() * 10,
      }
    })
    this.dummy = new THREE.Object3D()
  }

  update(delta) {
    this.time += delta
    const { dummy } = this

    this.flock.forEach((bird, index) => {
      bird.angle += bird.speed * delta
      dummy.position.set(
        bird.center.x + Math.cos(bird.angle) * bird.radius,
        bird.height + Math.sin(this.time * 0.7 + bird.phase) * 0.6,
        bird.center.y + Math.sin(bird.angle) * bird.radius
      )

      // Face along the circle and bank into the turn
      const direction = Math.sign(bird.speed)
      dummy.rotation.set(0, -bird.angle + (direction > 0 ? Math.PI : 0), 0)
      dummy.rotateZ(direction * 0.35)
      dummy.scale.setScalar(0.85)
      dummy.updateMatrix()
      this.mesh.setMatrixAt(index, dummy.matrix)

      // Flap for a few seconds, then glide with the wings held slightly up
      const flapping = Math.sin(this.time * 0.6 + bird.phase) > -0.2
      this.flaps.array[index] = flapping ? Math.sin(this.time * 9 + bird.phase) * 0.55 : 0.12
    })

    this.updatePerched(delta)
    this.mesh.instanceMatrix.needsUpdate = true
    this.flaps.needsUpdate = true
  }

  updatePerched(delta) {
    const { dummy } = this
    const boat = this.app.world.boat.object.position

    this.perched.forEach((gull, index) => {
      const slot = FLOCK + index
      let scale = 0.7

      if (gull.state === 'perched') {
        gull.position.copy(gull.home)
        dummy.rotation.set(0, gull.heading + Math.sin(this.time * 0.8 + index) * 0.25, 0)
        // Wings folded, with the odd stretch
        this.flaps.array[slot] = Math.sin(this.time * 0.5 + index * 2) > 0.97 ? 0.5 : -0.35
        if (boat.distanceTo(gull.home) < 8) {
          gull.state = 'flying'
          gull.timer = 0
          const away = gull.home.clone().sub(boat).setY(0).normalize()
          gull.velocity.set(away.x * 4.5, 3.2, away.z * 4.5)
          if (index % 2 === 0) this.app.sounds.play('gulls', 0.4, 1.05 + Math.random() * 0.1, gull.home)
        }
      } else if (gull.state === 'flying') {
        gull.timer += delta
        gull.velocity.y = Math.max(gull.velocity.y - delta * 0.6, 1.2)
        gull.position.addScaledVector(gull.velocity, delta)
        dummy.rotation.set(-0.35, Math.atan2(-gull.velocity.x, -gull.velocity.z), 0)
        this.flaps.array[slot] = Math.sin(this.time * 14 + index) * 0.7
        // Shrink away into the distance, then wait before coming back
        scale *= Math.min(1, Math.max(0, (5 - gull.timer) / 1.5))
        if (gull.timer > 5) {
          gull.state = 'away'
          gull.timer = 0
        }
      } else {
        gull.timer += delta
        scale = 0
        const clear = boat.distanceTo(gull.home) > 14
        if (gull.timer > 20 && clear) {
          gull.state = 'perched'
          gull.timer = 0
        }
      }

      dummy.position.copy(gull.position)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      this.mesh.setMatrixAt(slot, dummy.matrix)
    })
  }
}
