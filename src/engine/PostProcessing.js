import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

// Final look in one pass, on display-ready colours:
// - tilt-shift: blur grows toward the top and bottom of the screen, which
//   makes the scene read as a miniature diorama
// - grading: saturation, contrast and a slightly warm lift
// - vignette
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uFocus: { value: 0.5 },
    uBlur: { value: 5.5 },
    uSaturation: { value: 1.06 },
    uContrast: { value: 1.03 },
    uWarmth: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
    uVignette: { value: 0.4 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uFocus;
    uniform float uBlur;
    uniform float uSaturation;
    uniform float uContrast;
    uniform vec3 uWarmth;
    uniform float uVignette;
    varying vec2 vUv;

    void main() {
      vec3 color = texture2D(tDiffuse, vUv).rgb;

      float radius = smoothstep(0.18, 0.6, abs(vUv.y - uFocus)) * uBlur;
      if (radius > 0.25) {
        vec3 sum = color;
        // Golden-angle spiral: an even disc of taps from a single loop
        for (int i = 0; i < 16; i++) {
          float angle = float(i) * 2.39996;
          float spread = sqrt((float(i) + 0.5) / 16.0) * radius;
          sum += texture2D(tDiffuse, vUv + vec2(cos(angle), sin(angle)) * spread / uResolution).rgb;
        }
        color = sum / 17.0;
      }

      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);
      color = (color - 0.5) * uContrast + 0.5;
      color *= uWarmth;

      vec2 centered = vUv - 0.5;
      color *= 1.0 - dot(centered, centered) * uVignette;

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `,
}

export class PostProcessing {
  constructor(app) {
    this.app = app
    const { renderer, scene } = app
    const camera = app.cameraRig.camera

    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }))
    this.composer.addPass(new RenderPass(scene, camera))

    // Threshold above 1: only HDR pixels bloom (sun glints, lights at night),
    // so ordinary bright surfaces stay crisp
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.55, 1.05)
    this.composer.addPass(this.bloom)

    this.composer.addPass(new OutputPass())

    this.finish = new ShaderPass(FinishShader)
    this.composer.addPass(this.finish)
  }

  resize(width, height, pixelRatio) {
    this.composer.setPixelRatio(pixelRatio)
    this.composer.setSize(width, height)
    this.finish.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio)
  }

  render(delta) {
    // Behind the loader the subject (the volcano) sits high in the frame,
    // so the sharp band moves up with it
    const focus = this.finish.uniforms.uFocus
    focus.value += ((this.app.cameraRig.attract ? 0.66 : 0.5) - focus.value) * (1 - Math.exp(-2 * delta))
    this.composer.render(delta)
  }
}
