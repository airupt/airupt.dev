import ocean from '../assets/sounds/ocean.mp3?url'
import engine from '../assets/sounds/engine.wav?url'
import splash from '../assets/sounds/splash.mp3?url'
import bump from '../assets/sounds/bump.mp3?url'
import gulls from '../assets/sounds/gulls.mp3?url'
import click from '../assets/sounds/click.mp3?url'
import chime from '../assets/sounds/chime.mp3?url'
import open from '../assets/sounds/open.mp3?url'
import close from '../assets/sounds/close.mp3?url'
import glass from '../assets/sounds/glass.mp3?url'
import lapping from '../assets/sounds/lapping.mp3?url'

// Imported, so the build gives each a hashed, long-cached name
const files = { ocean, engine, splash, bump, gulls, click, chime, open, close, glass, lapping }

const STORAGE_KEY = 'airupt-muted'

function readMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

// Web Audio mixer. The context starts suspended; the "Set sail" click resumes
// it, because browsers only allow sound after a user gesture.
export class Sounds {
  constructor(app) {
    this.app = app
    this.context = new AudioContext()
    this.master = this.context.createGain()
    this.master.connect(this.context.destination)
    this.buffers = {}
    this.started = false
    this.muted = readMuted()
    this.master.gain.value = this.muted ? 0 : 1

    this.gullTimer = 6
    this.lastInWater = 1
    this.lastVelocity = { x: 0, z: 0 }

    document.addEventListener('visibilitychange', () => {
      this.setSuspended(document.hidden || app.overlay.isClassicOpen)
    })
  }

  // Sounds stream in after the world: the site never waits on them, and
  // start() begins the loops once they have arrived
  load() {
    this.loading ??= this.fetchAll()
    return this.loading
  }

  async fetchAll() {
    await Promise.all(
      Object.entries(files).map(async ([name, url]) => {
        try {
          const response = await fetch(url)
          this.buffers[name] = await this.context.decodeAudioData(await response.arrayBuffer())
        } catch {
          // A missing sound should never stop the site from loading
        }
      })
    )
  }

  start() {
    this.started = true
    this.context.resume()
    this.load().then(() => {
      this.ocean = this.loop('ocean', 0.3)
      this.engine = this.loop('engine', 0)
      this.lapping = this.loop('lapping', 0)
    })
  }

