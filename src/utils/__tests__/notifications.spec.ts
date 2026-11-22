import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  NOTIFY_REPEAT_MS,
  deliveryOf,
  isAllOff,
  isEventWanted,
  isRepeat,
  isSameSnapshots,
  notifyKeyOf,
  quotaAlertsOf,
  reasonOf,
  settingsOfLegacy,
  snapshotOf,
  withSettingDefaults,
  type DeliveryContext,
  type NotificationSettings,
  type ReasonContext,
  type TabSnapshot
} from '../notifications'
import { newTab } from '../chatTab'
import type { MachineQuota } from '../quota'

const snap = (fields: Partial<TabSnapshot> = {}): TabSnapshot => ({
  id: 't1',
  status: 'working',
  requestId: null,
  toolName: null,
  notice: null,
  isDisconnected: false,
  isAgentReply: false,
  openQuestion: null,
  ...fields
})

const LIVE: ReasonContext = { isReplay: false, isStoppedByUser: false }

describe('reasonOf with a question at the end of the answer', () => {
  it('should call a finished turn that ends on a question a question', () => {
    const after = snap({ status: 'idle', openQuestion: 'Soll der Ordner weg?' })
    expect(reasonOf(snap(), after, LIVE)).toBe('question')
  })

  it('should keep a finished turn without a question finished', () => {
    expect(reasonOf(snap(), snap({ status: 'idle' }), LIVE)).toBe('finished')
  })

  it('should stay quiet when the answer was to a subagent report', () => {
    const after = snap({ status: 'idle', openQuestion: 'Und?' })
    expect(reasonOf(snap({ isAgentReply: true }), after, LIVE)).toBeNull()
  })
})

const asking = (requestId: string, toolName: string) =>
  snap({ status: 'asking', requestId, toolName })

describe('reasonOf', () => {
  describe('permission asks', () => {
    it('should ask for approval when a new tool permission arrives', () => {
      expect(reasonOf(snap(), asking('r1', 'Bash'), LIVE)).toBe('approval')
    })

    it('should report a question for AskUserQuestion', () => {
      expect(reasonOf(snap(), asking('r1', 'AskUserQuestion'), LIVE)).toBe('question')
    })

    it('should report a plan for ExitPlanMode', () => {
      expect(reasonOf(snap(), asking('r1', 'ExitPlanMode'), LIVE)).toBe('plan')
    })

    it('should stay quiet while the same permission is still open', () => {
      expect(reasonOf(asking('r1', 'Bash'), asking('r1', 'Bash'), LIVE)).toBeNull()
    })

    it('should stay quiet for an ask agentd replays to an attaching app', () => {
      const context = { ...LIVE, isReplay: true }
      expect(reasonOf(snap({ status: 'starting' }), asking('r1', 'Bash'), context)).toBeNull()
    })

    it('should report a new ask right after the tab started', () => {
      expect(reasonOf(snap({ status: 'starting' }), asking('r2', 'Write'), LIVE)).toBe('approval')
    })
  })

  describe('end of a turn', () => {
    it('should report a finished turn when a working tab becomes idle', () => {
      expect(reasonOf(snap(), snap({ status: 'idle' }), LIVE)).toBe('finished')
    })

    it('should stay quiet when Claude only answered a subagent report', () => {
      const before = snap({ isAgentReply: true })
      expect(reasonOf(before, snap({ status: 'idle' }), LIVE)).toBe(null)
    })

    it('should stay quiet when the user interrupted the turn', () => {
      const context = { ...LIVE, isStoppedByUser: true }
      expect(reasonOf(snap(), snap({ status: 'idle' }), context)).toBeNull()
    })

    it('should stay quiet when a session starts', () => {
      expect(reasonOf(snap({ status: 'starting' }), snap({ status: 'idle' }), LIVE)).toBeNull()
    })
  })

  describe('failures', () => {
    it('should report a failure when the turn ends with an error notice', () => {
      const after = snap({ status: 'idle', notice: 'API Error: 529' })
      expect(reasonOf(snap(), after, LIVE)).toBe('failed')
    })

    it('should report a failure when Claude exits in the middle of a turn', () => {
      expect(reasonOf(snap({ status: 'asking' }), snap({ status: 'ended' }), LIVE)).toBe('failed')
    })

    it('should report a failure when the start fails with an error', () => {
      const after = snap({ status: 'starting', notice: 'claude not found' })
      expect(reasonOf(snap({ status: 'starting' }), after, LIVE)).toBe('failed')
    })

    it('should report a failure when Claude exits while starting', () => {
      expect(reasonOf(snap({ status: 'starting' }), snap({ status: 'ended' }), LIVE)).toBe('failed')
    })

    it('should stay quiet when the connection drops in the middle of a turn', () => {
      const after = snap({ status: 'ended', notice: 'lost', isDisconnected: true })
      expect(reasonOf(snap(), after, LIVE)).toBeNull()
    })

    it('should stay quiet when the user stopped the session', () => {
      const context = { ...LIVE, isStoppedByUser: true }
      expect(reasonOf(snap(), snap({ status: 'ended' }), context)).toBeNull()
    })

    it('should stay quiet when an idle tab ends', () => {
      expect(reasonOf(snap({ status: 'idle' }), snap({ status: 'ended' }), LIVE)).toBeNull()
    })
  })
})

