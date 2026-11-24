import { describe, expect, it } from 'vitest'
import transitionsCss from '../transitions.css?raw'

const MEDIA_BLOCK = /@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g
const RULE = /([^{}]+)\{([^{}]*)\}/g

/** The declarations that apply to `selector` outside any media query, later rules winning. */
const declarationsOf = (css: string, selector: string): Record<string, string> => {
  const declarations: Record<string, string> = {}
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const [, selectors, body] of withoutComments.replace(MEDIA_BLOCK, '').matchAll(RULE)) {
    // Commas inside :is(…) do not separate selectors.
    if (
      !selectors.split(/,(?![^(]*\))/).some((part) => part.replace(/\s+/g, ' ').trim() === selector)
    )
      continue
    for (const line of body.split(';')) {
      const [property, ...value] = line.split(':')
      if (value.length) declarations[property.trim()] = value.join(':').trim()
    }
  }
  return declarations
}

describe('layout snap cross-fade', () => {
  it.each(['sidebar', 'chat-column', 'chat-pane'])(
    'should fade the old and new %s on one curve and add them up',
    (name) => {
      const old = declarationsOf(transitionsCss, `::view-transition-old(${name})`)
      const next = declarationsOf(transitionsCss, `::view-transition-new(${name})`)

      expect([
        old.animation,
        old['mix-blend-mode'],
        next.animation,
        next['mix-blend-mode']
      ]).toEqual([
        'route-out var(--duration-snap-fade) var(--ease-out-soft) both',
        'plus-lighter',
        'route-in var(--duration-snap-fade) var(--ease-out-soft) both',
        'plus-lighter'
      ])
    }
  )

  it.each(['sidebar', 'chat-column', 'chat-pane', 'session-bar-tools', 'chat-search-field'])(
    'should keep a lone %s picture from adding its light onto the parts beneath',
    (name) => {
      const pair = declarationsOf(transitionsCss, `::view-transition-image-pair(${name})`)

      expect(pair.isolation).toBe('isolate')
    }
  )

  it('should carry the session bar buttons as their own part', () => {
    const tools = declarationsOf(
      transitionsCss,
      'html:is([data-sidebar-snap], [data-panel-snap]) [data-snap-bar-tools]'
    )

    expect(tools['view-transition-name']).toBe('session-bar-tools')
  })
})
