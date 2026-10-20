import * as THREE from 'three'
import { waveHeight } from './waves.js'

const quaternion = new THREE.Quaternion()
const offset = new THREE.Vector3()

// Pushes a body up at each sample point that sits below the wave surface.
// Lift is tuned so the body rests with its points `restDepth` under water.
// Returns the submerged fraction (0..1), handy for "can I steer" checks.
export function applyBuoyancy(body, points, dt, time, { restDepth = 0.2, damping = 5, maxDepth = 1 } = {}) {
  const mass = body.mass()
  const share = (mass * 9.81) / points.length
  const translation = body.translation()
  const rotation = body.rotation()
  const linvel = body.linvel()
  const angvel = body.angvel()
  quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)

  let submerged = 0
  for (const point of points) {
    offset.copy(point).applyQuaternion(quaternion)
    const x = translation.x + offset.x
    const y = translation.y + offset.y
    const z = translation.z + offset.z
    const depth = waveHeight(x, z, time) - y
    if (depth <= 0) continue
    submerged++

    // Vertical velocity of this point: v + (ω × r).y
    const pointVelocity = linvel.y + (angvel.z * offset.x - angvel.x * offset.z)
    const lift = (share * Math.min(depth, maxDepth)) / restDepth
    const drag = (-pointVelocity * damping * mass) / points.length
    body.applyImpulseAtPoint({ x: 0, y: (lift + drag) * dt, z: 0 }, { x, y, z }, true)
  }

  return submerged / points.length
}
