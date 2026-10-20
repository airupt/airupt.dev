import * as THREE from 'three'
import { shared } from './shading.js'
import { waveHeightGLSL } from './waves.js'

const RADIUS = 4.5

// A soft ring of light riding the waves around each section zone, in the
// section colour. It breathes gently, brightens while the boat is inside and
// sends a ripple outward the moment it enters.
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
          uRipple: { value: 1 },
        },
        vertexShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vLocal;
          ${waveHeightGLSL()}
          void main() {
            vLocal = position.xz;
            vec4 world = modelMatrix * vec4(position, 1.0);
            world.y = waveHeight(world.xz, uTime) + 0.06;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uColor;
          uniform float uActive;
          uniform float uRipple;
          varying vec2 vLocal;
          void main() {
            float radius = length(vLocal) / ${RADIUS.toFixed(1)};
            float breathe = sin(uTime * 2.0) * 0.03;
            // Soft band at the edge of the zone
            float band = smoothstep(0.78 + breathe, 0.95, radius) * (1.0 - smoothstep(0.97, 1.08 + breathe, radius));
            // Faint fill inside, so the zone reads as a place, not a line
            float fill = (1.0 - smoothstep(0.0, 0.95, radius)) * 0.12 * uActive;
            // Entry ripple travelling outward
            float ripple = smoothstep(0.08, 0.0, abs(radius - (0.9 + uRipple * 0.9))) * (1.0 - uRipple);
            float alpha = band * (0.4 + uActive * 0.45) + fill + ripple * 0.8;
            vec3 color = mix(uColor, vec3(1.0), 0.45) * (1.0 + uActive * 0.6 + ripple);
            gl_FragColor = vec4(color, alpha);
            #include <colorspace_fragment>
          }
        `,
      })

      // Finely subdivided so every part of the ring rides the waves; a coarse
      // disc would sag between its vertices and dip under the swell
      const geometry = new THREE.PlaneGeometry(RADIUS * 2.5, RADIUS * 2.5, 40, 40)
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
      const uniforms = material.uniforms
      const active = this.zones.active === zone
      if (active && uniforms.uActive.value < 0.05) uniforms.uRipple.value = 0
      uniforms.uActive.value += ((active ? 1 : 0) - uniforms.uActive.value) * (1 - Math.exp(-6 * delta))
      uniforms.uRipple.value = Math.min(1, uniforms.uRipple.value + delta * 1.2)
    }
  }
}
