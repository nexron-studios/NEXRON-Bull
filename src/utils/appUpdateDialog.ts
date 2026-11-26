import { downloadRatioOf, type UpdateInfo, type UpdatePhase } from '@/utils/appUpdate'

export const BULL_RELEASES_URL = 'https://github.com/nexron-studios/NEXRON-Bull/releases'

/** The buttons of the update dialog, in the order they stand (primary last). */
export const updateActionList = [
  'open_github',
  'later',
  'background',
  'update_now',
  'restart',
  'retry'
] as const
export type UpdateAction = (typeof updateActionList)[number]

/** A translation key with its values; the component translates. */
export type UpdateText = { key: string; params?: Record<string, string> }

export type UpdateProgressView =
  | { kind: 'download'; ratio: number | null; downloadedBytes: number; totalBytes: number | null }
  | { kind: 'done' }
  | { kind: 'installing' }

export type UpdateDialogView = {
  title: UpdateText
  sub: UpdateText
  notes: string[]
  progress: UpdateProgressView | null
  /** What went wrong in Bull's words, and the updater's own message under it */
  error: { text: UpdateText; reason: string } | null
  hint: UpdateText
  actions: UpdateAction[]
  /** Only while installing the dialog stays: Bull is about to close anyway. */
  isClosable: boolean
}

const RETRY_ACTIONS: UpdateAction[] = ['open_github', 'retry']

// While downloading the line says whether Bull started it by itself.
const foundView = (info: UpdateInfo, isAutomatic: boolean): UpdateDialogView => ({
  title: { key: 'update.found_title', params: { version: info.version } },
  sub: {
    key: isAutomatic ? 'update.sub_found_automatic' : 'update.sub_found',
    params: { current: info.currentVersion }
  },
  notes: info.notes,
  progress: null,
  error: null,
  hint: { key: 'update.hint_chats' },
  actions: ['background'],
  isClosable: true
})

type FailedPhase = Extract<UpdatePhase, { kind: 'failed' }>

// A failed look has no update to name, so it names the running Bull instead.
const failedView = (phase: FailedPhase, appVersion: string): UpdateDialogView => {
  const isCheck = phase.step === 'check'
  const current = isCheck ? appVersion : phase.info.currentVersion
  return {
    title: { key: isCheck ? 'update.check_failed_title' : 'update.failed_title' },
    sub: isCheck
      ? { key: 'update.sub_failed_check', params: { current } }
      : { key: `update.sub_failed_${phase.step}`, params: { version: phase.info.version } },
    notes: [],
    progress: null,
    error: { text: { key: `update.error_${phase.step}` }, reason: phase.reason },
    hint: { key: 'update.hint_failed', params: { current } },
    actions: RETRY_ACTIONS,
    isClosable: true
  }
}

/**
 * What the update dialog shows in each phase (Figma "42a" to "42e"); `null` while there is
 * nothing to show. `appVersion` names the running Bull when no update was found yet.
 */
export const updateDialogViewOf = (
  phase: UpdatePhase,
  isAutomatic: boolean,
  appVersion: string
): UpdateDialogView | null => {
  switch (phase.kind) {
    case 'idle':
    case 'checking':
    case 'current':
      return null
    // Not downloading yet, whatever the setting says now: it may have been switched on later.
    case 'available':
      return {
        ...foundView(phase.info, false),
        hint: { key: 'update.hint_manual' },
        actions: ['later', 'update_now']
      }
    case 'downloading':
      return {
        ...foundView(phase.info, isAutomatic),
        progress: {
          kind: 'download',
          ratio: downloadRatioOf(phase.downloadedBytes, phase.totalBytes),
          downloadedBytes: phase.downloadedBytes,
          totalBytes: phase.totalBytes
        }
      }
    case 'ready':
      return {
        ...foundView(phase.info, isAutomatic),
        title: { key: 'update.ready_title', params: { version: phase.info.version } },
        sub: { key: 'update.sub_ready' },
        progress: { kind: 'done' },
        actions: ['later', 'restart']
      }
    case 'installing':
      return {
        title: { key: 'update.installing_title' },
        sub: {
          key: 'update.sub_installing',
          params: { current: phase.info.currentVersion, version: phase.info.version }
        },
        notes: [],
        progress: { kind: 'installing' },
        error: null,
        hint: { key: 'update.hint_installing' },
        actions: [],
        isClosable: false
      }
    case 'failed':
      return failedView(phase, appVersion)
    default: {
      const unhandled: never = phase
      throw new Error(`Unhandled update phase: ${JSON.stringify(unhandled)}`)
    }
  }
}

