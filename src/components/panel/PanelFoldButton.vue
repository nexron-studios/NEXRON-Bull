<script setup lang="ts">
import { ChevronDown, ChevronUp } from '@lucide/vue'
import { useI18n } from 'vue-i18n'

// "Mehr anzeigen (n)" / "Weniger anzeigen" under a folded panel list (`useFoldedRows`).
const { isExpanded, hiddenCount, controls } = defineProps<{
  isExpanded: boolean
  hiddenCount: number
  /** The id of the list it folds */
  controls: string
}>()
const emit = defineEmits<{ toggle: [] }>()

const { t } = useI18n()
</script>

<template>
  <button
    type="button"
    class="motion-press flex w-fit items-center gap-0.5 rounded-sm text-meta text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    :aria-expanded="isExpanded"
    :aria-controls="controls"
    @click="emit('toggle')"
  >
    {{ isExpanded ? t('panel.show_less') : t('panel.show_more', { n: hiddenCount }) }}
    <component :is="isExpanded ? ChevronUp : ChevronDown" class="size-3.5" aria-hidden="true" />
  </button>
</template>
