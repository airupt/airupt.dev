import * as THREE from 'three'
import { shared } from './shading.js'
import { islandHeight } from './Islands.js'

// Bright enough to pass the bloom threshold; scaled by how dark it is
const GLOW_STRENGTH = 5

class Glow {
  constructor(parent, position, color, size = 0.16) {
    this.color = new THREE.Color(color)
    this.material = new THREE.MeshBasicMaterial({ color: 0x000000 })
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), this.material)
    this.mesh.position.copy(position)
    parent.add(this.mesh)
  }

  set(intensity) {
    this.material.color.copy(this.color).multiplyScalar(intensity)
    this.mesh.visible = intensity > 0.02
  }
}

// A soft warm disc on the ground under a lamp, faded in at night
let poolTexture = null
function createPoolTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255, 190, 110, 1)')
  gradient.addColorStop(0.45, 'rgba(255, 150, 70, 0.45)')
  gradient.addColorStop(1, 'rgba(255, 120, 40, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

class LightPool {
  constructor(scene, position, radius) {
    poolTexture ??= createPoolTexture()
    this.material = new THREE.MeshBasicMaterial({
      map: poolTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      opacity: 0,
    })
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), this.material)
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.position.copy(position).add(new THREE.Vector3(0, 0.12, 0))
    scene.add(this.mesh)
  }

  set(strength) {
    this.material.opacity = strength
    this.mesh.visible = strength > 0.01
  }
}

// A slowly turning pair of light cones from the top of the lighthouse
class Beam {
  constructor(parent, position) {
    this.pivot = new THREE.Group()
    this.pivot.position.copy(position)
    parent.add(this.pivot)

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uStrength: { value: 0 } },
      vertexShader: /* glsl */ `
        varying float vAlong;
        void main() {
          vAlong = uv.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uStrength;
        varying float vAlong;
        void main() {
          gl_FragColor = vec4(vec3(1.0, 0.9, 0.65) * pow(vAlong, 2.5) * uStrength, 1.0);
        }
      `,
    })

    // Cone apex sits on the lamp; the wide end points away horizontally
    const geometry = new THREE.ConeGeometry(1.5, 22, 20, 1, true)
    geometry.translate(0, -11, 0)
    geometry.rotateZ(Math.PI / 2)
    for (const side of [0, Math.PI]) {
      const cone = new THREE.Mesh(geometry, this.material)
      cone.rotation.y = side
      this.pivot.add(cone)
    }
  }

  update(delta, strength) {
    this.pivot.rotation.y += delta * 0.6
    this.material.uniforms.uStrength.value = strength * 0.2
    this.pivot.visible = strength > 0.02
  }
}

// Molten rock in the crater: slow plates of dark crust drifting over glowing
// lava, hot cracks bright enough to bloom, and a warm light thrown on the
// crater walls and the smoke above (see uLava* in shading.js)
// Finds where the lava lake belongs from the terrain itself: just under
// the lowest point of the crater rim, and as wide as the inner walls are at
// that height, so it always sits down inside the crater
function measureCrater(volcano) {
  const [bx, bz, blobRadius] = volcano.blobs[0]
  const height = (distance, angle) => islandHeight(volcano, bx + Math.cos(angle) * distance, bz + Math.sin(angle) * distance)
  const angles = Array.from({ length: 32 }, (_, i) => (i / 32) * Math.PI * 2)
  const floor = height(0, 0)
  let rim = Infinity
  for (const angle of angles) {
    let highest = -Infinity
    for (let d = 0; d < blobRadius * 0.4; d += 0.2) highest = Math.max(highest, height(d, angle))
    rim = Math.min(rim, highest)
  }
  const level = Math.max(Math.min(rim - 0.45, floor + 3.5), floor + 0.3)
  let inner = Infinity
  for (const angle of angles) {
    let d = 0
    while (d < blobRadius * 0.4 && height(d, angle) < level) d += 0.1
    inner = Math.min(inner, d)
  }
  return { position: new THREE.Vector3(volcano.x + bx, level, volcano.z + bz), radius: inner * 1.12 }
}

