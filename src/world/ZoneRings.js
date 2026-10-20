import * as THREE from 'three'
import { shared } from './shading.js'
import { waveHeightGLSL } from './waves.js'

const REACH = 6 // metres the ripples travel from the buoy
const PLANE = 16

// Calm ripples spreading from each section buoy in the section colour: a
// quiet "something here" in open water. Inside the zone they come faster and
// brighter, and entering sends one stronger pulse.
export class ZoneRings {
  constructor(app, zones) {
    this.zones = zones
    this.rings = zones.list.map(zone => {
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: shared.uTime,
          uColor: { value: new THREE.Color(zone.buoy.color).lerp(new THREE.Color('#ffffff'), 0.45) },
          uBuoy: { value: new THREE.Vector2() },
          uActive: { value: 0 },
          uPulse: { value: 1 },
        },
        vertexShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vWorld;
          ${waveHeightGLSL()}
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xz;
            world.y = waveHeight(world.xz, uTime) + 0.1;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform vec3 uColor;
          uniform vec2 uBuoy;
          uniform float uActive;
          uniform float uPulse;
          varying vec2 vWorld;
          void main() {
            float range = length(vWorld - uBuoy);
            float alpha = 0.0;
            float speed = mix(0.42, 0.7, uActive);
            for (int i = 0; i < 3; i++) {
              float phase = fract(uTime * speed / 2.4 + float(i) / 3.0);
              float radius = 0.6 + phase * ${REACH.toFixed(1)};
              float ring = 1.0 - smoothstep(0.0, 0.16, abs(range - radius));
              alpha += ring * (1.0 - phase) * (0.3 + uActive * 0.35);
            }
            // One wide, bright ring travelling out when the boat sails in
            float pulseRadius = 0.6 + uPulse * ${(REACH * 1.4).toFixed(1)};
            alpha += (1.0 - smoothstep(0.0, 0.3, abs(range - pulseRadius))) * (1.0 - uPulse) * 0.8;
            gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 0.9));
            #include <colorspace_fragment>
          }
        `,
      })

      // Subdivided so the ripples ride the swell
      const geometry = new THREE.PlaneGeometry(PLANE * 2, PLANE * 2, 64, 64)
      geometry.rotateX(-Math.PI / 2)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(zone.buoy.anchor.x, 0, zone.buoy.anchor.z)
      mesh.frustumCulled = false
      app.scene.add(mesh)
      return { zone, material }
    })
  }

  update(delta) {
    for (const { zone, material } of this.rings) {
      const uniforms = material.uniforms
      const active = this.zones.active === zone
      const buoy = zone.buoy.object.position
      uniforms.uBuoy.value.set(buoy.x, buoy.z)
      if (active && uniforms.uActive.value < 0.05) uniforms.uPulse.value = 0
      uniforms.uActive.value += ((active ? 1 : 0) - uniforms.uActive.value) * (1 - Math.exp(-5 * delta))
      uniforms.uPulse.value = Math.min(1, uniforms.uPulse.value + delta * 0.9)
    }
  }
}