/** `38,2 MB`: megabytes with one decimal, as the download shows them. */
export const formatMegabytes = (locale: string, bytes: number): string =>
  new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'megabyte',
    maximumFractionDigits: 1,
    minimumFractionDigits: 1
  }).format(bytes / 1_000_000)

/** `62 %` in German, `62%` in English. */
export const formatPercent = (locale: string, ratio: number): string =>
  new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio)

/** The button of the sidebar card: open the dialog, or restart straight away. */
export type UpdateCardAction = 'show' | 'restart' | 'details'

export type UpdateCardView = {
  title: UpdateText
  sub: UpdateText
  /** Share downloaded while the download runs, `null` before its size is known */
  ratio?: number | null
  action: UpdateCardAction | null
  isFailed: boolean
}

/**
 * The card above the quota in the sidebar (Figma "42d", "42d2"): an update that is not finished
 * stays visible after the dialog was closed. `null` when there is none.
 */
export const updateCardViewOf = (phase: UpdatePhase): UpdateCardView | null => {
  switch (phase.kind) {
    case 'idle':
    case 'checking':
    case 'current':
    case 'installing':
      return null
    case 'available':
      return {
        title: { key: 'update.card.available_title', params: { version: phase.info.version } },
        sub: { key: 'update.card.available_sub' },
        action: 'show',
        isFailed: false
      }
    case 'downloading': {
      const ratio = downloadRatioOf(phase.downloadedBytes, phase.totalBytes)
      return {
        title: { key: 'update.card.downloading_title' },
        sub: {
          key:
            ratio === null ? 'update.card.downloading_sub_unknown' : 'update.card.downloading_sub',
          params: { version: phase.info.version }
        },
        ratio,
        action: null,
        isFailed: false
      }
    }
    case 'ready':
      return {
        title: { key: 'update.card.ready_title', params: { version: phase.info.version } },
        sub: { key: 'update.card.ready_sub' },
        action: 'restart',
        isFailed: false
      }
    case 'failed':
      // A failed look in the background is not worth a card; Settings › Updates says it.
      if (phase.step === 'check') return null
      return {
        title: { key: 'update.card.failed_title' },
        sub: { key: 'update.card.failed_sub', params: { version: phase.info.version } },
        action: 'details',
        isFailed: true
      }
    default: {
      const unhandled: never = phase
      throw new Error(`Unhandled update phase: ${JSON.stringify(unhandled)}`)
    }
  }
}

export type UpdateStatusTone = 'good' | 'muted' | 'critical'

/**
 * The status line of Settings › Updates (Figma "42f"). An up-to-date Bull gets the age of its
 * last check from the component, which knows the clock and the language.
 */
export const updateStatusOf = (
  phase: UpdatePhase,
  hasChecked: boolean
): { text: UpdateText; tone: UpdateStatusTone } => {
  switch (phase.kind) {
    case 'idle':
    case 'current':
      return hasChecked
        ? { text: { key: 'settings.updates.status_current' }, tone: 'good' }
        : { text: { key: 'settings.updates.status_never' }, tone: 'muted' }
    case 'checking':
      return { text: { key: 'settings.updates.status_checking' }, tone: 'muted' }
    case 'available':
    case 'downloading':
    case 'ready':
    case 'installing':
      return {
        text: {
          key: `settings.updates.status_${phase.kind}`,
          params: { version: phase.info.version }
        },
        tone: 'muted'
      }
    case 'failed':
      return { text: { key: 'settings.updates.status_failed' }, tone: 'critical' }
    default: {
      const unhandled: never = phase
      throw new Error(`Unhandled update phase: ${JSON.stringify(unhandled)}`)
    }
  }
}
