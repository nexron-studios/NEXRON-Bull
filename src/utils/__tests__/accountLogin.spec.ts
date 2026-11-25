import { describe, expect, it } from 'vitest'
import {
  connectorLoginRequestOf,
  connectorSetupRequestOf,
  loginCommandLineOf,
  loginRequestOf
} from '../accountLogin'

const fresh = { label: 'kunde-x', dir: 'C:\\Users\\Home\\.claude-kunde-x', email: null }
const standard = { label: 'default', dir: 'C:\\Users\\Home\\.claude', email: null }

describe('loginRequestOf', () => {
  it('should open the login in the home folder with the profile folder set', () => {
    expect(loginRequestOf('nexron-server', fresh, 'Anmelden: kunde-x')).toEqual({
      machine: 'nexron-server',
      cwd: 'C:\\Users\\Home',
      command: 'claude /login',
      env: { CLAUDE_CONFIG_DIR: 'C:\\Users\\Home\\.claude-kunde-x' },
      title: 'Anmelden: kunde-x'
    })
  })

  it('should log the default profile in without CLAUDE_CONFIG_DIR', () => {
    expect(loginRequestOf(null, standard, 'Anmelden: default').env).toEqual({})
  })
})

describe('loginCommandLineOf', () => {
  it('should set the profile folder for PowerShell before logging in', () => {
    expect(loginCommandLineOf(fresh, 'windows')).toBe(
      "$env:CLAUDE_CONFIG_DIR = 'C:\\Users\\Home\\.claude-kunde-x'; claude /login"
    )
  })

  it('should double a quote in the folder so PowerShell reads one string', () => {
    const quoted = { ...fresh, dir: "C:/Users/O'Brien/.claude-kunde-x" }

    expect(loginCommandLineOf(quoted, 'windows')).toBe(
      "$env:CLAUDE_CONFIG_DIR = 'C:/Users/O''Brien/.claude-kunde-x'; claude /login"
    )
  })

  it('should set the profile folder in front of the command for a macOS or Linux shell', () => {
    const onMac = { ...fresh, dir: '/Users/home/.claude-kunde-x' }

    expect([loginCommandLineOf(onMac, 'macos'), loginCommandLineOf(onMac, 'linux')]).toEqual([
      "CLAUDE_CONFIG_DIR='/Users/home/.claude-kunde-x' claude /login",
      "CLAUDE_CONFIG_DIR='/Users/home/.claude-kunde-x' claude /login"
    ])
  })

  it('should escape a quote in the folder so a POSIX shell reads one string', () => {
    const quoted = { ...fresh, dir: "/Users/o'brien/.claude-kunde-x" }

    expect(loginCommandLineOf(quoted, 'macos')).toBe(
      "CLAUDE_CONFIG_DIR='/Users/o'\\''brien/.claude-kunde-x' claude /login"
    )
  })

  it('should log the default profile in with the bare command', () => {
    expect(loginCommandLineOf(standard, 'windows')).toBe('claude /login')
  })
})

describe('connectorLoginRequestOf', () => {
  it('should open /mcp in the chat folder with the account of the chat', () => {
    const tab = {
      machine: 'nexron-server',
      cwd: 'C:/work',
      profile: 'C:/Users/x/.claude-work',
      account: 'work'
    }
    expect(connectorLoginRequestOf(tab, 'Bei Notion anmelden')).toEqual({
      machine: 'nexron-server',
      cwd: 'C:/work',
      command: 'claude /mcp',
      env: { CLAUDE_CONFIG_DIR: 'C:/Users/x/.claude-work' },
      title: 'Bei Notion anmelden'
    })
  })

  it('should leave the config folder unset for the default profile', () => {
    const tab = { machine: null, cwd: 'C:/work', profile: 'C:/Users/x/.claude', account: 'default' }
    expect(connectorLoginRequestOf(tab, 'x').env).toEqual({})
  })
})

describe('connectorSetupRequestOf', () => {
  it('should leave the add command for the account unsent on the prompt of the chat', () => {
    const tab = {
      machine: 'nexron-server',
      cwd: 'C:/work',
      profile: 'C:/Users/x/.claude-work',
      account: 'work'
    }
    expect(connectorSetupRequestOf(tab, 'MCP-Server einrichten')).toEqual({
      machine: 'nexron-server',
      cwd: 'C:/work',
      draft: 'claude mcp add --scope user ',
      env: { CLAUDE_CONFIG_DIR: 'C:/Users/x/.claude-work' },
      title: 'MCP-Server einrichten'
    })
  })

  it('should leave the config folder unset for the default profile', () => {
    const tab = { machine: null, cwd: 'C:/work', profile: 'C:/Users/x/.claude', account: 'default' }
    expect(connectorSetupRequestOf(tab, 'x').env).toEqual({})
  })
})
