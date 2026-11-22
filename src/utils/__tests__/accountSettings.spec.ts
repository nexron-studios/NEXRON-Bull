import { describe, expect, it } from 'vitest'
import type { ProfileProps } from '@/types/agentd.type'
import {
  EMPTY_ACCOUNT_SETTINGS,
  accountNameProblemOf,
  defaultProfileOf,
  homeOfProfileDir,
  loginStateOf,
  newProfileDirOf,
  offeredProfilesOf,
  toneOf,
  withAccountSettingDefaults,
  withAdoptedTones,
  withDefault,
  withOffered,
  withTone
} from '../accountSettings'

const profile = (label: string, email: string | null = null): ProfileProps => ({
  label,
  dir: label === 'default' ? 'C:\\Users\\Home\\.claude' : `C:\\Users\\Home\\.claude-${label}`,
  email
})
const work = profile('work', 'alex@work.example')
const own = profile('default', 'alex@own.example')
const fresh = profile('kunde-x')

describe('accountSettings', () => {
  describe('offering accounts', () => {
    it('should offer every account until one is switched off', () => {
      expect(offeredProfilesOf(EMPTY_ACCOUNT_SETTINGS, null, [own, work])).toEqual([own, work])
    })

    it('should hide a switched-off account only on its own machine', () => {
      const settings = withOffered(EMPTY_ACCOUNT_SETTINGS, null, work.dir, false)

      expect(offeredProfilesOf(settings, null, [own, work])).toEqual([own])
      expect(offeredProfilesOf(settings, 'nexron-server', [own, work])).toEqual([own, work])
    })

    it('should offer an account again when it is switched back on', () => {
      const off = withOffered(EMPTY_ACCOUNT_SETTINGS, null, work.dir, false)

      expect(withOffered(off, null, work.dir, true).hidden).toEqual([])
    })
  })

  describe('defaultProfileOf', () => {
    it('should take the first offered account while none is chosen', () => {
      expect(defaultProfileOf(EMPTY_ACCOUNT_SETTINGS, null, [own, work])).toEqual(own)
    })

    it('should pass over a new account that never logged in', () => {
      expect(defaultProfileOf(EMPTY_ACCOUNT_SETTINGS, null, [fresh, work])).toEqual(work)
      expect(defaultProfileOf(EMPTY_ACCOUNT_SETTINGS, null, [fresh])).toEqual(fresh)
    })

    it('should take the chosen default of that machine', () => {
      const settings = withDefault(EMPTY_ACCOUNT_SETTINGS, null, work.dir)

      expect(defaultProfileOf(settings, null, [own, work])).toEqual(work)
      expect(defaultProfileOf(settings, 'nexron-server', [own, work])).toEqual(own)
    })

    it('should drop the default when that account is switched off', () => {
      const settings = withOffered(
        withDefault(EMPTY_ACCOUNT_SETTINGS, null, work.dir),
        null,
        work.dir,
        false
      )

      expect(settings.defaults).toEqual({})
      expect(defaultProfileOf(settings, null, [own, work])).toEqual(own)
    })

    it('should switch an account on when it becomes the default', () => {
      const off = withOffered(EMPTY_ACCOUNT_SETTINGS, null, work.dir, false)

      expect(withDefault(off, null, work.dir)).toEqual({
        hidden: [],
        defaults: { '': work.dir },
        tones: {}
      })
    })

    it('should be null when every account of the machine is switched off', () => {
      const settings = withOffered(EMPTY_ACCOUNT_SETTINGS, null, own.dir, false)

      expect(defaultProfileOf(settings, null, [own])).toBeNull()
    })
  })

  describe('tones', () => {
    it('should keep the hashed colour until one is picked', () => {
      const picked = withTone(EMPTY_ACCOUNT_SETTINGS, 'alex@work.example', 'd')

      expect(toneOf(picked, 'alex@work.example')).toBe('d')
    })

    it('should move the colour of a new account to its email once it has logged in', () => {
      const settings = withTone(EMPTY_ACCOUNT_SETTINGS, `:${fresh.dir}`, 'c')

      const adopted = withAdoptedTones(settings, null, [{ ...fresh, email: 'kunde@x.example' }])

      expect(adopted.tones).toEqual({ [`:${fresh.dir}`]: 'c', 'kunde@x.example': 'c' })
    })

    it('should not overwrite a colour the login already has', () => {
      const settings = withTone(
        withTone(EMPTY_ACCOUNT_SETTINGS, `:${fresh.dir}`, 'c'),
        'kunde@x.example',
        'a'
      )

      const adopted = withAdoptedTones(settings, null, [{ ...fresh, email: 'kunde@x.example' }])

      expect(adopted).toBe(settings)
    })
  })

  it('should fill fields missing from an older stored entry', () => {
    expect(withAccountSettingDefaults({ hidden: ['|x'] })).toEqual({
      hidden: ['|x'],
      defaults: {},
      tones: {}
    })
  })

  describe('loginStateOf', () => {
    it('should read a missing or ended login as logged out', () => {
      expect(loginStateOf({ problem: 'no_login' })).toBe('logged_out')
      expect(loginStateOf({ problem: 'logged_out' })).toBe('logged_out')
    })

    it('should read an expired token as expired', () => {
      expect(loginStateOf({ problem: 'expired' })).toBe('expired')
    })

    it('should read numbers or a passing problem as logged in', () => {
      expect(loginStateOf({ problem: null })).toBe('logged_in')
      expect(loginStateOf({ problem: 'rate_limited' })).toBe('logged_in')
      expect(loginStateOf({ problem: 'stale' })).toBe('logged_in')
    })
  })

  describe('accountNameProblemOf', () => {
    it('should accept lowercase letters, digits and inner dashes', () => {
      expect(accountNameProblemOf('kunde-x2', ['work'])).toBeNull()
    })

    it('should name what is wrong with a name', () => {
      expect(accountNameProblemOf('', [])).toBe('empty')
      expect(accountNameProblemOf('Kunde', [])).toBe('invalid')
      expect(accountNameProblemOf('-x', [])).toBe('invalid')
      expect(accountNameProblemOf('a/b', [])).toBe('invalid')
      expect(accountNameProblemOf('default', [])).toBe('invalid')
      expect(accountNameProblemOf('x'.repeat(33), [])).toBe('invalid')
      expect(accountNameProblemOf('work', ['work'])).toBe('taken')
      expect(accountNameProblemOf('work', ['Work'])).toBe('taken')
    })
  })

  describe('profile folders', () => {
    it('should put a new account next to the other profile folders', () => {
      expect(newProfileDirOf([work], 'kunde-x')).toBe('C:\\Users\\Home\\.claude-kunde-x')
      expect(newProfileDirOf([{ ...work, dir: '/home/j/.claude' }], 'x')).toBe('/home/j/.claude-x')
    })

    it('should not guess a folder while the machine lists no profile', () => {
      expect(newProfileDirOf([], 'kunde-x')).toBeNull()
    })

    it('should find the home folder of a profile folder', () => {
      expect(homeOfProfileDir('C:\\Users\\Home\\.claude-work')).toBe('C:\\Users\\Home')
    })
  })
})
