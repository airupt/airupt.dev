import * as THREE from 'three'
import { createStylizedMaterial, windGLSL } from './shading.js'
import { createRandom, smoothstep } from '../utils/noise.js'
import { pathAmount } from './Paths.js'

const DENSITY = 11 // blades per square metre of grass face

// Grass grown on the grassy faces of each island. Every blade is a single
// triangle: two root corners and a tip. The vertex shader gives it its height,
// turns it to face the camera and bends the tip with the wind.
export class Grass {
  constructor(app, islands) {
    this.uniforms = {
      uBladeWidth: { value: 0.12 },
      uBladeHeight: { value: 0.38 },
      // Perpendicular to the fixed camera direction, so blades show their full width
      uBladeRight: { value: new THREE.Vector3(1, 0, -1).normalize() },
    }

    this.material = createStylizedMaterial(
      { vertexColors: true },
      { waterLine: false, key: 'grass', extend: shader => this.extend(shader) }
    )

    for (const island of islands.list) {
      if (!island.grass.length) continue
      const mesh = new THREE.Mesh(this.createGeometry(island), this.material)
      mesh.position.set(island.x, 0, island.z)
      mesh.receiveShadow = true
      app.scene.add(mesh)
    }
  }

  createGeometry(island) {
    const random = createRandom(island.seed * 31)
    const positions = []
    const blades = []
    const colors = []
    const edgeA = new THREE.Vector3()
    const edgeB = new THREE.Vector3()
    const point = new THREE.Vector3()

    for (const { a, b, c, color } of island.grass) {
      const area = edgeA.subVectors(b, a).cross(edgeB.subVectors(c, a)).length() / 2
      // Fractional blade counts are rounded up or down at random, keeping density even
      const count = Math.floor(area * DENSITY + random())

      for (let i = 0; i < count; i++) {
        let u = random()
        let v = random()
        if (u + v > 1) {
          u = 1 - u
          v = 1 - v
        }
        point.copy(a).addScaledVector(edgeA.subVectors(b, a), u).addScaledVector(edgeB.subVectors(c, a), v)
        // Thins out toward the beach and stays off the footpaths
        if (random() > smoothstep(0.12, 0.75, point.y)) continue
        if (random() < pathAmount(island.paths, point.x + island.x, point.z + island.z) * 1.4) continue

        const height = random()
        const shade = 0.85 + random() * 0.3
        for (let corner = 0; corner < 3; corner++) {
          positions.push(point.x, point.y, point.z)
          blades.push(corner, height)
          colors.push(color.r * shade, color.g * shade, color.b * shade)
        }
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('aBlade', new THREE.Float32BufferAttribute(blades, 2))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(positions.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3))
    geometry.computeBoundingSphere()
    geometry.boundingSphere.radius += 1
    return geometry
  }

  extend(shader) {
    Object.assign(shader.uniforms, this.uniforms)

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uNoise;
        uniform float uBladeWidth;
        uniform float uBladeHeight;
        uniform vec3 uBladeRight;
        attribute vec2 aBlade;
        varying float vGrassTip;
        ${windGLSL}`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec2 bladeWorld = (modelMatrix * vec4(transformed, 1.0)).xz;
        float tipness = 1.0 - step(0.5, aBlade.x);
        // Corner order chosen so the triangle's front face points at the camera
        float side = aBlade.x < 1.5 ? -1.0 : 1.0;
        float height = uBladeHeight * (0.45 + aBlade.y * 0.55) * (0.6 + texture2D(uNoise, bladeWorld * 0.03).r * 0.8);
        transformed += uBladeRight * side * uBladeWidth * (1.0 - tipness);
        transformed.y += height * tipness;
        transformed.xz += windOffset(bladeWorld) * tipness * height * 2.0;
        vGrassTip = tipness;`
      )

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGrassTip;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Blades stay close to the ground's colour (tips only a touch lighter),
        // so the lawn reads as one soft surface rather than noise
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.08 + vec3(0.01, 0.015, 0.0), vGrassTip);
        // Sun-dried patches break up the green
        float meadow = texture2D(uNoise, vStylizedWorld.xz * 0.04).g;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.3, 1.15, 0.65), smoothstep(0.55, 0.75, meadow) * 0.35);`
      )
      // Roots sit a little in the shade of their neighbours
      .replace('// STYLIZED_SHADE', 'shade = max(shade, (1.0 - vGrassTip) * 0.32);')
  }
}
