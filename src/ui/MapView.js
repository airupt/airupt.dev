import * as THREE from 'three'
import { arch, islands, ringCourse, worldRadius, wreck } from '../world/layout.js'
import { courseGates } from '../world/gates.js'
import { profile, sections } from '../content/portfolio.js'
import { shared } from '../world/shading.js'
import { islandHeight } from '../world/terrain.js'
import { smoothstep } from '../utils/noise.js'

const SVG = 'http://www.w3.org/2000/svg'
const EXTENT = 96 // metres from the centre to each edge of the chart
// Labels stay inside the round chart, this far from its middle at most
const ROUND = EXTENT * 0.93
const PIN = 3.6
const BADGE = 4.8
// The course's route reacts to a pointer this many units either side of it
const COURSE_REACH = 9

// Icons for the landmark badges, drawn on a 24 unit grid: [strokes, fills]
const ICONS = {
  flag: ['M6 21V3.5M6 4h13v9H6', 'M6 4h4.33v4.5H6ZM14.67 4H19v4.5h-4.33ZM10.33 8.5h4.34V13h-4.34Z'],
  arch: ['', 'M3 20v-8.5a9 9 0 0 1 18 0V20h-5.5v-8.5a3.5 3.5 0 0 0-7 0V20Z'],
  waves: ['M3 9.5c2.25 0 2.25-2 4.5-2s2.25 2 4.5 2 2.25-2 4.5-2 2.25 2 4.5 2M3 15.5c2.25 0 2.25-2 4.5-2s2.25 2 4.5 2 2.25-2 4.5-2 2.25 2 4.5 2', ''],
  anchor: ['M12 7.5V21M8 11h8M4.5 13.5a7.5 7.5 0 0 0 15 0M12 7.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', ''],
}

function svg(tag, attributes = {}) {
  const node = document.createElementNS(SVG, tag)
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value)
  return node
}

// From the world's ground plane to the chart, which is turned 45°
const toChart = (x, z) => ({ x: (x - z) * Math.SQRT1_2, y: (x + z) * Math.SQRT1_2 })

// The closed curve through every point: Catmull-Rom, as cubic Béziers for
// the drawing and as a point at `t` along segment `i` for everything else
function catmull(points, i, t) {
  const at = index => points[(index + points.length) % points.length]
  const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
  const blend = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t)
  return { x: blend(p0.x, p1.x, p2.x, p3.x), z: blend(p0.z, p1.z, p2.z, p3.z) }
}

function loopThrough(points) {
  const at = index => points[(index + points.length) % points.length]
  const round = value => value.toFixed(2)
  let d = `M ${round(points[0].x)} ${round(points[0].z)}`
  for (let i = 0; i < points.length; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    const c1 = [p1.x + (p2.x - p0.x) / 6, p1.z + (p2.z - p0.z) / 6]
    const c2 = [p2.x - (p3.x - p1.x) / 6, p2.z - (p3.z - p1.z) / 6]
    d += ` C ${c1.map(round).join(' ')} ${c2.map(round).join(' ')} ${round(p2.x)} ${round(p2.z)}`
  }
  return `${d} Z`
}

// A round badge with an icon, centred on 0 0
function badge(icon, className) {
  const group = svg('g', { class: `map-badge ${className}` })
  group.append(svg('circle', { r: BADGE, class: 'map-badge-disc' }))
  const [strokes, fills] = ICONS[icon]
  const drawing = svg('g', { transform: `scale(${(BADGE * 1.45) / 24}) translate(-12 -12)` })
  if (strokes) drawing.append(svg('path', { d: strokes, class: 'map-icon-stroke' }))
  if (fills) drawing.append(svg('path', { d: fills, class: 'map-icon-fill' }))
  group.append(drawing)
  return group
}

// The gold tick on whatever the visitor has done, at the top right of a pin or badge
function tick(radius) {
  const offset = radius * 0.9
  const group = svg('g', { class: 'map-tick', transform: `translate(${offset} ${-offset})` })
  group.append(svg('circle', { r: 2.3 }), svg('path', { d: 'M -1.15 0.05 L -0.3 0.9 L 1.2 -0.75' }))
  group.style.display = 'none'
  return group
}

function titleOf(island) {
  if (island.label === 'name') return profile.name
  return sections.find(section => section.id === island.section)?.title ?? island.label
}

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

