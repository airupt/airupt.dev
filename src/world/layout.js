// Where everything sits in the world. `section` ids match src/content/portfolio.js
export const islands = [
  { id: 'home', label: 'name', x: 0, z: -26, radius: 9, height: 4, seed: 3 },
  { id: 'about', section: 'about', color: '#ffb84a', x: -36, z: -44, radius: 12, height: 5, seed: 11 },
  { id: 'projects', section: 'projects', color: '#ff6b4a', x: 40, z: -56, radius: 17, height: 7, seed: 23 },
  { id: 'skills', section: 'skills', color: '#7d6bff', x: -54, z: 16, radius: 12, height: 4.5, seed: 37 },
  { id: 'contact', section: 'contact', color: '#2ec4a6', x: 48, z: 18, radius: 10, height: 5.5, seed: 41 },
  { id: 'islet-1', x: 14, z: 42, radius: 5, height: 2, seed: 53 },
  { id: 'islet-2', x: -20, z: 54, radius: 4, height: 1.6, seed: 61 },
  { id: 'islet-3', x: 78, z: -14, radius: 6, height: 2.5, seed: 71 },
  { id: 'islet-4', x: -78, z: -24, radius: 5, height: 2.2, seed: 83 },
]

export const spawn = { x: 0, z: 0 }

// Past this distance from the centre the sea pushes the boat back
export const worldRadius = 105
