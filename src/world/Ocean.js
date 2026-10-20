import * as THREE from 'three'
import { waveHeightGLSL } from './waves.js'
import { islands } from './layout.js'
import { createStylizedMaterial } from './shading.js'

const SIZE = 400
const SEGMENTS = 160
const CELL = SIZE / SEGMENTS

// A large faceted plane displaced by the shared wave function. It follows the
// camera in whole-cell steps, so vertices always land on the same world grid
// and the surface never appears to slide.
export class Ocean {
  constructor(app) {
    this.app = app

    const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS)
    geometry.rotateX(-Math.PI / 2)

    this.uniforms = {
      uDeep: { value: new THREE.Color('#0f5fa8') },
      uCrest: { value: new THREE.Color('#7fdcff') },
      uShallow: { value: new THREE.Color('#2fd6cf') },
      uIslands: { value: islands.map(island => new THREE.Vector3(island.x, island.z, island.radius)) },
    }

    const material = createStylizedMaterial(
      { color: '#1b8fd6', flatShading: true },
      { waterLine: false, key: 'ocean', extend: shader => this.extend(shader) }
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
        ${waveHeightGLSL()}`
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
        uniform vec3 uDeep;
        uniform vec3 uCrest;
        uniform vec3 uShallow;
        uniform vec3 uIslands[${islands.length}];
        varying float vWave;
        varying vec2 vOceanPosition;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Broad patches of deeper and lighter water drifting slowly
        float patches = texture2D(uNoise, vOceanPosition * 0.006 + uTime * 0.002).r;
        diffuseColor.rgb = mix(uDeep, diffuseColor.rgb, smoothstep(0.25, 0.65, patches) * 0.55 + 0.45);

        // Troughs a little darker, crests a little lighter; facets come from flat shading
        diffuseColor.rgb = mix(uDeep, diffuseColor.rgb, smoothstep(-0.55, 0.0, vWave) * 0.6 + 0.4);
        diffuseColor.rgb = mix(diffuseColor.rgb, uCrest, smoothstep(0.3, 0.6, vWave) * 0.5);

        // Shallow water around every island, measured in island radii and
        // wobbled by noise so the rings don't read as perfect circles
        float nearest = 10.0;
        for (int i = 0; i < ${islands.length}; i++) {
          nearest = min(nearest, length(vOceanPosition - uIslands[i].xy) / uIslands[i].z);
        }
        nearest += (texture2D(uNoise, vOceanPosition * 0.03).r - 0.5) * 0.18;
        float shore = 1.0 - smoothstep(0.9, 1.6, nearest);
        diffuseColor.rgb = mix(diffuseColor.rgb, uShallow, shore * 0.85);

        // Broken contour lines rolling in toward each beach
        float ring = fract(nearest * 5.0 + uTime * 0.18);
        float rings = smoothstep(0.88, 0.94, ring) * (1.0 - smoothstep(1.0, 1.45, nearest)) * step(0.97, nearest);
        rings *= smoothstep(0.4, 0.6, texture2D(uNoise, vOceanPosition * 0.02 + uTime * 0.01).g);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), rings * 0.6);`
      )
      .replace(
        '// STYLIZED_EXTRA',
        `// Sun glints: a tight highlight on facets that mirror the sun toward the camera.
        // It goes above 1.0, so only these sparkles reach the bloom threshold.
        vec3 viewDirection = normalize(cameraPosition - vStylizedWorld);
        float glint = pow(max(dot(stylizedNormal, normalize(uSunDirection + viewDirection)), 0.0), 260.0);
        stylizedColor += uLightColor * glint * 3.0 * (1.0 - shade);`
      )
  }

  update(focus) {
    this.mesh.position.x = Math.round(focus.x / CELL) * CELL
    this.mesh.position.z = Math.round(focus.z / CELL) * CELL
  }
}
