import * as THREE from 'three'
import { createStylizedMaterial } from './shading.js'
import { sections } from '../content/portfolio.js'

const BOARD = { width: 2.6, height: 2 }
const TEXTURE = { width: 680, height: 520 }

// Paints one project card: its screenshot (or a striped tile with initials
// until there is one) above the title and year
function paintCard(context, project, color, image) {
  const { width, height } = TEXTURE
  const pictureHeight = Math.round(height * 0.68)

  context.fillStyle = '#123a5c'
  context.fillRect(0, 0, width, height)

  if (image) {
    // Cover-fit the screenshot into the picture area
    const scale = Math.max(width / image.width, pictureHeight / image.height)
    const drawWidth = image.width * scale
    const drawHeight = image.height * scale
    context.save()
    context.beginPath()
    context.rect(0, 0, width, pictureHeight)
    context.clip()
    context.drawImage(image, (width - drawWidth) / 2, (pictureHeight - drawHeight) / 2, drawWidth, drawHeight)
    context.restore()
  } else {
    context.fillStyle = color
    context.fillRect(0, 0, width, pictureHeight)
    context.fillStyle = 'rgba(13, 43, 69, 0.08)'
    for (let x = -pictureHeight; x < width; x += 36) {
      context.beginPath()
      context.moveTo(x, pictureHeight)
      context.lineTo(x + 18, pictureHeight)
      context.lineTo(x + 18 + pictureHeight, 0)
      context.lineTo(x + pictureHeight, 0)
      context.fill()
    }
    const initials = project.title
      .split(/\s+/)
      .map(word => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
    context.fillStyle = '#0d2b45'
    context.font = '800 150px "Bricolage Grotesque", system-ui, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(initials, width / 2, pictureHeight / 2 + 6)
  }

  context.fillStyle = color
  context.fillRect(0, pictureHeight, width, 10)

  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillStyle = '#f4f1ea'
  let size = 58
  do {
    context.font = `800 ${size}px "Bricolage Grotesque", system-ui, sans-serif`
    size -= 2
  } while (context.measureText(project.title).width > width - 60)
  context.fillText(project.title, 30, pictureHeight + 82)

  context.fillStyle = 'rgba(244, 241, 234, 0.7)'
  context.font = '600 30px "Figtree", system-ui, sans-serif'
  context.fillText([project.year, project.role].filter(Boolean).join(' · '), 30, pictureHeight + 132)
}

// Framed boards on the Projects island showing the first few projects, so
// the work is visible in the world before you open the panel
export class ProjectBoards {
  constructor(app, islands) {
    this.app = app
    this.boards = []
    this.contacts = []
    const island = islands.list.find(candidate => candidate.section === 'projects')
    const projects = sections.find(section => section.id === 'projects')?.projects ?? []
    if (!island || !projects.length) return

    const color = island.color
    const frameMaterial = createStylizedMaterial({ color: '#7a4f33', flatShading: true }, { waterLine: false })
    const frameGeometry = new THREE.BoxGeometry(BOARD.width + 0.3, BOARD.height + 0.3, 0.14)
    // One stout post each: the board turns on top of it (see update())
    const postGeometry = new THREE.CylinderGeometry(0.14, 0.17, 2.3, 8)
    postGeometry.translate(0, 0.55, 0)
    projects.slice(0, 3).forEach((project, index) => {
      // A gentle arc at the back of the square (see IslandScenes.js)
      const spot = island.plan.boards[index]
      if (!spot) return
      const { x, z, rotation } = spot
      const surface = islands.surfaceAt(island, x, z)
      if (!surface) return

      const post = new THREE.Mesh(postGeometry, frameMaterial)
      post.position.set(x, surface.y, z)
      post.castShadow = true
      post.receiveShadow = true
      app.scene.add(post)
      this.contacts.push({ x, z, radius: 0.4 })

      const pivot = new THREE.Group()
      pivot.position.set(x, surface.y + 2.6, z)
      pivot.rotation.y = rotation
      app.scene.add(pivot)

      const frame = new THREE.Mesh(frameGeometry, frameMaterial)
      frame.position.z = -0.08
      frame.castShadow = true
      frame.receiveShadow = true
      pivot.add(frame)

      const canvas = document.createElement('canvas')
      canvas.width = TEXTURE.width
      canvas.height = TEXTURE.height
      const context = canvas.getContext('2d')
      paintCard(context, project, color, null)
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 4

      if (project.image) {
        const image = new Image()
        image.onload = () => {
          paintCard(context, project, color, image)
          texture.needsUpdate = true
        }
        image.src = project.image
      }

      // Lights up while its card is hovered in the panel (see highlight())
      const highlight = { value: 0 }
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(BOARD.width, BOARD.height),
        createStylizedMaterial(
          { map: texture },
          {
            waterLine: false,
            key: 'board',
            extend: shader => {
              shader.uniforms.uHighlight = highlight
              shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nuniform float uHighlight;')
                .replace('// STYLIZED_SHADE', 'shade = (1.0 - dropShadow) * 0.6 * (1.0 - uHighlight);')
                .replace('// STYLIZED_EXTRA', 'stylizedColor *= 1.0 + max(uHighlight, 0.0) * 0.55 + min(uHighlight, 0.0) * 0.3;')
            },
          }
        )
      )
      face.position.z = 0.02
      face.receiveShadow = true
      pivot.add(face)
      this.boards.push({ highlight, face, pivot, rest: rotation, turn: 0, position: new THREE.Vector3(x, surface.y + 2.6, z) })
    })
  }

  // Called by the panel: which project card is under the pointer (or null).
  // That board brightens and the camera leans a little toward it.
  highlight(index) {
    this.active = index
    const board = this.boards[index]
    const rig = this.app.cameraRig
    if (board && rig.override) rig.nudgeTarget.subVectors(board.position, rig.override).setY(0).multiplyScalar(0.22)
    else rig.nudgeTarget.set(0, 0, 0)
  }

  // The hovered board brightens and steps forward off its frame; the others
  // dim, so it's obvious which one the card belongs to. As the boat passes
  // close by, each board turns on its post to face it, as if to show itself.
  update(delta) {
    const anyActive = this.active !== null && this.active !== undefined
    const boat = this.app.world.boat.object.position
    this.boards.forEach(({ highlight, face, pivot, rest, position }, index) => {
      const target = index === this.active ? 1 : anyActive ? -1 : 0
      highlight.value += (target - highlight.value) * (1 - Math.exp(-8 * delta))
      const lift = Math.max(highlight.value, 0)
      face.position.z = 0.02 + lift * 0.12
      face.scale.setScalar(1 + lift * 0.05)

      const board = this.boards[index]
      const distance = Math.hypot(boat.x - position.x, boat.z - position.z)
      const toBoat = Math.atan2(boat.x - position.x, boat.z - position.z) - rest
      const wanted = distance < 32 && !anyActive ? THREE.MathUtils.clamp(Math.atan2(Math.sin(toBoat), Math.cos(toBoat)), -0.5, 0.5) : 0
      board.turn += (wanted - board.turn) * (1 - Math.exp(-2.5 * delta))
      pivot.rotation.y = rest + board.turn
    })
  }
}