// Chart of the archipelago: a picture of the real world taken from straight
// above at boot, turned 45° so "up" on the chart is "up" on screen. Over it:
// the ring course, pins for the places you can sail to and badges for the
// landmarks, each ticked once done, and names placed where they overlap
// nothing. Choosing a place sails you there; the list beside the chart says
// how far you've got with each.
export class MapView {
  constructor(app) {
    this.app = app
    this.dialog = document.querySelector('#map')
    this.chart = this.dialog.querySelector('.map-chart')
    this.list = this.dialog.querySelector('.map-list')

    this.highlights = []
    this.destinations = []
    this.rows = []
    // Pins and badges ({ x, y, radius } on the chart, `shown`) and names to place
    this.marks = []
    this.labels = []

    this.root = svg('svg', { viewBox: `${-EXTENT} ${-EXTENT} ${EXTENT * 2} ${EXTENT * 2}`, role: 'img', 'aria-label': 'Map of the islands and the ring course' })
    const blur = svg('filter', { id: 'map-glow-blur', x: '-30%', y: '-30%', width: '160%', height: '160%' })
    // Blurred, then its alpha boosted so the rim reads as a glow
    const transfer = svg('feComponentTransfer')
    transfer.append(svg('feFuncA', { type: 'linear', slope: '2.4' }))
    blur.append(svg('feGaussianBlur', { stdDeviation: '2' }), transfer)
    this.defs = svg('defs')
    this.defs.append(blur)
    // The world, turned; then pins, badges and names, upright; the boat on top
    this.ground = svg('g', { transform: 'rotate(45)' })
    this.overlay = svg('g')
    this.top = svg('g', { transform: 'rotate(45)' })
    this.root.append(this.defs, this.ground, this.overlay, this.top)
    this.picture = svg('image', { x: -EXTENT, y: -EXTENT, width: EXTENT * 2, height: EXTENT * 2 })
    this.ground.append(this.picture, svg('circle', { r: worldRadius, class: 'map-edge' }))

    this.addCourse()
    for (const island of islands) if (titleOf(island)) this.addIsland(island)
    this.addLandmarks()

    // The course's start is a destination too, after the islands
    this.courseRow = this.addRow('Ring course', 'repeating-conic-gradient(#1c1c1c 0 25%, #fff 0 50%) 50% / 6px 6px', () => this.sailToCourse(), this.courseSpots)

    this.boat = svg('path', { d: 'M 0 -5 L 3.6 4 L -3.6 4 Z', class: 'map-boat' })
    this.top.append(this.boat)
    this.chart.append(this.root)

    this.dialog.addEventListener('close', () => app.overlay.setSailing(true))
    this.dialog.addEventListener('click', event => {
      if (event.target === this.dialog) this.dialog.close()
    })
    this.dialog.addEventListener('keydown', event => {
      // Holding M would otherwise close it again straight away
      if (event.repeat) return
      if (event.code === 'KeyM') this.dialog.close()
      this.destinations[Number(event.key) - 1]?.()
    })
    document.querySelector('#open-map').addEventListener('click', () => this.open())
    app.inputs.on('map', () => this.open())
  }

  // The ring course, drawn rather than photographed (its rings only rise
  // once the visitor sets sail, after the picture was taken): a dashed gold
  // route with arrows the way the lap goes, and the chequered start. A wide
  // band along the route and round the start picks it, so a rough click or
  // tap anywhere near it is enough.
  addCourse() {
    this.course = courseGates(ringCourse, arch, 1)
    const route = loopThrough(this.course)
    const group = svg('g', { class: 'map-course' })
    group.append(svg('path', { d: route, class: 'map-route' }))
    for (const index of [3, 8, 13, 18]) {
      const gate = this.course[index]
      const angle = (Math.atan2(-gate.normal.x, gate.normal.z) * 180) / Math.PI
      group.append(svg('path', { d: 'M -1.7 -0.9 L 0 0.9 L 1.7 -0.9', class: 'map-arrow', transform: `translate(${gate.x} ${gate.z}) rotate(${angle.toFixed(1)})` }))
    }
    const band = svg('path', { d: route, class: 'map-course-hit', 'stroke-width': COURSE_REACH * 2 })
    group.append(band)
    this.ground.append(group)

    // Where the route runs, as points on the chart, so names keep off it
    this.routePoints = []
    for (let i = 0; i < this.course.length; i++) {
      for (let t = 0; t < 1; t += 0.125) {
        const point = catmull(this.course, i, t)
        this.routePoints.push(toChart(point.x, point.z))
      }
    }

    const start = toChart(this.course[0].x, this.course[0].z)
    const flag = badge('flag', 'map-start map-grow')
    const done = tick(BADGE)
    flag.append(done)
    const place = svg('g', { transform: `translate(${start.x.toFixed(2)} ${start.y.toFixed(2)})`, class: 'map-pick' })
    place.append(svg('circle', { r: COURSE_REACH + 2, class: 'map-hit' }), flag)
    this.overlay.append(place)
    const mark = { ...start, radius: BADGE, shown: true }
    this.marks.push(mark)
    this.courseTick = done
    this.addLabel('Ring course', mark, 'landmark')
    this.courseSpots = [group, place]
    for (const target of [band, place]) target.addEventListener('click', () => this.sailToCourse())
  }

