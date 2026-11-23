import { describe, expect, it } from 'vitest'
import { markdown, renderSegments } from '../markdown'

describe('renderSegments', () => {
  it('should cut the text around a callout', () => {
    const text = 'Erledigt.\n\n> [!warning] Achtung\n> Server neu gestartet.\n\nDanach mehr.'
    expect(renderSegments(text)).toEqual([
      { kind: 'markdown', html: '<p>Erledigt.</p>\n' },
      {
        kind: 'callout',
        callout: {
          kind: 'warning',
          title: 'Achtung',
          body: 'Server neu gestartet.',
          isFolded: false
        },
        html: '<p>Server neu gestartet.</p>\n'
      },
      { kind: 'markdown', html: '<p>Danach mehr.</p>\n' }
    ])
  })

  it('should keep text without callouts as one piece', () => {
    expect(renderSegments('Nur Text.\n\n> Ein Zitat')).toEqual([
      {
        kind: 'markdown',
        html: '<p>Nur Text.</p>\n<blockquote>\n<p>Ein Zitat</p>\n</blockquote>\n'
      }
    ])
  })

  it('should leave a callout inside a code block as text', () => {
    const segments = renderSegments('```md\n> [!question] Frage\n```')
    expect(segments.map((segment) => segment.kind)).toEqual(['markdown'])
  })

  it('should split two callouts that follow each other', () => {
    const kinds = renderSegments('> [!todo] Offen\n> - a\n\n> [!question]\n> Und?').map(
      (segment) => (segment.kind === 'callout' ? segment.callout.kind : segment.kind)
    )
    expect(kinds).toEqual(['todo', 'question'])
  })

  it('should resolve a reference link whose definition stands after a callout', () => {
    const text = 'Siehe [PR][1].\n\n> [!tip] Vorschlag\n> Mergen?\n\n[1]: https://x.test'
    expect(renderSegments(text)).toEqual([
      { kind: 'markdown', html: '<p>Siehe <a href="https://x.test">PR</a>.</p>\n' },
      expect.objectContaining({ kind: 'callout', html: '<p>Mergen?</p>\n' })
    ])
  })

  it('should find a callout in text with carriage-return line ends', () => {
    const kinds = renderSegments('Text\r\rmehr\r\n\r\n> [!warning]\r\n> Achtung').map(
      (segment) => segment.kind
    )
    expect(kinds).toEqual(['markdown', 'callout'])
  })
})

describe('markdown', () => {
  it('should turn task list markers into read-only checkboxes', () => {
    expect(markdown.render('- [x] Build\n- [ ] Merge')).toBe(
      '<ul>\n' +
        '<li class="task-item"><input type="checkbox" disabled checked class="task-check"> Build</li>\n' +
        '<li class="task-item"><input type="checkbox" disabled class="task-check"> Merge</li>\n' +
        '</ul>\n'
    )
  })

  it('should keep escaping html Claude wrote inside a task item', () => {
    expect(markdown.render('- [ ] <b>bold</b>')).toContain('&lt;b&gt;bold&lt;/b&gt;')
  })

  it('should leave plain list items alone', () => {
    expect(markdown.render('- [link](https://a.dev)')).toBe(
      '<ul>\n<li><a href="https://a.dev">link</a></li>\n</ul>\n'
    )
  })

  it('should put an open-in-preview button after a link to a local page', () => {
    const html = markdown.render('Siehe [Kalender](http://localhost:5173/kalender).')
    const button = /<\/a><button type="button" class="preview-link" data-preview="([^"]+)"/.exec(
      html
    )
    expect(button?.[1]).toBe('http://localhost:5173/kalender')
  })

  it('should give a bare localhost address the button too', () => {
    expect(markdown.render('http://127.0.0.1:1483/').match(/data-preview="[^"]+"/g)).toEqual([
      'data-preview="http://127.0.0.1:1483/"'
    ])
  })

  it('should leave links to other hosts without the button', () => {
    expect(markdown.render('[Doku](https://vuejs.org)')).toBe(
      '<p><a href="https://vuejs.org">Doku</a></p>\n'
    )
  })
})
