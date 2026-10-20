// Bundles the hand-picked Kenney models in assets/kenney into public/models/world.glb.
// Every model becomes one root node named by its id, so the app looks models up by name.
// Run with: npm run models
import { Document, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, getBounds, mergeDocuments, prune, quantize, unpartition } from '@gltf-transform/functions'

// id → [kit folder, file name]
const models = {
  boat: ['watercraft-kit', 'boat-speed-i'],
  buoy: ['watercraft-kit', 'buoy'],
  'buoy-flag': ['watercraft-kit', 'buoy-flag'],
  sailboat: ['watercraft-kit', 'boat-sail-a'],
  'fishing-boat': ['watercraft-kit', 'boat-fishing-small'],
  houseboat: ['watercraft-kit', 'boat-house-a'],

  'palm-straight': ['pirate-kit', 'palm-straight'],
  'palm-bend': ['pirate-kit', 'palm-bend'],
  'palm-detailed-straight': ['pirate-kit', 'palm-detailed-straight'],
  'palm-detailed-bend': ['pirate-kit', 'palm-detailed-bend'],
  barrel: ['pirate-kit', 'barrel'],
  crate: ['pirate-kit', 'crate'],
  'crate-bottles': ['pirate-kit', 'crate-bottles'],
  bottle: ['pirate-kit', 'bottle'],
  flag: ['pirate-kit', 'flag-high'],
  'flag-pennant': ['pirate-kit', 'flag-high-pennant'],
  tower: ['pirate-kit', 'tower-complete-small'],
  wreck: ['pirate-kit', 'ship-wreck'],
  'hut-roof': ['pirate-kit', 'structure-roof'],
  lookout: ['pirate-kit', 'tower-watch'],

  signpost: ['survival-kit', 'signpost'],
  'signpost-single': ['survival-kit', 'signpost-single'],
  tent: ['survival-kit', 'tent'],
  campfire: ['survival-kit', 'campfire-pit'],
  anvil: ['survival-kit', 'workbench-anvil'],
  fish: ['survival-kit', 'fish'],
  'fish-large': ['survival-kit', 'fish-large'],

  stall: ['fantasy-town-kit', 'stall-red'],
  cart: ['fantasy-town-kit', 'cart'],
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const target = new Document()
target.createBuffer()
const scene = target.createScene('world')
target.getRoot().setDefaultScene(scene)

const format = value => value.toFixed(2).padStart(6)

for (const [id, [kit, file]] of Object.entries(models)) {
  const source = await io.read(`assets/kenney/${kit}/${file}.glb`)
  const sourceScene = source.getRoot().getDefaultScene() ?? source.getRoot().listScenes()[0]
  const merged = mergeDocuments(target, source).get(sourceScene)

  const root = target.createNode(id)
  for (const child of merged.listChildren()) {
    merged.removeChild(child)
    root.addChild(child)
  }
  merged.dispose()
  scene.addChild(root)

  const { min, max } = getBounds(root)
  console.log(`${id.padEnd(24)} size ${format(max[0] - min[0])} ${format(max[1] - min[1])} ${format(max[2] - min[2])}   min y ${format(min[1])}`)
}

// No normal maps are used, so tangents are dead weight
const stripTangents = document => {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) primitive.setAttribute('TANGENT', null)
  }
}

await target.transform(stripTangents, unpartition(), dedup(), prune(), quantize())
await io.write('public/models/world.glb', target)
console.log(`\nWrote public/models/world.glb with ${Object.keys(models).length} models`)
