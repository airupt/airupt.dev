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
    radius: 17,
    seed: 11,
    // A crescent: two low arms hold a sheltered bay with the dock in it
    blobs: [
      [0, 0, 9.5, 5],
      [-6, -6, 7, 7.5],
      [11.6, 4.2, 4.5, 2.4],
      [4.9, -11.4, 4.5, 2],
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
    radius: 17,
    seed: 37,
    terraces: true,
    // A long terraced ridge running across the view
    blobs: [
      [0, 0, 8, 4],
      [6.4, 2.9, 6, 3.2],
      [11.4, 5.2, 4.2, 2.2],
      [-6.4, -2.9, 6.5, 4.6],
      [-10.9, -5, 4, 2.6],
    ],
  },
  {
    id: 'contact',
    section: 'contact',
    color: '#2ec4a6',
    x: 48,
    z: -14,
    radius: 14,
    seed: 41,
    // Twin hills and a sandy spit
    blobs: [
      [0, 0, 9, 4.5],
      [-5, -6, 5, 6.5],
      [6, 5, 5, 5.5],
      [2, -10, 3, 1.6],
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
  // Beside the run from the start to Projects, not on it
  { id: 'islet-1', x: 19, z: -26, radius: 5, seed: 53, blobs: [[0, 0, 4, 1.6]] },
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
  {
    // A long, low sandbar with a lone palm
    id: 'sandbar',
    x: 33,
    z: 12,
    radius: 11,
    seed: 113,
    sparse: true,
    blobs: [
      [-7, 4.4, 2.6, 0.95],
      [-3.5, 2.2, 3, 1],
      [0, 0, 3.4, 1.1],
      [3.5, -2.2, 2.8, 1],
      [6.8, -4.2, 2.2, 0.85],
    ],
  },
  {
    // A ring of reef just under the surface around a deep lagoon: you see it
    // as turquoise water, with a few rocks breaking through
    id: 'reef',
    x: 60,
    z: -38,
    radius: 9,
    seed: 127,
    reef: true,
    sparse: true,
    blobs: Array.from({ length: 11 }, (_, i) => {
      const angle = (i / 11) * Math.PI * 2
      const ring = 5.5 + Math.sin(i * 2.7) * 0.8
      return [Math.cos(angle) * ring, Math.sin(angle) * ring, 2.4 + Math.cos(i * 1.9) * 0.6, 0.25]
    }),
  },
]

// Footpaths worn into each island, from the end of its dock inland, in
// metres [inland, sideways] from where the dock meets the beach (the same
// frame as the set pieces in Decor.js). `line` is a trail, `clearing` a round
// patch of bare earth (a little plaza the props stand on): [inland, sideways, radius].
export const paths = {
  home: { lines: [[[0, 0], [1.5, -0.7], [3, -1.6], [4.8, -1.4], [6.2, -0.4]]] },
  about: {
    lines: [[[0, 0], [1.6, 0.3], [2.8, 0.4]], [[4.4, 0], [5.6, -0.9], [6.4, -1.4]]],
    clearings: [[3.6, 0.5, 1.7]],
  },
  projects: {
    lines: [[[0, 0], [1.4, 0.1]], [[4.4, -0.4], [5.8, -1.3], [6.8, -1.5]], [[6.9, -5.9], [6.9, 2.9]]],
    clearings: [[3, 0.2, 2.3]],
  },
  skills: {
    lines: [[[0, 0], [1.6, -0.3], [2.8, -0.5]], [[4.6, -0.3], [5.8, 0]]],
    clearings: [[3.6, -0.6, 1.5]],
  },
  contact: { lines: [[[0, 0], [1.8, 0.4], [3.6, 0.3], [5.4, 0]]] },
}

// Sea stacks between the islands so open water always has something in it
export const rockClusters = [
  [21, 31],
  [37, -2],
  [-14, -22],
  [-30, -30],
  [34, -26],
  [-62, -5],
  [-32, 62],
  [8, 70],
  [62, 12],
  [-70, 35],
]

// A natural arch out west, wide enough to sail through
export const arch = { x: -64, z: 22, yaw: 0.5, span: 10 }

// The boat starts beside the home island, bow pointing along a clear run to
// the Projects island so the first press of W goes somewhere
export const spawn = { x: 13.4, z: -9.2, yaw: 0.21 }

// Past this distance from the centre the sea pushes the boat back
export const worldRadius = 100

// Metres from the centre to each edge of the textures baked over the whole
// archipelago (sea map, path map)
export const MAP_EXTENT = 128
