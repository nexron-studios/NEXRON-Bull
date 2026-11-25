import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentdEvent, AgentdRequest, PromptBlock } from '@/types/agentd.type'
import { newTab, type ChatTabState } from '@/utils/chatTab'
import type { MarkNote } from '@/utils/markup'
import { useChatStore } from '../chat'
import { useDraftStore } from '../drafts'
import { useHeldPromptsStore } from '../heldPrompts'
import { useShellRunsStore } from '../shellRuns'
import { useSlashCommandsStore } from '../slashCommands'

const { listeners, send, ask } = vi.hoisted(() => ({
  listeners: [] as ((event: AgentdEvent) => void)[],
  send: vi.fn((_message: AgentdRequest) => Promise.resolve()),
  ask: vi.fn()
}))

vi.mock('@/api/services/agentd.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/services/agentd.service')>()),
  agentdService: {
    send,
    ask,
    waitFor: vi.fn(),
    onEvent: (listener: (event: AgentdEvent) => void) => {
      listeners.push(listener)
      return () => {}
    },
    onReady: () => () => {}
  }
}))

const emit = (event: AgentdEvent) => listeners.forEach((listener) => listener(event))

const openTab = (status: ChatTabState['status']) => {
  const chat = useChatStore()
  const tab = newTab({
    id: 't1',
    title: 'Chat',
    profile: null,
    account: 'work',
    cwd: 'C:\\work\\app',
    machine: null,
    sessionId: 's1',
    model: null,
    permissionMode: null,
    isFresh: false
  })
  chat.tabs = [{ ...tab, status, history: 'loaded' }]
  return chat
}

const sentContents = () =>
  send.mock.calls.flatMap(([message]) => (message.op === 'send' ? [message.content] : []))

describe('useChatStore with the composer', () => {
  beforeEach(() => {
    listeners.length = 0
    send.mockClear()
    ask.mockReset()
    setActivePinia(createPinia())
  })

  it('should hold a message typed while Claude works and send it once the turn ends', () => {
    const chat = openTab('working')

    chat.send('t1', 'and check light mode', [])
    expect(sentContents()).toEqual([])
    expect(
      useHeldPromptsStore()
        .heldOf('t1')
        .map((prompt) => prompt.text)
    ).toEqual(['and check light mode'])

    emit({ type: 'claude', tab: 't1', event: { type: 'result', subtype: 'success', result: '' } })
    expect(sentContents()).toEqual([[{ type: 'text', text: 'and check light mode' }]])
    expect(useHeldPromptsStore().heldOf('t1')).toEqual([])
  })

  it('should put held messages back into the composer when Claude is stopped', () => {
    const chat = openTab('working')
    useDraftStore().draftOf('t1').text = 'half typed'

    chat.send('t1', 'held one', [])
    void chat.interrupt('t1')

    expect(useDraftStore().draftOf('t1').text).toBe('held one\n\nhalf typed')
    expect(useHeldPromptsStore().heldOf('t1')).toEqual([])
  })

  it('should take a prompt back into the composer when stopped before Claude started', () => {
    const chat = openTab('starting')

    chat.send('t1', 'check the week view', [])
    void chat.interrupt('t1')

    expect(chat.hasQueued('t1')).toBe(false)
    expect(useDraftStore().draftOf('t1').text).toBe('check the week view')
    expect(send.mock.calls.map(([message]) => message.op)).toEqual([])
  })

  it('should take a queued command back into the composer when stopped before Claude started', () => {
    const chat = openTab('starting')

    chat.sendCommand('t1', '/compact keep the API notes')
    void chat.interrupt('t1')

    expect(chat.hasQueued('t1')).toBe(false)
    expect(useDraftStore().draftOf('t1').text).toBe('/compact keep the API notes')
  })

  it('should give queued prompts and commands back in the order they were sent', () => {
    const chat = openTab('starting')

    chat.send('t1', 'check the week view', [])
    chat.sendCommand('t1', '/compact keep the API notes')
    chat.send('t1', 'then the month view', [])
    void chat.interrupt('t1')

    expect(useDraftStore().draftOf('t1').text).toBe(
      'check the week view\n\n/compact keep the API notes\n\nthen the month view'
    )
  })

  it('should send finished shell commands in front of the next prompt', async () => {
    const chat = openTab('idle')
    ask.mockResolvedValue({
      type: 'shell_result',
      id: 1,
      stdout: ' M app.ts\n',
      stderr: '',
      code: 0,
      duration_ms: 300,
      is_timed_out: false
    })
    await useShellRunsStore().start(chat.tabs[0] as ChatTabState, 'git status --short')
    expect(ask).toHaveBeenCalledWith(
      { op: 'run_shell', cwd: 'C:\\work\\app', command: 'git status --short' },
      null,
      150_000
    )

    chat.send('t1', 'commit that', [])

    expect(sentContents()).toEqual([
      [
        { type: 'text', text: '<bash-input>git status --short</bash-input>' },
        { type: 'text', text: '<bash-stdout> M app.ts\n</bash-stdout><bash-stderr></bash-stderr>' },
        { type: 'text', text: 'commit that' }
      ]
    ])
    expect(useShellRunsStore().runsOf('t1')).toEqual([])
    expect(chat.tabs[0]?.pending[0]?.blocks.map((block) => block.type)).toEqual([
      'shell',
      'shell_output',
      'text'
    ])
  })

  it('should show a prompt with shell output as sent once Claude answers, without an echo', async () => {
    const chat = openTab('idle')
    ask.mockResolvedValue({
      type: 'shell_result',
      id: 1,
      stdout: 'clean',
      stderr: '',
      code: 0,
      duration_ms: 100,
      is_timed_out: false
    })
    await useShellRunsStore().start(chat.tabs[0] as ChatTabState, 'git status')
    chat.send('t1', 'commit it', [])

    emit({
      type: 'message',
      tab: 't1',
      message: { uuid: 'a1', role: 'assistant', at: null, blocks: [{ type: 'text', text: 'ok' }] }
    })

    const tab = chat.tabs[0]
    expect(tab?.pending).toEqual([])
    expect(tab?.messages.map((message) => message.blocks.map((block) => block.type))).toEqual([
      ['shell', 'shell_output', 'text'],
      ['text']
    ])
  })

  it('should give the shell output back to the chat when the prompt never left', async () => {
    const chat = openTab('idle')
    ask.mockResolvedValue({
      type: 'shell_result',
      id: 1,
      stdout: 'clean',
      stderr: '',
      code: 0,
      duration_ms: 100,
      is_timed_out: false
    })
    await useShellRunsStore().start(chat.tabs[0] as ChatTabState, 'git status')
    send.mockRejectedValueOnce(new Error('connection lost'))

    chat.send('t1', 'commit it', [])
    await vi.waitFor(() => expect(chat.tabs[0]?.pending).toEqual([]))

    expect(
      useShellRunsStore()
        .runsOf('t1')
        .map((run) => [run.command, run.state])
    ).toEqual([['git status', 'done']])
    expect(useDraftStore().draftOf('t1').text).toBe('commit it')
  })

  it('should keep a failed shell command out of the prompt and show why', async () => {
    const chat = openTab('idle')
    ask.mockRejectedValue(new Error('folder C:\\gone not found'))
    await useShellRunsStore().start(chat.tabs[0] as ChatTabState, 'ls')

    chat.send('t1', 'next', [])

    expect(sentContents()).toEqual([[{ type: 'text', text: 'next' }]])
    expect(
      useShellRunsStore()
        .runsOf('t1')
        .map((run) => [run.state, run.error])
    ).toEqual([['failed', 'folder C:\\gone not found']])
  })

  it('should remember the commands Claude lists for each tab', () => {
    useChatStore()
    const commands = useSlashCommandsStore()
    const listed = [{ name: 'compact', description: 'Free up context', argument_hint: '' }]

    emit({ type: 'commands', tab: 't1', commands: listed })

    expect(commands.commandsOf('t1')).toEqual(listed)
    expect(commands.commandsOf('t2')).toEqual([])
  })

  it('should run a registered command in the app and give it back when unregistered', () => {
    const commands = useSlashCommandsStore()
    const handler = vi.fn()
    const release = commands.register('export', handler)

    expect(commands.run('t1', 'export', 'now')).toBe(true)
    expect(handler).toHaveBeenCalledWith('t1', 'now')
    release()
    expect(commands.run('t1', 'export', '')).toBe(false)
  })
})

