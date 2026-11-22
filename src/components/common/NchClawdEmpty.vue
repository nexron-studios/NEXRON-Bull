<script setup lang="ts">
import sleepingGif from '@/assets/clawd-sleeping.gif'
import sleepingStill from '@/assets/clawd-sleeping-still.png'
import { useId } from 'vue'

// An empty chat, after the Agent Dashboard's EmptySession: Clawd dozes until the first prompt.
// Search, offline and "all done" keep the icon tile of NchEmpty; this one is for chats only.
defineProps<{ title: string; hint: string }>()

// The GIF is drawn in Claude orange. This filter paints every orange pixel (red well above blue)
// in --brand and keeps eyes and "z" bubbles, so Clawd follows the theme (18.11.2026).
const tintId = `clawd-tint-${useId()}`
</script>

<template>
  <div
    class="relative flex min-h-64 flex-1 overflow-hidden rounded-xl border border-dashed border-input"
  >
    <div class="pointer-events-none absolute inset-0 clawd-glow" aria-hidden="true" />
    <div class="pointer-events-none absolute inset-0 clawd-dots opacity-40" aria-hidden="true" />

    <div
      class="relative flex flex-1 flex-col items-center justify-center gap-4 px-5 py-6 text-center"
    >
      <svg width="0" height="0" class="absolute" aria-hidden="true">
        <filter :id="tintId" color-interpolation-filters="sRGB">
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  8 0 -8 0 -1"
            result="body"
          />
          <feFlood class="[flood-color:var(--brand)]" result="brand" />
          <feComposite in="brand" in2="body" operator="in" result="tinted" />
          <feComposite in="tinted" in2="SourceGraphic" operator="over" />
        </filter>
      </svg>
      <!-- The first frame only, when the system asks for less motion. -->
      <picture class="shrink-0">
        <source :srcset="sleepingStill" media="(prefers-reduced-motion: reduce)" />
        <img
          :src="sleepingGif"
          alt=""
          width="54"
          height="68"
          class="[image-rendering:pixelated]"
          :style="{ filter: `url(#${tintId})` }"
        />
      </picture>

      <div class="flex min-w-0 flex-col items-center gap-1">
        <p class="text-body font-semibold text-foreground">{{ title }}</p>
        <p class="max-w-[40ch] text-small text-balance text-muted-foreground">{{ hint }}</p>
      </div>

      <!-- Decoration: the prompt line Claude Code would show, waiting with a blinking caret. -->
      <div
        class="flex w-full max-w-56 items-center gap-2 rounded-md border border-input bg-background px-2.5 py-1 font-mono text-meta"
        aria-hidden="true"
      >
        <span class="w-[1ch] shrink-0 text-brand">&gt;</span>
        <span class="h-3.5 w-1.5 shrink-0 caret-blink rounded-[1px] bg-subtle" />
      </div>

      <slot />
    </div>
  </div>
</template>
