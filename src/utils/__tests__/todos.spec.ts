import { describe, expect, it } from 'vitest'
import { todosOf, type TaskCall } from '../todos'

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
