import { describe, expect, it } from 'vitest'
import { draftWithUnsent, isHeldWhile, pendingMessageOf, withoutEchoed } from '../pendingPrompts'
import type { ChatMessage } from '@/types/agentd.type'
import type { PendingImage } from '@/utils/content'
import { IMAGE_REF_SLOTS, imageRefFormatOf } from '@/utils/imageRefs'

const FORMAT = imageRefFormatOf(`[Bild ${IMAGE_REF_SLOTS.n} (${IMAGE_REF_SLOTS.name})]`)

const NOW = Date.parse('2026-11-15T20:00:00Z')

/** As the composer renders a reference: no line break inside, so no-break spaces and hyphens. */
const unbroken = (text: string) =>
  text.replace(/\[[^\]]*\]/g, (token) => token.replaceAll(' ', '\u00a0').replaceAll('-', '\u2011'))

const echo = (uuid: string, blocks: ChatMessage['blocks']): ChatMessage => ({
  uuid,
  role: 'user',
  at: null,
  blocks
})

const pendingText = (id: string, text: string) =>
  pendingMessageOf([{ type: 'text', text }], id, NOW, false)

const image: PendingImage = {
  id: 'i1',
  name: 'shot.png',
  mediaType: 'image/png',
  data: 'iVBOR',
  src: 'data:image/png;base64,iVBOR',
  bytes: 4
}

describe('pendingMessageOf', () => {
  it('should show text and images the way agentd parses the echo', () => {
    const content = [
      {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: 'image/png', data: 'iVBOR' }
      },
      { type: 'text' as const, text: 'Which colour?' }
    ]
    expect(pendingMessageOf(content, 'x1', NOW, false)).toEqual({
      uuid: 'pending:x1',
      role: 'user',
      at: '2026-11-15T20:00:00.000Z',
      blocks: [
        { type: 'image', media_type: 'image/png', data: 'iVBOR' },
        { type: 'text', text: 'Which colour?' }
      ]
    })
  })

  it('should mark a prompt sent after Claude replied in the turn as mid-turn', () => {
    expect(pendingMessageOf([{ type: 'text', text: 'Also the footer' }], 'x2', NOW, true)).toEqual({
      uuid: 'pending:x2',
      role: 'user',
      at: '2026-11-15T20:00:00.000Z',
      blocks: [{ type: 'text', text: 'Also the footer' }],
      is_mid_turn: true
    })
  })
})

describe('withoutEchoed', () => {
  const first = pendingText('a', 'first')
  const second = pendingText('b', 'second')
  const third = pendingText('c', '<b>third</b>')

  it('should drop the pending prompt with the same text as the echo', () => {
    expect(withoutEchoed([first], echo('u1', [{ type: 'text', text: 'first\n' }]))).toEqual([])
  })

  it('should drop every prompt Claude took into one echo', () => {
    const batch = echo('u2', [
      { type: 'text', text: 'first\n' },
      { type: 'text', text: 'second' }
    ])
    expect(withoutEchoed([first, second, third], batch)).toEqual([third])
  })

  it('should drop older prompts still waiting, Claude takes them in order', () => {
    expect(withoutEchoed([first, second], echo('u3', [{ type: 'text', text: 'second' }]))).toEqual(
      []
    )
  })

  it('should match a slash command Claude turned into a command block', () => {
    const compact = pendingText('d', '/compact keep the plan')
    const command = echo('u4', [{ type: 'command', name: '/compact', args: 'keep the plan' }])
    expect(withoutEchoed([compact, first], command)).toEqual([first])
  })

  it('should keep every prompt for a user line that matches none of them', () => {
    const other = echo('u5', [{ type: 'text', text: 'something else' }])
    const result = echo('u6', [
      { type: 'tool_result', tool_use_id: 't1', is_error: false, content: [] }
    ])
    const interrupted = echo('u7', [{ type: 'interrupted' }])
    for (const line of [other, result, interrupted])
      expect(withoutEchoed([first, second], line)).toEqual([first, second])
  })

  it('should not take a text-only echo for a prompt with an image', () => {
    const withImage = pendingMessageOf(
      [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'iVBOR' }
        },
        { type: 'text', text: 'first' }
      ],
      'e',
      NOW,
      false
    )
    expect(withoutEchoed([withImage], echo('u8', [{ type: 'text', text: 'first' }]))).toEqual([
      withImage
    ])
  })
})

describe('draftWithUnsent', () => {
  it('should put unsent prompts back in front of what is typed now', () => {
    const draft = { text: 'new idea', images: [] }
    const unsent = [
      { text: 'first', images: [image] },
      { text: 'second', images: [] }
    ]
    expect(draftWithUnsent(draft, unsent, FORMAT)).toEqual({
      text: 'first\n\nsecond\n\nnew idea',
      images: [image]
    })
  })

  it('should number the image references of every part after the images in front of it', () => {
    const later = { ...image, id: 'i2', name: 'later.png' }
    const draft = { text: 'see [Bild 1 (later.png)]', images: [later] }
    const unsent = [{ text: '[Bild 1 (shot.png)] broken', images: [image] }]
    expect(draftWithUnsent(draft, unsent, FORMAT).text).toBe(
      unbroken('[Bild 1 (shot.png)] broken\n\nsee [Bild 2 (later.png)]')
    )
  })
})

describe('isHeldWhile', () => {
  it.each([
    ['a message while Claude works', 'working', 'and check light mode', 'afterTurn', true],
    [
      'a message while Claude waits for an approval',
      'asking',
      'and check light mode',
      'afterTurn',
      true
    ],
    [
      'a message sent into the turn while Claude works',
      'working',
      'and check light mode',
      'intoTurn',
      false
    ],
    [
      'a message sent into the turn during an approval',
      'asking',
      'and check light mode',
      'intoTurn',
      false
    ],
    ['a slash command while Claude works', 'working', '/review', 'afterTurn', true],
    ['a slash command sent into the turn', 'working', '/review', 'intoTurn', true],
    ['a slash command once Claude is done', 'idle', '/review', 'afterTurn', false],
    ['a message once Claude is done', 'idle', 'and check light mode', 'afterTurn', false],
    [
      'a message sent into the turn once Claude is done',
      'idle',
      'and check light mode',
      'intoTurn',
      false
    ],
    ['a message while Claude starts', 'starting', 'and check light mode', 'afterTurn', false]
  ] as const)('should decide for %s', (_, status, text, delivery, expected) => {
    expect(isHeldWhile(status, text, delivery)).toBe(expected)
  })
})
