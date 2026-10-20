const files = {
  ocean: '/sounds/ocean.mp3',
  engine: '/sounds/engine.wav',
  splash: '/sounds/splash.mp3',
  bump: '/sounds/bump.mp3',
  gulls: '/sounds/gulls.mp3',
  click: '/sounds/click.mp3',
  chime: '/sounds/chime.mp3',
  open: '/sounds/open.mp3',
  close: '/sounds/close.mp3',
  glass: '/sounds/glass.mp3',
  lapping: '/sounds/lapping.mp3',
}

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

  async load() {
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
    this.ocean = this.loop('ocean', 0.3)
    this.engine = this.loop('engine', 0)
    this.lapping = this.loop('lapping', 0)
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
