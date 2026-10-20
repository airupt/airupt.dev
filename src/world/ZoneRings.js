import * as THREE from 'three'
import { shared } from './shading.js'
import { waveHeightGLSL } from './waves.js'

// A dashed ring floating on the waves around each section zone, in the
// section colour. It turns slowly and brightens while the boat is inside.
export class ZoneRings {
  constructor(app, zones) {
    this.zones = zones
    this.rings = zones.list.map(zone => {
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: shared.uTime,
          uColor: { value: new THREE.Color(zone.buoy.color) },
          uActive: { value: 0 },
        },
        vertexShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          ${waveHeightGLSL()}
          void main() {
            vUv = uv;
            vec4 world = modelMatrix * vec4(position, 1.0);
            world.y = waveHeight(world.xz, uTime) + 0.08;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uActive;
          varying vec2 vUv;
          void main() {
            // RingGeometry UVs are planar and centred on 0.5, so the angle around comes from atan
            float angle = atan(vUv.y - 0.5, vUv.x - 0.5);
            float dash = step(0.45, fract(angle / 6.2832 * 24.0 + uTime * 0.15));
            vec3 color = mix(uColor, vec3(1.0), 0.35) * (1.0 + uActive * 1.5);
            gl_FragColor = vec4(color, dash * (0.55 + uActive * 0.45));
            #include <colorspace_fragment>
          }
        `,
      })

      const geometry = new THREE.RingGeometry(5.2, 5.6, 96, 1)
      geometry.rotateX(-Math.PI / 2)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(zone.x, 0, zone.z)
      mesh.frustumCulled = false
      app.scene.add(mesh)
      return { zone, material }
    })
  }

  update(delta) {
    for (const { zone, material } of this.rings) {
      const target = this.zones.active === zone ? 1 : 0
      material.uniforms.uActive.value += (target - material.uniforms.uActive.value) * (1 - Math.exp(-6 * delta))
    }
  }
}
