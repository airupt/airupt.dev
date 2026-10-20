import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createStylizedMaterial, windGLSL } from './shading.js'
import { createRandom, hash2 } from '../utils/noise.js'

// One lump of leaves: a low-poly ball with its corners pushed in and out a
// little so no two facets line up
function createBlobGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 1)
  const position = geometry.attributes.position
  const normal = geometry.attributes.normal
  const vertex = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i).normalize()
    normal.setXYZ(i, vertex.x, vertex.y, vertex.z)
    // Shared corners get the same push, so the surface stays closed
    const lump = 0.88 + hash2(Math.round(vertex.x * 50), Math.round(vertex.y * 50) + Math.round(vertex.z * 50) * 7, 3) * 0.2
    position.setXYZ(i, vertex.x * lump, vertex.y * lump * 0.86, vertex.z * lump)
  }
  return geometry
}

// Bushes and tree canopies: instanced soft blobs, each with its own size,
// turn and colour. A crown is a few blobs heaped together.
export class Foliage {
  constructor(app) {
    this.app = app
    this.instances = []
    this.trunks = []
  }

  addCluster(position, size, color) {
    this.instances.push({ position: position.clone(), size, color: new THREE.Color(color) })
  }

  addTree(position, height, canopySize, color, random) {
    this.trunks.push({ position: position.clone(), height })
    const top = position.clone()
    top.y += height
    this.addCluster(top, canopySize, color)
    // Smaller lumps heaped around and on top of the main one make the crown irregular
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + random() * 1.2
      const lift = i === 3 ? 0.62 : -0.2 + random() * 0.35
      const reach = i === 3 ? 0.2 : 0.78
      const offset = new THREE.Vector3(Math.cos(angle) * canopySize * reach, canopySize * lift, Math.sin(angle) * canopySize * reach)
      this.addCluster(top.clone().add(offset), canopySize * (0.52 + random() * 0.2), color)
    }
  }

  build() {
    this.buildClusters()
    if (this.trunks.length) this.buildTrunks()
  }

  buildClusters() {
    // Faceted like the palms, rocks and cliffs, so the whole world is one low-poly family
    const material = createStylizedMaterial({ color: '#ffffff', flatShading: true }, { waterLine: false, key: 'foliage', extend: shader => this.extend(shader) })
    const mesh = new THREE.InstancedMesh(createBlobGeometry(), material, this.instances.length)
    const object = new THREE.Object3D()
    const random = createRandom(13)

    this.instances.forEach((instance, index) => {
      object.position.copy(instance.position)
      object.rotation.set(0, random() * Math.PI * 2, 0)
      object.scale.setScalar(instance.size)
      object.updateMatrix()
      mesh.setMatrixAt(index, object.matrix)
      // Each lump a shade lighter or darker than its neighbours, so a crown
      // reads as a heap of separate clumps
      mesh.setColorAt(index, instance.color.clone().multiplyScalar(0.88 + random() * 0.22))
    })

    mesh.castShadow = true
    mesh.receiveShadow = true
    this.app.scene.add(mesh)
  }

  buildTrunks() {
    const geometry = new THREE.CylinderGeometry(0.11, 0.2, 1, 6)
    geometry.translate(0, 0.5, 0)
    const material = createStylizedMaterial({ color: '#8a5a3c', flatShading: true }, { waterLine: false })
    const mesh = new THREE.InstancedMesh(geometry, material, this.trunks.length)
    const object = new THREE.Object3D()

    this.trunks.forEach((trunk, index) => {
      object.position.copy(trunk.position)
      object.scale.set(1, trunk.height, 1)
      object.updateMatrix()
      mesh.setMatrixAt(index, object.matrix)
    })

    mesh.castShadow = true
    mesh.receiveShadow = true
    this.app.scene.add(mesh)
  }

  // Lumps lean with the wind as a whole, and are darker underneath where
  // the crown shades itself
  extend(shader) {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uNoise;
        varying float vBlobHeight;
        ${windGLSL}`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBlobHeight = position.y;
        vec2 blobCentre = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        vec2 lean = windOffset(blobCentre) * (position.y + 1.0) * 0.18;
        transformed.xz += (inverse(mat2(instanceMatrix[0].xz, instanceMatrix[2].xz)) * lean);`
      )

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBlobHeight;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.72, 1.06, smoothstep(-0.9, 0.7, vBlobHeight));')
      // A crisper edge between the lit and shaded side of each lump
      .replace('// STYLIZED_SHADE', 'shade = mix(shade, smoothstep(0.3, 0.6, shade), 0.75);')
  }
}
