<script setup lang="ts">
import { computed } from 'vue'
import { Download, Image, Redo2, Undo2, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useMarkup } from '@/composables/useMarkup'

// Top of the preview. Desktop (Figma "20"): name and size left, counter or strokes and close
// right. Phone (Figma "M19", "M20"): close, centred title, download; while marking cancel, title,
// undo and redo.
const { name, meta, counter, isPhone, isMarking } = defineProps<{
  name: string
  meta: string
  /** "1 / 3", or null for a single image */
  counter: string | null
  isPhone: boolean
  isMarking: boolean
}>()
const emit = defineEmits<{ close: []; cancel: []; download: [] }>()

const { t } = useI18n()
const markup = useMarkup()

const strokeCount = computed(() =>
  t('images.stroke_count', { n: markup.strokes.value.length }, markup.strokes.value.length)
)
const subtitle = computed(() => (counter ? `${counter} · ${meta}` : meta))

// Icon buttons on the dark stage: light icon, a faint light hover; touch size on phones.
const ON_STAGE = 'text-stage-foreground hover:bg-stage-foreground/10 hover:text-stage-foreground'
const ON_STAGE_PHONE = `size-11 ${ON_STAGE}`
</script>

<template>
  <header v-if="isPhone && isMarking" class="flex h-12 items-center gap-1 px-1">
    <Button
      variant="ghost"
      class="h-11 px-3 text-body text-stage-foreground hover:bg-stage-foreground/10 hover:text-stage-foreground"
      @click="emit('cancel')"
    >
      {{ t('images.cancel') }}
    </Button>
    <DialogTitle class="flex-1 text-center text-body font-semibold">
      {{ t('images.mark') }}
    </DialogTitle>
    <DialogDescription class="sr-only">{{ name }}</DialogDescription>
    <NchIconButton
      :label="t('images.undo')"
      :disabled="!markup.canUndo.value"
      :class="ON_STAGE_PHONE"
      @click="markup.undo"
    >
      <Undo2 class="size-5" aria-hidden="true" />
    </NchIconButton>
    <NchIconButton
      :label="t('images.redo')"
      :disabled="!markup.canRedo.value"
      :class="ON_STAGE_PHONE"
      @click="markup.redo"
    >
      <Redo2 class="size-5" aria-hidden="true" />
    </NchIconButton>
  </header>

  <header v-else-if="isPhone" class="flex h-14 items-center gap-1 px-1">
    <NchIconButton :label="t('chat.close_image')" :class="ON_STAGE_PHONE" @click="emit('close')">
      <X class="size-5" aria-hidden="true" />
    </NchIconButton>
    <div class="min-w-0 flex-1 text-center">
      <DialogTitle class="truncate text-body font-semibold">{{ name }}</DialogTitle>
      <DialogDescription class="text-meta tabular-nums opacity-70" aria-live="polite">
        {{ subtitle }}
      </DialogDescription>
    </div>
    <NchIconButton :label="t('images.download')" :class="ON_STAGE_PHONE" @click="emit('download')">
      <Download class="size-5" aria-hidden="true" />
    </NchIconButton>
  </header>

  <header v-else class="flex items-center gap-3 text-stage-foreground">
    <span
      class="grid size-8 shrink-0 place-items-center rounded-lg bg-stage-foreground/10"
      aria-hidden="true"
    >
      <Image class="size-4" />
    </span>
    <div class="flex min-w-0 flex-1 items-baseline gap-3">
      <DialogTitle class="truncate text-body font-semibold">{{ name }}</DialogTitle>
      <DialogDescription class="shrink-0 text-meta tabular-nums opacity-70">
        {{ meta }}
      </DialogDescription>
    </div>
    <span class="text-small tabular-nums opacity-70" aria-live="polite">
      {{ isMarking ? strokeCount : counter }}
    </span>
    <NchIconButton
      :label="t('chat.close_image')"
      :class="['size-9', ON_STAGE]"
      @click="emit('close')"
    >
      <X class="size-5" aria-hidden="true" />
    </NchIconButton>
  </header>
</template>
