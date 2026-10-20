// The archipelago, laid out by hand around the start point. The camera looks
// diagonally toward -x/-z, so "up the screen" is the -x/-z direction.
//
// Each island is built from blobs: [x, z, radius, height] relative to its
// centre. Overlapping blobs merge into one coastline, which gives bays,
// peninsulas and second peaks. `radius` bounds the whole island.
// `section` ids match src/content/portfolio.js.
export const islands = [
  {
    id: 'home',
    label: 'name',
    x: 0,
    z: 0,
    radius: 15,
    seed: 3,
    // The bay opens toward the right of the screen, so from the start the
    // whole island sits beside the boat (other islands face the start point)
    facing: [0.707, -0.707],
    // Two arms hold a small bay with the dock
    blobs: [
      [-2.8, 2.8, 8.5, 4.2],
      [-0.7, -7.8, 5, 2.4],
      [7.8, 0.7, 5, 2.4],
    ],
  },
  {
    id: 'about',
    section: 'about',
    color: '#ffb84a',
    x: -40,
    z: 14,
    radius: 16,
    seed: 11,
    blobs: [
      [0, 0, 11, 5],
      [-6, -6, 7, 7.5],
    ],
  },
  {
    id: 'projects',
    section: 'projects',
    color: '#ff6b4a',
    x: 4,
    z: -52,
    radius: 21,
    seed: 23,
    terraces: true,
    blobs: [
      [0, 0, 15, 5.5],
      [9, -7, 8, 3.5],
      [-9, -6, 7, 4],
    ],
  },
  {
    id: 'skills',
    section: 'skills',
    color: '#7d6bff',
    x: -14,
    z: 51,
    radius: 16,
    seed: 37,
    terraces: true,
    blobs: [
      [0, 0, 9, 4],
      [8, 4, 7, 3],
      [-7, -4, 6, 3.6],
    ],
  },
  {
    id: 'contact',
    section: 'contact',
    color: '#2ec4a6',
    x: 48,
    z: -14,
    radius: 13,
    seed: 41,
    blobs: [
      [0, 0, 9, 4.5],
      [-5, -6, 5, 6.5],
    ],
  },
  {
    // Landmark you see from the start: a smoking volcano, the "erupt" in Airupt
    id: 'volcano',
    label: 'Mount Airupt',
    volcano: true,
    x: -54,
    z: -47,
    radius: 25,
    seed: 97,
    blobs: [
      [0, 0, 19, 19],
      [10, 7, 8, 3],
    ],
  },
  { id: 'islet-1', x: 10, z: -24, radius: 5, seed: 53, blobs: [[0, 0, 4, 1.6]] },
  {
    id: 'islet-2',
    x: -45,
    z: -17,
    radius: 7,
    seed: 61,
    blobs: [
      [0, 0, 5, 2.2],
      [3, 2, 3, 1.2],
    ],
  },
  { id: 'islet-3', x: 47, z: -55, radius: 7, seed: 71, blobs: [[0, 0, 6, 2.5]] },
  { id: 'islet-4', x: -55, z: 50, radius: 6, seed: 83, blobs: [[0, 0, 5, 2]] },
  {
    id: 'islet-5',
    x: 47,
    z: 27,
    radius: 7,
    seed: 89,
    blobs: [
      [0, 0, 5, 2.2],
      [-3, 2, 3, 1.5],
    ],
  },
  { id: 'islet-6', x: 23, z: 57, radius: 5, seed: 101, blobs: [[0, 0, 4, 1.8]] },
]

// The boat starts beside the home island, bow pointing along a clear run to
// the Projects island so the first press of W goes somewhere
export const spawn = { x: 13.4, z: -9.2, yaw: 0.21 }

// Past this distance from the centre the sea pushes the boat back
export const worldRadius = 100