describe('useChatStore with the notes of marked images', () => {
  const note = (number: number, text: string): MarkNote => ({ number, text })
  const noted = (id: string, name: string, notes: MarkNote[]) => ({
    id,
    name,
    mediaType: 'image/png' as const,
    data: 'QUJD',
    src: 'data:image/png;base64,QUJD',
    bytes: 3,
    notes
  })
  const textOf = (content: PromptBlock[]) =>
    content.flatMap((block) => (block.type === 'text' ? [block.text] : []))

  beforeEach(() => {
    listeners.length = 0
    send.mockClear()
    setActivePinia(createPinia())
  })

  it("should write each image's notes in front of the text as the message goes out", () => {
    const chat = openTab('idle')
    const one = noted('a', 'one.png', [note(1, 'bigger'), note(2, 'bluer')])
    const two = noted('b', 'two.png', [])
    const three = noted('c', 'three.png', [note(1, 'smaller')])

    chat.send('t1', 'please crop', [one, two, three])

    expect(sentContents().map(textOf)).toEqual([
      [
        'About [Image 1 (one.png)]: ① bigger ② bluer\nAbout [Image 3 (three.png)]: ① smaller\n\nplease crop'
      ]
    ])
  })

  it('should give a held message back with its notes on the images, not in the text', () => {
    const chat = openTab('working')
    const one = noted('a', 'one.png', [note(1, 'bigger')])

    chat.send('t1', 'please crop', [one])
    void chat.interrupt('t1')

    const draft = useDraftStore().draftOf('t1')
    expect(draft.text).toBe('please crop')
    expect(draft.images.map((image) => image.notes)).toEqual([[note(1, 'bigger')]])
  })

  it('should send a prompt from the history as it was, with no notes added again', () => {
    const chat = openTab('idle')
    const recalled = 'About [Image 1 (one.png)]: ① bigger\n\nplease crop'

    chat.send('t1', recalled, [])

    expect(sentContents().map(textOf)).toEqual([[recalled]])
  })
})
