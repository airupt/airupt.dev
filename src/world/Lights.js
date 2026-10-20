import * as THREE from 'three'

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
      const [bx, bz] = volcano.blobs[0]
      this.lava = new Glow(app.scene, new THREE.Vector3(volcano.x + bx, volcano.top - 3.6, volcano.z + bz), '#ff5a1a', 1.9)
      this.lava.mesh.scale.y = 0.35
    }

    for (const { id, model } of decor.placed) {
      if (id === 'lantern') {
        // Kenney's lantern head sits near the top of the 1.56 unit model
        this.glows.push(new Glow(model, new THREE.Vector3(0, 1.38, 0), '#ffb35c', 0.12))
        this.pools.push(new LightPool(app.scene, model.position, 3.2))
      }
      if (id === 'campfire') {
        this.flames.push(new Glow(model, new THREE.Vector3(0, 0.06, 0), '#ff7a2e', 0.06))
        this.pools.push(new LightPool(app.scene, model.position, 4))
      }
      if (id === 'tower') {
        this.lamp = new Glow(model, new THREE.Vector3(0, 6.1, 0), '#fff0c0', 0.3)
        this.beam = new Beam(model, new THREE.Vector3(0, 6.1, 0))
      }
    }

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
    this.lava?.set((1.4 + strength * 0.5) * (0.9 + Math.sin(this.time * 2.3) * 0.1))
    this.beam?.update(delta, strength / GLOW_STRENGTH)
  }
}
