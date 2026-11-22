import { computed, toValue, type MaybeRefOrGetter, type Ref } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { useFuse } from '@vueuse/integrations/useFuse'
import { agentdService, type Machine } from '@/api/services/agentd.service'
import {
  MENTION_FUSE_OPTIONS,
  mentionRowsOf,
  mentionSearchableOf,
  topMentionsOf
} from '@/utils/composerMenu'
import { mentionEntriesOf } from '@/utils/fileMentions'

/** agentd caps the list there too; a remote monorepo must not cross SSH whole. */
export const FILES_LIMIT = 20_000
/** Long enough for one message with several mentions, short enough to see a new file soon. */
const FILES_STALE_MS = 30 * 1000
/** An offline machine never answers; the menu then says so instead of loading forever. */
const FILES_TIMEOUT_MS = 10 * 1000

/**
 * The `@` menu of one tab: the files of its folder on its machine, read when the menu opens and
 * searched fuzzily, the file name weighing more than the folders above it.
 */
export const useMentionMenu = (
  place: MaybeRefOrGetter<{ cwd: string; machine: Machine }>,
  query: Ref<string>,
  isOpen: Ref<boolean>
) => {
  const cwd = computed(() => toValue(place).cwd)
  const machine = computed(() => toValue(place).machine)
  const files = useQuery({
    queryKey: ['agentd', 'files', machine, cwd],
    queryFn: () =>
      agentdService.ask<'files'>(
        { op: 'list_files', cwd: cwd.value, limit: FILES_LIMIT },
        machine.value,
        FILES_TIMEOUT_MS
      ),
    enabled: isOpen,
    staleTime: FILES_STALE_MS,
    retry: false
  })

  const entries = computed(() =>
    mentionSearchableOf(mentionEntriesOf(files.data.value?.files ?? []))
  )
  const { results } = useFuse(query, entries, { fuseOptions: MENTION_FUSE_OPTIONS })
  const rows = computed(() =>
    query.value ? mentionRowsOf(results.value) : topMentionsOf(entries.value)
  )
  const known = computed(() => new Set(entries.value.map((entry) => entry.path)))
  const isTruncated = computed(() => files.data.value?.is_truncated ?? false)

  return {
    rows,
    known,
    isPending: files.isPending,
    isError: files.isError,
    error: files.error,
    isTruncated
  }
}
