// Builds DOM for portfolio content. Uses textContent throughout, never innerHTML.
function element(tag, attributes = {}, children = []) {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'text') node.textContent = value
    else node.setAttribute(key, value)
  }
  node.append(...children.filter(Boolean))
  return node
}

const externalLink = (url, text) => element('a', { href: url, target: '_blank', rel: 'noopener', text })

const renderers = {
  about: section => section.paragraphs.map(text => element('p', { text })),

  projects: section => [
    element(
      'ul',
      { class: 'projects' },
      section.projects.map(project =>
        element('li', { class: 'project' }, [
          element('h3', { text: project.title }),
          element('p', { class: 'project-meta', text: [project.year, project.role].filter(Boolean).join(' · ') }),
          element('p', { text: project.description }),
          project.tags?.length && element('ul', { class: 'tags' }, project.tags.map(tag => element('li', { text: tag }))),
          project.url && externalLink(project.url, project.linkLabel ?? 'View project'),
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
    element('ul', { class: 'links' }, [
      profile.email && element('li', {}, [element('a', { href: `mailto:${profile.email}`, text: profile.email })]),
      ...profile.links.map(link => element('li', {}, [externalLink(link.url, link.label)])),
    ]),
  ],
}

export function renderSection(section, profile, idPrefix) {
  const headingId = `${idPrefix}-${section.id}`
  return element('section', { class: `section section-${section.kind}`, 'aria-labelledby': headingId }, [
    element('h2', { id: headingId, text: section.title }),
    ...renderers[section.kind](section, profile),
  ])
}

export function renderClassic(profile, sections, onBack) {
  const back = element('button', { class: 'button button-primary classic-back', text: 'Back to the sea' })
  back.addEventListener('click', onBack)

  return element('div', { class: 'classic-inner' }, [
    element('header', { class: 'classic-header' }, [
      element('h1', { text: profile.name }),
      element('p', { class: 'classic-role', text: `${profile.role}. ${profile.tagline}` }),
      back,
    ]),
    element('main', {}, sections.map(section => renderSection(section, profile, 'classic'))),
  ])
}