describe('snapshotOf', () => {
  const tab = () => ({
    ...newTab({
      id: 't1',
      title: 'Fix the build',
      profile: null,
      account: 'default',
      cwd: 'C:\\work',
      machine: 'nexron-server',
      sessionId: 's1',
      model: null,
      permissionMode: null,
      isFresh: false
    }),
    status: 'asking' as const,
    permission: { requestId: 'r1', toolName: 'Bash', input: {}, suggestions: [] }
  })

  it('should keep only what a notification depends on', () => {
    expect(snapshotOf(tab(), 'Connection lost')).toEqual({
      id: 't1',
      status: 'asking',
      requestId: 'r1',
      toolName: 'Bash',
      notice: null,
      isDisconnected: false,
      isAgentReply: false,
      openQuestion: null
    })
  })

  it('should mark the connection-lost notice of the tab machine', () => {
    const lost = { ...tab(), notice: 'Connection lost' }
    expect(snapshotOf(lost, 'Connection lost').isDisconnected).toBe(true)
  })
})

describe('isSameSnapshots', () => {
  it('should treat equal fields in fresh objects as the same', () => {
    expect(isSameSnapshots([snap()], [snap()])).toBe(true)
  })

  it('should see a status change', () => {
    expect(isSameSnapshots([snap()], [snap({ status: 'idle' })])).toBe(false)
  })

  it('should see a closed tab', () => {
    expect(isSameSnapshots([snap(), snap({ id: 't2' })], [snap()])).toBe(false)
  })
})

describe('deliveryOf', () => {
  const context = (fields: Partial<DeliveryContext> = {}): DeliveryContext => ({
    tabId: 't1',
    activeId: 't1',
    isFocused: true,
    canUseOs: true,
    background: 'os',
    ...fields
  })

  it('should use the system while the window is not focused', () => {
    expect(deliveryOf(context({ isFocused: false }))).toBe('os')
  })

  it('should fall back to a toast when system notifications are unavailable', () => {
    expect(deliveryOf(context({ isFocused: false, canUseOs: false }))).toBe('toast')
  })

  it('should show a toast in the background when the user picked the window', () => {
    expect(deliveryOf(context({ isFocused: false, background: 'toast' }))).toBe('toast')
  })

  it('should show a toast for another tab in the focused window', () => {
    expect(deliveryOf(context({ tabId: 't2' }))).toBe('toast')
  })

  it('should not notify for the tab the user is looking at', () => {
    expect(deliveryOf(context())).toBeNull()
  })

  it('should show a toast for news of no tab while no tab is open', () => {
    expect(deliveryOf(context({ tabId: null, activeId: null }))).toBe('toast')
  })
})

describe('isRepeat', () => {
  it('should treat a second event for the same key inside the window as a repeat', () => {
    expect(isRepeat(1_000, 1_000 + NOTIFY_REPEAT_MS - 1)).toBe(true)
  })

  it('should let the event through once the window passed', () => {
    expect(isRepeat(1_000, 1_000 + NOTIFY_REPEAT_MS)).toBe(false)
  })

  it('should let the first event through', () => {
    expect(isRepeat(undefined, 1_000)).toBe(false)
  })
})

describe('notifyKeyOf', () => {
  it('should combine tab and reason', () => {
    expect(notifyKeyOf('t1', 'finished')).toBe('t1:finished')
  })
})

const settings = (fields: Partial<NotificationSettings> = {}): NotificationSettings => ({
  ...DEFAULT_NOTIFICATION_SETTINGS,
  isOn: true,
  ...fields
})

describe('settingsOfLegacy', () => {
  it('should turn the old switch that was on into the defaults with notifications on', () => {
    expect(settingsOfLegacy('true')).toEqual({
      isOn: true,
      events: {
        approval: true,
        question: true,
        plan: true,
        finished: true,
        failed: true,
        quota_low: false
      },
      background: 'os',
      hasSound: false
    })
  })

  it('should keep notifications off when the old switch was off', () => {
    expect(settingsOfLegacy('false').isOn).toBe(false)
  })

  it('should keep notifications off when the old switch was never set', () => {
    expect(settingsOfLegacy(null).isOn).toBe(false)
  })
})

