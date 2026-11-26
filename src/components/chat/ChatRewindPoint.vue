<script setup lang="ts">
import { computed } from 'vue'
import { Circle, CircleDot } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useAgeFormat } from '@/composables/useAgeFormat'
import type { RewindPointProps } from '@/types/agentd.type'

// One earlier prompt to go back to (Figma "34"): its text, how long ago, what its turn changed.
const { point, now, name } = defineProps<{ point: RewindPointProps; now: number; name: string }>()

const chosen = defineModel<string | null>({ required: true })

const { t } = useI18n()
const formatAge = useAgeFormat()

const isChosen = computed(() => chosen.value === point.uuid)
const label = computed(() => point.text || t('rewind.images_only', point.images))
const meta = computed(() => {
  const changes = t('rewind.files_changed', point.files_changed)
  if (!point.at) return changes
  const age = formatAge.value(Math.max(0, now - Date.parse(point.at)))
  return t('rewind.meta', { age, changes })
})
</script>

<template>
  <!-- `relative`: the hidden radio stays in this row, so focusing it scrolls the list, not the
       dialog around it (same bug as the question card, 25.11.2026). -->
  <label
    class="relative flex cursor-pointer items-center gap-2.5 rounded-lg border border-input px-2.5 py-2 has-checked:border-brand has-checked:bg-brand/7 has-focus-visible:ring-2 has-focus-visible:ring-ring"
  >
    <input v-model="chosen" type="radio" :name :value="point.uuid" class="sr-only" />
    <CircleDot v-if="isChosen" class="size-3.5 shrink-0 text-brand" aria-hidden="true" />
    <Circle v-else class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    <span class="flex min-w-0 flex-1 flex-col gap-0.5">
      <span class="line-clamp-2 text-small break-words">{{ label }}</span>
      <span class="text-meta text-muted-foreground">{{ meta }}</span>
    </span>
  </label>
</template>
