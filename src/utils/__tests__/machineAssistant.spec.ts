import { describe, expect, it } from 'vitest'
import {
  authorizedKeysCommandOf,
  forgetHostKeyCommandOf,
  installStepsOf,
  machineEntryOf,
  machineFormOf,
  machineFormProblemOf,
  oldAgentdFileOf,
  probeActionOf,
  unixAuthorizedKeysCommandOf
} from '../machineAssistant'

const form = (overrides: Partial<Record<'host' | 'user' | 'port' | 'name', string>> = {}) => ({
  host: 'buero-pc',
  user: '',
  port: '',
  name: '',
  ...overrides
})

describe('oldAgentdFileOf', () => {
  it('should name the Windows backup for Windows and for an unknown system', () => {
    expect(oldAgentdFileOf('windows')).toBe('agentd.old.exe')
    expect(oldAgentdFileOf(null)).toBe('agentd.old.exe')
    expect(oldAgentdFileOf(undefined)).toBe('agentd.old.exe')
  })

  it('should name the backup without extension on a Mac and on Linux', () => {
    expect(oldAgentdFileOf('macos')).toBe('agentd.old')
    expect(oldAgentdFileOf('linux')).toBe('agentd.old')
  })
})

describe('probeActionOf', () => {
  it('should offer the install for a machine without a working agentd', () => {
    expect(probeActionOf('no_agentd')).toBe('install')
    expect(probeActionOf('agentd_blocked')).toBe('install')
  })

  it('should send a refused key to the key help and a changed one to forgetting it', () => {
    expect(probeActionOf('auth_failed')).toBe('fix_key')
    expect(probeActionOf('host_key_changed')).toBe('forget_key')
  })

  it('should let a working machine be used and an offline one be checked again', () => {
    expect(probeActionOf('ok')).toBe('add')
    expect(probeActionOf('offline')).toBe('retry')
    expect(probeActionOf('host_key_unknown')).toBe('retry')
    expect(probeActionOf('unsupported_system')).toBe('none')
  })
})

describe('machineFormProblemOf', () => {
  it('should accept a host alone', () => {
    expect(machineFormProblemOf(form(), [])).toBeNull()
  })

  it('should ask for a host and refuse one ssh would read as an option', () => {
    expect(machineFormProblemOf(form({ host: '  ' }), [])).toBe('host_missing')
    expect(machineFormProblemOf(form({ host: '-oProxyCommand=x' }), [])).toBe('host_invalid')
    expect(machineFormProblemOf(form({ host: 'two words' }), [])).toBe('host_invalid')
  })

  it('should refuse a port outside 1 to 65535', () => {
    expect(machineFormProblemOf(form({ port: '0' }), [])).toBe('port')
    expect(machineFormProblemOf(form({ port: '70000' }), [])).toBe('port')
    expect(machineFormProblemOf(form({ port: '22a' }), [])).toBe('port')
    expect(machineFormProblemOf(form({ port: '2222' }), [])).toBeNull()
  })

  it('should refuse a name another machine has, ignoring case, also when it defaults to the host', () => {
    expect(machineFormProblemOf(form({ name: 'Server' }), ['server'])).toBe('name_taken')
    expect(machineFormProblemOf(form({ host: 'nexron-server' }), ['nexron-server'])).toBe(
      'name_taken'
    )
  })
})

describe('machineEntryOf', () => {
  it('should name the machine after its host and leave out empty fields', () => {
    expect(machineEntryOf(form({ host: ' 10.0.0.5 ' }))).toEqual({
      name: '10.0.0.5',
      host: '10.0.0.5'
    })
  })

  it('should keep user, port and name when given', () => {
    expect(machineEntryOf(form({ user: 'alex', port: '2222', name: 'Büro' }))).toEqual({
      name: 'Büro',
      host: 'buero-pc',
      user: 'alex',
      port: 2222
    })
  })

  it('should give the form back with an empty name when it is the host', () => {
    expect(machineFormOf({ name: 'buero-pc', host: 'buero-pc', port: 2222 })).toEqual(
      form({ port: '2222' })
    )
  })
})

describe('authorizedKeysCommandOf', () => {
  const KEY = 'ssh-ed25519 AAAAC3Nza alex@pc'

  it('should add the key to the user file and create its folder', () => {
    expect(authorizedKeysCommandOf(KEY, false)).toBe(
      String.raw`powershell -NoProfile -Command "New-Item -Force -ItemType Directory ~\.ssh | Out-Null; Add-Content ~\.ssh\authorized_keys 'ssh-ed25519 AAAAC3Nza alex@pc'"`
    )
  })

  it('should put an administrator key into the shared file with its rights, by SID', () => {
    expect(authorizedKeysCommandOf(KEY, true)).toBe(
      String.raw`powershell -NoProfile -Command "Add-Content C:\ProgramData\ssh\administrators_authorized_keys 'ssh-ed25519 AAAAC3Nza alex@pc'; icacls.exe C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant *S-1-5-32-544:F /grant *S-1-5-18:F"`
    )
  })

  it('should double a quote in the key comment', () => {
    expect(authorizedKeysCommandOf("ssh-ed25519 AAA o'brien", false)).toContain(
      "'ssh-ed25519 AAA o''brien'"
    )
  })
})

describe('unixAuthorizedKeysCommandOf', () => {
  it('should append the key with the modes ssh insists on', () => {
    expect(unixAuthorizedKeysCommandOf('ssh-ed25519 AAAAC3Nza alex@pc\n')).toBe(
      "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo 'ssh-ed25519 AAAAC3Nza alex@pc' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
    )
  })

  it('should close and reopen the quotes around a quote in the comment', () => {
    expect(unixAuthorizedKeysCommandOf("ssh-ed25519 AAA o'brien")).toContain(
      `echo 'ssh-ed25519 AAA o'"'"'brien' >>`
    )
  })
})

describe('forgetHostKeyCommandOf', () => {
  it('should name a non-default port the way known_hosts stores it', () => {
    expect(forgetHostKeyCommandOf({ name: 'x', host: 'box' }, null)).toBe('ssh-keygen -R box')
    expect(forgetHostKeyCommandOf({ name: 'x', host: 'box', port: 2222 }, null)).toBe(
      'ssh-keygen -R "[box]:2222"'
    )
  })

  it('should forget the name ssh stored instead of an alias from ~/.ssh/config', () => {
    const server = { name: 'nexron-server', host: 'nexron-server' }
    expect(forgetHostKeyCommandOf(server, '100.64.0.10')).toBe('ssh-keygen -R 100.64.0.10')
    expect(forgetHostKeyCommandOf(server, '[10.0.0.2]:2222')).toBe(
      'ssh-keygen -R "[10.0.0.2]:2222"'
    )
  })
})

describe('installStepsOf', () => {
  it('should mark the steps before the current one done and the rest waiting', () => {
    expect(installStepsOf('copying')).toEqual([
      { step: 'checking', state: 'done' },
      { step: 'stopping', state: 'done' },
      { step: 'copying', state: 'running' },
      { step: 'verifying', state: 'waiting' }
    ])
  })
})
