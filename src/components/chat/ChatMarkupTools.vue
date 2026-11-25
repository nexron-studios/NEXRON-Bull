<script setup lang="ts">
import type { Component } from 'vue'
import { Eraser, Highlighter, MapPin, MoveUpRight, Pencil, Square, Type } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { useMarkup } from '@/composables/useMarkup'
import {
  markupColorList,
  markupSizeList,
  markupToolList,
  type MarkupColor,
  type MarkupSize,
  type MarkupTool
} from '@/utils/markup'

// Tool, colour and size pickers (Figma "20b" bar, "M20" sheet). `isLarge`: the phone sheet, with
// touch-sized buttons on the dark stage and the tools on a row of their own when the parent wraps.
const { isLarge = false } = defineProps<{ isLarge?: boolean }>()

const TOOL_ICONS: Record<MarkupTool, Component> = {
  pen: Pencil,
  highlighter: Highlighter,
  arrow: MoveUpRight,
  rect: Square,
  pin: MapPin,
  text: Type,
  eraser: Eraser
}

const SWATCHES: Record<MarkupColor, string> = {
  critical: 'bg-critical',
  warning: 'bg-warning',
  good: 'bg-good',
  brand: 'bg-brand',
  // Its own edge: the off-white is 1.15:1 against the light popover and vanished there.
  white: 'bg-stage-foreground border border-muted-foreground'
}

const SIZE_DOTS: Record<MarkupSize, string> = { s: 'size-1', m: 'size-1.5', l: 'size-2.5' }

const { t } = useI18n()
const markup = useMarkup()

// Tools get the full touch size; colours and sizes are a little smaller so both fit one row.
const buttonClass = (isOn: boolean, largeSize = 'size-11') => [
  isLarge
    ? `${largeSize} text-stage-foreground hover:bg-stage-foreground/10 hover:text-stage-foreground`
    : 'size-8',
  isOn && (isLarge ? 'bg-stage-foreground/15' : 'bg-accent ring-1 ring-border')
]
</script>

<template>
  <div
    role="group"
    :aria-label="t('images.tools')"
    class="flex items-center"
    :class="isLarge ? 'w-full justify-between' : 'gap-1'"
  >
    <NchIconButton
      v-for="tool in markupToolList"
      :key="tool"
      :label="t(`images.tool.${tool}`)"
      :aria-pressed="markup.tool.value === tool"
      :class="buttonClass(markup.tool.value === tool)"
      @click="markup.tool.value = tool"
    >
      <component :is="TOOL_ICONS[tool]" :class="isLarge ? 'size-5' : 'size-4'" aria-hidden="true" />
    </NchIconButton>
  </div>
  <span v-if="!isLarge" class="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
  <div
    role="group"
    :aria-label="t('images.colors')"
    class="flex items-center"
    :class="{ 'gap-0.5': !isLarge }"
  >
    <NchIconButton
      v-for="color in markupColorList"
      :key="color"
      :label="t(`images.color.${color}`)"
      :aria-pressed="markup.color.value === color"
      :class="isLarge ? 'size-10 hover:bg-stage-foreground/10' : 'size-7'"
      @click="markup.color.value = color"
    >
      <span
        class="block rounded-full ring-offset-2"
        :class="[
          SWATCHES[color],
          isLarge ? 'size-7 ring-offset-stage' : 'size-5 ring-offset-popover',
          markup.color.value === color
            ? isLarge
              ? 'ring-2 ring-stage-foreground'
              : 'ring-2 ring-foreground'
            : 'ring-1 ring-border'
        ]"
      />
    </NchIconButton>
  </div>
  <span
    class="h-6 w-px shrink-0"
    :class="isLarge ? 'bg-stage-foreground/20' : 'bg-border'"
    aria-hidden="true"
  />
  <div
    role="group"
    :aria-label="t('images.sizes')"
    class="flex items-center"
    :class="{ 'gap-0.5': !isLarge }"
  >
    <NchIconButton
      v-for="size in markupSizeList"
      :key="size"
      :label="t(`images.size.${size}`)"
      :aria-pressed="markup.size.value === size"
      :class="buttonClass(markup.size.value === size, 'size-10')"
      @click="markup.size.value = size"
    >
      <span class="block rounded-full bg-current" :class="SIZE_DOTS[size]" />
    </NchIconButton>
  </div>
</template>
