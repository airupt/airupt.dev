// Everything visitors read lives here, shared by the 3D panels and the classic view.
import airuptImage from '../assets/projects/airupt-dev.jpg?url'
import reallifeImage from '../assets/projects/reallife-roleplay.jpg?url'
import quasarImage from '../assets/projects/quasar-store.jpg?url'

export const profile = {
  name: 'airupt',
  role: 'Creative developer',
  tagline: 'Set sail through my work.',
  // Left empty on purpose: contact goes through the links below
  email: '',
  links: [
    { label: 'GitHub', url: 'https://github.com/airupt' },
    { label: 'X', url: 'https://x.com/airuptwastaken' },
  ],
}

// Messages in the bottles hidden around the sea, one per bottle
export const bottles = [
  'You found a bottle! There are seven more drifting around these islands.',
  'Every island here is grown from noise in code, not modelled by hand.',
  'Every blade of grass is a single triangle, turned to face you.',
  'The sea and the boat share one wave formula, so the boat rides exactly the waves you see.',
  'Wait for night: the lighthouse lights up and the wake starts to glow.',
  'airupt has been building things for more than five years: 3D on the web, websites, game servers and the tools in between.',
  'Some of airupt\'s favourite code runs where you would least expect it: inside GTA V roleplay servers.',
  'That was the last one. Thanks for exploring! Say hi on the Contact island.',
]

export const sections = [
  {
    id: 'about',
    kind: 'about',
    title: 'About',
    paragraphs: [
      'Ahoy! I\'m airupt, a creative developer who has spent more than five years building things for screens: interactive 3D on the web, websites and web apps, game servers, and the tools and automations that keep it all afloat.',
      'Lately I\'m mostly deep in game projects, but I\'m always up for a new voyage. I\'m open to freelance work and full-time roles, so if you have a project worth sailing toward, the Contact island is just over there.',
    ],
  },
  {
    id: 'projects',
    kind: 'projects',
    title: 'Projects',
    projects: [
      {
        title: 'airupt.dev',
        year: '2026',
        role: 'Design & development',
        description: 'This portfolio: a little boat on a low-poly sea, built from scratch with Three.js and Rapier. Every island, dock and lighthouse is made in code.',
        tags: ['Three.js', 'Rapier', 'GLSL', 'Vite', 'Cloudflare'],
        url: '',
        image: airuptImage,
        imageAlt: 'The airupt.dev island world: a boat moored at an island with a red and white lighthouse',
      },
      {
        title: 'Reallife Roleplay',
        year: '2026–now',
        role: 'Developer',
        description: 'A Dutch GTA V roleplay server on FiveM. Together with the rest of the development team I build everything from gameplay systems and in-game interfaces to the server infrastructure and the tools that keep it running.',
        tags: ['FiveM', 'Lua', 'NUI', 'MySQL'],
        url: 'https://realliferoleplay.nl',
        linkLabel: 'Visit Reallife Roleplay',
        image: reallifeImage,
        imageAlt: 'The Reallife Roleplay webshop homepage',
      },
      {
        title: 'Quasar Store',
        year: '2024–2026',
        role: 'Freelance developer',
        description: 'Quasar Store makes premium FiveM scripts used by more than 30,000 servers. As a freelancer I built in-game interfaces and gameplay scripts for their catalogue.',
        tags: ['FiveM', 'Lua', 'JavaScript', 'NUI'],
        url: 'https://quasar-store.com',
        linkLabel: 'Visit Quasar Store',
        image: quasarImage,
        imageAlt: 'The Quasar Store homepage',
      },
    ],
  },
  {
    id: 'skills',
    kind: 'skills',
    title: 'Skills',
    groups: [
      {
        title: 'Frontend',
        items: ['JavaScript', 'TypeScript', 'React', 'Vue', 'Next.js', 'Nuxt', 'Svelte', 'Astro', 'Angular', 'Three.js', 'WebGL', 'WebGPU', 'GLSL shaders', 'GSAP', 'Tailwind CSS', 'HTML & CSS', 'Web Audio', 'PWAs', 'Electron', 'React Native'],
      },
      {
        title: 'Backend',
        items: ['Node.js', 'Python', 'PHP & Laravel', 'C# & .NET', 'Lua', 'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'REST & GraphQL APIs', 'Supabase', 'Firebase', 'WebSockets'],
      },
      {
        title: 'Game servers',
        items: ['FiveM (QBCore, ESX, Qbox)', 'txAdmin', 'Pterodactyl', 'Performance profiling', 'Anti-cheat'],
      },
      {
        title: 'AI & automation',
        items: ['LLM APIs (Claude, OpenAI)', 'AI agents & MCP', 'AI coding tools', 'RAG & vector databases', 'Prompt engineering', 'Image & video generation', 'Voice & speech AI', 'Fine-tuning', 'Computer vision', 'Discord bots', 'n8n & Zapier', 'Web scraping'],
      },
      {
        title: 'Tools',
        items: ['Git & GitHub', 'GitHub Actions', 'Docker', 'Cloudflare', 'Vercel & Netlify', 'Nginx', 'Linux servers', 'Vite'],
      },
    ],
  },
  {
    id: 'contact',
    kind: 'contact',
    title: 'Contact',
    intro: 'Want to build something together? Reach out on GitHub or X.',
  },
]
