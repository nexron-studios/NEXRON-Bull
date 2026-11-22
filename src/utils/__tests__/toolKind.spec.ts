import { describe, expect, it } from 'vitest'
import { compactPath, isTaskTool, shortTarget, toolInfoOf } from '../toolKind'

describe('toolInfoOf', () => {
  it('should give colour, activity and icon of a known tool', () => {
    expect(toolInfoOf('Grep')).toEqual({ kind: 'read', activity: 'searches', icon: 'search' })
  })

  it('should treat every task tool as planning', () => {
    expect(['TodoWrite', 'TaskCreate', 'TaskUpdate'].map((name) => toolInfoOf(name))).toEqual([
      { kind: 'change', activity: 'plans', icon: 'tasks' },
      { kind: 'change', activity: 'plans', icon: 'tasks' },
      { kind: 'change', activity: 'plans', icon: 'tasks' }
    ])
  })

  it('should fall back to a plug for MCP tools and a wrench for unknown ones', () => {
    expect([toolInfoOf('mcp__figma__get').icon, toolInfoOf('Skill').icon]).toEqual([
      'plug',
      'wrench'
    ])
  })
})

describe('isTaskTool', () => {
  it('should know the plan tools and nothing else', () => {
    expect(['TaskList', 'TodoWrite', 'Edit'].map(isTaskTool)).toEqual([true, true, false])
  })
})

describe('shortTarget', () => {
  it('should shorten a path to its file name', () => {
    expect(shortTarget('C:\\dev\\src\\CalendarWeek.vue')).toBe('CalendarWeek.vue')
  })

  it('should keep a command with slashes as it is', () => {
    expect(shortTarget('npm run build && npx vitest src/a')).toBe(
      'npm run build && npx vitest src/a'
    )
  })
})

describe('compactPath', () => {
  it('should keep the last three parts of a long path', () => {
    expect(compactPath('C:\\Users\\Home\\dev\\bull\\src\\App.vue')).toBe('…\\bull\\src\\App.vue')
  })

  it('should leave a short path and a command alone', () => {
    expect([compactPath('src/App.vue'), compactPath('npm test -- src/a/b/c')]).toEqual([
      'src/App.vue',
      'npm test -- src/a/b/c'
    ])
  })
})
