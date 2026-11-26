<script setup lang="ts">
import { computed } from 'vue'
import { Copy, Download, Minus, Plus, Redo2, Undo2 } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import ChatMarkupTools from '@/components/chat/ChatMarkupTools.vue'
import { Button } from '@/components/ui/button'
import { useMarkup } from '@/composables/useMarkup'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { stepZoom } from '@/utils/markup'
import { REDO_CHORDS, UNDO_CHORD } from '@/utils/shortcuts'

// Floating bar under the desktop preview (Figma "20", "20b"): the drawing tools with undo and redo
// wherever the markup has somewhere to go, then zoom, copy and download. No switch between
// viewing and marking (Jonas, 25.11.2026): drawing is always one click away.
const { canMark } = defineProps<{ canMark: boolean }>()
const emit = defineEmits<{ copy: []; download: [] }>()

const zoom = defineModel<number>('zoom', { required: true })

const { t, locale } = useI18n()
const { ariaOf } = useShortcutLabels()
const markup = useMarkup()

const zoomLabel = computed(() =>
  new Intl.NumberFormat(locale.value, { style: 'percent' }).format(zoom.value)
)
</script>

<template>
  <div
    class="flex items-center gap-1 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl"
  >
    <template v-if="canMark">
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
      <span class="mx-1 h-6 w-px bg-border" aria-hidden="true" />
    </template>

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
  </div>
</template>
