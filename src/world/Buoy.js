import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { applyBuoyancy } from './buoyancy.js'
import { createStylizedMaterial } from './shading.js'

// Points spread wider than the buoy itself: lift pushing from close under the
// centre would tip a narrow buoy over like a pencil balanced on a fingertip
const FLOAT_POINTS = [0, 1, 2, 3].map(i => {
  const angle = (i / 4) * Math.PI * 2
  return new THREE.Vector3(Math.cos(angle) * 0.6, -0.2, Math.sin(angle) * 0.6)
})

const material = createStylizedMaterial({ vertexColors: true, flatShading: true }, { key: 'buoy' })

// Body, white band and cone merged into one mesh, coloured per vertex
function createModel(color) {
  const paint = (geometry, hex, y) => {
    geometry.translate(0, y, 0)
    const value = new THREE.Color(hex)
    const colors = new Float32Array(geometry.attributes.position.count * 3)
    for (let i = 0; i < colors.length; i += 3) value.toArray(colors, i)
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geometry.toNonIndexed()
  }

  const geometry = mergeGeometries([
    paint(new THREE.CylinderGeometry(0.42, 0.48, 0.9, 8), color, 0),
    paint(new THREE.CylinderGeometry(0.44, 0.46, 0.18, 8), '#ffffff', 0.12),
    paint(new THREE.ConeGeometry(0.22, 0.55, 6), color, 0.72),
  ])
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true

  const model = new THREE.Group()
  model.add(mesh)
  return model
}

// Floating marker that bobs on the waves, can be bumped around, and drifts
// back to its anchor on a soft tether.
export class Buoy {
  // `model` replaces the round section buoy (a channel mark, for one),
  // centred on the float body like the default model
  constructor(app, { x, z, color, model = null }) {
    this.anchor = { x, z }
    this.color = color

    const { world } = app.physics
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 0.2, z).setLinearDamping(0.4).setAngularDamping(1).setCanSleep(false)
    )
    world.createCollider(RAPIER.ColliderDesc.cylinder(0.45, 0.45).setDensity(40).setRestitution(0.4), this.body)

    this.object = model ?? createModel(color)
    app.scene.add(this.object)
    app.physics.sync(this.body, this.object)
    app.physics.beforeStep.push((dt, time) => this.step(dt, time))
  }

  step(dt, time) {
    applyBuoyancy(this.body, FLOAT_POINTS, dt, time, { restDepth: 0.25, damping: 4 })

    const mass = this.body.mass()
    const translation = this.body.translation()
    const pull = 2 * mass * dt
    this.body.applyImpulse(
      { x: (this.anchor.x - translation.x) * pull, y: 0, z: (this.anchor.z - translation.z) * pull },
      true
    )
  }
}
