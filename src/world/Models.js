import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { stylizeObject } from './shading.js'

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

// Loads public/models/world.glb (built by scripts/build-models.mjs) and hands
// out copies by id. Copies share geometry and materials with the original.
export class Models {
  async load(url, onProgress) {
    const gltf = await new GLTFLoader().loadAsync(url, event => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    })
    this.root = gltf.scene
    stylizeObject(this.root)
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
