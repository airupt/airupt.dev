import * as THREE from 'three'

const bow = new THREE.Vector3()
const side = new THREE.Vector3()
const forward = new THREE.Vector3()

// Spray from the bow at speed, a burst when landing after a jump, and one
// when the boat slams into something
export class BoatEffects {
  constructor(boat, splashes) {
    this.boat = boat
    this.splashes = splashes
    this.sprayBudget = 0
    this.lastInWater = 1
    this.lastVelocity = new THREE.Vector3()
    this.lastPosition = new THREE.Vector3()
    // Called with a 0..1 strength when the boat slams into something or lands hard
    this.onImpact = null
  }

  update(delta) {
    const { boat, splashes } = this
    const speed = Math.abs(boat.speed)
    forward.set(0, 0, -1).applyQuaternion(boat.object.quaternion).setY(0).normalize()

    // Spray thrown off both sides of the bow, more and bigger with speed
    if (boat.inWater > 0 && speed > 3.5) {
      this.sprayBudget += (speed - 3.5) * 9 * delta
      while (this.sprayBudget >= 1) {
        this.sprayBudget -= 1
        const direction = Math.random() < 0.5 ? -1 : 1
        side.set(-forward.z, 0, forward.x).multiplyScalar(direction)
        bow.set(direction * 0.66, -0.15, -1.05).applyQuaternion(boat.object.quaternion).add(boat.object.position)
        splashes.emit(bow, side.clone().multiplyScalar(1.6 + speed * 0.14).addScaledVector(forward, speed * 0.2), {
          count: 1,
          spread: 0.45,
          up: 1.7 + speed * 0.1,
          size: 0.08 + Math.min(speed / 16, 1) * 0.05,
          life: 0.75,
        })
      }
    }

    // Boost kicks up a rooster tail behind the motor, and keeps it going
    const boosting = boat.app.inputs.state.boost && boat.app.inputs.state.throttle > 0
    if (boosting && boat.inWater > 0) {
      bow.set(0, 0, 1.9).applyQuaternion(boat.object.quaternion).add(boat.object.position)
      if (!this.wasBoosting) {
        splashes.emit(bow, forward.clone().multiplyScalar(-2.5), { count: 22, spread: 1.1, up: 3.2, size: 0.09, life: 0.9 })
      } else if (speed > 6) {
        this.tailBudget = (this.tailBudget ?? 0) + speed * 2.2 * delta
        while (this.tailBudget >= 1) {
          this.tailBudget -= 1
          splashes.emit(bow, forward.clone().multiplyScalar(-1.5 - Math.random()), { count: 1, spread: 0.5, up: 2.6 + Math.random(), size: 0.09, life: 0.7 })
        }
      }
    }
    this.wasBoosting = boosting

    if (boat.inWater > 0 && this.lastInWater === 0 && boat.velocity.y < -2) {
      splashes.emit(boat.object.position, new THREE.Vector3(), { count: 26, spread: 2.2, up: 2.4, size: 0.1, life: 1 })
      this.onImpact?.(Math.min(-boat.velocity.y / 10, 1) * 0.6)
    }
    this.lastInWater = boat.inWater

    // A jump in position is a respawn, not a collision
    const teleported = this.lastPosition.distanceTo(boat.object.position) > 5
    this.lastPosition.copy(boat.object.position)
    const change = this.lastVelocity.distanceTo(boat.velocity)
    if (change > 2.5 && change < 20 && !teleported) {
      bow.set(0, 0, -1.8).applyQuaternion(boat.object.quaternion).add(boat.object.position)
      splashes.emit(bow, new THREE.Vector3(), { count: Math.round(change * 4.5), spread: 2.2, up: 2.8, size: 0.11, life: 0.9 })
      this.onImpact?.(Math.min(change / 12, 1))
    }
    this.lastVelocity.copy(boat.velocity)
  }
}