class Lava {
  constructor(scene, position, radius) {
    // A ragged pool, its edge running into the crater walls
    const geometry = new THREE.CircleGeometry(radius, 18)
    const vertices = geometry.attributes.position
    for (let i = 1; i < vertices.count; i++) {
      const wobble = 1 + ((((Math.sin(i * 12.9898) * 43758.5453) % 1) + 1) % 1) * 0.15
      vertices.setXY(i, vertices.getX(i) * wobble, vertices.getY(i) * wobble)
    }
    vertices.setZ(0, 0.15)
    geometry.rotateX(-Math.PI / 2)

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: shared.uTime,
        uNoise: shared.uNoise,
        uHeat: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vLocal;
        void main() {
          vLocal = position.xz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform sampler2D uNoise;
        uniform float uHeat;
        varying vec2 vLocal;
        void main() {
          float centre = 1.0 - smoothstep(0.0, 2.4, length(vLocal));
          vec3 lava = mix(vec3(1.0, 0.3, 0.1), vec3(1.0, 0.7, 0.28), centre);
          // Two layers of noise drifting apart: where they agree, crust forms
          float plates = texture2D(uNoise, vLocal * 0.09 + uTime * vec2(0.006, 0.004)).r;
          float detail = texture2D(uNoise, vLocal * 0.23 - uTime * vec2(0.004, 0.009)).g;
          float crust = smoothstep(0.5, 0.58, plates * 0.75 + detail * 0.4);
          // Thin bright seams along the edges of the plates
          float seam = 1.0 - smoothstep(0.0, 0.05, abs(plates * 0.75 + detail * 0.4 - 0.54));
          vec3 color = lava * (1.2 + seam * 1.6) * uHeat;
          color = mix(color, vec3(0.3, 0.08, 0.04), crust * (1.0 - seam) * 0.85);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    })
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.position.copy(position)
    scene.add(this.mesh)
    shared.uLavaPosition.value.copy(position).y += 1.5
  }

  update(time, night) {
    const flicker = 0.9 + Math.sin(time * 2.3) * 0.06 + Math.sin(time * 7.1) * 0.04
    this.material.uniforms.uHeat.value = (1 + night * 0.4) * flicker
    shared.uLavaGlow.value = (0.9 + night * 1.6) * flicker
  }
}

// Everything that lights up when the sun goes down
export class Lights {
  constructor(app, decor, zones, boat, islands) {
    this.app = app
    this.glows = []
    this.blinkers = []
    this.flames = []
    this.pools = []
    this.time = 0

    // Lava in the volcano's crater: glows a little by day, brightly at night
    const volcano = islands.list.find(island => island.volcano)
    if (volcano) {
      const { position, radius } = measureCrater(volcano)
      this.lava = new Lava(app.scene, position, radius)
    }

    for (const { id, model } of decor.placed) {
      if (id === 'lantern') {
        // Inside the little lantern on top of the post (see Decor.js)
        this.glows.push(new Glow(model, new THREE.Vector3(0, 1.38, 0), '#ffb35c', 0.09))
        this.pools.push(new LightPool(app.scene, model.position, 3.2))
      }
      if (id === 'campfire') {
        this.flames.push(new Glow(model, new THREE.Vector3(0, model.userData.flame, 0), '#ff7a2e', 0.22))
        this.pools.push(new LightPool(app.scene, model.position, 4.5))
      }
      if (id === 'lighthouse') {
        const lamp = new THREE.Vector3(0, model.userData.lamp, 0)
        this.lamp = new Glow(model, lamp, '#fff0c0', 0.55)
        this.beam = new Beam(model, lamp)
      }
    }

    // Only lamps close to the sea light it up
    const waterside = decor.placed
      .filter(({ id }) => id === 'lantern' || id === 'campfire')
      .map(({ model }) => model.position)
      .filter(position => position.y < 1.6)
    app.world.ocean.setLamps(waterside)

    zones.list.forEach((zone, index) => {
      const glow = new Glow(zone.buoy.object, new THREE.Vector3(0, 1.05, 0), zone.buoy.color, 0.11)
      this.blinkers.push({ glow, phase: index * 0.37 })
    })

    // Navigation lights: red to port (left), green to starboard (right)
    this.boatLights = [
      new Glow(boat.lean, new THREE.Vector3(-0.78, 0.7, -0.75), '#ff3b3b', 0.12),
      new Glow(boat.lean, new THREE.Vector3(0.78, 0.7, -0.75), '#3bff7a', 0.12),
    ]
  }

  update(delta, night) {
    this.time += delta
    const strength = THREE.MathUtils.smoothstep(night, 0.25, 0.85) * GLOW_STRENGTH

    for (const glow of this.glows) glow.set(strength)
    for (const glow of this.boatLights) glow.set(strength * 1.3)
    for (const pool of this.pools) pool.set((strength / GLOW_STRENGTH) * 0.55)
    for (const flame of this.flames) {
      // The campfire burns all day but only really shows in the dark
      const flicker = 0.75 + Math.sin(this.time * 13) * 0.12 + Math.sin(this.time * 31) * 0.1
      flame.set((0.6 + strength) * flicker)
    }
    for (const { glow, phase } of this.blinkers) {
      const on = (this.time * 0.5 + phase) % 1 < 0.35 ? 1 : 0.08
      glow.set(Math.max(strength, 0.6) * on)
    }

    this.lamp?.set(strength * 0.9)
    this.lava?.update(this.time, strength / GLOW_STRENGTH)
    this.beam?.update(delta, strength / GLOW_STRENGTH)
  }
}
