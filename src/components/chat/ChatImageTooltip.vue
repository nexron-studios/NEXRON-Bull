<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { imageMeta } from '@/utils/attachments'
import type { Size } from '@/utils/markup'

// The full name behind a truncated one, with dimensions, size and what a click does (Figma "20c").
const { name, bytes, size } = defineProps<{ name: string; bytes: number; size: Size | null }>()

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
    </TooltipContent>
  </Tooltip>
</template>
