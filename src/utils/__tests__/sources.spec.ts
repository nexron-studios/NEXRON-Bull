import { describe, expect, it } from 'vitest'
import { sourcesOfCall, uniqueSources } from '../sources'
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
      { url: 'https://www.prompt-kit.com/docs/tool', domain: 'prompt-kit.com' },
      { url: 'https://github.com/ibelick/prompt-kit', domain: 'github.com' }
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

  it('should find no sources in other tools', () => {
    expect(sourcesOfCall('Bash', { command: 'curl https://example.com' }, null)).toEqual([])
  })
})

describe('uniqueSources', () => {
  it('should keep the first of two equal urls', () => {
    const source = { url: 'https://a.dev/', domain: 'a.dev' }
    expect(uniqueSources([source, { ...source }])).toEqual([source])
  })
})
