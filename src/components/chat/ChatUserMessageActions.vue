<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, Copy, Pencil } from '@lucide/vue'
import { useTimeoutFn } from '@vueuse/core'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAgeFormat } from '@/composables/useAgeFormat'
import { useMinuteClock } from '@/composables/useClock'
import { usePromptEdit, type PromptEditState } from '@/composables/usePromptEdit'
import { useUsageFormat } from '@/composables/useUsageFormat'
import { copyText } from '@/lib/clipboard'
import { MS_PER_MINUTE } from '@/utils/elapsed'

// The row under a sent prompt, as on Claude.ai: when it was sent, edit, copy. It shows on hover
// and on focus inside the message, and always on touch, where there is no hover.
const { uuid, text, at } = defineProps<{ uuid: string; text: string; at: string | null }>()

/** How long the copy button shows the check mark */
const COPIED_MS = 1500

const isCopied = ref(false)

const { t } = useI18n()
const now = useMinuteClock()
const formatAge = useAgeFormat()
const format = useUsageFormat()
const promptEdit = usePromptEdit()
const { start: showCopied } = useTimeoutFn(() => (isCopied.value = false), COPIED_MS, {
  immediate: false
})

// A transcript timestamp that is no date shows no time instead of breaking the row.
const sentAt = computed(() => {
  const ms = at ? Date.parse(at) : Number.NaN
  return Number.isNaN(ms) ? null : ms
})
const age = computed(() => {
  if (sentAt.value === null) return ''
  const ms = Math.max(0, now.value.getTime() - sentAt.value)
  return ms < MS_PER_MINUTE ? t('chat.sent_now') : t('chat.sent_ago', { age: formatAge.value(ms) })
})
const fullDate = computed(() => (sentAt.value === null ? '' : format.value.dateTime(sentAt.value)))
const editState = computed<PromptEditState | null>(() => promptEdit?.stateOf(uuid) ?? null)
const editLabel = computed(() => {
  switch (editState.value) {
    case null:
    case 'ready':
    case 'checking':
      return t('chat.edit_prompt')
    case 'busy':
      return t('chat.edit_prompt_busy')
    case 'no_point':
      return t('chat.edit_prompt_no_point')
    default: {
      const unhandled: never = editState.value
      throw new Error(`Unhandled prompt edit state: ${unhandled}`)
    }
  }
})

const edit = () => {
  if (editState.value !== 'ready') return
  promptEdit?.edit(uuid)
}

const copy = async () => {
  if (!(await copyText(text))) return
  isCopied.value = true
  showCopied()
}
</script>

<template>
  <div
    class="flex items-center gap-0.5 text-muted-foreground opacity-0 transition-opacity duration-150 ease-out group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
  >
    <Tooltip v-if="sentAt !== null">
      <TooltipTrigger as-child>
        <time :datetime="at ?? undefined" class="px-1.5 text-meta tabular-nums">
          <span aria-hidden="true">{{ age }}</span>
          <span class="sr-only">{{ fullDate }}</span>
        </time>
      </TooltipTrigger>
      <TooltipContent>{{ fullDate }}</TooltipContent>
    </Tooltip>
    <!-- Disabled through aria only: a disabled button gets no pointer events, so no tooltip
         could say why. -->
    <NchIconButton
      v-if="editState"
      :label="editLabel"
      size="icon-xs"
      :aria-disabled="editState !== 'ready'"
      class="aria-disabled:cursor-not-allowed aria-disabled:opacity-50 pointer-coarse:size-11"
      @click="edit"
    >
      <Pencil class="size-4" aria-hidden="true" />
    </NchIconButton>
    <NchIconButton
      :label="t('chat.copy_prompt')"
      size="icon-xs"
      class="pointer-coarse:size-11"
      @click="copy"
    >
      <Check v-if="isCopied" class="size-4" aria-hidden="true" />
      <Copy v-else class="size-4" aria-hidden="true" />
    </NchIconButton>
  </div>
</template>
