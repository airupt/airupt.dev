import * as THREE from 'three'
import { createStylizedMaterial } from './shading.js'

const BOARD = { width: 4.4, height: 1.45, depth: 0.1, bevel: 0.06 }
// The painted panel sits inside the wooden frame by this much on each side
const FRAME = 0.13

// Painted panel in the site's ink blue: the name in the display font, with
// a thin trim line in the section colour all round, like the map pins
function createBoardTexture(text, accent) {
  const width = BOARD.width - FRAME * 2
  const height = BOARD.height - FRAME * 2
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = Math.round((1024 * height) / width)
  const context = canvas.getContext('2d')

  context.fillStyle = '#123a5c'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.strokeStyle = accent
  context.lineWidth = 9
  context.strokeRect(22, 22, canvas.width - 44, canvas.height - 44)

  context.fillStyle = '#f4f1ea'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  let size = 200
  do {
    context.font = `800 ${size}px "Bricolage Grotesque", system-ui, sans-serif`
    size -= 6
  } while (context.measureText(text).width > canvas.width * 0.8)
  context.fillText(text, canvas.width / 2, canvas.height * 0.52)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

// A plank of wood with bevelled edges and softly rounded corners
function createBoardGeometry() {
  const { width, height, depth, bevel } = BOARD
  const w = width / 2 - bevel
  const h = height / 2 - bevel
  const r = 0.08
  const shape = new THREE.Shape()
  shape.moveTo(-w + r, -h)
  shape.lineTo(w - r, -h)
  shape.quadraticCurveTo(w, -h, w, -h + r)
  shape.lineTo(w, h - r)
  shape.quadraticCurveTo(w, h, w - r, h)
  shape.lineTo(-w + r, h)
  shape.quadraticCurveTo(-w, h, -w, h - r)
  shape.lineTo(-w, -h + r)
  shape.quadraticCurveTo(-w, -h, -w + r, -h)
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 2 })
  geometry.translate(0, 0, -depth / 2)
  return geometry
}

// Wooden signs with the section name, planted beside each dock path and turned to
// face the camera so they read from the default view. Boards and posts of
// all signs are two instanced draws; only the painted fronts are separate.
export class Signs {
  constructor(app, islands, entries) {
    const woodMaterial = createStylizedMaterial({ color: '#a76c3e', flatShading: true }, { waterLine: false })
    const facing = Math.atan2(app.cameraRig.direction.x, app.cameraRig.direction.z)
    const boards = []
    const posts = []
    const placement = new THREE.Object3D()

    for (const { island, text, color } of entries) {
      // Beside the path up from the dock (see IslandScenes.js)
      const { x, z } = island.plan.sign
      const surface = islands.surfaceAt(island, x, z)
      if (!surface) continue

      placement.position.set(x, surface.y, z)
      placement.rotation.y = facing
      placement.updateMatrix()

      boards.push(placement.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.8, 0)))
      for (const side of [-1, 1]) {
        // Reaching 0.6 m into the ground, so neither post floats on a slope
        posts.push(placement.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(side * BOARD.width * 0.36, 0.95, -0.12)))
      }

      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(BOARD.width - FRAME * 2, BOARD.height - FRAME * 2),
        // The face points at the camera, i.e. mostly away from the sun: skip the
        // form shading so the lettering stays bright, keep cast shadows
        createStylizedMaterial(
          { map: createBoardTexture(text, color) },
          {
            waterLine: false,
            key: 'sign',
            extend: shader => {
              shader.fragmentShader = shader.fragmentShader.replace('// STYLIZED_SHADE', 'shade = (1.0 - dropShadow) * 0.6;')
            },
          }
        )
      )
      face.applyMatrix4(placement.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.8, BOARD.depth / 2 + BOARD.bevel + 0.005)))
      face.receiveShadow = true
      app.scene.add(face)
    }

    for (const [geometry, matrices] of [
      [createBoardGeometry(), boards],
      [new THREE.BoxGeometry(0.2, 3.1, 0.2), posts],
    ]) {
      const mesh = new THREE.InstancedMesh(geometry, woodMaterial, matrices.length)
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      app.scene.add(mesh)
    }
  }
}
