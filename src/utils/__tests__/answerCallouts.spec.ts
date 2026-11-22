import { describe, expect, it } from 'vitest'
import { latestAnswerOf, notificationTextOf, openItemsOf, openQuestionOf } from '../answerCallouts'

describe('notificationTextOf', () => {
  it('should turn markdown into one plain line', () => {
    expect(notificationTextOf('Soll ich **`src/old`** löschen?\nSiehe [Plan](./plan.md).')).toBe(
      'Soll ich src/old löschen? Siehe Plan.'
    )
  })

  it('should cut a long question at a word', () => {
    const text = notificationTextOf(`${'Wort '.repeat(40)}Ende`)
    expect([text.length <= 142, text.endsWith('Wort …')]).toEqual([true, true])
  })
})
import { newTab, type ChatTabState } from '../chatTab'
import type { ChatMessage } from '@/types/agentd.type'

const message = (uuid: string, role: ChatMessage['role'], text: string): ChatMessage => ({
  uuid,
  role,
  at: null,
  blocks: [{ type: 'text', text }]
})

const tab = (messages: ChatMessage[], fields: Partial<ChatTabState> = {}): ChatTabState => ({
  ...newTab({
    id: 't1',
    title: 't1',
    profile: null,
    account: 'office',
    cwd: 'C:\\me\\dev\\projects\\nexron-chat',
    machine: null,
    sessionId: 's1',
    model: null,
    permissionMode: null,
    isFresh: false
  }),
  status: 'idle',
  messages,
  ...fields
})

const ASKING = 'Erledigt.\n\n> [!question] Braucht dich\n> Soll der Ordner weg?'

describe('latestAnswerOf', () => {
  it('should take the answer that ended the turn', () => {
    const answer = message('a1', 'assistant', 'Fertig.')
    expect(latestAnswerOf(tab([message('u1', 'user', 'Los'), answer]))?.uuid).toBe('a1')
  })

  it('should have none once the user wrote again', () => {
    const messages = [message('a1', 'assistant', ASKING), message('u2', 'user', 'Ja')]
    expect(latestAnswerOf(tab(messages))).toBeNull()
  })

  it('should have none while Claude works', () => {
    expect(latestAnswerOf(tab([message('a1', 'assistant', ASKING)], { status: 'working' }))).toBe(
      null
    )
  })
})

describe('openQuestionOf', () => {
  it('should read the question the last answer ends on', () => {
    expect(openQuestionOf(tab([message('a1', 'assistant', ASKING)]))).toBe('Soll der Ordner weg?')
  })

  it('should find no question inside a code block', () => {
    const text = '```md\n> [!question] Beispiel\n> Und?\n```'
    expect(openQuestionOf(tab([message('a1', 'assistant', text)]))).toBeNull()
  })

  it('should find no question in an answer without one', () => {
    expect(openQuestionOf(tab([message('a1', 'assistant', 'Fertig.')]))).toBeNull()
  })
})

describe('openItemsOf', () => {
  it('should list the open points of every answer, each point once', () => {
    const messages = [
      message('a1', 'assistant', '> [!todo] Offen\n> - Figma nachziehen\n> - Server verteilen'),
      message('u1', 'user', 'Weiter'),
      message('a2', 'assistant', '> [!todo]\n> - Server verteilen\n> - Light Mode prüfen')
    ]
    expect(openItemsOf(messages)).toEqual([
      { text: 'Figma nachziehen', messageId: 'a1' },
      { text: 'Server verteilen', messageId: 'a1' },
      { text: 'Light Mode prüfen', messageId: 'a2' }
    ])
  })

  it('should take a body without a list as one point', () => {
    const messages = [message('a1', 'assistant', '> [!todo] Offen\n> Nicht im Fenster geprüft.')]
    expect(openItemsOf(messages)).toEqual([{ text: 'Nicht im Fenster geprüft.', messageId: 'a1' }])
  })
})
