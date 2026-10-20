import * as THREE from 'three'
import { waveHeightGLSL } from './waves.js'
import { islands } from './layout.js'

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
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color('#13609f') },
      uCrest: { value: new THREE.Color('#8fe0ff') },
      uShallow: { value: new THREE.Color('#47d3cb') },
      uIslands: { value: islands.map(island => new THREE.Vector3(island.x, island.z, island.radius)) },
    }

    const material = new THREE.MeshStandardMaterial({ color: '#2389cf', roughness: 0.45, flatShading: true })
    material.onBeforeCompile = shader => {
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
          uniform float uTime;
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
          // Troughs a little darker, crests a little lighter; the facets come from flat shading
          diffuseColor.rgb = mix(uDeep, diffuseColor.rgb, smoothstep(-0.55, 0.0, vWave) * 0.6 + 0.4);
          diffuseColor.rgb = mix(diffuseColor.rgb, uCrest, smoothstep(0.3, 0.6, vWave) * 0.5);

          // Shallow water and a foam ring around every island
          float shore = 0.0;
          for (int i = 0; i < ${islands.length}; i++) {
            float islandDistance = length(vOceanPosition - uIslands[i].xy) / uIslands[i].z;
            shore = max(shore, 1.0 - smoothstep(0.9, 1.6, islandDistance));
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, uShallow, shore * 0.8);
          float foam = smoothstep(0.93, 0.95, shore + sin(uTime * 1.3) * 0.02);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), foam);`
        )
    }

    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.receiveShadow = true
    app.scene.add(this.mesh)
  }

  update(focus) {
    this.uniforms.uTime.value = this.app.physics.renderTime
    this.mesh.position.x = Math.round(focus.x / CELL) * CELL
    this.mesh.position.z = Math.round(focus.z / CELL) * CELL
  }
}
