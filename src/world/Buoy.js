import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { applyBuoyancy } from './buoyancy.js'
import { createStylizedMaterial } from './shading.js'

// Points spread wider than the buoy itself: lift pushing from close under the
// centre would tip a narrow buoy over like a pencil balanced on a fingertip
const FLOAT_POINTS = [0, 1, 2, 3].map(i => {
  const angle = (i / 4) * Math.PI * 2
  return new THREE.Vector3(Math.cos(angle) * 0.6, -0.2, Math.sin(angle) * 0.6)
})

function createModel(color) {
  const material = createStylizedMaterial({ color, flatShading: true })
  const white = createStylizedMaterial({ color: '#ffffff', flatShading: true })

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.9, 8), material)
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.46, 0.18, 8), white)
  band.position.y = 0.12
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 6), material)
  top.position.y = 0.72

  const model = new THREE.Group()
  model.add(body, band, top)
  model.traverse(child => (child.castShadow = true))
  return model
}

// Floating marker that bobs on the waves, can be bumped around, and drifts
// back to its anchor on a soft tether.
export class Buoy {
  constructor(app, { x, z, color }) {
    this.anchor = { x, z }

    const { world } = app.physics
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 0.2, z).setLinearDamping(0.4).setAngularDamping(1).setCanSleep(false)
    )
    world.createCollider(RAPIER.ColliderDesc.cylinder(0.45, 0.45).setDensity(40).setRestitution(0.4), this.body)

    this.object = createModel(color)
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
