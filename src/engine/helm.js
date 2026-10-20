// How far off the stick's heading (radians) the rudder is hard over
const FULL_RUDDER = 0.5

const clamp = value => Math.min(Math.max(value, -1), 1)

// The camera never turns, so a stick points where to go on screen: the boat
// swings round to that heading and pushing further means faster.
//   stick: x right, y down, up to 1 long
//   heading: the bow's direction on the water, { x, z }
//   screen: the ground directions that point up and right on screen
//   speed: forward speed, negative going backwards
export function helmToward(stick, heading, screen, speed) {
  const amount = Math.min(Math.hypot(stick.x, stick.y), 1)
  const targetX = screen.right.x * stick.x - screen.up.x * stick.y
  const targetZ = screen.right.z * stick.x - screen.up.z * stick.y
  // Positive when the target lies to starboard
  const error = Math.atan2(heading.x * targetZ - heading.z * targetX, heading.x * targetX + heading.z * targetZ)

  // The rudder works the other way while the boat moves backwards
  const steer = clamp(error / FULL_RUDDER) * (speed < -0.5 ? -1 : 1)
  // Slow with the stick pointing behind: back away (off a rock, say) while
  // the bow swings round to it
  if (Math.abs(error) > 2 && speed < 1) return { throttle: -0.6 * amount, steer }
  // Ease off while turning far round so the boat pivots instead of looping wide
  return { throttle: amount * (0.45 + 0.55 * Math.max(Math.cos(error), 0)), steer }
}
