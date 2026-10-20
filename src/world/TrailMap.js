import * as THREE from 'three'

const SIZE = 72 // metres covered by the map, centred on the boat
const RESOLUTION = 512
const TEXEL = SIZE / RESOLUTION

// Fades the previous frame a little, spreads it slightly so trails widen as
// they age, and shifts it when the window moves with the boat
const decayMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uPrevious: { value: null },
    uShift: { value: new THREE.Vector2() },
    uDecay: { value: 0.985 },
    uTexel: { value: 1 / RESOLUTION },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D uPrevious;
    uniform vec2 uShift;
    uniform float uDecay;
    uniform float uTexel;
    varying vec2 vUv;
    float sampleAt(vec2 uv) {
      // Outside the old window there is no history
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
      return texture2D(uPrevious, uv).r;
    }
    void main() {
      vec2 uv = vUv + uShift;
      float value = sampleAt(uv) * 0.6
        + (sampleAt(uv + vec2(uTexel, 0.0)) + sampleAt(uv - vec2(uTexel, 0.0))
        + sampleAt(uv + vec2(0.0, uTexel)) + sampleAt(uv - vec2(0.0, uTexel))) * 0.1;
      gl_FragColor = vec4(value * uDecay, 0.0, 0.0, 1.0);
    }
  `,
  depthTest: false,
  depthWrite: false,
})

// A soft round stamp, added on top of whatever is there
const brushMaterial = new THREE.ShaderMaterial({
  uniforms: { uStrength: { value: 1 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      float falloff = 1.0 - smoothstep(0.15, 0.5, length(vUv - 0.5));
      gl_FragColor = vec4(falloff * uStrength, 0.0, 0.0, 1.0);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthTest: false,
  depthWrite: false,
})

const stern = new THREE.Vector3()

// A world-space map of churned water around the boat, rendered every frame:
// the hull leaves a ring of contact foam, the motor a trail that widens and
// fades. The ocean shader reads it to draw foam that follows the boat.
export class TrailMap {
  constructor(app, boat) {
    this.app = app
    this.boat = boat
    const options = { type: THREE.HalfFloatType, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, depthBuffer: false }
    this.targets = [new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, options), new THREE.WebGLRenderTarget(RESOLUTION, RESOLUTION, options)]
    this.center = new THREE.Vector2()

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), decayMaterial)
    this.quad.frustumCulled = false
    this.decayScene = new THREE.Scene()
    this.decayScene.add(this.quad)

    // Stamps are placed in metres relative to the window centre
    this.stampScene = new THREE.Scene()
    this.stampCamera = new THREE.OrthographicCamera(-SIZE / 2, SIZE / 2, SIZE / 2, -SIZE / 2, -1, 1)
    this.hull = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), brushMaterial.clone())
    // Two stamps at the stern corners and a weaker one between them: as the
    // boat moves on they spread into the V of a real wake
    this.wakes = [-0.85, 0, 0.85].map(side => {
      const stamp = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), brushMaterial.clone())
      stamp.userData.side = side
      return stamp
    })
    this.stampScene.add(this.hull, ...this.wakes)

    // What the ocean shader needs
    this.uniforms = {
      uTrail: { value: this.targets[0].texture },
      uTrailCenter: { value: this.center },
      uTrailSize: { value: SIZE },
    }
  }

  reset() {
    this.cleared = false
  }

  update(delta) {
    const { renderer } = this.app
    const position = this.boat.object.position

    // Snap the window to whole texels so shifting it never blurs the history
    const nextX = Math.round(position.x / TEXEL) * TEXEL
    const nextZ = Math.round(position.z / TEXEL) * TEXEL
    decayMaterial.uniforms.uShift.value.set((nextX - this.center.x) / SIZE, -(nextZ - this.center.y) / SIZE)
    decayMaterial.uniforms.uDecay.value = Math.pow(0.975, delta * 60)
    this.center.set(nextX, nextZ)

    const [previous, next] = this.targets
    const savedTarget = renderer.getRenderTarget()
    const savedAutoClear = renderer.autoClear

    if (!this.cleared) {
      for (const target of this.targets) {
        renderer.setRenderTarget(target)
        renderer.setClearColor(0x000000, 1)
        renderer.clear()
      }
      this.cleared = true
    }

    decayMaterial.uniforms.uPrevious.value = previous.texture
    renderer.setRenderTarget(next)
    renderer.render(this.decayScene, this.stampCamera)

    // Stamps: map x → right, z → down in texture space (v = -z)
    const yaw = Math.atan2(2 * (this.boat.object.quaternion.w * this.boat.object.quaternion.y), 1 - 2 * this.boat.object.quaternion.y ** 2)
    const speed = Math.abs(this.boat.speed)
    const inWater = this.boat.inWater > 0 ? 1 : 0

    this.hull.position.set(position.x - nextX, -(position.z - nextZ), 0)
    this.hull.rotation.z = yaw
    this.hull.scale.set(2.6, 4.6, 1)
    this.hull.material.uniforms.uStrength.value = inWater * (0.008 + Math.min(speed / 10, 1) * 0.07) * delta * 60

    const wakeStrength = inWater * Math.min(Math.max(speed - 1.5, 0) / 8, 1) * 0.24 * delta * 60
    for (const stamp of this.wakes) {
      const side = stamp.userData.side
      stern.set(side, 0, 1.9).applyQuaternion(this.boat.object.quaternion).add(position)
      stamp.position.set(stern.x - nextX, -(stern.z - nextZ), 0)
      stamp.scale.setScalar(side === 0 ? 1.4 : 1.1 + Math.min(speed / 12, 1) * 0.6)
      stamp.material.uniforms.uStrength.value = wakeStrength * (side === 0 ? 0.45 : 1)
    }

    renderer.autoClear = false
    renderer.render(this.stampScene, this.stampCamera)
    renderer.autoClear = savedAutoClear
    renderer.setRenderTarget(savedTarget)

    this.targets.reverse()
    this.uniforms.uTrail.value = this.targets[0].texture
  }
}
