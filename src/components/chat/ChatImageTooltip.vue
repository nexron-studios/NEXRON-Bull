<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { imageMeta } from '@/utils/attachments'
import type { Size } from '@/utils/markup'

// The full name behind a truncated one, with dimensions, size and what a click does (Figma "20c").
// `notes`: what was noted on the image's marks, listed under it, as the chip only counts them.
const {
  name,
  bytes,
  size,
  notes = []
} = defineProps<{ name: string; bytes: number; size: Size | null; notes?: readonly string[] }>()

const { t, locale } = useI18n()

const meta = computed(() => imageMeta(bytes, locale.value, size))
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <slot />
    </TooltipTrigger>
    <TooltipContent class="flex-col items-start gap-0.5">
      <span class="font-semibold break-all">{{ name }}</span>
      <span class="tabular-nums opacity-80">{{ meta }} · {{ t('images.preview_hint') }}</span>
      <ul v-if="notes.length" class="mt-1 flex max-w-72 flex-col gap-0.5">
        <li v-for="(note, at) in notes" :key="at" class="break-words">{{ note }}</li>
      </ul>
    </TooltipContent>
  </Tooltip>
</template>
