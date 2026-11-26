import { describe, expect, it } from 'vitest'
import { compactPath, isTaskTool, shortTarget, skillIconOf, toolInfoOf } from '../toolKind'

describe('toolInfoOf', () => {
  it('should give colour, activity and icon of a known tool', () => {
    expect(toolInfoOf('Grep')).toEqual({ kind: 'read', activity: 'searches', icon: 'search' })
  })

  it('should mark a skill with its own kind, activity and icon', () => {
    expect(toolInfoOf('Skill')).toEqual({ kind: 'skill', activity: 'applies_skill', icon: 'skill' })
  })

  it('should treat every task tool as planning', () => {
    expect(['TodoWrite', 'TaskCreate', 'TaskUpdate'].map((name) => toolInfoOf(name))).toEqual([
      { kind: 'change', activity: 'plans', icon: 'tasks' },
      { kind: 'change', activity: 'plans', icon: 'tasks' },
      { kind: 'change', activity: 'plans', icon: 'tasks' }
    ])
  })

  it('should fall back to a plug for MCP tools and a wrench for unknown ones', () => {
    expect([toolInfoOf('mcp__figma__get').icon, toolInfoOf('Mystery').icon]).toEqual([
      'plug',
      'wrench'
    ])
  })
})

describe('toolInfoOf for skills', () => {
  it('should give a Skill call the skill colour, activity and the icon of its skill', () => {
    expect(toolInfoOf('Skill', 'code-review')).toEqual({
      kind: 'skill',
      activity: 'applies_skill',
      icon: 'review'
    })
  })

  it('should give a Skill call without a skill name the generic skill icon', () => {
    expect(toolInfoOf('Skill')).toEqual({ kind: 'skill', activity: 'applies_skill', icon: 'skill' })
  })

  it('should ignore the target of every other tool', () => {
    expect(toolInfoOf('Bash', 'code-review')).toEqual({
      kind: 'outside',
      activity: 'runs',
      icon: 'terminal'
    })
  })
})

describe('skillIconOf', () => {
  it('should know the well-known skills', () => {
    expect(
      ['security-review', 'simplify', 'run', 'loop', 'schedule', 'init', 'update-config'].map(
        skillIconOf
      )
    ).toEqual(['security', 'simplify', 'play', 'loop', 'schedule', 'init', 'config'])
  })

  it('should read a plugin skill and a typed command by their bare name', () => {
    expect([skillIconOf('anthropic-skills:security-review'), skillIconOf('/code-review')]).toEqual([
      'security',
      'review'
    ])
  })

  it('should fall back to the generic skill icon for any other skill', () => {
    expect([skillIconOf('anthropic-skills:pdf'), skillIconOf('blender-reel')]).toEqual([
      'skill',
      'skill'
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
