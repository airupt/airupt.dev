import * as THREE from 'three'
import { waveHeightGLSL, waveNormalGLSL } from './waves.js'
import { islands } from './layout.js'
import { createStylizedMaterial } from './shading.js'
import { bakeWaterMap, waterMapGLSL } from './WaterMap.js'

const SIZE = 300
const SEGMENTS = 200
const CELL = SIZE / SEGMENTS

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
      uWaterMap: { value: bakeWaterMap(islands) },
      uShallow: { value: new THREE.Color('#62d8c8') },
      uMid: { value: new THREE.Color('#2a9fcf') },
      uDeep: { value: new THREE.Color('#1d61a3') },
      uCrest: { value: new THREE.Color('#7ccdee') },
      // Turned off when the map photographs the sea from straight above
      uGlint: { value: 3 },
      // Churned water glows like plankton at night
      uFoamGlow: { value: 0 },
      uNight: { value: 0 },
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
        float coast = sea.y;

        // Sandy turquoise over the shallows, teal on the shelf, blue offshore
        vec3 water = mix(uShallow, uMid, smoothstep(0.02, 0.4, depth));
        water = mix(water, uDeep, smoothstep(0.35, 1.0, depth));
        water *= 0.95 + texture2D(uNoise, vOceanPosition * 0.005 + uTime * 0.002).r * 0.1;
        // At night open water sinks to a deep navy, the shallows keep a little glow
        water *= mix(1.0, mix(0.4, 0.75, 1.0 - smoothstep(0.1, 0.6, depth)), uNight);

        // Troughs a touch darker, crests lighter out in open water; facets come from flat shading
        water = mix(water * 0.86, water, smoothstep(-0.55, 0.0, vWave));
        water = mix(water, uCrest, smoothstep(0.3, 0.6, vWave) * 0.35 * smoothstep(0.3, 0.8, depth));

        // Surf: a frothy band hugging the shore, and broken lines that roll in
        // toward it, following the real coastline
        float breakup = texture2D(uNoise, vOceanPosition * 0.045 + uTime * vec2(0.01, 0.006)).g;
        float surf = 1.0 - smoothstep(0.15, 0.75 + sin(uTime * 1.4 + vOceanPosition.x * 0.25) * 0.25, coast);
        surf *= smoothstep(0.2, 0.45, breakup + 0.25);
        // Only the line nearest the beach: further out, broken contours read as scribbles
        float roll = fract(coast / 2.4 + uTime * 0.22);
        float lines = smoothstep(0.86, 0.91, roll) * (1.0 - smoothstep(0.94, 0.99, roll));
        lines *= (1.0 - smoothstep(0.8, 3.2, coast)) * smoothstep(0.3, 0.6, coast) * smoothstep(0.35, 0.5, breakup);
        // Water churned up by the boat: lighter where it was stirred, foam
        // where it is still fresh, broken up by fine noise
        vec2 trailUv = vec2((vOceanPosition.x - uTrailCenter.x) / uTrailSize + 0.5, -(vOceanPosition.y - uTrailCenter.y) / uTrailSize + 0.5);
        float inside = step(0.0, trailUv.x) * step(trailUv.x, 1.0) * step(0.0, trailUv.y) * step(trailUv.y, 1.0);
        float trail = texture2D(uTrail, trailUv).r * inside;
        float churn = texture2D(uNoise, vOceanPosition * 0.31 + uTime * 0.04).r * 0.6 + texture2D(uNoise, vOceanPosition * 0.83 - uTime * 0.03).g * 0.4;
        water = mix(water, uCrest, smoothstep(0.03, 0.25, trail) * 0.28);
        float trailFoam = smoothstep(0.4, 0.62, trail * (0.3 + churn * 1.15));

        vec3 trailColor = mix(vec3(1.0), vec3(0.3, 2.2, 2.6), uFoamGlow);
        diffuseColor.rgb = mix(water, vec3(1.0), max(surf, lines * 0.45));
        diffuseColor.rgb = mix(diffuseColor.rgb, trailColor, trailFoam);`
      )
      // The swell barely tilts the surface, so read the light on a much
      // narrower range than land does: wave backs fall into soft shade.
      // Cast shadows are lighter on water than on land.
      .replace(
        '// STYLIZED_SHADE',
        `shade = (1.0 - dropShadow) * 0.55;
        shade = max(shade, (1.0 - smoothstep(0.6, 0.88, dot(stylizedNormal, uSunDirection))) * 0.45);
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
        stylizedColor += uLightColor * glint * uGlint * (1.0 - shade) * smoothstep(0.2, 0.6, depth);`
      )
  }

  // The boat's trail map (see TrailMap.js) shares its uniforms with the sea
  useTrail(trail) {
    Object.assign(this.uniforms, trail.uniforms)
  }

  setNight(night) {
    this.uniforms.uFoamGlow.value = THREE.MathUtils.smoothstep(night, 0.4, 0.9)
    this.uniforms.uNight.value = night
  }

  update(focus) {
    this.mesh.position.x = Math.round(focus.x / CELL) * CELL
    this.mesh.position.z = Math.round(focus.z / CELL) * CELL
  }
}
