import { describe, expect, it } from 'vitest'
import { calloutOf, calloutsIn, itemsOf, pointCountOf, quotedTextOf, quoteOf } from '../callouts'

describe('calloutsIn', () => {
  it('should find the callouts of a text in order', () => {
    const text = 'Text\n\n> [!warning]\n> Achtung\n\n> Zitat\n\n> [!question] Und?'
    expect(calloutsIn(text).map((callout) => callout.kind)).toEqual(['warning', 'question'])
  })

  it('should skip a callout inside a fenced code block', () => {
    expect(calloutsIn('~~~\n> [!todo] x\n~~~\n> [!tip] y')).toEqual([
      { kind: 'tip', title: 'y', body: '', isFolded: false }
    ])
  })
})

describe('itemsOf and pointCountOf', () => {
  it('should take the top-level list items, not the nested ones', () => {
    const body = '- Eins\n  - darunter\n2. Zwei'
    expect([itemsOf(body), pointCountOf(body)]).toEqual([['Eins', 'Zwei'], 2])
  })

  it('should drop task boxes and join an item that wraps onto the next line', () => {
    const body = '- [ ] Fix login\n- [x] Check the\n  mobile layout'
    expect(itemsOf(body)).toEqual(['Fix login', 'Check the mobile layout'])
  })

  it('should not count list lines inside a code block', () => {
    const body = '- Eins\n```\n- kein Punkt\n```\n- Zwei'
    expect([itemsOf(body), pointCountOf(body)]).toEqual([['Eins', 'Zwei'], 2])
  })

  it('should count no points in a body without a list', () => {
    expect([itemsOf('Nur Text.'), pointCountOf('Nur Text.')]).toEqual([['Nur Text.'], 0])
  })
})

describe('quotedTextOf', () => {
  it('should quote the body when there is one', () => {
    const callout = calloutOf(['> [!question] Braucht dich', '> Soll der Ordner weg?'])
    expect(callout && quotedTextOf(callout)).toBe('Soll der Ordner weg?')
  })

  it('should quote the title of a one-line callout', () => {
    const callout = calloutOf(['> [!question] Soll der Ordner weg?'])
    expect(callout && quotedTextOf(callout)).toBe('Soll der Ordner weg?')
  })
})

describe('calloutOf', () => {
  it('should read kind, title and body of a callout quote', () => {
    const callout = calloutOf(['> [!question] Braucht dich', '> Soll der Ordner weg?'])
    expect(callout).toEqual({
      kind: 'question',
      title: 'Braucht dich',
      body: 'Soll der Ordner weg?',
      isFolded: false
    })
  })

  it('should fold a callout marked with a minus', () => {
    const callout = calloutOf(['> [!info]-', '> - 4 Commits', '> - 2 Worktrees'])
    expect(callout).toEqual({
      kind: 'info',
      title: null,
      body: '- 4 Commits\n- 2 Worktrees',
      isFolded: true
    })
  })

  it('should accept the kind in any case and quotes without a space', () => {
    expect(calloutOf(['>[!WARNING]', '>Server neu gestartet.'])?.kind).toBe('warning')
  })

  it('should leave a plain quote alone', () => {
    expect(calloutOf(['> Nur ein Zitat'])).toBeNull()
  })

  it('should leave callout kinds Bull does not show alone', () => {
    expect(calloutOf(['> [!abstract] Zusammenfassung', '> Text'])).toBeNull()
  })
})

describe('quoteOf', () => {
  it('should prefix every line and keep empty lines bare', () => {
    expect(quoteOf('Erste Zeile\n\nDritte')).toBe('> Erste Zeile\n>\n> Dritte')
  })
})
