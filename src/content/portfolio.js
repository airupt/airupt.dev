// Everything visitors read lives here, shared by the 3D panels and the classic view.
// Placeholder text: replace it with your own.
export const profile = {
  name: 'Your Name',
  role: 'Developer',
  tagline: 'Building playful things for the web.',
  email: '',
  links: [
    { label: 'GitHub', url: 'https://github.com/' },
    { label: 'LinkedIn', url: 'https://www.linkedin.com/' },
  ],
}

export const sections = [
  {
    id: 'about',
    kind: 'about',
    title: 'About',
    paragraphs: [
      'Placeholder: two or three sentences about who you are and what you love building.',
      'Placeholder: where you are based, what you are working on now, and what you are looking for.',
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
        description: 'This portfolio: a little boat on a low-poly sea, built with Three.js and Rapier.',
        tags: ['Three.js', 'Rapier', 'Vite', 'Cloudflare'],
        url: '',
      },
      {
        title: 'Project two',
        year: '2025',
        role: 'Placeholder role',
        description: 'Placeholder: what it is, what you did, and the result.',
        tags: ['Tag'],
        url: '',
      },
      {
        title: 'Project three',
        year: '2024',
        role: 'Placeholder role',
        description: 'Placeholder: what it is, what you did, and the result.',
        tags: ['Tag'],
        url: '',
      },
    ],
  },
  {
    id: 'skills',
    kind: 'skills',
    title: 'Skills',
    groups: [
      { title: 'Frontend', items: ['JavaScript', 'Three.js', 'HTML & CSS'] },
      { title: 'Backend', items: ['Placeholder'] },
      { title: 'Tools', items: ['Git', 'Vite', 'Cloudflare'] },
    ],
  },
  {
    id: 'contact',
    kind: 'contact',
    title: 'Contact',
    intro: 'Placeholder: how and why people should reach out.',
  },
]
