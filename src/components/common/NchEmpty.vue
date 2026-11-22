<script setup lang="ts">
import type { Component } from 'vue'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'

const {
  icon,
  title,
  hint,
  size = 'md'
} = defineProps<{
  icon: Component
  title: string
  hint: string
  size?: 'sm' | 'md'
}>()
</script>

<template>
  <!-- A view-filling state sits a touch above the middle; a small one centres in its panel, where
       the lift pushed a state with a button over the panel's top edge. -->
  <div class="grid min-h-48 flex-1 place-items-center">
    <Empty :class="{ '-mt-[8vh]': size === 'md' }">
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          :class="size === 'md' ? 'size-12 rounded-xl [&_svg]:size-6' : 'size-9'"
        >
          <component :is="icon" aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle :class="size === 'md' ? 'text-title' : 'text-body'">{{ title }}</EmptyTitle>
        <EmptyDescription class="text-small">{{ hint }}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent v-if="$slots.default">
        <slot />
      </EmptyContent>
    </Empty>
  </div>
</template>