  // A named island: its whole shape on the chart is a target, lit up in its
  // own outline when pointed at, with a pin and its name
  addIsland(island) {
    const title = titleOf(island)
    // The list stays the keyboard route, so the chart's copy is hidden from screen readers
    const spot = svg('g', { transform: `translate(${island.x} ${island.z})`, class: 'map-spot', 'aria-hidden': 'true' })
    const reach = island.radius * 1.3
    const shape = { x: -reach, y: -reach, width: reach * 2, height: reach * 2 }
    // The glow only shows outside the coast: masked by the island itself
    const mask = svg('mask', { id: `map-mask-${island.id}`, maskUnits: 'userSpaceOnUse', ...shape })
    const cutout = svg('image', shape)
    mask.append(svg('rect', { ...shape, fill: '#fff' }), cutout)
    this.defs.append(mask)
    const glow = svg('image', { ...shape, class: 'map-glow', mask: `url(#${mask.id})` })
    const fill = svg('image', { ...shape, class: 'map-fill' })
    this.highlights.push({ island, images: [glow, fill], cutout })
    spot.append(svg('circle', { r: island.radius * 0.85, class: 'map-hit' }), glow, fill)
    this.ground.append(spot)

    const color = island.color ?? (island.volcano ? '#a8a29c' : '#fffaf0')
    const at = toChart(island.x, island.z)
    const pin = svg('g', { transform: `translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})`, class: 'map-pin', 'aria-hidden': 'true' })
    // Pin and tick in one body, so pointing at it grows both together
    const body = svg('g', { class: 'map-grow' })
    const done = tick(PIN)
    body.append(svg('circle', { r: PIN, fill: color, class: 'map-pin-dot' }), done)
    pin.append(body)
    this.overlay.append(pin)
    const mark = { ...at, radius: PIN, shown: true, island }
    this.marks.push(mark)
    const label = this.addLabel(title, mark, 'island')

    const go = () => this.sailTo(island)
    spot.addEventListener('click', go)
    const row = this.addRow(title, color, go, [spot, pin, label])
    row.island = island
    row.tick = done
  }

  // Landmarks out at sea, each with its badge; the wreck stays off the
  // chart until it has been found
  addLandmarks() {
    const reef = islands.find(island => island.reef)
    this.landmarks = [
      { title: 'Rock arch', at: arch, icon: 'arch', log: 'arch', hint: 'Sail through it' },
      { title: 'Lagoon', at: reef, icon: 'waves', log: 'reef', hint: 'Slip in through a gap in the reef' },
      { title: 'Wreck', at: wreck, icon: 'anchor', log: 'wreck', secret: true },
    ].map(landmark => {
      const at = toChart(landmark.at.x, landmark.at.z)
      const place = svg('g', { transform: `translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})`, class: 'map-landmark' })
      const title = svg('title')
      const done = tick(BADGE)
      place.append(title, badge(landmark.icon, ''), done)
      this.overlay.append(place)
      const mark = { ...at, radius: BADGE, shown: true }
      this.marks.push(mark)
      return { ...landmark, place, title, done, mark, label: this.addLabel(landmark.title, mark, 'landmark') }
    })

    // The treasure's X, shown once the treasure map is complete, in the
    // lagoon (where it takes the lagoon badge's place)
    const cay = islands.find(island => island.id === 'reef-cay')
    const at = toChart(cay.x, cay.z)
    this.treasureMark = svg('path', { d: 'M -4 -4 L 4 4 M -4 4 L 4 -4', class: 'map-treasure', transform: `translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})` })
    this.treasureMark.style.display = 'none'
    this.overlay.append(this.treasureMark)
  }

