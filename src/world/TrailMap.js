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

// The V of the wake: soft points written into the green channel, which the
// decay pass clears every frame, so they are redrawn where they are now
const wakeMaterial = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    attribute float aStrength;
    varying vec2 vUv;
    varying float vStrength;
    void main() {
      vUv = uv;
      vStrength = aStrength;
      gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    varying float vStrength;
    void main() {
      float falloff = 1.0 - smoothstep(0.1, 0.5, length(vUv - 0.5));
      gl_FragColor = vec4(0.0, falloff * vStrength, 0.0, 1.0);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthTest: false,
  depthWrite: false,
})

// Where the hull meets the water: a thin oval of foam around it, so the boat
// sits in the sea instead of on it
const ringMaterial = new THREE.ShaderMaterial({
  uniforms: { uStrength: { value: 1 } },
  vertexShader: brushMaterial.vertexShader,
  fragmentShader: /* glsl */ `
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      float radius = length(vUv - 0.5);
      float ring = smoothstep(0.3, 0.4, radius) * (1.0 - smoothstep(0.42, 0.5, radius));
      gl_FragColor = vec4(0.0, ring * uStrength, 0.0, 1.0);
    }
  `,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthTest: false,
  depthWrite: false,
})

const WAKE_POINTS = 220
const WAKE_SPACING = 0.32 // metres travelled between two pairs of points
const WAKE_LIFE = 2.8
// Points drift sideways at this fraction of the boat's speed, which opens
// the two arms of the wake at about 19 degrees, like a real one
const WAKE_SPREAD = 0.34

const stern = new THREE.Vector3()
const matrix = new THREE.Matrix4()

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
    // The motor churns a narrow line straight behind the boat
    this.prop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), brushMaterial.clone())
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMaterial)

    this.points = Array.from({ length: WAKE_POINTS }, () => ({ x: 0, z: 0, vx: 0, vz: 0, age: WAKE_LIFE, strength: 0 }))
    this.nextPoint = 0
    this.travelled = 0
    this.wake = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), wakeMaterial, WAKE_POINTS)
    this.wake.frustumCulled = false
    this.wakeStrength = new THREE.InstancedBufferAttribute(new Float32Array(WAKE_POINTS), 1)
    this.wakeStrength.setUsage(THREE.DynamicDrawUsage)
    this.wake.geometry.setAttribute('aStrength', this.wakeStrength)
    this.stampScene.add(this.hull, this.prop, this.ring, this.wake)

    // What the ocean shader needs
    this.uniforms = {
      uTrail: { value: this.targets[0].texture },
      uTrailCenter: { value: this.center },
      uTrailSize: { value: SIZE },
    }
  }

  reset() {
    this.cleared = false
    for (const point of this.points) point.age = WAKE_LIFE
  }

  // Leaves pairs of foam points at the stern corners as the boat moves; each
  // drifts outward, spreads and fades
  updateWake(delta, speed, inWater, nextX, nextZ) {
    const { quaternion, position } = this.boat.object
    this.travelled += speed * delta * inWater
    const strength = Math.min(Math.max(speed - 1.2, 0) / 9, 1)
    while (this.travelled > WAKE_SPACING) {
      this.travelled -= WAKE_SPACING
      if (strength <= 0) continue
      for (const side of [-1, 1]) {
        const point = this.points[this.nextPoint]
        this.nextPoint = (this.nextPoint + 1) % WAKE_POINTS
        stern.set(side * 0.7, 0, 1.5).applyQuaternion(quaternion).add(position)
        // Sideways relative to the hull, scaled by speed
        const outward = new THREE.Vector3(side, 0, 0).applyQuaternion(quaternion).setY(0).normalize()
        Object.assign(point, {
          x: stern.x,
          z: stern.z,
          vx: outward.x * speed * WAKE_SPREAD,
          vz: outward.z * speed * WAKE_SPREAD,
          age: 0,
          strength,
        })
      }
    }

    const drag = Math.exp(-0.7 * delta)
    this.points.forEach((point, index) => {
      let value = 0
      let size = 0
      if (point.age < WAKE_LIFE) {
        point.age += delta
        point.x += point.vx * delta
        point.z += point.vz * delta
        point.vx *= drag
        point.vz *= drag
        const life = point.age / WAKE_LIFE
        value = point.strength * Math.pow(Math.max(1 - life, 0), 1.8) * 0.5
        size = 1 + life * 1.4
      }
      matrix.makeScale(size, size, 1).setPosition(point.x - nextX, -(point.z - nextZ), 0)
      this.wake.setMatrixAt(index, matrix)
      this.wakeStrength.array[index] = value
    })
    this.wake.instanceMatrix.needsUpdate = true
    this.wakeStrength.needsUpdate = true
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
    this.hull.scale.set(2.2, 4.2, 1)
    this.hull.material.uniforms.uStrength.value = inWater * Math.min(speed / 10, 1) * 0.05 * delta * 60

    // A narrow, rough line down the middle of the wake
    stern.set(0, 0, 1.9).applyQuaternion(this.boat.object.quaternion).add(position)
    this.prop.position.set(stern.x - nextX, -(stern.z - nextZ), 0)
    this.prop.scale.setScalar(0.9 + Math.min(speed / 12, 1) * 0.4)
    this.prop.material.uniforms.uStrength.value = inWater * Math.min(Math.max(speed - 1, 0) / 8, 1) * 0.11 * delta * 60

    // The waterline foam is strongest at rest; at speed the wake takes over
    this.ring.position.copy(this.hull.position)
    this.ring.rotation.z = yaw
    this.ring.scale.set(2.05, 4.1, 1)
    this.ring.material.uniforms.uStrength.value = inWater * (0.75 - Math.min(speed / 8, 1) * 0.35)

    this.updateWake(delta, speed, inWater, nextX, nextZ)

    renderer.autoClear = false
    renderer.render(this.stampScene, this.stampCamera)
    renderer.autoClear = savedAutoClear
    renderer.setRenderTarget(savedTarget)

    this.targets.reverse()
    this.uniforms.uTrail.value = this.targets[0].texture
  }
}
