import './styles.css'
import { Experience } from './engine/Experience.js'

const experience = new Experience(document.querySelector('#scene'))
experience.start()

if (import.meta.env.DEV) window.experience = experience
