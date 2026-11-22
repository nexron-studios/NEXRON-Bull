import { describe, expect, it } from 'vitest'
import { newChatSettingsOf } from '../newChat'

describe('newChatSettingsOf', () => {
  it('should start the default model on high', () => {
    expect(newChatSettingsOf('opus', 'auto')).toEqual({
      model: 'opus',
      effort: 'high',
      permissionMode: 'auto'
    })
  })

  it('should leave the effort to another model', () => {
    expect(newChatSettingsOf('haiku', 'auto')).toEqual({
      model: 'haiku',
      effort: null,
      permissionMode: 'auto'
    })
  })

  it('should leave everything to the account when nothing is picked', () => {
    expect(newChatSettingsOf(null, null)).toEqual({
      model: null,
      effort: null,
      permissionMode: null
    })
  })
})
