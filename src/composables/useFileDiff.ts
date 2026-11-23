import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import { useQuery } from '@tanstack/vue-query'
import { agentdService, type Machine } from '@/api/services/agentd.service'
import { reviewOf, type ReviewHunk } from '@/utils/diffReview'

/** A diff of a big file runs git twice on the machine; an offline one never answers. */
const FILE_DIFF_TIMEOUT_MS = 15 * 1000

/**
 * The review's lines of one file: git's working tree against `HEAD` on the machine the chat runs
 * on, else the edits the chat recorded (`chatHunks`). Asked again on every opening, since Claude
 * or the user may have changed the file meanwhile. An agentd from before the op answers with an
 * error, and the chat's edits stand in.
 */
export const useFileDiff = (
  target: MaybeRefOrGetter<{ machine: Machine; cwd: string; path: string } | null>,
  chatHunks: MaybeRefOrGetter<ReviewHunk[]>
) => {
  const query = useQuery({
    queryKey: computed(() => {
      const value = toValue(target)
      return ['agentd', 'file_diff', value?.machine ?? null, value?.cwd, value?.path]
    }),
    queryFn: async () => {
      const value = toValue(target)
      if (!value) throw new Error('file_diff without a file')
      return agentdService.ask<'file_diff'>(
        { op: 'file_diff', cwd: value.cwd, path: value.path },
        value.machine,
        FILE_DIFF_TIMEOUT_MS
      )
    },
    enabled: computed(() => toValue(target) !== null),
    staleTime: 0,
    retry: false
  })

  const review = computed(() => reviewOf(query.data.value, query.isError.value, toValue(chatHunks)))

  return { review, refetch: query.refetch }
}
