import { describe, expect, it } from 'vitest'
import { shellBlockOf, shellPromptBlocks } from '../shellBlocks'

describe('shellPromptBlocks', () => {
  it('should wrap a command and its output in the tags Claude Code writes', () => {
    expect(shellPromptBlocks({ command: 'git status', stdout: 'clean\n', stderr: '' })).toEqual([
      { type: 'text', text: '<bash-input>git status</bash-input>' },
      { type: 'text', text: '<bash-stdout>clean\n</bash-stdout><bash-stderr></bash-stderr>' }
    ])
  })
})

describe('shellBlockOf', () => {
  it('should read the tags back as agentd does', () => {
    expect(shellBlockOf('<bash-input> npm test</bash-input>')).toEqual({
      type: 'shell',
      command: 'npm test'
    })
    expect(shellBlockOf('<bash-stdout>ok\n</bash-stdout><bash-stderr>warn</bash-stderr>')).toEqual({
      type: 'shell_output',
      stdout: 'ok',
      stderr: 'warn'
    })
  })

  it('should leave typed text alone', () => {
    expect(shellBlockOf('what does <bash-input> mean?')).toBeNull()
  })
})
