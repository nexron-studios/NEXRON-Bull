import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { useStorage } from '@vueuse/core'
import type { Update } from '@tauri-apps/plugin-updater'
import { appUpdateService } from '@/api/services/appUpdate.service'
import {
  releaseNoteLinesOf,
  updateInfoOf,
  type UpdateInfo,
  type UpdatePhase,
  type UpdateStep
} from '@/utils/appUpdate'

const AUTOMATIC_STORAGE_KEY = 'bull.updates.automatic'
const LAST_CHECKED_STORAGE_KEY = 'bull.updates.lastCheckedAt'
/** `lastCheckedAt` before the first check: storage keeps numbers, not `null`. */
const NEVER_CHECKED = 0

const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/**
 * Bull's own updates (Figma "42"): look on GitHub, download, install and restart. With
 * "Automatisch aktualisieren" on (the default) a found update downloads at once and the dialog
 * shows it; off, it waits in the sidebar until asked. Restarting always waits for a click.
 */
export const useAppUpdateStore = defineStore('appUpdate', () => {
  const isAutomatic = useStorage(AUTOMATIC_STORAGE_KEY, true)
  const lastCheckedAt = useStorage(LAST_CHECKED_STORAGE_KEY, NEVER_CHECKED)
  const phase = ref<UpdatePhase>({ kind: 'idle' })
  const isDialogOpen = ref(false)

  // A resource on the Rust side, not state: kept out of reactivity and closed when replaced.
  let pending: Update | null = null

  const info = computed(() => updateInfoOf(phase.value))
  const isBusy = computed(() =>
    ['checking', 'downloading', 'installing'].includes(phase.value.kind)
  )

  const failCheck = (error: unknown) => {
    const reason = reasonOf(error)
    console.warn('update.failed', { step: 'check', reason })
    phase.value = { kind: 'failed', step: 'check', info: null, reason }
  }

  const fail = (step: Exclude<UpdateStep, 'check'>, error: unknown, found: UpdateInfo) => {
    const reason = reasonOf(error)
    console.warn('update.failed', { step, reason })
    phase.value = { kind: 'failed', step, info: found, reason }
  }

  const download = async () => {
    const found = info.value
    if (!pending || !found) return
    phase.value = { kind: 'downloading', info: found, downloadedBytes: 0, totalBytes: null }
    try {
      await appUpdateService.download(pending, ({ downloaded, total }) => {
        phase.value = {
          kind: 'downloading',
          info: found,
          downloadedBytes: downloaded,
          totalBytes: total
        }
      })
      phase.value = { kind: 'ready', info: found }
    } catch (error) {
      fail('download', error, found)
    }
  }

  const adopt = async (update: Update): Promise<UpdateInfo> => {
    await pending?.close()
    pending = update
    return {
      version: update.version,
      currentVersion: update.currentVersion,
      notes: releaseNoteLinesOf(update.body)
    }
  }

  /** Looks for a newer Bull. Asked by hand, the dialog opens for whatever it finds. */
  const check = async ({ isManual }: { isManual: boolean }) => {
    if (isBusy.value) return
    // One found update at a time: it stays until it is installed, and a look in the background
    // must not swap it for a network error. Asked by hand, its dialog opens instead.
    if (info.value) {
      isDialogOpen.value = isDialogOpen.value || isManual
      return
    }
    isDialogOpen.value = false
    phase.value = { kind: 'checking' }
    try {
      const update = await appUpdateService.find()
      lastCheckedAt.value = Date.now()
      if (!update) {
        phase.value = { kind: 'current' }
        return
      }
      const found = await adopt(update)
      phase.value = { kind: 'available', info: found }
      if (isManual || isAutomatic.value) isDialogOpen.value = true
      if (isAutomatic.value) await download()
    } catch (error) {
      failCheck(error)
      isDialogOpen.value = isManual
    }
  }

  const restart = async () => {
    const found = info.value
    if (!pending || !found || phase.value.kind !== 'ready') return
    phase.value = { kind: 'installing', info: found }
    isDialogOpen.value = true
    try {
      await appUpdateService.installAndRestart(pending)
    } catch (error) {
      fail('install', error, found)
    }
  }

  /** The failed step again; a failed install has its download still, so it installs again. */
  const retry = async () => {
    if (phase.value.kind !== 'failed') return
    if (phase.value.step === 'check') return check({ isManual: true })
    if (phase.value.step === 'install') {
      phase.value = { kind: 'ready', info: phase.value.info }
      return restart()
    }
    return download()
  }

  const openDialog = () => {
    isDialogOpen.value = true
  }

  return {
    isAutomatic,
    lastCheckedAt,
    phase,
    isDialogOpen,
    info,
    isBusy,
    check,
    download,
    restart,
    retry,
    openDialog
  }
})
