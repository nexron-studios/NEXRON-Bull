<script setup lang="ts">
import { computed } from 'vue'
import { Copy, Download, Eye, Minus, PenLine, Plus, Redo2, Undo2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import ChatMarkupTools from '@/components/chat/ChatMarkupTools.vue'
import { Button } from '@/components/ui/button'
import { useMarkup } from '@/composables/useMarkup'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { stepZoom } from '@/utils/markup'
import { REDO_CHORDS, UNDO_CHORD } from '@/utils/shortcuts'
import type { LightboxMode } from '@/utils/lightbox'

// Floating bar under the desktop preview (Figma "20", "20b"): view or mark, then zoom, copy and
// download while viewing, or the drawing tools with undo and redo while marking.
const { canMark } = defineProps<{ canMark: boolean }>()
const emit = defineEmits<{ copy: []; download: [] }>()

const mode = defineModel<LightboxMode>('mode', { required: true })
const zoom = defineModel<number>('zoom', { required: true })

const { t, locale } = useI18n()
const { ariaOf } = useShortcutLabels()
const markup = useMarkup()

const zoomLabel = computed(() =>
  new Intl.NumberFormat(locale.value, { style: 'percent' }).format(zoom.value)
)

const SEGMENT = 'h-8 gap-1.5 px-2.5 text-small'
</script>

<template>
  <div
    class="flex items-center gap-1 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
  >
    <div v-if="canMark" role="group" :aria-label="t('images.mode')" class="flex gap-0.5">
      <Button
        variant="ghost"
        :class="[SEGMENT, { 'bg-accent': mode === 'view' }]"
        :aria-pressed="mode === 'view'"
        @click="mode = 'view'"
      >
        <Eye aria-hidden="true" />
        {{ t('images.view') }}
      </Button>
      <Button
        variant="ghost"
        :class="[SEGMENT, { 'bg-accent': mode === 'mark' }]"
        :aria-pressed="mode === 'mark'"
        @click="mode = 'mark'"
      >
        <PenLine aria-hidden="true" />
        {{ t('images.mark') }}
      </Button>
    </div>
    <span v-if="canMark" class="mx-1 h-6 w-px bg-border" aria-hidden="true" />

    <template v-if="mode === 'view'">
      <NchIconButton :label="t('images.zoom_out')" @click="zoom = stepZoom(zoom, -1)">
        <Minus class="size-4" aria-hidden="true" />
      </NchIconButton>
      <Button
        variant="ghost"
        class="h-8 min-w-16 px-2 text-small tabular-nums"
        :aria-label="t('images.zoom_reset')"
        @click="zoom = 1"
      >
        {{ zoomLabel }}
      </Button>
      <NchIconButton :label="t('images.zoom_in')" @click="zoom = stepZoom(zoom, 1)">
        <Plus class="size-4" aria-hidden="true" />
      </NchIconButton>
      <span class="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      <NchIconButton :label="t('images.copy')" @click="emit('copy')">
        <Copy class="size-4" aria-hidden="true" />
      </NchIconButton>
      <NchIconButton :label="t('images.download')" @click="emit('download')">
        <Download class="size-4" aria-hidden="true" />
      </NchIconButton>
    </template>

    <template v-else>
      <ChatMarkupTools />
      <span class="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      <NchIconButton
        :label="t('images.undo')"
        :aria-keyshortcuts="ariaOf(UNDO_CHORD)"
        :disabled="!markup.canUndo.value"
        @click="markup.undo"
      >
        <Undo2 class="size-4" aria-hidden="true" />
      </NchIconButton>
      <NchIconButton
        :label="t('images.redo')"
        :aria-keyshortcuts="ariaOf(...REDO_CHORDS)"
        :disabled="!markup.canRedo.value"
        @click="markup.redo"
      >
        <Redo2 class="size-4" aria-hidden="true" />
      </NchIconButton>
    </template>
  </div>
</template>
