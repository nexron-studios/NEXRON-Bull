import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/types/agentd.type'
import {
  frameSandboxOf,
  isLocalUrl,
  latestPreviewOf,
  loadableUrlOf,
  previewUrlOf,
  previewUrlOn,
  typedPreviewUrlOf
} from '../previewUrl'

const message = (
  role: ChatMessage['role'],
  text: string,
  uuid = text,
  at: string | null = null
): ChatMessage => ({ uuid, role, at, blocks: [{ type: 'text', text }] })

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
      messageId: 'a2',
      at: null
    })
  })

  it('should carry the time of the answer', () => {
    const messages = [
      message('assistant', 'http://localhost:5173/', 'a1', '2026-11-25T10:00:00.000Z')
    ]
    expect(latestPreviewOf(messages)?.at).toBe(Date.parse('2026-11-25T10:00:00.000Z'))
  })

  it('should not take a host that only starts with localhost', () => {
    const messages = [message('assistant', 'Siehe http://localhost.example.com/x')]
    expect(latestPreviewOf(messages)).toBeNull()
  })

  it('should find the any-address a server prints', () => {
    const messages = [message('assistant', 'Uvicorn running on http://0.0.0.0:8000 (CTRL+C)')]
    expect(latestPreviewOf(messages)?.url).toBe('http://0.0.0.0:8000')
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
    expect(latestPreviewOf(messages)).toEqual({
      url: 'http://localhost:5173/',
      messageId: 'a1',
      at: null
    })
  })

  it('should give null without any local address', () => {
    expect(latestPreviewOf([message('assistant', 'Fertig.')])).toBeNull()
  })
})

describe('previewUrlOf', () => {
  const typed = { url: 'http://localhost:5173/b', detectedIn: 'a1' }

  it('should show the detected address while nothing was typed', () => {
    const detected = { url: 'http://localhost:5173/a', messageId: 'a1', at: null }
    expect(previewUrlOf(undefined, detected)).toBe('http://localhost:5173/a')
  })

  it('should keep the typed address while Claude sends no newer answer with one', () => {
    const detected = { url: 'http://localhost:5173/a', messageId: 'a1', at: null }
    expect(previewUrlOf(typed, detected)).toBe('http://localhost:5173/b')
  })

  it('should let a newer answer replace the typed address', () => {
    const detected = { url: 'http://localhost:5173/c', messageId: 'a2', at: null }
    expect(previewUrlOf(typed, detected)).toBe('http://localhost:5173/c')
  })

  it('should let a newer answer win even when it names the same address again', () => {
    const detected = { url: 'http://localhost:5173/a', messageId: 'a2', at: null }
    expect(previewUrlOf(typed, detected)).toBe('http://localhost:5173/a')
  })

  it('should keep the typed address while the history is not loaded yet', () => {
    expect(previewUrlOf(typed, null)).toBe('http://localhost:5173/b')
  })

  it('should keep an address typed before the history loaded an older answer', () => {
    const early = { url: 'http://localhost:5173/b', detectedIn: null, savedAt: 2000 }
    const older = { url: 'http://localhost:5173/a', messageId: 'a1', at: 1000 }
    expect(previewUrlOf(early, older)).toBe('http://localhost:5173/b')
  })

  it('should let an answer after the typed address win', () => {
    const early = { url: 'http://localhost:5173/b', detectedIn: null, savedAt: 2000 }
    const later = { url: 'http://localhost:5173/c', messageId: 'a2', at: 3000 }
    expect(previewUrlOf(early, later)).toBe('http://localhost:5173/c')
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

describe('loadableUrlOf', () => {
  it('should load the any-address of this machine as localhost', () => {
    expect([loadableUrlOf('http://0.0.0.0:8000/docs'), loadableUrlOf('http://[::]:3000/')]).toEqual(
      ['http://localhost:8000/docs', 'http://localhost:3000/']
    )
  })

  it('should leave localhost and 127.0.0.1 alone', () => {
    expect(loadableUrlOf('http://127.0.0.1:5173/x')).toBe('http://127.0.0.1:5173/x')
  })
})

describe('frameSandboxOf', () => {
  it('should let a page from another origin keep its origin', () => {
    expect(frameSandboxOf('http://localhost:5173/', 'http://tauri.localhost')).toBe(
      'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads'
    )
  })

  it("should take the origin from a page served from Bull's own origin", () => {
    expect(frameSandboxOf('http://localhost:1460/x', 'http://localhost:1460')).toBe(
      'allow-scripts allow-forms allow-modals allow-downloads'
    )
  })
})
