<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeftRight, TriangleAlert } from '@lucide/vue'
import { useMinuteClock } from '@/composables/useClock'
import { useI18n } from 'vue-i18n'
import type { AccountRefProps } from '@/types/agentd.type'
import { Button } from '@/components/ui/button'
import { resetOf } from '@/utils/limits'
import { leftPercentOf } from '@/utils/percent'
import { glowClassOf } from '@/theme/glow'

// The 5-hour window passed 90 % (Figma "24b"): offer to go on on `candidate` once this turn ends,
// so a running turn is never cut off by the move.
const { account, candidate } = defineProps<{
  account: AccountRefProps
  candidate: AccountRefProps
}>()
const emit = defineEmits<{ stay: []; move: [] }>()

const { t, locale } = useI18n()
const now = useMinuteClock()

const left = computed(
  () => resetOf(account.resets_at_ms, now.value.getTime(), locale.value)?.left ?? null
)
const title = computed(() => {
  const percent = Math.round(leftPercentOf(account.used_percent ?? 0))
  return left.value
    ? t('chat.limit.nudge_title', { account: account.label, percent, left: left.value })
    : t('chat.limit.nudge_title_no_reset', { account: account.label, percent })
})
</script>

<template>
  <div
    :class="glowClassOf('warning')"
    class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-2"
    role="status"
  >
    <TriangleAlert class="size-4 shrink-0 text-warning" aria-hidden="true" />
    <div class="flex min-w-0 flex-1 basis-56 flex-col">
      <span class="text-small font-semibold">{{ title }}</span>
      <span class="text-meta text-muted-foreground">
        {{ t('chat.limit.nudge_text', { candidate: candidate.label }) }}
      </span>
    </div>
    <div class="flex flex-wrap gap-1.5">
      <Button variant="outline" size="sm" @click="emit('stay')">
        {{ t('chat.limit.stay', { account: account.label }) }}
      </Button>
      <Button
        size="sm"
        class="bg-brand-strong text-brand-foreground hover:bg-brand-strong-hover"
        @click="emit('move')"
      >
        <ArrowLeftRight aria-hidden="true" />
        {{ t('chat.limit.switch_after_turn') }}
      </Button>
    </div>
  </div>
</template>
