import * as THREE from 'three'
import { waveHeightGLSL, waveNormalGLSL } from './waves.js'
import { arch, islands, rockClusters } from './layout.js'
import { createStylizedMaterial } from './shading.js'
import { bakeWaterMap, waterMapGLSL } from './WaterMap.js'

const SIZE = 300
const SEGMENTS = 200
const CELL = SIZE / SEGMENTS
const MAX_LAMPS = 12

// Rocks in open water, for their shallows: each sea stack cluster, and the
// two feet of the arch
function seaRocks() {
  const feet = [-1, 1].map(side => [arch.x + Math.cos(arch.yaw) * side * (arch.span / 2), arch.z - Math.sin(arch.yaw) * side * (arch.span / 2), 2.4])
  return [...rockClusters.map(([x, z]) => [x, z, 2.2]), ...feet]
}

// A large plane displaced by the shared wave function, lit with the exact
// wave normal so the swell reads as smooth rolling water rather than a grid
// of facets. It follows the camera in whole-cell steps, so vertices always
// land on the same world grid and the surface never appears to slide.
// Colour and foam come from the baked sea map, so shallows and surf follow
// the real coastlines.
export class Ocean {
  constructor(app) {
    this.app = app

    const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS)
    geometry.rotateX(-Math.PI / 2)

    this.uniforms = {
      uWaterMap: { value: bakeWaterMap(islands, seaRocks()) },
      uShallow: { value: new THREE.Color('#62d8c8') },
      uMid: { value: new THREE.Color('#2a9fcf') },
      uDeep: { value: new THREE.Color('#1d61a3') },
      uCrest: { value: new THREE.Color('#7ccdee') },
      // Turned off when the map photographs the sea from straight above
      uGlint: { value: 3 },
      // Churned water glows like plankton at night
      uFoamGlow: { value: 0 },
      uNight: { value: 0 },
      // Lamps near the shore: xy position, radius, strength (see setLamps)
      uLamps: { value: Array.from({ length: MAX_LAMPS }, () => new THREE.Vector4(0, 0, 1, 0)) },
      uLampStrength: { value: 0 },
      uTrail: { value: null },
      uTrailCenter: { value: new THREE.Vector2() },
      uTrailSize: { value: 1 },
    }

