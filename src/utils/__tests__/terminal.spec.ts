import { describe, expect, it } from 'vitest'
import {
  controlCharOf,
  fontSizeOf,
  resolveShell,
  startupInputOf,
  terminalThemeOf
} from '../terminal'

describe('resolveShell', () => {
  it('should take the shell from the settings when it is installed', () => {
    expect(resolveShell('cmd', ['pwsh', 'powershell', 'cmd'])).toBe('cmd')
  })

  it('should fall back to PowerShell 7 when the picked shell is missing', () => {
    expect(resolveShell('bash', ['pwsh', 'powershell', 'cmd'])).toBe('pwsh')
  })

  it('should fall back to Windows PowerShell without PowerShell 7', () => {
    expect(resolveShell('auto', ['powershell', 'cmd'])).toBe('powershell')
  })

  it('should take PowerShell 7 on automatic when it is installed', () => {
    expect(resolveShell('auto', ['pwsh', 'powershell', 'cmd'])).toBe('pwsh')
  })
})

describe('fontSizeOf', () => {
  it('should read numbers and numeric strings', () => {
    expect([fontSizeOf(15), fontSizeOf('12')]).toEqual([15, 12])
  })

  it('should keep the size readable and fall back on garbage', () => {
    expect([fontSizeOf(2), fontSizeOf(99), fontSizeOf('big'), fontSizeOf(null)]).toEqual([
      8, 32, 13, 13
    ])
  })
})

describe('terminalThemeOf', () => {
  const TOKENS: Record<string, string> = {
    '--background': '#0e0e0f',
    '--foreground': '#f0efec',
    '--muted-foreground': '#8e8d84',
    '--subtle': '#c3c2b7',
    '--input': '#3a3a3b',
    '--critical': '#e05252',
    '--good': '#0ca30c',
    '--warning': '#fab219',
    '--brand': '#4d7cff',
    '--act-read': '#7f9bc4',
    '--act-change': '#9085e9',
    '--act-outside': '#1fa9bd'
  }
  const read = (token: string) => TOKENS[token] ?? ''

  it('should map the ANSI colours onto the palette', () => {
    const theme = terminalThemeOf(read, true)
    expect([theme.red, theme.green, theme.yellow, theme.blue, theme.magenta, theme.cyan]).toEqual([
      '#e05252',
      '#0ca30c',
      '#fab219',
      '#4d7cff',
      '#9085e9',
      '#1fa9bd'
    ])
    expect([theme.brightBlue, theme.brightBlack]).toEqual(['#7f9bc4', '#8e8d84'])
  })

  it('should use the page background and a see-through brand selection', () => {
    const theme = terminalThemeOf(read, true)
    expect([theme.background, theme.cursor, theme.selectionBackground]).toEqual([
      '#0e0e0f',
      '#f0efec',
      '#4d7cff59'
    ])
  })

  it('should keep white readable on the light background', () => {
    const theme = terminalThemeOf(read, false)
    expect([theme.black, theme.white, theme.brightWhite]).toEqual(['#f0efec', '#8e8d84', '#c3c2b7'])
  })
})

describe('startupInputOf', () => {
  /** Typed before a draft in PowerShell, whose grey history guess would follow the draft. */
  const NO_PREDICTION =
    "if ('PredictionSource' -in (Get-Command Set-PSReadLineOption -ErrorAction Ignore).Parameters.Keys) { Set-PSReadLineOption -PredictionSource None }\r"

  it('should type only the command on this machine', () => {
    expect(
      startupInputOf(
        {
          machine: null,
          cwd: 'C:\\x',
          command: 'claude /login',
          env: { CLAUDE_CONFIG_DIR: 'C:\\a' }
        },
        'pwsh'
      )
    ).toBe('claude /login\r')
  })

  it('should set the environment and the folder on another machine first', () => {
    expect(
      startupInputOf(
        {
          machine: 'nexron-server',
          cwd: 'C:\\Users\\me\\$work',
          command: 'claude /login',
          env: { CLAUDE_CONFIG_DIR: "C:\\Users\\me\\.claude-o'neil" }
        },
        'pwsh'
      )
    ).toBe(
      "$env:CLAUDE_CONFIG_DIR = 'C:\\Users\\me\\.claude-o''neil'\r" +
        "cd 'C:\\Users\\me\\$work'\r" +
        'claude /login\r'
    )
  })

  it('should turn off the history guess on another machine, whatever shell is picked here', () => {
    expect(
      startupInputOf(
        {
          machine: 'nexron-server',
          cwd: 'C:\\work',
          command: 'claude mcp add --help',
          draft: 'claude mcp add --scope user ',
          env: {}
        },
        'cmd'
      )
    ).toBe(
      "cd 'C:\\work'\r" + NO_PREDICTION + 'claude mcp add --help\rclaude mcp add --scope user '
    )
  })

  it('should turn off the history guess for a draft in PowerShell on this machine', () => {
    const request = { machine: null, cwd: 'C:\\work', draft: 'claude mcp add ' }

    expect(startupInputOf(request, 'pwsh')).toBe(NO_PREDICTION + 'claude mcp add ')
    expect(startupInputOf(request, 'powershell')).toBe(NO_PREDICTION + 'claude mcp add ')
  })

  it('should leave other shells and terminals without a draft as they are', () => {
    const request = { machine: null, cwd: 'C:\\work', draft: 'claude mcp add ' }

    expect(startupInputOf(request, 'cmd')).toBe('claude mcp add ')
    expect(startupInputOf(request, 'bash')).toBe('claude mcp add ')
    expect(startupInputOf({ machine: null, cwd: '', command: 'claude' }, 'pwsh')).toBe('claude\r')
  })

  it('should type nothing for a plain terminal', () => {
    expect(startupInputOf({ machine: 'nexron-server', cwd: '' }, 'pwsh')).toBe('')
  })
})

describe('controlCharOf', () => {
  it('should turn letters and brackets into control characters', () => {
    expect([controlCharOf('c'), controlCharOf('D'), controlCharOf('[')]).toEqual([
      '\x03',
      '\x04',
      '\x1b'
    ])
  })

  it('should leave other characters alone', () => {
    expect([controlCharOf('1'), controlCharOf('ab')]).toEqual(['1', 'ab'])
  })
})
