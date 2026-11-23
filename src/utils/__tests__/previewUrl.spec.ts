import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/types/agentd.type'
import {
  isLocalUrl,
  latestPreviewOf,
  previewUrlOf,
  previewUrlOn,
  typedPreviewUrlOf
} from '../previewUrl'

const message = (role: ChatMessage['role'], text: string, uuid = text): ChatMessage => ({
  uuid,
  role,
  at: null,
  blocks: [{ type: 'text', text }]
})

describe('isLocalUrl', () => {
  it('should accept localhost and the loopback addresses', () => {
    expect(
      [
        'http://localhost:5173/',
        'https://127.0.0.1/x',
        'http://[::1]:3000',
        'http://0.0.0.0:8080'
      ].map(isLocalUrl)
    ).toEqual([true, true, true, true])
  })

  it('should reject other hosts and other schemes', () => {
    expect(
      ['https://example.com', 'file://localhost/c:/x', 'localhost:5173'].map(isLocalUrl)
    ).toEqual([false, false, false])
  })
})

describe('latestPreviewOf', () => {
  it('should take the last link of the newest answer', () => {
    const messages = [
      message('assistant', 'Siehe http://localhost:5173/alt', 'a1'),
      message(
        'assistant',
        'Erst http://localhost:5173/a, dann http://localhost:5173/kalender.',
        'a2'
      )
    ]
    expect(latestPreviewOf(messages)).toEqual({
      url: 'http://localhost:5173/kalender',
      messageId: 'a2'
    })
  })

  it('should read the address out of a markdown link', () => {
    const messages = [
      message('assistant', 'So siehst du es: [Kalender](http://127.0.0.1:1483/kalender)')
    ]
    expect(latestPreviewOf(messages)?.url).toBe('http://127.0.0.1:1483/kalender')
  })

  it('should skip the user and answers without a local address', () => {
    const messages = [
      message('assistant', 'Läuft auf http://localhost:5173/', 'a1'),
      message('user', 'Öffne http://localhost:9999/', 'u1'),
      message('assistant', 'Doku: https://vuejs.org', 'a2')
    ]
    expect(latestPreviewOf(messages)).toEqual({ url: 'http://localhost:5173/', messageId: 'a1' })
  })

  it('should give null without any local address', () => {
    expect(latestPreviewOf([message('assistant', 'Fertig.')])).toBeNull()
  })
})

describe('previewUrlOf', () => {
  const typed = { url: 'http://localhost:5173/b', detectedIn: 'a1' }

  it('should show the detected address while nothing was typed', () => {
    const detected = { url: 'http://localhost:5173/a', messageId: 'a1' }
    expect(previewUrlOf(undefined, detected)).toBe('http://localhost:5173/a')
  })

  it('should keep the typed address while Claude sends no newer answer with one', () => {
    const detected = { url: 'http://localhost:5173/a', messageId: 'a1' }
    expect(previewUrlOf(typed, detected)).toBe('http://localhost:5173/b')
  })

  it('should let a newer answer replace the typed address', () => {
    const detected = { url: 'http://localhost:5173/c', messageId: 'a2' }
    expect(previewUrlOf(typed, detected)).toBe('http://localhost:5173/c')
  })

  it('should let a newer answer win even when it names the same address again', () => {
    const detected = { url: 'http://localhost:5173/a', messageId: 'a2' }
    expect(previewUrlOf(typed, detected)).toBe('http://localhost:5173/a')
  })

  it('should keep the typed address while the history is not loaded yet', () => {
    expect(previewUrlOf(typed, null)).toBe('http://localhost:5173/b')
  })
})

describe('typedPreviewUrlOf', () => {
  it('should add http to an address typed without a scheme', () => {
    expect(typedPreviewUrlOf(' localhost:5173/kalender ')).toBe('http://localhost:5173/kalender')
  })

  it('should keep an https address', () => {
    expect(typedPreviewUrlOf('https://example.com/x')).toBe('https://example.com/x')
  })

  it('should refuse other schemes and empty text', () => {
    expect([
      typedPreviewUrlOf('javascript:alert(1)'),
      typedPreviewUrlOf('file:///c:/x'),
      typedPreviewUrlOf('  ')
    ]).toEqual([null, null, null])
  })
})

describe('previewUrlOn', () => {
  it('should put the machine host in place of localhost and keep port, path and query', () => {
    expect(previewUrlOn('http://localhost:5173/kalender?tag=a#top', 'devbox.example')).toBe(
      'http://devbox.example:5173/kalender?tag=a#top'
    )
  })

  it('should rewrite 127.0.0.1 to an IP address', () => {
    expect(previewUrlOn('http://127.0.0.1:3000/', '192.0.2.10')).toBe('http://192.0.2.10:3000/')
  })

  it('should bracket an IPv6 host', () => {
    expect(previewUrlOn('http://localhost:3000/', '2001:db8::1')).toBe('http://[2001:db8::1]:3000/')
  })

  it('should leave an address on another host alone', () => {
    expect(previewUrlOn('https://example.com/x', '192.0.2.10')).toBe('https://example.com/x')
  })
})
