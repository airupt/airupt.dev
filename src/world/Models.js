import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createStylizedMaterial, stylize, stylizeObject, windGLSL } from './shading.js'

// The Kenney kits use different unit sizes; these bring every model to metres
// and to a size that sits right next to the 3.9 m boat (a barrel waist
// high, a crate knee to waist high, a workbench at hand height)
const scales = {
  boat: 1,
  tent: 5,
  campfire: 3.4,
  signpost: 4,
  'signpost-single': 4,
  stall: 2.4,
  cart: 2,
  'hut-roof': 1.12,
  lookout: 1.3,
  anvil: 3.2,
  barrel: 0.62,
  crate: 0.72,
  'crate-bottles': 0.72,
  fish: 4.5,
  'fish-large': 4,
}

// Pale lavender-grey stone turns violet in the tinted shade; warmed to
// sandstone it stays a soft grey-mauve. Applied once, on its own materials.
const tints = {
  tower: '#f1d9bd',
  lookout: '#efd6b8',
}

// Models whose tops bend in the wind
const swaying = ['palm-straight', 'palm-bend', 'palm-detailed-straight', 'palm-detailed-bend']

// Bends vertices by the wind, more the higher they sit in the model
function sway(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nuniform sampler2D uNoise;\n${windGLSL}`)
    .replace(
      '#include <project_vertex>',
      `vec4 swayLocal = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        swayLocal = instanceMatrix * swayLocal;
      #endif
      vec4 swayWorld = modelMatrix * swayLocal;
      float bend = pow(clamp(transformed.y / 4.2, 0.0, 1.0), 2.0);
      swayWorld.xz += windOffset(swayWorld.xz) * bend * 1.6;
      vec4 mvPosition = viewMatrix * swayWorld;
      gl_Position = projectionMatrix * mvPosition;`
    )
}

// Loads public/models/world.glb (built by scripts/build-models.mjs) and hands
// out copies by id. Copies share geometry and materials with the original.
export class Models {
  async load(url, onProgress) {
    const gltf = await new GLTFLoader().loadAsync(url, event => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    })
    this.root = gltf.scene
    stylizeObject(this.root)

    const swayMaterials = new Map()
    for (const id of swaying) {
      this.root.getObjectByName(id)?.traverse(child => {
        if (!child.isMesh) return
        const source = child.material
        if (!swayMaterials.has(source)) {
          swayMaterials.set(source, createStylizedMaterial({ color: source.color, map: source.map }, { waterLine: false, key: 'sway', extend: sway }))
        }
        child.material = swayMaterials.get(source)
      })
    }

    this.root.traverse(child => {
      if (!child.isMesh) return
      child.castShadow = true
      child.receiveShadow = true
    })
  }

  // Gives a model its own tinted copies of its materials (they are shared
  // with every other model from the same kit)
  tint(id, source) {
    if (!tints[id] || source.userData.tinted) return
    const tint = new THREE.Color(tints[id])
    const copies = new Map()
    source.traverse(child => {
      if (!child.isMesh) return
      if (!copies.has(child.material)) {
        // clone() drops the stylised shader hook, so it is stylised again
        const copy = stylize(child.material.clone())
        copy.color.multiply(tint)
        copies.set(child.material, copy)
      }
      child.material = copies.get(child.material)
    })
    source.userData.tinted = true
  }

  get(id) {
    const source = this.root.getObjectByName(id)
    if (!source) throw new Error(`Unknown model "${id}"`)
    this.tint(id, source)
    const copy = source.clone()
    copy.position.set(0, 0, 0)
    copy.rotation.set(0, 0, 0)
    copy.scale.setScalar(scales[id] ?? 1)
    return copy
  }
}
