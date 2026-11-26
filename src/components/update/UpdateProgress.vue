<script setup lang="ts">
import { computed } from 'vue'
import { Check } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import UpdateBar from '@/components/update/UpdateBar.vue'
import { formatMegabytes, formatPercent, type UpdateProgressView } from '@/utils/appUpdateDialog'

// The bar of the update dialog (Figma "42a" to "42c"): blue while downloading, green once done,
// a travelling segment while installing, where no share is known.
const { progress } = defineProps<{ progress: UpdateProgressView }>()

const { t, locale } = useI18n()

const ratio = computed(() => {
  if (progress.kind === 'done') return 1
  if (progress.kind === 'download') return progress.ratio
  return null
})
const label = computed(() => {
  if (progress.kind === 'done') return t('update.downloaded')
  if (progress.kind === 'installing') return t('update.installing')
  return t('update.downloading')
})
const percent = computed(() =>
  ratio.value === null ? '' : formatPercent(locale.value, ratio.value)
)
const bytes = computed(() => {
  if (progress.kind !== 'download' || progress.totalBytes === null) return ''
  return t('update.bytes', {
    done: formatMegabytes(locale.value, progress.downloadedBytes),
    total: formatMegabytes(locale.value, progress.totalBytes)
  })
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-3">
      <span
        class="flex items-center gap-1.5 text-small font-medium"
        :class="progress.kind === 'done' ? 'text-good' : 'text-foreground'"
        aria-live="polite"
      >
        <Check v-if="progress.kind === 'done'" class="size-3.5" aria-hidden="true" />
        {{ label }}
      </span>
      <span class="font-mono text-meta text-muted-foreground tabular-nums">{{ percent }}</span>
    </div>
    <UpdateBar class="h-1.5" :ratio :label :is-done="progress.kind === 'done'" />
    <span v-if="bytes" class="font-mono text-meta text-subtle tabular-nums">{{ bytes }}</span>
  </div>
</template>
