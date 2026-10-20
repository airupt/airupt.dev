import * as THREE from 'three'
import { waveHeight } from './waves.js'
import { bottles as messages } from '../content/portfolio.js'

const STORAGE_KEY = 'airupt-bottles'
const PICKUP_DISTANCE = 2.2

// Hidden around the archipelago, some behind islands so finding them all
// means exploring the whole map
const spots = [
  [22, 22],
  [-20, -30],
  [-64, 22], // under the rock arch
  [28, -72],
  [72, 2],
  [-32, 74],
  [-84, -18],
  [40, 46],
]

function readCollected() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

function saveCollected(collected) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collected]))
  } catch {
    // Private mode: progress just isn't remembered between visits
  }
}

// Messages in bottles: bob on the waves with a soft glow; sailing through
// one collects it and shows its message. Progress is kept in this browser.
export class Bottles {
  constructor(app, models, splashes) {
    this.app = app
    this.splashes = splashes
    this.collected = readCollected()
    this.time = 0

    this.items = spots.slice(0, messages.length).map(([x, z], index) => {
      const object = new THREE.Group()
      const model = models.get('bottle')
      model.scale.multiplyScalar(1.6)
      model.rotation.z = Math.PI * 0.42 // lying on the water, neck up a little
      model.position.y = -0.1
      object.add(model)

      const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.1, 1.2) }))
      glow.position.y = 0.25
      object.add(glow)

      object.position.set(x, 0, z)
      object.visible = !this.collected.has(index)
      app.scene.add(object)
      return { index, object, x, z, pickup: 0 }
    })

    app.overlay.setBottleCount(this.collected.size, this.items.length)
  }

  update(delta) {
    this.time += delta
    const time = this.app.physics.renderTime
    const boat = this.app.world.boat.object.position

    for (const item of this.items) {
      if (!item.object.visible) continue

      if (item.pickup > 0) {
        // Collected: spin up out of the water and shrink away
        item.pickup += delta
        item.object.position.y += delta * 3
        item.object.rotation.y += delta * 10
        item.object.scale.setScalar(Math.max(0, 1 - item.pickup * 1.4))
        if (item.pickup > 0.75) item.object.visible = false
        continue
      }

      item.object.position.y = waveHeight(item.x, item.z, time)
      item.object.rotation.y = this.time * 0.6 + item.index

      if (Math.hypot(boat.x - item.x, boat.z - item.z) < PICKUP_DISTANCE) this.collect(item)
    }
  }

  collect(item) {
    item.pickup = 0.001
    this.collected.add(item.index)
    saveCollected(this.collected)
    this.splashes.emit(item.object.position.clone(), new THREE.Vector3(), { count: 18, spread: 1.4, up: 2.6, size: 0.08, life: 0.9 })
    this.app.sounds.play('glass', 0.8)
    this.app.sounds.play('chime', 0.4, 1.25)
    this.app.overlay.setBottleCount(this.collected.size, this.items.length)
    this.app.overlay.toast(messages[item.index], `Bottle ${this.collected.size} of ${this.items.length}`)
  }
}