  // A name on the chart, put in place each time the map opens (see layout)
  addLabel(text, mark, kind) {
    const element = svg('text', { class: `map-label map-label-${kind}` })
    element.textContent = text
    this.overlay.append(element)
    const label = { element, text, mark, kind }
    this.labels.push(label)
    return element
  }

  // A row in the travel list beside the chart, ticked like its place on the
  // chart, with a number key; pointing at it (or focusing it) lights up its
  // place on the chart, and the other way round
  addRow(title, pin, go, spots) {
    const button = document.createElement('button')
    button.className = 'map-button'
    const name = document.createElement('span')
    name.textContent = title
    // Said in words for screen readers
    const done = document.createElement('span')
    done.className = 'map-done'
    done.hidden = true
    done.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-check" /></svg><span class="visually-hidden">, done</span>'
    const number = String(this.destinations.length + 1)
    const cap = document.createElement('kbd')
    cap.className = 'key map-key'
    cap.textContent = number
    button.append(name, done, cap)
    button.setAttribute('aria-keyshortcuts', number)
    button.style.setProperty('--pin', pin)
    button.addEventListener('click', go)
    this.list.append(button)
    this.destinations.push(go)

    const hot = value => {
      for (const spot of spots) spot.classList.toggle('is-hot', value)
      button.classList.toggle('is-hot', value)
    }
    for (const target of [...spots, button]) {
      target.addEventListener('pointerenter', () => hot(true))
      target.addEventListener('pointerleave', () => hot(false))
    }
    button.addEventListener('focusin', () => hot(true))
    button.addEventListener('focusout', () => hot(false))
    const row = { button, done }
    this.rows.push(row)
    return row
  }

  // Ticks, the wreck and the X, as they are now
  refresh() {
    const { logbook, reactions } = this.app.world
    const has = id => Boolean(logbook?.has(id))
    for (const row of this.rows) {
      // Docked at a section island, landed on Mount Airupt, a lap of the
      // course; airupt is where you start, so there is nothing to tick
      const done =
        row === this.courseRow ? has('course') : row.island.section ? Boolean(reactions?.visited.has(row.island.section)) : row.island.landing ? has('landing') : false
      row.done.hidden = !done
      if (row.tick) row.tick.style.display = done ? '' : 'none'
    }
    this.courseTick.style.display = has('course') ? '' : 'none'

    const treasure = this.treasureMark.style.display !== 'none'
    for (const landmark of this.landmarks) {
      const found = has(landmark.log)
      // The X stands where the lagoon badge would
      const shown = !(landmark.secret && !found) && !(landmark.log === 'reef' && treasure)
      landmark.place.style.display = shown ? '' : 'none'
      landmark.mark.shown = shown
      landmark.done.style.display = found ? '' : 'none'
      landmark.title.textContent = found ? `${landmark.title}: found` : `${landmark.title}${landmark.hint ? `: ${landmark.hint.toLowerCase()}` : ''}`
      // With the X up, the lagoon's name goes beside the X instead
      landmark.label.style.display = shown || landmark.log === 'reef' ? '' : 'none'
    }
    this.treasureShown = treasure
  }

