import * as THREE from 'three'
import { shared, fogColorGLSL } from './shading.js'

// The sky is the fog gradient itself, so far geometry fades straight into it.
// The directional light exists only to render the shadow map; the stylised
// materials do their own lighting from the shared uniforms.
export class Sky {
  constructor(app) {
    this.app = app

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(380, 16, 8),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: shared,
        vertexShader: /* glsl */ `
          void main() {
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec2 uResolution;
          uniform vec3 uFogColorA;
          uniform vec3 uFogColorB;
          uniform vec2 uFogCenter;
          uniform vec2 uFogRadial;
          ${fogColorGLSL}
          void main() {
            gl_FragColor = vec4(stylizedFogColor(), 1.0);
            #include <colorspace_fragment>
          }
        `,
      })
    )
    this.dome.renderOrder = -1
    this.dome.frustumCulled = false

    this.sun = new THREE.DirectionalLight('#ffffff', 1)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 160
    this.sun.shadow.bias = -0.001
    this.sun.shadow.normalBias = 0.08
    this.sun.shadow.radius = 3

    app.scene.add(this.dome, this.sun, this.sun.target)
  }

  update(focus, cameraDistance) {
    this.dome.position.copy(this.app.cameraRig.camera.position)

    this.sun.position.copy(shared.uSunDirection.value).multiplyScalar(70).add(focus)
    this.sun.target.position.copy(focus)

    // Fog and shadow range follow the zoom, so the framing looks the same at any distance
    shared.uFogNear.value = cameraDistance * 0.95
    shared.uFogFar.value = cameraDistance * 2.9

    const half = Math.max(30, cameraDistance * 1.1)
    const shadowCamera = this.sun.shadow.camera
    if (Math.abs(shadowCamera.right - half) > 0.5) {
      shadowCamera.left = -half
      shadowCamera.right = half
      shadowCamera.top = half
      shadowCamera.bottom = -half
      shadowCamera.updateProjectionMatrix()
    }
  }
}
