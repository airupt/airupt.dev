import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bindings, keyFor, BUTTON } from '../src/engine/bindings.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('every action names a key and a gamepad control', () => {
  for (const [action, { keyboard, gamepad }] of Object.entries(bindings)) {
    assert.ok(keyboard, `${action} has no key`)
    assert.ok(gamepad, `${action} has no gamepad control`)
  }
})

test('gamepad names are buttons on a standard pad, or its sticks and D-pad', () => {
  const names = new Set(Object.keys(BUTTON).map(name => name.toLowerCase()))
  for (const [action, { gamepad }] of Object.entries(bindings)) {
    const ok = gamepad.split(' ').every(word => names.has(word.toLowerCase())) || /stick|D-pad/.test(gamepad)
    assert.ok(ok, `${action}: "${gamepad}" is not a gamepad control`)
  }
})

test('touch has no keys to name', () => {
  assert.equal(keyFor('map', 'touch'), '')
  assert.equal(keyFor('map', 'gamepad'), 'View')
  assert.equal(keyFor('map', 'keyboard'), 'M')
  assert.equal(keyFor('nothing', 'keyboard'), '')
})

test('every control that shows a key in its tooltip refers to a known action', () => {
  const sources = [read('index.html'), read('src/ui/render.js')].join('\n')
  const actions = [...sources.matchAll(/data-action["']?\s*[:=]\s*["']([\w-]+)["']/g)].map(match => match[1])
  assert.ok(actions.length > 15, `only found ${actions.length} labelled controls`)
  for (const action of actions) assert.ok(bindings[action], `data-action="${action}" is not in bindings.js`)
})
