import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/types/agentd.type'
import { todosOf, turnPlanOf, type TaskCall } from '../todos'

let nextCallId = 0
const call = (
  name: string,
  input: Record<string, unknown>,
  result: string | null = null
): TaskCall => ({
  id: `toolu_${++nextCallId}`,
  name,
  input,
  result
})

describe('todosOf', () => {
  it('should take the list of a TodoWrite as it is', () => {
    const todos = [
      { content: 'Build', status: 'in_progress', activeForm: 'Building' },
      { content: 'Merge', status: 'pending', activeForm: 'Merging' }
    ]
    expect(todosOf([call('TodoWrite', { todos })])).toEqual([
      { id: '1', content: 'Build', status: 'in_progress' },
      { id: '2', content: 'Merge', status: 'pending' }
    ])
  })

  it('should build the list from created and updated tasks', () => {
    const calls = [
      call('TaskCreate', { subject: 'Read file' }, 'Task #1 created successfully: Read file'),
      call('TaskCreate', { subject: 'Fix bug' }, 'Task #2 created successfully: Fix bug'),
      call('TaskUpdate', { taskId: '1', status: 'completed' }),
      call('TaskUpdate', { taskId: '2', status: 'in_progress' })
    ]
    expect(todosOf(calls)).toEqual([
      { id: '1', content: 'Read file', status: 'completed' },
      { id: '2', content: 'Fix bug', status: 'in_progress' }
    ])
  })

  it('should give a task without result its call id, even after a deletion', () => {
    const calls = [
      call('TaskCreate', { subject: 'A' }, 'Task #1 created successfully: A'),
      call('TaskCreate', { subject: 'B' }, 'Task #2 created successfully: B'),
      call('TaskUpdate', { taskId: '1', status: 'deleted' }),
      { id: 'toolu_new', name: 'TaskCreate', input: { subject: 'C' }, result: null }
    ]
    expect(todosOf(calls).map((todo) => todo.id)).toEqual(['2', 'toolu_new'])
  })

  it('should drop a deleted task', () => {
    const calls = [
      call('TaskCreate', { subject: 'Old' }, 'Task #1 created successfully: Old'),
      call('TaskUpdate', { taskId: '1', status: 'deleted' })
    ]
    expect(todosOf(calls)).toEqual([])
  })

  it('should skip TodoWrite entries with an unknown status', () => {
    expect(todosOf([call('TodoWrite', { todos: [{ content: 'X', status: 'blocked' }] })])).toEqual(
      []
    )
  })
})

const callMessage = (id: string, name: string, input: Record<string, unknown>): ChatMessage => ({
  uuid: `a-${id}`,
  role: 'assistant',
  at: null,
  blocks: [{ type: 'tool_use', id, name, input }]
})

const resultMessage = (id: string, text: string): ChatMessage => ({
  uuid: `u-${id}`,
  role: 'user',
  at: null,
  blocks: [
    { type: 'tool_result', tool_use_id: id, is_error: false, content: [{ type: 'text', text }] }
  ]
})

describe('turnPlanOf', () => {
  const earlier = [
    callMessage('c1', 'TaskCreate', { subject: 'Build' }),
    resultMessage('c1', 'Task #1 created successfully: Build'),
    callMessage('c2', 'TaskCreate', { subject: 'Merge' }),
    resultMessage('c2', 'Task #2 created successfully: Merge')
  ]

  it('should show the whole list when the turn updated a task of an earlier turn', () => {
    const turn = [callMessage('c3', 'TaskUpdate', { taskId: '1', status: 'completed' })]
    expect(turnPlanOf([...earlier, ...turn], turn)).toEqual([
      { id: '1', content: 'Build', status: 'completed' },
      { id: '2', content: 'Merge', status: 'pending' }
    ])
  })

  it('should show nothing when the turn never wrote to the list', () => {
    const turn = [callMessage('c4', 'TaskList', {})]
    expect(turnPlanOf([...earlier, ...turn], turn)).toEqual([])
  })
})
