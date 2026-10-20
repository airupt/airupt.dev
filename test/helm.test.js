import { test } from 'node:test'
import assert from 'node:assert/strict'
import { helmToward } from '../src/engine/helm.js'

// A camera looking toward -z: up the screen is -z, right is +x
const screen = { up: { x: 0, z: -1 }, right: { x: 1, z: 0 } }
const bowUpScreen = { x: 0, z: -1 }
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} is not ${expected}`)

test('pushing the way the bow already points sails straight on at full throttle', () => {
  const { throttle, steer } = helmToward({ x: 0, y: -1 }, bowUpScreen, screen, 5)
  close(throttle, 1, 'throttle')
  close(steer, 0, 'steer')
})

test('pushing right or left of the bow turns that way', () => {
  assert.equal(helmToward({ x: 1, y: 0 }, bowUpScreen, screen, 5).steer, 1)
  assert.equal(helmToward({ x: -1, y: 0 }, bowUpScreen, screen, 5).steer, -1)
  // A small angle gives a small turn
  const slight = helmToward({ x: 0.1, y: -1 }, bowUpScreen, screen, 5).steer
  assert.ok(slight > 0 && slight < 0.3, `slight turn was ${slight}`)
})

test('a half push sails at half speed', () => {
  close(helmToward({ x: 0, y: -0.5 }, bowUpScreen, screen, 5).throttle, 0.5, 'throttle')
})

test('turning far round eases off the throttle', () => {
  const { throttle } = helmToward({ x: 1, y: 0 }, bowUpScreen, screen, 5)
  close(throttle, 0.45, 'throttle')
})

test('pointing behind a slow boat backs it away', () => {
  assert.ok(helmToward({ x: 0.2, y: 1 }, bowUpScreen, screen, 0).throttle < 0)
  // Moving fast it turns round instead
  assert.ok(helmToward({ x: 0.2, y: 1 }, bowUpScreen, screen, 8).throttle > 0)
})

test('the rudder flips while going backwards so the bow still swings toward the stick', () => {
  const forward = helmToward({ x: 1, y: 0.2 }, bowUpScreen, screen, 0.5).steer
  const backward = helmToward({ x: 1, y: 0.2 }, bowUpScreen, screen, -2).steer
  assert.equal(Math.sign(forward), -Math.sign(backward))
})

test('it follows the screen, whichever way the camera looks', () => {
  // Camera looking diagonally toward -x/-z, as in the game
  const s = Math.SQRT1_2
  const diagonal = { up: { x: -s, z: -s }, right: { x: s, z: -s } }
  // Bow pointing up the screen; stick up the screen: straight on
  close(helmToward({ x: 0, y: -1 }, { x: -s, z: -s }, diagonal, 5).steer, 0, 'steer')
  // Stick to the right of the screen: turn to starboard
  assert.equal(helmToward({ x: 1, y: 0 }, { x: -s, z: -s }, diagonal, 5).steer, 1)
})