  // A deep volcanic rumble made on the spot: brown noise through a low-pass
  // filter with a slow swell and fade. No recording needed.
  rumble(volume) {
    if (this.context.state !== 'running' || volume < 0.02) return
    const duration = 3
    const rate = this.context.sampleRate
    if (!this.rumbleBuffer) {
      this.rumbleBuffer = this.context.createBuffer(1, rate * duration, rate)
      const data = this.rumbleBuffer.getChannelData(0)
      let last = 0
      for (let i = 0; i < data.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
        data[i] = last * 3.5
      }
    }
    const source = this.context.createBufferSource()
    source.buffer = this.rumbleBuffer
    const filter = this.context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 140
    const gain = this.context.createGain()
    const now = this.context.currentTime
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(volume, now + 0.6)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)
    source.connect(filter).connect(gain).connect(this.master)
    source.start()
  }

  // A small brass bell, made on the spot: a few inharmonic partials that
  // ring out and fade. Panned and faded like play() when given a position.
  bell(volume = 0.25, position = null) {
    if (this.context.state !== 'running') return
    if (position) {
      const rig = this.app.cameraRig
      volume *= Math.max(0, 1 - Math.hypot(position.x - rig.focus.x, position.z - rig.focus.z) / 70)
      if (volume < 0.01) return
    }
    const now = this.context.currentTime
    for (const [ratio, level, decay] of [[1, 1, 2.2], [2.76, 0.45, 1.2], [5.4, 0.25, 0.6], [8.9, 0.12, 0.35]]) {
      const oscillator = this.context.createOscillator()
      oscillator.frequency.value = 660 * ratio
      const gain = this.context.createGain()
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(volume * level, now + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay)
      oscillator.connect(gain).connect(this.master)
      oscillator.start(now)
      oscillator.stop(now + decay + 0.05)
    }
  }

  // One crackle of a wood fire: a few milliseconds of bright noise
  crackle(volume) {
    if (this.context.state !== 'running' || volume < 0.01) return
    if (!this.crackleBuffer) {
      const rate = this.context.sampleRate
      this.crackleBuffer = this.context.createBuffer(1, Math.round(rate * 0.04), rate)
      const data = this.crackleBuffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3)
    }
    const source = this.context.createBufferSource()
    source.buffer = this.crackleBuffer
    source.playbackRate.value = 0.6 + Math.random() * 0.9
    const filter = this.context.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.value = 1200
    const gain = this.context.createGain()
    gain.gain.value = volume * (0.4 + Math.random() * 0.6)
    source.connect(filter).connect(gain).connect(this.master)
    source.start()
  }

  setSuspended(suspended) {
    if (!this.started) return
    if (suspended) this.context.suspend()
    else this.context.resume()
  }

  setMuted(muted) {
    this.muted = muted
    this.master.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.05)
    try {
      localStorage.setItem(STORAGE_KEY, muted ? '1' : '0')
    } catch {
      // Private mode: the choice just isn't remembered
    }
  }

  loop(name, volume) {
    const buffer = this.buffers[name]
    if (!buffer) return null
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.loop = true
    const gain = this.context.createGain()
    gain.gain.value = volume
    source.connect(gain).connect(this.master)
    source.start()
    return { source, gain }
  }

  // With a world position the sound is panned to where it is on screen and
  // fades out with distance from the camera's focus
  play(name, volume = 1, rate = 1, position = null) {
    const buffer = this.buffers[name]
    if (!buffer || this.context.state !== 'running') return
    let pan = 0
    if (position) {
      const rig = this.app.cameraRig
      const distance = Math.hypot(position.x - rig.focus.x, position.z - rig.focus.z)
      volume *= Math.max(0, 1 - distance / 70)
      if (volume < 0.01) return
      this.projected ??= position.clone()
      pan = Math.max(-1, Math.min(1, this.projected.copy(position).project(rig.camera).x)) * 0.8
    }
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.playbackRate.value = rate
    const gain = this.context.createGain()
    gain.gain.value = volume
    const panner = this.context.createStereoPanner()
    panner.pan.value = pan
    source.connect(gain).connect(panner).connect(this.master)
    source.start()
  }

  update(delta) {
    if (!this.started) return
    const boat = this.app.world.boat
    const throttle = Math.abs(this.app.inputs.state.throttle)
    const speed = Math.min(Math.abs(boat.speed) / 16, 1)
    const now = this.context.currentTime

    if (this.engine) {
      this.engine.source.playbackRate.setTargetAtTime(0.75 + speed * 0.7 + throttle * 0.1, now, 0.15)
      const volume = (0.05 + speed * 0.2 + throttle * 0.08) * (boat.inWater > 0 ? 1 : 0.6)
      this.engine.gain.gain.setTargetAtTime(volume, now, 0.1)
    }

    // Surf on the beaches swells as you come close to land: the distance to
    // the nearest shore is read from the baked sea map
    if (this.ocean) {
      const map = this.app.world.ocean.uniforms.uWaterMap.value.image
      const tx = Math.min(map.width - 1, Math.max(0, Math.floor(((boat.object.position.x + 128) / 256) * map.width)))
      const tz = Math.min(map.height - 1, Math.max(0, Math.floor(((boat.object.position.z + 128) / 256) * map.height)))
      const coast = (map.data[(tz * map.width + tx) * 4 + 1] / 255) * 24
      const shore = 1 - Math.min(Math.max((coast - 2) / 12, 0), 1)
      this.ocean.gain.gain.setTargetAtTime(0.26 + shore * 0.3, now, 0.6)
    }

    // A campfire crackles when you're near it
    const fire = this.app.world.decor?.placed.find(placed => placed.id === 'campfire')?.model.position
    if (fire) {
      const near = 1 - Math.min(Math.hypot(fire.x - boat.object.position.x, fire.z - boat.object.position.z) / 24, 1)
      this.crackleTimer = (this.crackleTimer ?? 0) - delta
      if (near > 0 && this.crackleTimer <= 0) {
        this.crackleTimer = 0.04 + Math.random() * 0.22
        this.crackle(near * near * 0.22)
      }
    }

    // Water slapping the hull is what you hear when idling, drowned out at speed
    if (this.lapping) {
      const volume = boat.inWater > 0 ? 0.32 * (1 - Math.min(Math.abs(boat.speed) / 6, 1)) : 0
      this.lapping.gain.gain.setTargetAtTime(volume, now, 0.3)
    }

    // Landing after a jump off a wave
    if (boat.inWater > 0 && this.lastInWater === 0 && boat.velocity.y < -2) {
      this.play('splash', Math.min(-boat.velocity.y / 6, 1) * 0.6, 0.9 + Math.random() * 0.2)
    }
    this.lastInWater = boat.inWater

    // A sudden drop in speed means the boat hit something; normal drag and
    // braking never change velocity this much in a single frame. A big jump
    // in position is a respawn, not a collision.
    const position = boat.object.position
    const teleported = this.lastPosition && Math.hypot(position.x - this.lastPosition.x, position.z - this.lastPosition.z) > 5
    const change = Math.hypot(boat.velocity.x - this.lastVelocity.x, boat.velocity.z - this.lastVelocity.z)
    if (change > 2.5 && !teleported) this.play('bump', Math.min(change / 10, 1) * 0.8, 0.9 + Math.random() * 0.2, position)
    this.lastVelocity = { x: boat.velocity.x, z: boat.velocity.z }
    this.lastPosition = { x: position.x, z: position.z }

    this.gullTimer -= delta
    if (this.gullTimer <= 0) {
      this.gullTimer = 14 + Math.random() * 16
      const nearIsland = this.app.world.islands.list.some(
        island => Math.hypot(island.x - position.x, island.z - position.z) < island.radius + 18
      )
      if (nearIsland) this.play('gulls', 0.22, 0.95 + Math.random() * 0.1)
    }
  }
}
