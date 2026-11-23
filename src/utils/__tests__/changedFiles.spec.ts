import { describe, expect, it } from 'vitest'
import type { Block, ChatMessage, PatchHunk } from '@/types/agentd.type'
import { changedFilesOf, type ChangeSource } from '../changedFiles'

const message = (blocks: Block[], at: string | null = null): ChatMessage => ({
  uuid: 'm',
  role: 'assistant',
  at,
  blocks
})
const edit = (id: string, path: string): Block => ({
  type: 'tool_use',
  id,
  name: 'Edit',
  input: { file_path: path, old_string: 'a', new_string: 'b\nc' }
})
const result = (id: string, isError = false, patch?: PatchHunk[]): Block => ({
  type: 'tool_result',
  tool_use_id: id,
  is_error: isError,
  content: [],
  patch
})
const chat = (messages: ChatMessage[]): ChangeSource => ({ messages, cardId: null })

describe('changedFilesOf', () => {
  it('should sum every change to one file', () => {
    const [file] = changedFilesOf([
      chat([
        message([edit('1', '/x/a.ts'), edit('2', '/x/a.ts')]),
        message([result('1'), result('2')])
      ])
    ])

    expect([file?.added, file?.removed]).toEqual([4, 2])
  })

  it('should keep every change as hunks for the review, oldest first', () => {
    const patch = [{ old_start: 7, new_start: 7, lines: ['-a', '+b'] }]
    const [file] = changedFilesOf([
      chat([
        message([edit('1', '/x/a.ts'), edit('2', '/x/a.ts')]),
        message([result('1'), result('2', false, patch)])
      ])
    ])

    expect(file?.hunks).toEqual([
      { old_start: null, new_start: null, lines: ['-a', '+b', '+c'] },
      { old_start: 7, new_start: 7, lines: ['-a', '+b'] }
    ])
  })

  it('should put the latest changed file first', () => {
    const files = changedFilesOf([
      chat([
        message([edit('1', '/x/a.ts'), edit('2', '/x/b.ts'), edit('3', '/x/a.ts')]),
        message([result('1'), result('2'), result('3')])
      ])
    ])

    expect(files.map((file) => file.name)).toEqual(['a.ts', 'b.ts'])
  })

  it('should keep the first spelling of a Windows path written another way', () => {
    const files = changedFilesOf([
      chat([
        message([edit('1', 'C:\\app\\src\\a.ts'), edit('2', 'c:/app/src/A.ts')]),
        message([result('1'), result('2')])
      ])
    ])

    expect(files.map(({ key, name, folder }) => ({ key, name, folder }))).toEqual([
      { key: 'c:/app/src/a.ts', name: 'a.ts', folder: 'src' }
    ])
  })

  it('should count from the patch when Claude Code sent one', () => {
    const [file] = changedFilesOf([
      chat([
        message([edit('1', '/x/a.ts')]),
        message([
          result('1', false, [{ old_start: 4, new_start: 4, lines: [' k', '-a', '-b', '+c'] }])
        ])
      ])
    ])

    expect([file?.added, file?.removed]).toEqual([1, 2])
  })

  it('should leave out failed calls', () => {
    expect(
      changedFilesOf([chat([message([edit('1', '/x/a.ts')]), message([result('1', true)])])])
    ).toEqual([])
  })

  it('should leave out calls still waiting for their result', () => {
    expect(changedFilesOf([chat([message([edit('1', '/x/a.ts')])])])).toEqual([])
  })

  it('should point a subagent change at the Agent call and order it by time', () => {
    const files = changedFilesOf([
      chat([message([edit('1', '/x/a.ts')], '2026-11-21T10:00:00Z'), message([result('1')])]),
      {
        messages: [message([edit('9', '/x/b.ts')], '2026-11-21T11:00:00Z'), message([result('9')])],
        cardId: 'agent-call'
      }
    ])

    expect(files.map(({ name, cardId }) => ({ name, cardId }))).toEqual([
      { name: 'b.ts', cardId: 'agent-call' },
      { name: 'a.ts', cardId: '1' }
    ])
  })
})
