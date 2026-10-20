import * as THREE from 'three'
import { createStylizedMaterial } from './shading.js'

const BOARD = { width: 3.2, height: 1.1, depth: 0.12 }

// Painted plank: section name in the display font on a wood-coloured board
function createBoardTexture(text, accent) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = Math.round((512 * BOARD.height) / BOARD.width)
  const context = canvas.getContext('2d')

  context.fillStyle = '#c98b55'
  context.fillRect(0, 0, canvas.width, canvas.height)
  // Plank seams
  context.fillStyle = '#b07846'
  for (const y of [0.33, 0.66]) context.fillRect(0, canvas.height * y - 2, canvas.width, 4)
  // Accent stripe in the section colour
  context.fillStyle = accent
  context.fillRect(0, canvas.height - 16, canvas.width, 16)

  context.fillStyle = '#2b1a10'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  let size = 96
  do {
    context.font = `800 ${size}px "Bricolage Grotesque", system-ui, sans-serif`
    size -= 4
  } while (context.measureText(text).width > canvas.width * 0.86)
  context.fillText(text, canvas.width / 2, canvas.height * 0.47)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

// Wooden signs with the section name, planted near each dock and turned to
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
      const { shore, out } = island
      // On the beach, to one side of the dock
      const x = shore.x - out.x * 2.5 + out.z * 4
      const z = shore.z - out.z * 2.5 - out.x * 4
      const surface = islands.surfaceAt(island, x, z)
      if (!surface) continue

      placement.position.set(x, surface.y, z)
      placement.rotation.y = facing
      placement.updateMatrix()

      boards.push(placement.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.55, 0)))
      for (const side of [-1, 1]) {
        posts.push(placement.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(side * BOARD.width * 0.36, 1.05, -0.1)))
      }

      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(BOARD.width, BOARD.height),
        createStylizedMaterial({ map: createBoardTexture(text, color) }, { waterLine: false, key: 'sign' })
      )
      face.applyMatrix4(placement.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.55, BOARD.depth / 2 + 0.005)))
      face.receiveShadow = true
      app.scene.add(face)
    }

    for (const [geometry, matrices] of [
      [new THREE.BoxGeometry(BOARD.width, BOARD.height, BOARD.depth), boards],
      [new THREE.BoxGeometry(0.16, 2.1, 0.16), posts],
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
