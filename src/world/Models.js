import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createStylizedMaterial, stylizeObject, windGLSL } from './shading.js'

// The Kenney kits use different unit sizes; these bring every model to metres
const scales = {
  boat: 0.8,
  tent: 5,
  campfire: 5,
  signpost: 4,
  'signpost-single': 4,
  lantern: 1.3,
  stall: 2.4,
  cart: 2,
  banner: 2.4,
}

// Models whose tops bend in the wind
const swaying = ['palm-straight', 'palm-bend', 'palm-detailed-straight', 'palm-detailed-bend', 'grass-plant', 'grass-patch']

// Bends vertices by the wind, more the higher they sit in the model
function sway(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nuniform sampler2D uNoise;\n${windGLSL}`)
    .replace(
      '#include <project_vertex>',
      `vec4 swayWorld = modelMatrix * vec4(transformed, 1.0);
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

  get(id) {
    const source = this.root.getObjectByName(id)
    if (!source) throw new Error(`Unknown model "${id}"`)
    const copy = source.clone()
    copy.position.set(0, 0, 0)
    copy.rotation.set(0, 0, 0)
    copy.scale.setScalar(scales[id] ?? 1)
    return copy
  }
}
