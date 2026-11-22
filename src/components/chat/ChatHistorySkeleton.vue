<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Skeleton } from '@/components/ui/skeleton'

// The shape of a conversation while its transcript loads (Figma "M08" and "19 Laden"): a prompt
// on the right, a reply with tool cards on the left, so nothing jumps when the messages land.
const { t } = useI18n()

const TOOL_CARD_ROWS = ['w-2/5', 'w-1/3']
</script>

<template>
  <div class="flex flex-col gap-4" role="status">
    <span class="sr-only">{{ t('chat.stream.loading_history') }}</span>
    <Skeleton class="h-10 w-3/5 max-w-md self-end rounded-2xl" />
    <div class="flex max-w-[72ch] flex-col gap-2.5">
      <Skeleton class="h-3.5 w-11/12" />
      <Skeleton class="h-3.5 w-4/5" />
      <Skeleton class="h-3.5 w-1/2" />
    </div>
    <div
      v-for="width in TOOL_CARD_ROWS"
      :key="width"
      class="flex h-10 max-w-[72ch] items-center gap-3 rounded-lg border border-border px-3"
    >
      <Skeleton class="size-4 rounded" />
      <Skeleton class="h-3 rounded-sm" :class="width" />
    </div>
    <div class="flex max-w-[72ch] flex-col gap-2.5">
      <Skeleton class="h-3.5 w-11/12" />
      <Skeleton class="h-3.5 w-4/5" />
      <Skeleton class="h-3.5 w-1/2" />
    </div>
    <Skeleton class="h-10 w-3/5 max-w-md self-end rounded-2xl" />
    <div class="flex max-w-[72ch] flex-col gap-2.5">
      <Skeleton class="h-3.5 w-11/12" />
      <Skeleton class="h-3.5 w-4/5" />
      <Skeleton class="h-3.5 w-1/2" />
    </div>
  </div>
</template>
