import './styles.css'
import { Overlay } from './ui/Overlay.js'

// The loader and classic view work straight away; three.js and Rapier
// (most of the download) arrive in a separate chunk behind it.
const overlay = new Overlay()
overlay.setProgress(0.05)

const { Experience } = await import('./engine/Experience.js')
const experience = new Experience(document.querySelector('#scene'), overlay)
experience.start()

if (import.meta.env.DEV) window.experience = experience