  // Every name where it overlaps no pin, badge or other name, and keeps
  // off the course's route where it can: of a few spots round its pin or
  // badge (an island's name prefers above the island), the first that is
  // clear wins
  layout() {
    const font = getComputedStyle(document.documentElement).getPropertyValue('--font-display')
    const context = (this.measure ??= document.createElement('canvas').getContext('2d'))
    const taken = this.marks
      .filter(mark => mark.shown)
      .map(mark => ({ left: mark.x - mark.radius - 0.6, right: mark.x + mark.radius + 0.6, top: mark.y - mark.radius - 0.6, bottom: mark.y + mark.radius + 0.6 }))
    if (this.treasureShown) {
      const { x, y } = this.lagoonPoint()
      taken.push({ left: x - 4.6, right: x + 4.6, top: y - 4.6, bottom: y + 4.6 })
    }
    const inside = box => [box.left, box.right].every(x => [box.top, box.bottom].every(y => Math.hypot(x, y) < ROUND))
    const onRoute = box => this.routePoints.filter(point => point.x > box.left && point.x < box.right && point.y > box.top && point.y < box.bottom).length

    // Islands first: their names are the biggest and matter most
    const ordered = [...this.labels].sort((a, b) => (a.kind === 'island' ? 0 : 1) - (b.kind === 'island' ? 0 : 1))
    for (const label of ordered) {
      if (label.element.style.display === 'none') continue
      const size = label.kind === 'island' ? 7 : 5.6
      context.font = `800 ${size}px ${font}`
      const width = context.measureText(label.text).width
      const { x, y, radius } = label.mark
      const gap = 1.6
      const above = y - radius - gap - size * 0.22
      const below = y + radius + gap + size * 0.78
      const middle = y + size * 0.3
      const side = radius + gap
      const candidates = [
        [x, above, 'middle'],
        [x, below, 'middle'],
        [x + side, middle, 'start'],
        [x - side, middle, 'end'],
        [x + side * 0.7, above, 'start'],
        [x - side * 0.7, above, 'end'],
        [x + side * 0.7, below, 'start'],
        [x - side * 0.7, below, 'end'],
      ]
      // An island's name sits above the island itself first, clear of its pin
      if (label.kind === 'island') {
        const island = label.mark.island
        candidates.unshift([x, y - island.radius * 0.75 - 3, 'middle'], [x, y + island.radius * 0.6 + size, 'middle'])
      }
      let best = null
      candidates.forEach(([cx, cy, anchor], index) => {
        const left = anchor === 'middle' ? cx - width / 2 : anchor === 'start' ? cx : cx - width
        // A little more round the text for its dark outline
        const box = { left: left - 1.2, right: left + width + 1.2, top: cy - size * 0.78 - 1, bottom: cy + size * 0.22 + 1 }
        if (!inside(box)) return
        const score = taken.filter(other => overlaps(box, other)).length * 1000 + onRoute(box) * 20 + index
        if (!best || score < best.score) best = { score, cx, cy, anchor, box }
      })
      if (!best) continue
      label.element.setAttribute('x', best.cx.toFixed(2))
      label.element.setAttribute('y', best.cy.toFixed(2))
      label.element.setAttribute('text-anchor', best.anchor)
      taken.push(best.box)
    }
  }

  lagoonPoint() {
    const cay = islands.find(island => island.id === 'reef-cay')
    return toChart(cay.x, cay.z)
  }

  // Renders the whole archipelago once from straight above into an image
  capture() {
    const { renderer, scene, world } = this.app
    const size = 1024
    const target = new THREE.WebGLRenderTarget(size, size, { samples: 4 })
    target.texture.colorSpace = THREE.SRGBColorSpace

    const camera = new THREE.OrthographicCamera(-EXTENT, EXTENT, EXTENT, -EXTENT, 1, 400)
    camera.position.set(0, 200, 0)
    camera.up.set(0, 0, -1) // screen down = +z, matching SVG's y axis
    camera.lookAt(0, 0, 0)

    // No fog or sky from up here, the boat should not punch holes in things,
    // and the shadow box has to cover the whole map for this one frame
    const saved = {
      near: shared.uFogNear.value,
      far: shared.uFogFar.value,
      seeThrough: shared.uSeeThroughCenter.value.clone(),
    }
    shared.uFogNear.value = 1e5
    shared.uFogFar.value = 1e5 + 1
    shared.uSeeThroughCenter.value.set(-1e5, -1e5)
    world.sky.dome.visible = false
    // Boats, cargo and bottles would only read as specks of dust on the chart
    world.props?.instances.setVisible(false)
    const bottles = world.bottles?.items.filter(item => item.object.visible) ?? []
    for (const item of bottles) item.object.visible = false
    world.ocean.uniforms.uGlint.value = 0
    const shadowCamera = world.sky.sun.shadow.camera
    const shadowBounds = [shadowCamera.left, shadowCamera.right, shadowCamera.top, shadowCamera.bottom]
    Object.assign(shadowCamera, { left: -EXTENT, right: EXTENT, top: EXTENT, bottom: -EXTENT })
    shadowCamera.updateProjectionMatrix()
    world.sky.sun.position.copy(shared.uSunDirection.value).multiplyScalar(150)
    world.sky.sun.target.position.set(0, 0, 0)
    world.sky.sun.target.updateMatrixWorld()

    renderer.setRenderTarget(target)
    renderer.render(scene, camera)
    const pixels = new Uint8Array(size * size * 4)
    renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels)
    renderer.setRenderTarget(null)

    shared.uFogNear.value = saved.near
    shared.uFogFar.value = saved.far
    shared.uSeeThroughCenter.value.copy(saved.seeThrough)
    world.sky.dome.visible = true
    world.props?.instances.setVisible(true)
    for (const item of bottles) item.object.visible = true
    world.ocean.uniforms.uGlint.value = 3
    ;[shadowCamera.left, shadowCamera.right, shadowCamera.top, shadowCamera.bottom] = shadowBounds
    shadowCamera.updateProjectionMatrix()
    target.dispose()

