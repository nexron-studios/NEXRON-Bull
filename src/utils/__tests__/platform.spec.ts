import { describe, expect, it } from 'vitest'
import { computerWordOf, systemNameOf } from '../platform'

const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0'
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko)'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15'

describe('systemNameOf', () => {
  it('should name the desktop systems', () => {
    expect([WINDOWS, MAC, LINUX].map(systemNameOf)).toEqual(['Windows', 'macOS', 'Linux'])
  })

  it('should name no system for phones, although their agents mention Linux or Mac OS', () => {
    expect([ANDROID, IPHONE].map(systemNameOf)).toEqual([null, null])
  })

  it('should name no system for an unknown agent', () => {
    expect(systemNameOf('curl/8.4.0')).toBe(null)
  })
})

describe('computerWordOf', () => {
  it('should call a Mac a Mac', () => {
    expect(computerWordOf('macOS')).toBe('Mac')
  })

  it('should call every other computer a PC, a phone browser included', () => {
    expect([computerWordOf('Windows'), computerWordOf('Linux'), computerWordOf(null)]).toEqual([
      'PC',
      'PC',
      'PC'
    ])
  })
})
