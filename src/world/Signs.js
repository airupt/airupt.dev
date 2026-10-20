import * as THREE from 'three'
import { createStylizedMaterial } from './shading.js'

const BOARD = { width: 4.4, height: 1.45, depth: 0.14 }

// Painted board in the site's ink blue: the name in the display font, with
// a stripe in the section colour along the bottom
function createBoardTexture(text, accent) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = Math.round((1024 * BOARD.height) / BOARD.width)
  const context = canvas.getContext('2d')

  context.fillStyle = '#123a5c'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = accent
  context.fillRect(0, canvas.height - 34, canvas.width, 34)

  context.fillStyle = '#f4f1ea'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  let size = 200
  do {
    context.font = `800 ${size}px "Bricolage Grotesque", system-ui, sans-serif`
    size -= 6
  } while (context.measureText(text).width > canvas.width * 0.84)
  context.fillText(text, canvas.width / 2, canvas.height * 0.45)

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

      boards.push(placement.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.8, 0)))
      for (const side of [-1, 1]) {
        posts.push(placement.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(side * BOARD.width * 0.36, 1.25, -0.12)))
      }

      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(BOARD.width, BOARD.height),
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
      face.applyMatrix4(placement.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.8, BOARD.depth / 2 + 0.005)))
      face.receiveShadow = true
      app.scene.add(face)
    }

    for (const [geometry, matrices] of [
      [new THREE.BoxGeometry(BOARD.width, BOARD.height, BOARD.depth), boards],
      [new THREE.BoxGeometry(0.2, 2.5, 0.2), posts],
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
