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
// face the camera so they read from the default view
export class Signs {
  constructor(app, islands, entries) {
    const postMaterial = createStylizedMaterial({ color: '#8a5a3c', flatShading: true }, { waterLine: false })
    const edgeMaterial = createStylizedMaterial({ color: '#a76c3e', flatShading: true }, { waterLine: false })
    const facing = Math.atan2(app.cameraRig.direction.x, app.cameraRig.direction.z)

    for (const { island, text, color } of entries) {
      const { shore, out } = island
      // On the beach, to one side of the dock
      const x = shore.x - out.x * 2.5 + out.z * 4
      const z = shore.z - out.z * 2.5 - out.x * 4
      const surface = islands.surfaceAt(island, x, z)
      if (!surface) continue

      const sign = new THREE.Group()
      sign.position.set(x, surface.y, z)
      sign.rotation.y = facing

      const face = createStylizedMaterial({ map: createBoardTexture(text, color) }, { waterLine: false, key: 'sign' })
      // BoxGeometry material order: +x, -x, +y, -y, +z (front), -z
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(BOARD.width, BOARD.height, BOARD.depth),
        [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, face, edgeMaterial]
      )
      board.position.y = 1.55
      sign.add(board)

      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.1, 0.16), postMaterial)
        post.position.set(side * BOARD.width * 0.36, 1.05, -0.1)
        sign.add(post)
      }

      sign.traverse(child => {
        child.castShadow = true
        child.receiveShadow = true
      })
      app.scene.add(sign)
    }
  }
}
