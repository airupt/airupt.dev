import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { createStylizedMaterial, windGLSL } from './shading.js'
import { createRandom } from '../utils/noise.js'

const CARDS = 70

// Soft blobs added together; cutting this at 0.5 leaves a lumpy leaf-cluster
// outline, and rotating the lookup a little makes the outline flutter
function createLeafTexture() {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  context.fillStyle = '#000'
  context.fillRect(0, 0, size, size)
  context.globalCompositeOperation = 'lighter'

  const random = createRandom(5)
  for (let i = 0; i < 22; i++) {
    const angle = random() * Math.PI * 2
    const distance = Math.sqrt(random()) * size * 0.26
    const x = size / 2 + Math.cos(angle) * distance
    const y = size / 2 + Math.sin(angle) * distance
    const radius = size * (0.08 + random() * 0.09)
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
    gradient.addColorStop(0, 'rgba(255,255,255,0.75)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = gradient
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

// Leaf cards scattered through a unit sphere, all facing +Z. Normals are bent
// outward so the whole cluster is lit like one soft ball.
function createClusterGeometry() {
  const random = createRandom(9)
  const cards = []
  const radial = new THREE.Vector3()
  const vertex = new THREE.Vector3()

  for (let i = 0; i < CARDS; i++) {
    const card = new THREE.PlaneGeometry(0.8, 0.8)
    card.rotateZ(random() * Math.PI * 2)
    radial.setFromSphericalCoords(1 - Math.pow(random(), 3), Math.acos(2 * random() - 1), random() * Math.PI * 2)
    card.translate(radial.x, radial.y, radial.z)

    const outward = radial.clone().normalize()
    const position = card.attributes.position
    const normal = card.attributes.normal
    for (let j = 0; j < position.count; j++) {
      vertex.fromBufferAttribute(position, j).lerp(outward, 0.85).normalize()
      normal.setXYZ(j, vertex.x, vertex.y, vertex.z)
    }
    cards.push(card)
  }

  return mergeGeometries(cards)
}

// Bushes and tree canopies: instanced leaf clusters turned to face the
// fixed camera direction, each with its own size, roll and colour.
export class Foliage {
  constructor(app) {
    this.app = app
    this.instances = []
    this.trunks = []
    this.texture = createLeafTexture()
    this.cameraDirection = app.cameraRig.direction.clone()
  }

  addCluster(position, size, color) {
    this.instances.push({ position: position.clone(), size, color: new THREE.Color(color) })
  }

  addTree(position, height, canopySize, color, random) {
    this.trunks.push({ position: position.clone(), height })
    const top = position.clone()
    top.y += height
    this.addCluster(top, canopySize, color)
    // A couple of smaller clusters around the main one make the crown irregular
    for (let i = 0; i < 2; i++) {
      const angle = random() * Math.PI * 2
      const offset = new THREE.Vector3(Math.cos(angle) * canopySize * 0.7, -canopySize * 0.25, Math.sin(angle) * canopySize * 0.7)
      this.addCluster(top.clone().add(offset), canopySize * (0.55 + random() * 0.2), color)
    }
  }

  build() {
    this.buildClusters()
    if (this.trunks.length) this.buildTrunks()
  }

  buildClusters() {
    const material = createStylizedMaterial({ color: '#ffffff' }, { waterLine: false, key: 'foliage', extend: shader => this.extend(shader) })
    const mesh = new THREE.InstancedMesh(createClusterGeometry(), material, this.instances.length)
    const object = new THREE.Object3D()
    const random = createRandom(13)

    this.instances.forEach((instance, index) => {
      const roll = random() * Math.PI * 2
      object.position.copy(instance.position)
      object.up.set(Math.sin(roll), Math.cos(roll), 0)
      object.lookAt(instance.position.clone().add(this.cameraDirection))
      object.scale.setScalar(instance.size)
      object.updateMatrix()
      mesh.setMatrixAt(index, object.matrix)
      mesh.setColorAt(index, instance.color)
    })

    mesh.castShadow = true
    mesh.receiveShadow = true
    // Shadows use the same leaf outline instead of solid squares
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      alphaMap: this.texture,
      alphaTest: 0.5,
    })
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

  extend(shader) {
    shader.uniforms.uLeaves = { value: this.texture }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uNoise;
        varying vec2 vLeafUv;
        varying float vLeafWind;
        ${windGLSL}`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vLeafUv = uv;
        vec2 clusterPosition = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
        vLeafWind = length(windOffset(clusterPosition));`
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uLeaves;
        varying vec2 vLeafUv;
        varying float vLeafWind;`
      )
      .replace(
        '#include <alphamap_fragment>',
        `float leafAngle = vLeafWind * 2.2;
        vec2 leafUv = mat2(cos(leafAngle), -sin(leafAngle), sin(leafAngle), cos(leafAngle)) * (vLeafUv - 0.5) + 0.5;
        if (texture2D(uLeaves, leafUv).r < 0.5) discard;`
      )
  }
}
