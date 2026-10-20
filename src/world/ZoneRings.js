import * as THREE from 'three'
import { shared } from './shading.js'
import { waveHeightGLSL } from './waves.js'
import { waterMapGLSL } from './WaterMap.js'

const REACH = 6 // metres the ripples travel from the buoy
const PLANE = 16

// Calm ripples spreading from each section buoy, tinted with the section
// colour: a quiet "something here" in open water. They are drawn like foam,
// soft and broken, widening as they travel, and stop at the beach. Inside the
// zone they come faster and brighter, and entering sends one stronger pulse.
export class ZoneRings {
  constructor(app, zones, waterMap) {
    this.zones = zones
    this.rings = zones.list.map(zone => {
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: shared.uTime,
          uNoise: shared.uNoise,
          uWaterMap: { value: waterMap },
          uColor: { value: new THREE.Color(zone.buoy.color).lerp(new THREE.Color('#ffffff'), 0.6) },
          uBuoy: { value: new THREE.Vector2() },
          uActive: { value: 0 },
          uNight: { value: 0 },
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
          uniform sampler2D uNoise;
          uniform vec3 uColor;
          uniform vec2 uBuoy;
          uniform float uActive;
          uniform float uPulse;
          uniform float uNight;
          varying vec2 vWorld;
          ${waterMapGLSL}
          void main() {
            float range = length(vWorld - uBuoy);
            float breakup = texture2D(uNoise, vWorld * 0.3 + uTime * 0.02).r;
            float alpha = 0.0;
            float speed = mix(0.42, 0.7, uActive);
            for (int i = 0; i < 3; i++) {
              float phase = fract(uTime * speed / 2.4 + float(i) / 3.0);
              float radius = 0.6 + phase * ${REACH.toFixed(1)};
              // Thin and solid near the buoy, wider and more broken further out
              float width = mix(0.1, 0.45, phase);
              float ring = 1.0 - smoothstep(0.0, width, abs(range - radius));
              ring *= smoothstep(0.25, 0.45, breakup + (1.0 - phase) * 0.35);
              alpha += ring * (1.0 - phase) * (0.32 + uActive * 0.3);
            }
            // One wide, bright ring travelling out when the boat sails in
            float pulseRadius = 0.6 + uPulse * ${(REACH * 1.4).toFixed(1)};
            float pulse = 1.0 - smoothstep(0.0, mix(0.2, 0.7, uPulse), abs(range - pulseRadius));
            alpha += pulse * smoothstep(0.2, 0.4, breakup + 0.15) * (1.0 - uPulse) * 0.8;
            // Ripples never run up the beach
            alpha *= smoothstep(0.4, 1.4, sampleWaterMap(vWorld).y);
            // Quieter after dark, so lamps and lights stay the brightest things
            gl_FragColor = vec4(uColor * mix(1.0, 0.55, uNight), clamp(alpha, 0.0, 0.9) * mix(1.0, 0.6, uNight));
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

  setNight(night) {
    for (const { material } of this.rings) material.uniforms.uNight.value = night
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
