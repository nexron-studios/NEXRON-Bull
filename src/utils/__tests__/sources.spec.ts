import { describe, expect, it } from 'vitest'
import { groupSourcesByDomain, pathOf, sourceRowOf, sourcesOfCall, uniqueSources } from '../sources'
import type { ToolResultBlock } from '../toolPairs'

const searchResult = (text: string): ToolResultBlock => ({
  type: 'tool_result',
  tool_use_id: 't1',
  is_error: false,
  content: [{ type: 'text', text }]
})

describe('sourcesOfCall', () => {
  it('should take the url of a WebFetch', () => {
    expect(sourcesOfCall('WebFetch', { url: 'https://tauri.app/v2/' }, null)).toEqual([
      { url: 'https://tauri.app/v2/', domain: 'tauri.app' }
    ])
  })

  it('should read every link from a WebSearch result', () => {
    const text =
      'Links: [{"title":"Tool","url":"https://www.prompt-kit.com/docs/tool"},{"title":"GH","url":"https://github.com/ibelick/prompt-kit"}].'
    expect(sourcesOfCall('WebSearch', { query: 'tool' }, searchResult(text))).toEqual([
      { url: 'https://www.prompt-kit.com/docs/tool', domain: 'prompt-kit.com', title: 'Tool' },
      { url: 'https://github.com/ibelick/prompt-kit', domain: 'github.com', title: 'GH' }
    ])
  })

  it('should keep balanced parentheses in a link', () => {
    const text = 'See https://en.wikipedia.org/wiki/Rust_(programming_language).'
    expect(sourcesOfCall('WebSearch', { query: 'rust' }, searchResult(text))).toEqual([
      {
        url: 'https://en.wikipedia.org/wiki/Rust_(programming_language)',
        domain: 'en.wikipedia.org'
      }
    ])
  })

  it('should end a link at a closing parenthesis that has no opening one', () => {
    const text = '(source: https://tauri.app/v2/)'
    expect(sourcesOfCall('WebSearch', { query: 'tauri' }, searchResult(text))).toEqual([
      { url: 'https://tauri.app/v2/', domain: 'tauri.app' }
    ])
  })

  it('should take the page title a WebSearch result names', () => {
    const text = 'Links: [{"title":"Chip \\"overflow\\"","url":"https://carbondesignsystem.com/x"}]'
    expect(sourcesOfCall('WebSearch', { query: 'chips' }, searchResult(text))).toEqual([
      {
        url: 'https://carbondesignsystem.com/x',
        domain: 'carbondesignsystem.com',
        title: 'Chip "overflow"'
      }
    ])
  })

  it('should find the title of a hit whose url ends in punctuation', () => {
    const text = 'Links: [{"title":"Spec","url":"https://a.dev/spec."}]'
    expect(sourcesOfCall('WebSearch', { query: 'spec' }, searchResult(text))).toEqual([
      { url: 'https://a.dev/spec', domain: 'a.dev', title: 'Spec' }
    ])
  })

  it('should find no sources in other tools', () => {
    expect(sourcesOfCall('Bash', { command: 'curl https://example.com' }, null)).toEqual([])
  })
})

describe('uniqueSources', () => {
  it('should keep a title a later read of the same page found', () => {
    const fetched = { url: 'https://a.dev/x', domain: 'a.dev' }
    const found = { ...fetched, title: 'X guide' }
    expect(uniqueSources([fetched, found])).toEqual([found])
  })

  it('should keep the first of two equal urls', () => {
    const source = { url: 'https://a.dev/', domain: 'a.dev' }
    expect(uniqueSources([source, { ...source }])).toEqual([source])
  })
})

const pagesOf = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ url: `https://a.dev/${index}`, domain: 'a.dev' }))

describe('sourceRowOf', () => {
  it('should show up to eight pages without a +N chip', () => {
    expect(sourceRowOf(pagesOf(8))).toEqual({ shown: pagesOf(8), hiddenCount: 0 })
  })

  it('should start folding at nine pages', () => {
    expect(sourceRowOf(pagesOf(9))).toEqual({ shown: pagesOf(6), hiddenCount: 3 })
  })

  it('should fold everything after the sixth page into the +N chip', () => {
    expect(sourceRowOf(pagesOf(94))).toEqual({ shown: pagesOf(6), hiddenCount: 88 })
  })
})

describe('groupSourcesByDomain', () => {
  it('should group pages by site in the order the sites were first read', () => {
    const a1 = { url: 'https://a.dev/1', domain: 'a.dev' }
    const b1 = { url: 'https://b.dev/1', domain: 'b.dev' }
    const a2 = { url: 'https://a.dev/2', domain: 'a.dev' }
    expect(groupSourcesByDomain([a1, b1, a2])).toEqual([
      { domain: 'a.dev', sources: [a1, a2] },
      { domain: 'b.dev', sources: [b1] }
    ])
  })
})

describe('pathOf', () => {
  it('should show the decoded path with query after the host', () => {
    expect(pathOf('https://de.wikipedia.org/wiki/M%C3%BCnchen?x=1')).toBe('/wiki/München?x=1')
  })

  it('should keep a path whose percent sign is no escape', () => {
    expect(pathOf('https://a.dev/100%25-sure%')).toBe('/100%25-sure%')
  })
})
