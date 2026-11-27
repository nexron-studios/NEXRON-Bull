import type { ChatMessage } from '@/types/agentd.type'
import { isTaskTool } from '@/utils/toolKind'
import {
  resultTextOf,
  resultsByToolId,
  type ToolResultBlock,
  type ToolUseBlock
} from '@/utils/toolPairs'

export const todoStatusList = ['pending', 'in_progress', 'completed'] as const
export type TodoStatus = (typeof todoStatusList)[number]

export interface Todo {
  /** Claude Code's task number; the list position for `TodoWrite` lists */
  id: string
  content: string
  status: TodoStatus
}

/** One call of a task tool, with the text of its result once it is there. */
export interface TaskCall {
  /** The tool call's id; a created task goes by it until the result names its number */
  id: string
  name: string
  input: Record<string, unknown>
  result: string | null
}

const DELETED = 'deleted'
const CREATED_ID = /#(\d+)/

const isTodoStatus = (value: unknown): value is TodoStatus =>
  (todoStatusList as readonly unknown[]).includes(value)

const fromTodoWrite = (input: Record<string, unknown>): Todo[] => {
  if (!Array.isArray(input.todos)) return []
  return input.todos.flatMap((entry: unknown, index) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { content, status } = entry as Record<string, unknown>
    if (typeof content !== 'string' || !isTodoStatus(status)) return []
    return [{ id: String(index + 1), content, status }]
  })
}

const created = (todos: Todo[], { id: callId, input, result }: TaskCall): Todo[] => {
  if (typeof input.subject !== 'string') return todos
  // "Task #3 created successfully: …". Until that arrives the call id stands in: it is unique,
  // where a guessed number could collide with a task deleted before.
  const id = CREATED_ID.exec(result ?? '')?.[1] ?? callId
  return [...todos, { id, content: input.subject, status: 'pending' }]
}

const updated = (todos: Todo[], { input }: TaskCall): Todo[] => {
  const id = String(input.taskId ?? '')
  if (input.status === DELETED) return todos.filter((todo) => todo.id !== id)
  return todos.map((todo) =>
    todo.id === id
      ? {
          ...todo,
          status: isTodoStatus(input.status) ? input.status : todo.status,
          content: typeof input.subject === 'string' ? input.subject : todo.content
        }
      : todo
  )
}

/**
 * Claude's plan after these calls, in order; malformed entries are skipped. `TodoWrite` sends
 * the whole list, newer Claude Code versions create and update single tasks instead.
 */
export const todosOf = (calls: TaskCall[]): Todo[] =>
  calls.reduce<Todo[]>((todos, call) => {
    switch (call.name) {
      case 'TodoWrite':
        return fromTodoWrite(call.input)
      case 'TaskCreate':
        return created(todos, call)
      case 'TaskUpdate':
        return updated(todos, call)
      default:
        return todos
    }
  }, [])

/** The task tool calls among these, each with the text of its result once it is there. */
export const taskCallsOf = (
  calls: ToolUseBlock[],
  results: Map<string, ToolResultBlock>
): TaskCall[] =>
  calls
    .filter((call) => isTaskTool(call.name))
    .map(({ id, name, input }) => {
      const result = results.get(id)
      return { id, name, input, result: result ? resultTextOf(result) : null }
    })

const taskCallsIn = (messages: ChatMessage[]): TaskCall[] =>
  taskCallsOf(
    messages
      .flatMap((message) => message.blocks)
      .filter((block): block is ToolUseBlock => block.type === 'tool_use'),
    resultsByToolId(messages)
  )

/** The task tools that change the list; `TaskList` and `TaskGet` only read it. */
const PLAN_WRITES = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate'])

/**
 * The plan of one turn: the session's task list as it stands, but only when the turn wrote to it.
 * A turn that never touched the list would otherwise show the leftovers of an older prompt.
 */
export const turnPlanOf = (chat: ChatMessage[], turn: ChatMessage[]): Todo[] =>
  taskCallsIn(turn).some((call) => PLAN_WRITES.has(call.name)) ? todosOf(taskCallsIn(chat)) : []
