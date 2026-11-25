import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { machineService } from '@/api/services/machine.service'
import { isDesktopApp } from '@/lib/platform'
import { usePreviewStore } from '@/stores/preview'
import type { ChatTabState } from '@/utils/chatTab'
import {
  isLocalUrl,
  latestPreviewOf,
  loadableUrlOf,
  previewUrlOf,
  previewUrlOn
} from '@/utils/previewUrl'

/** A dev server answers within milliseconds; an offline machine never does. */
const PROBE_TIMEOUT_MS = 4 * 1000

/** What the pane can show for a tab right now. */
export type PreviewTarget =
  | { kind: 'empty' }
  /** A browser on another device: its `localhost` is that device, not the chat's machine */
  | { kind: 'app_only'; url: string }
  /** The tab runs on another machine whose host name is still being looked up */
  | { kind: 'resolving'; url: string }
  /** ssh could not say which host the machine is, so its `localhost` cannot be reached */
  | { kind: 'no_host'; url: string }
  | { kind: 'checking'; url: string; src: string }
  | { kind: 'unreachable'; url: string; src: string }
  | { kind: 'ready'; url: string; src: string }

// `no-cors` answers opaquely, but it answers: a refused or timed-out connection rejects instead.
// A cross-origin frame never reports a failed load to its parent, so this is the only way to know.
const isReachable = (src: string): Promise<boolean> =>
  fetch(src, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    .then(() => true)
    // A failed request is the answer here, not an error to report.
    .catch(() => false)

/** A query only runs while `enabled` holds, so its value is there; anything else is a bug here. */
const present = (value: string | null): string => {
  if (value === null) throw new Error('preview query ran while disabled')
  return value
}

/**
 * The page the preview shows for a tab: the newest local address in Claude's answers, or the
 * one the user typed or picked after it. On another machine its `localhost` is that machine, so
 * the host becomes the one ssh connects to.
 */
export const usePreviewTarget = (tab: MaybeRefOrGetter<ChatTabState>) => {
  const preview = usePreviewStore()
  /** Bumped by reload: the frame mounts again and the probe asks again */
  const reloadCount = ref(0)

  const detected = computed(() => latestPreviewOf(toValue(tab).messages))
  const url = computed(() => previewUrlOf(preview.saved[toValue(tab).id], detected.value))
  const remoteMachine = computed(() => {
    const { machine } = toValue(tab)
    return machine && url.value && isLocalUrl(url.value) ? machine : null
  })
  const hostQuery = useQuery({
    queryKey: ['machines', 'host-name', remoteMachine],
    queryFn: () => machineService.hostName(present(remoteMachine.value)),
    enabled: computed(() => !!remoteMachine.value),
    // ssh's config does not change while Bull runs, short of editing it by hand.
    staleTime: Infinity,
    retry: false
  })
  const src = computed(() => {
    if (!url.value || !isDesktopApp()) return null
    if (!remoteMachine.value) return loadableUrlOf(url.value)
    return hostQuery.data.value ? previewUrlOn(url.value, hostQuery.data.value) : null
  })
  const probe = useQuery({
    queryKey: ['preview', 'reachable', src, reloadCount],
    queryFn: () => isReachable(present(src.value)),
    enabled: computed(() => !!src.value),
    staleTime: 0,
    // Only a new address or reload asks again: a dev server restarting while Bull regains focus
    // would otherwise swap a working frame (its scroll and route) for "does not answer".
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false
  })

  const target = computed((): PreviewTarget => {
    if (!url.value) return { kind: 'empty' }
    if (!isDesktopApp()) return { kind: 'app_only', url: url.value }
    if (!src.value)
      return { kind: hostQuery.isPending.value ? 'resolving' : 'no_host', url: url.value }
    if (probe.isPending.value) return { kind: 'checking', url: url.value, src: src.value }
    const kind = probe.data.value ? 'ready' : 'unreachable'
    return { kind, url: url.value, src: src.value }
  })

  const reload = () => {
    reloadCount.value++
  }

  return { target, remoteMachine, reloadCount, reload }
}
