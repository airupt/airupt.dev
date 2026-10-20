import * as THREE from 'three'

const colors = {
  zenith: new THREE.Color('#3f9ee8'),
  horizon: new THREE.Color('#cdeeff'),
}

// Gradient sky dome, matching fog, and the lights. The sun and its shadow
// box travel with the camera focus so shadows stay sharp wherever you sail.
export class Sky {
  constructor(app) {
    this.app = app
    app.scene.background = colors.horizon
    app.scene.fog = new THREE.Fog(colors.horizon, 70, 200)

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(380, 24, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uZenith: { value: colors.zenith },
          uHorizon: { value: colors.horizon },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDirection;
          void main() {
            vDirection = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uZenith;
          uniform vec3 uHorizon;
          varying vec3 vDirection;
          void main() {
            gl_FragColor = vec4(mix(uHorizon, uZenith, smoothstep(0.0, 0.55, vDirection.y)), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      })
    )
    this.dome.renderOrder = -1
    this.dome.frustumCulled = false

    this.hemisphere = new THREE.HemisphereLight('#d8f0ff', '#4a7a5a', 1.4)

    this.sun = new THREE.DirectionalLight('#fff1d6', 2.4)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 140
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.04
    this.sunOffset = new THREE.Vector3(-25, 45, 30)

    app.scene.add(this.dome, this.hemisphere, this.sun, this.sun.target)
  }

  update(focus, cameraDistance) {
    this.dome.position.copy(this.app.cameraRig.camera.position)

    this.sun.position.copy(focus).add(this.sunOffset)
    this.sun.target.position.copy(focus)

    // Grow the shadow box when zoomed out so distant islands keep their shadows
    const half = Math.max(30, cameraDistance * 1.4)
    const shadowCamera = this.sun.shadow.camera
    if (shadowCamera.right !== half) {
      shadowCamera.left = -half
      shadowCamera.right = half
      shadowCamera.top = half
      shadowCamera.bottom = -half
      shadowCamera.updateProjectionMatrix()
    }
  }
}
