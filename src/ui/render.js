// Builds DOM for portfolio content. Uses textContent throughout, never innerHTML.
export function element(tag, attributes = {}, children = []) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'text') node.textContent = value
    else node.setAttribute(key, value)
  }
  node.append(...children.filter(Boolean))
  return node
}

// An icon from the sprite in index.html
export function icon(name, className = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', className)
  svg.setAttribute('aria-hidden', 'true')
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', `#icon-${name}`)
  svg.append(use)
  return svg
}

// A contact route as a wide button: its mark, its name and the handle
function contactLink(url, name, handle, mark) {
  const external = !url.startsWith('mailto:')
  return element('a', { class: 'contact-link', href: url, ...(external && { target: '_blank', rel: 'noopener' }) }, [
    icon(mark, mark === 'mail' ? 'icon' : 'icon icon-filled'),
    element('span', { class: 'contact-name', text: name }),
    element('span', { class: 'contact-handle', text: handle }),
  ])
}

const marks = { github: 'github', x: 'x' }

const externalLink = (url, text, className) =>
  element('a', { href: url, target: '_blank', rel: 'noopener', text, ...(className && { class: className }) })

// A project's screenshot, or a coloured tile with its initials until there is one
function projectVisual(project) {
  if (project.image) {
    return element('img', { class: 'project-visual', src: project.image, alt: project.imageAlt ?? '', loading: 'lazy' })
  }
  const initials = project.title
    .split(/\s+/)
    .map(word => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  return element('div', { class: 'project-visual project-visual-placeholder', 'aria-hidden': 'true', text: initials })
}

const renderers = {
  about: section => section.paragraphs.map(text => element('p', { text })),

  projects: section => [
    element(
      'ul',
      { class: 'projects' },
      section.projects.map(project =>
        element('li', { class: 'project' }, [
          projectVisual(project),
          element('div', { class: 'project-body' }, [
            element('h3', { text: project.title }),
            element('p', { class: 'project-meta', text: [project.year, project.role].filter(Boolean).join(' · ') }),
            element('p', { text: project.description }),
            project.tags?.length && element('ul', { class: 'tags' }, project.tags.map(tag => element('li', { text: tag }))),
            project.url && externalLink(project.url, project.linkLabel ?? 'View project', 'button button-small'),
          ]),
        ])
      )
    ),
  ],

  skills: section =>
    section.groups.map(group =>
      element('div', { class: 'skill-group' }, [
        element('h3', { text: group.title }),
        element('ul', { class: 'tags' }, group.items.map(item => element('li', { text: item }))),
      ])
    ),

  contact: (section, profile) => [
    element('p', { text: section.intro }),
    element('div', { class: 'contact-links' }, [
      profile.email && contactLink(`mailto:${profile.email}`, 'Email', profile.email, 'mail'),
      ...profile.links.map(link => contactLink(link.url, link.label, `@${new URL(link.url).pathname.split('/').filter(Boolean)[0] ?? ''}`, marks[link.label.toLowerCase()] ?? 'arrow')),
    ]),
  ],
}

export function renderSection(section, profile, idPrefix, color) {
  const headingId = `${idPrefix}-${section.id}`
  const node = element('section', { class: `section section-${section.kind}`, 'aria-labelledby': headingId }, [
    element('h2', { id: headingId, text: section.title }),
    ...renderers[section.kind](section, profile),
  ])
  if (color) node.style.setProperty('--section-color', color)
  return node
}

// The airupt mark from the icon sprite in index.html, plus the wordmark
function brand() {
  const mark = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  mark.setAttribute('class', 'brand-mark')
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use')
  use.setAttribute('href', '#icon-mark')
  mark.append(use)
  const node = element('p', { class: 'brand' }, [mark])
  node.append('airupt')
  return node
}

export const isBrandName = name => name.trim().toLowerCase() === 'airupt'

export function renderClassic(profile, sections, colors, onBack) {
  const back = element('button', {
    class: 'button button-primary classic-back',
    text: 'Back to the sea',
    'aria-keyshortcuts': 'Escape',
    'data-tooltip': 'Back to the sea · Esc',
  })
  back.addEventListener('click', onBack)

  return element('div', { class: 'classic-inner' }, [
    element('header', { class: 'classic-header' }, [
      isBrandName(profile.name) ? null : brand(),
      isBrandName(profile.name) ? element('h1', { class: 'brand-title' }, [brand().querySelector('.brand-mark'), profile.name]) : element('h1', { text: profile.name }),
      element('p', { class: 'classic-role', text: `${profile.role}. ${profile.tagline}` }),
      back,
    ]),
    element('main', {}, sections.map(section => renderSection(section, profile, 'classic', colors[section.id]))),
  ])
}