    // Pixels come back bottom row first
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    const image = context.createImageData(size, size)
    for (let row = 0; row < size; row++) {
      image.data.set(pixels.subarray(row * size * 4, (row + 1) * size * 4), (size - 1 - row) * size * 4)
    }
    context.putImageData(image, 0, 0)
    this.picture.setAttribute('href', canvas.toDataURL('image/jpeg', 0.85))
    // Kept for the treasure map in the captain's log
    this.chartCanvas = canvas
    this.queueHighlights()
  }

  get extent() {
    return EXTENT
  }

  showTreasure(visible) {
    this.treasureMark.style.display = visible ? '' : 'none'
  }

  // Each named island as a white silhouette, soft at the coast. Drawn one
  // island at a time when the page is idle after loading, so the first
  // look at the map never waits for them.
  queueHighlights() {
    const later = window.requestIdleCallback ?? (callback => setTimeout(callback, 50))
    const next = () => {
      const pending = this.highlights.find(highlight => !highlight.drawn)
      if (!pending) return
      this.drawHighlight(pending)
      later(next)
    }
    later(next)
  }

  drawHighlight(highlight) {
    highlight.drawn = true
    const { island, images, cutout } = highlight
    const perMetre = 2.5
    const reach = island.radius * 1.3
    const size = Math.ceil(reach * 2 * perMetre)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    const image = context.createImageData(size, size)
    for (let row = 0; row < size; row++) {
      for (let column = 0; column < size; column++) {
        const height = islandHeight(island, (column + 0.5) / perMetre - reach, (row + 0.5) / perMetre - reach)
        const index = (row * size + column) * 4
        image.data[index] = image.data[index + 1] = image.data[index + 2] = 255
        image.data[index + 3] = 255 * smoothstep(-0.25, 0.25, height)
      }
    }
    context.putImageData(image, 0, 0)
    const url = canvas.toDataURL()
    for (const element of images) element.setAttribute('href', url)
    // The same silhouette in black cuts the island out of its glow's mask
    for (let i = 0; i < image.data.length; i += 4) image.data[i] = image.data[i + 1] = image.data[i + 2] = 0
    context.putImageData(image, 0, 0)
    cutout.setAttribute('href', canvas.toDataURL())
  }

  open() {
    // Only from sailing: not over a panel, the log, photo mode or the page view
    if (!this.app.inputs.enabled) return
    for (const highlight of this.highlights) if (!highlight.drawn) this.drawHighlight(highlight)
    this.refresh()
    this.layout()
    this.dialog.showModal()
    this.app.overlay.setSailing(false)
    this.app.sounds.play('click', 0.5, 1.1)
  }

  sailTo(island) {
    this.dialog.close()
    const zone = this.app.world.zones.list.find(candidate => candidate.island.id === island.id)
    if (zone) {
      // Arrive moored at the island's dock
      this.app.world.boat.teleport(zone.x, zone.z, zone.yaw)
    } else if (island.label === 'name') {
      this.app.world.boat.respawn()
    } else {
      // Landmarks without a dock: arrive offshore on the side facing the start
      const length = Math.hypot(island.x, island.z) || 1
      const distance = island.radius + 8
      const x = island.x - (island.x / length) * distance
      const z = island.z - (island.z / length) * distance
      this.app.world.boat.teleport(x, z, Math.atan2(x - island.x, z - island.z))
    }
  }

  // To the chequered ring, a little way back from it and facing through
  sailToCourse() {
    this.dialog.close()
    const start = this.course[0]
    this.app.world.boat.teleport(start.x - start.normal.x * 9, start.z - start.normal.z * 9, Math.atan2(-start.normal.x, -start.normal.z))
  }

  update() {
    if (!this.dialog.open) return
    const { position, quaternion } = this.app.world.boat.object
    // Heading on the ground plane, as an SVG rotation (0 = toward -z)
    const yaw = Math.atan2(2 * (quaternion.w * quaternion.y + quaternion.x * quaternion.z), 1 - 2 * (quaternion.y ** 2 + quaternion.x ** 2))
    const transform = `translate(${position.x.toFixed(2)} ${position.z.toFixed(2)}) rotate(${((-yaw * 180) / Math.PI).toFixed(1)})`
    if (transform !== this.boatTransform) this.boat.setAttribute('transform', (this.boatTransform = transform))
  }
}