describe('withSettingDefaults', () => {
  it('should fill events a newer version added and keep the stored ones', () => {
    const stored = { isOn: true, events: { approval: false }, background: 'toast' } as never
    expect(withSettingDefaults(stored, DEFAULT_NOTIFICATION_SETTINGS)).toEqual({
      isOn: true,
      events: {
        approval: false,
        question: true,
        plan: true,
        finished: true,
        failed: true,
        quota_low: false
      },
      background: 'toast',
      hasSound: false
    })
  })

  it('should fall back to the defaults when storage holds null', () => {
    expect(withSettingDefaults(null, DEFAULT_NOTIFICATION_SETTINGS)).toEqual(
      DEFAULT_NOTIFICATION_SETTINGS
    )
  })

  it('should drop values of the wrong kind', () => {
    const stored = { isOn: 'yes', background: 'email', hasSound: 1 } as never
    expect(withSettingDefaults(stored, DEFAULT_NOTIFICATION_SETTINGS)).toEqual(
      DEFAULT_NOTIFICATION_SETTINGS
    )
  })
})

describe('isEventWanted', () => {
  it('should let an event through whose switch is on', () => {
    expect(isEventWanted(settings(), 'approval', false)).toBe(true)
  })

  it('should filter an event whose switch is off', () => {
    const events = { ...DEFAULT_NOTIFICATION_SETTINGS.events, finished: false }
    expect(isEventWanted(settings({ events }), 'finished', false)).toBe(false)
  })

  it('should filter everything while notifications are off', () => {
    expect(isEventWanted(settings({ isOn: false }), 'approval', false)).toBe(false)
  })

  it('should filter a muted chat', () => {
    expect(isEventWanted(settings(), 'approval', true)).toBe(false)
  })

  it('should keep the quota off until it is switched on', () => {
    expect(isEventWanted(settings(), 'quota_low', false)).toBe(false)
  })
})

describe('isAllOff', () => {
  it('should be off while the master switch is off', () => {
    expect(isAllOff(settings({ isOn: false }))).toBe(true)
  })

  it('should be off when every event is switched off', () => {
    const events = {
      approval: false,
      question: false,
      plan: false,
      finished: false,
      failed: false,
      quota_low: false
    }
    expect(isAllOff(settings({ events }))).toBe(true)
  })

  it('should be on with the defaults', () => {
    expect(isAllOff(settings())).toBe(false)
  })
})

describe('quotaAlertsOf', () => {
  const RESET = '2026-11-16T15:00:00Z'
  const RESET_MS = Date.parse(RESET)
  /** An hour before the window resets */
  const NOW = Date.parse('2026-11-16T14:00:00Z')

  const account = (percent: number, resetsAt: string | null = RESET): MachineQuota => ({
    machine: null,
    profile: 'C:\\Users\\me\\.claude-work',
    label: 'work',
    email: 'me@example.com',
    plan: 'max',
    windows: [
      { key: 'five_hour', used_percent: percent, resets_at: resetsAt },
      { key: 'seven_day', used_percent: 95, resets_at: '2026-11-20T10:00:00Z' }
    ],
    fetched_ms: 0,
    problem: null
  })

  it('should tell an account whose 5-hour window reached 80 %, with what is left', () => {
    expect(quotaAlertsOf([account(82.4)], {}, NOW)).toEqual([
      { key: 'me@example.com', label: 'work', percent: 18, resetsAt: RESET_MS }
    ])
  })

  it('should stay quiet below 80 %, also when the week is fuller', () => {
    expect(quotaAlertsOf([account(79.9)], {}, NOW)).toEqual([])
  })

  it('should tell an account once per window', () => {
    expect(quotaAlertsOf([account(90)], { 'me@example.com': RESET_MS }, NOW)).toEqual([])
  })

  it('should treat a slightly moved reset time as the same window', () => {
    const moved = new Date(RESET_MS + 60_000).toISOString()
    expect(quotaAlertsOf([account(90, moved)], { 'me@example.com': RESET_MS }, NOW)).toEqual([])
  })

  it('should tell again in the next window', () => {
    const next = '2026-11-16T20:30:00Z'
    expect(quotaAlertsOf([account(85, next)], { 'me@example.com': RESET_MS }, NOW)).toEqual([
      { key: 'me@example.com', label: 'work', percent: 15, resetsAt: Date.parse(next) }
    ])
  })

  it('should skip a window that reset already, as cached data can hold', () => {
    expect(quotaAlertsOf([account(85)], {}, Date.parse('2026-11-16T16:00:00Z'))).toEqual([])
  })

  it('should skip a window without a reset time', () => {
    expect(quotaAlertsOf([account(90, null)], {}, NOW)).toEqual([])
  })
})