    const material = createStylizedMaterial(
      { color: '#ffffff' },
      { waterLine: false, seeThrough: false, key: 'ocean', extend: shader => this.extend(shader) }
    )

    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.receiveShadow = true
    app.scene.add(this.mesh)
  }

  extend(shader) {
    Object.assign(shader.uniforms, this.uniforms)

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        varying float vWave;
        varying vec2 vOceanPosition;
        ${waveHeightGLSL()}
        ${waveNormalGLSL()}`
      )
      .replace(
        '#include <beginnormal_vertex>',
        'vec3 objectNormal = waveNormal((modelMatrix * vec4(position, 1.0)).xz, uTime);'
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vOceanPosition = (modelMatrix * vec4(transformed, 1.0)).xz;
        vWave = waveHeight(vOceanPosition, uTime);
        transformed.y += vWave;`
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform vec3 uShallow;
        uniform vec3 uMid;
        uniform vec3 uDeep;
        uniform vec3 uCrest;
        uniform float uGlint;
        uniform float uFoamGlow;
        uniform float uNight;
        uniform vec4 uLamps[${MAX_LAMPS}];
        uniform float uLampStrength;
        uniform sampler2D uTrail;
        uniform vec2 uTrailCenter;
        uniform float uTrailSize;
        varying float vWave;
        varying vec2 vOceanPosition;
        ${waterMapGLSL}`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 sea = sampleWaterMap(vOceanPosition);
        float depth = sea.x;
        // Big slow patches vary everything that would otherwise repeat in a grid
        float patches = texture2D(uNoise, vOceanPosition * 0.011 + uTime * 0.0025).g;

        // Sandy turquoise over the shallows, teal on the shelf, blue offshore
        vec3 water = mix(uShallow, uMid, smoothstep(0.02, 0.4, depth));
        water = mix(water, uDeep, smoothstep(0.35, 1.0, depth));
        water *= 0.95 + texture2D(uNoise, vOceanPosition * 0.005 + uTime * 0.002).r * 0.1;
        // At night open water sinks to a deep navy, the shallows keep only a faint glow
        water *= mix(1.0, mix(0.4, 0.52, 1.0 - smoothstep(0.1, 0.6, depth)), uNight);

        // Troughs a touch darker, crests lighter out in open water, in patches
        water = mix(water * 0.86, water, smoothstep(-0.55, 0.0, vWave));
        float crestMask = smoothstep(0.3, 0.75, patches);
        water = mix(water, uCrest, smoothstep(0.3, 0.6, vWave) * 0.35 * smoothstep(0.3, 0.8, depth) * crestMask);

        // Surf hugging the beach: its width wanders along the shore between
        // about 0.4 and 2 metres, breathes with the swell, and frays into
        // flecks toward its outer edge
        float bandWidth = mix(0.4, 2.0, texture2D(uNoise, vOceanPosition * 0.021 + vec2(uTime * 0.003, 0.0)).g);
        bandWidth *= 1.0 + sin(uTime * 1.3 + dot(vOceanPosition, vec2(0.21, 0.15))) * 0.22;
        float flecks = texture2D(uNoise, vOceanPosition * 0.33 + uTime * vec2(0.018, 0.011)).r;
        float density = 1.0 - sea.y / bandWidth;
        float surf = smoothstep(0.42, 0.52, density + (flecks - 0.5) * 0.85);

        // Broken lines of surf that roll in toward the beach over about four
        // seconds, fading in offshore and melting into the surf. The distance
        // is warped by noise so they never trace the coast exactly.
        float coast = sea.y + (texture2D(uNoise, vOceanPosition * 0.02).r - 0.5) * 3.4;
        float roll = fract(coast / 2.6 + uTime * 0.24);
        float lines = smoothstep(0.87, 0.91, roll) * (1.0 - smoothstep(0.93, 0.97, roll));
        lines *= (1.0 - smoothstep(1.6, 3.8, coast)) * smoothstep(0.5, 1.1, sea.y);
        // Only stretches of the shore have a wave coming in at any moment
        float sets = texture2D(uNoise, vOceanPosition * 0.04 + uTime * vec2(0.012, -0.008)).g;
        lines *= smoothstep(0.47, 0.6, sets) * smoothstep(0.3, 0.42, flecks);

        // Churn from the boat. Red: a narrow line behind the motor that widens
        // and fades. Green: the V of the wake and the waterline foam.
        vec2 trailUv = vec2((vOceanPosition.x - uTrailCenter.x) / uTrailSize + 0.5, -(vOceanPosition.y - uTrailCenter.y) / uTrailSize + 0.5);
        float inside = step(0.0, trailUv.x) * step(trailUv.x, 1.0) * step(0.0, trailUv.y) * step(trailUv.y, 1.0);
        vec2 trailTexel = texture2D(uTrail, trailUv).rg * inside;
        float churn = texture2D(uNoise, vOceanPosition * 0.31 + uTime * 0.04).r * 0.6 + texture2D(uNoise, vOceanPosition * 0.83 - uTime * 0.03).g * 0.4;
        // Prop wash: a pale turquoise band straight behind the boat
        water = mix(water, vec3(0.28, 0.69, 0.79), smoothstep(0.04, 0.3, trailTexel.r) * 0.3 * (1.0 - uNight * 0.7));
        float trailFoam = smoothstep(0.42, 0.6, trailTexel.r * (0.3 + churn * 1.15));
        float fray = texture2D(uNoise, vOceanPosition * 1.7 + uTime * 0.05).r;
        // Fresh foam is solid; it frays into flecks only as it fades
        float fresh = smoothstep(0.5, 1.1, trailTexel.g);
        trailFoam = max(trailFoam, smoothstep(0.46, 0.56, trailTexel.g + ((churn - 0.5) * 0.9 + (fray - 0.5) * 0.5) * (1.0 - fresh * 0.8)));

        // At night the surf dims to a cool blue so lights stay the brightest thing
        vec3 foamColor = mix(vec3(1.0), vec3(0.44, 0.56, 0.78), uNight);
        float foamAmount = mix(1.0, 0.4, uNight);
        diffuseColor.rgb = mix(water, foamColor, max(surf, lines * 0.5) * foamAmount);
        vec3 trailColor = mix(vec3(1.0), vec3(0.25, 1.1, 1.3), uFoamGlow);
        diffuseColor.rgb = mix(diffuseColor.rgb, trailColor, trailFoam);`
      )
      // The swell barely tilts the surface, so read the light on a much
      // narrower range than land does: wave backs fall into soft shade.
      // Cast shadows are lighter on water than on land.
      .replace(
        '// STYLIZED_SHADE',
        `shade = (1.0 - dropShadow) * 0.55;
        shade = max(shade, (1.0 - smoothstep(0.6, 0.88, dot(stylizedNormal, uSunDirection))) * 0.45 * mix(0.5, 1.0, patches));
        // Cloud shadows only dim the water a little, with soft edges
        float softCloud = smoothstep(0.5, 0.78, cloud) * uCloudShadow;
        shade = max(shade, softCloud * 0.45);`
      )
      .replace(
        '// STYLIZED_EXTRA',
        `// Sun glints: a tight highlight on facets that mirror the sun toward the camera.
        // It goes above 1.0, so only these sparkles reach the bloom threshold.
        vec3 viewDirection = normalize(cameraPosition - vStylizedWorld);
        float glint = pow(max(dot(stylizedNormal, normalize(uSunDirection + viewDirection)), 0.0), 260.0);
        stylizedColor += uLightColor * glint * uGlint * (1.0 - shade) * smoothstep(0.2, 0.6, depth) * mix(1.0, 0.25, uNight);

        // Warm lamplight spilling onto the water at night, broken up by the ripples
        if (uLampStrength > 0.0) {
          float lampLight = 0.0;
          for (int i = 0; i < ${MAX_LAMPS}; i++) {
            vec4 lamp = uLamps[i];
            float fall = 1.0 - smoothstep(0.0, lamp.z, distance(vOceanPosition, lamp.xy));
            lampLight += fall * fall * lamp.w;
          }
          float shimmer = 0.45 + texture2D(uNoise, vOceanPosition * 0.8 + uTime * vec2(0.05, -0.03)).r * 1.1;
          // Amber, replacing some of the blue rather than only adding to it,
          // which would turn it pink
          float lamp = clamp(lampLight * shimmer * uLampStrength, 0.0, 1.0);
          stylizedColor = mix(stylizedColor, vec3(1.0, 0.62, 0.16), lamp * 0.45) + vec3(0.5, 0.32, 0.04) * lamp * 0.3;
        }`
      )
  }

  // The boat's trail map (see TrailMap.js) shares its uniforms with the sea
  useTrail(trail) {
    Object.assign(this.uniforms, trail.uniforms)
  }

  // Lights by the water whose glow shows on the sea after dark
  setLamps(positions) {
    positions.slice(0, MAX_LAMPS).forEach((position, index) => this.uniforms.uLamps.value[index].set(position.x, position.z, 3.6, 0.5))
  }

  setNight(night) {
    this.uniforms.uLampStrength.value = THREE.MathUtils.smoothstep(night, 0.3, 0.85)
    this.uniforms.uFoamGlow.value = THREE.MathUtils.smoothstep(night, 0.4, 0.9)
    this.uniforms.uNight.value = night
  }

  update(focus) {
    this.mesh.position.x = Math.round(focus.x / CELL) * CELL
    this.mesh.position.z = Math.round(focus.z / CELL) * CELL
  }
}
