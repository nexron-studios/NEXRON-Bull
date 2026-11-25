import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { agentdService, type Machine } from '@/api/services/agentd.service'
import { reviewOf } from '@/utils/diffReview'
import type { DiffHunk } from '@/utils/diffRows'

/** A diff of a big file runs git twice on the machine; an offline one never answers. */
const FILE_DIFF_TIMEOUT_MS = 15 * 1000

/**
 * The review's lines of one file: git's working tree against `HEAD` on the machine the chat runs
 * on, else the edits the chat recorded (`chatHunks`). Asked again whenever a file is shown, since
 * Claude or the user may have changed the file meanwhile. An agentd from before the op answers with an
 * error, and the chat's edits stand in.
 */
export const useFileDiff = (
  target: MaybeRefOrGetter<{ machine: Machine; cwd: string; path: string }>,
  chatHunks: MaybeRefOrGetter<DiffHunk[]>
) => {
  const query = useQuery({
    queryKey: computed(() => {
      const { machine, cwd, path } = toValue(target)
      return ['agentd', 'file_diff', machine, cwd, path]
    }),
    queryFn: async () => {
      const { machine, cwd, path } = toValue(target)
      return agentdService.ask<'file_diff'>(
        { op: 'file_diff', cwd, path },
        machine,
        FILE_DIFF_TIMEOUT_MS
      )
    },
    staleTime: 0,
    // Read once per opening: a refetch on focus would only reset what the user chose meanwhile.
    refetchOnWindowFocus: false,
    retry: false
  })

  const review = computed(() =>
    reviewOf(query.data.value, query.isError.value, () => toValue(chatHunks))
  )

  return { review, refetch: query.refetch }
}
