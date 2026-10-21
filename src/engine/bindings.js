// Every action, and what it is called on a keyboard and on a gamepad: the
// legend, the tooltips, the prompts and the photo mode hints are written
// from here, so they always match the controls the visitor is holding.

// Buttons on a standard gamepad (the W3C "standard" mapping)
export const BUTTON = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  VIEW: 8,
  MENU: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
}

export const bindings = {
  sail: { keyboard: 'W A S D', gamepad: 'Left stick' },
  boost: { keyboard: 'Shift', gamepad: 'RT' },
  interact: { keyboard: 'E', gamepad: 'A' },
  map: { keyboard: 'M', gamepad: 'View' },
  log: { keyboard: 'L', gamepad: 'Menu' },
  photo: { keyboard: 'P', gamepad: 'X' },
  sound: { keyboard: 'N', gamepad: 'LB' },
  page: { keyboard: 'V', gamepad: 'R3' },
  reset: { keyboard: 'R', gamepad: 'Y' },
  back: { keyboard: 'Esc', gamepad: 'B' },
  lapShare: { keyboard: 'C', gamepad: 'D-pad ↑' },
  // Photo mode
  move: { keyboard: 'W A S D', gamepad: 'Left stick' },
  turn: { keyboard: 'Arrows', gamepad: 'Right stick' },
  zoom: { keyboard: '− =', gamepad: 'LT RT' },
  light: { keyboard: '[ ]', gamepad: 'D-pad ← →' },
  blur: { keyboard: 'Q E', gamepad: 'D-pad ↓ ↑' },
  boat: { keyboard: 'H', gamepad: 'X' },
  grid: { keyboard: 'G', gamepad: 'RB' },
  view: { keyboard: 'R', gamepad: 'Y' },
  shutter: { keyboard: 'Space', gamepad: 'A' },
  save: { keyboard: 'S', gamepad: 'A' },
  share: { keyboard: 'D', gamepad: 'X' },
}

// The name of an action's control on the given device (touch has none)
export function keyFor(action, device) {
  const binding = bindings[action]
  if (!binding || device === 'touch') return ''
  return device === 'gamepad' ? binding.gamepad : binding.keyboard
}
