<script setup lang="ts">
import { ref } from 'vue'
import { PenLine, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import ChatImageTooltip from '@/components/chat/ChatImageTooltip.vue'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { MOVE_CHORD } from '@/utils/shortcuts'
import { naturalSizeOf, type Size } from '@/utils/markup'
import type { PendingImage } from '@/utils/content'

// One attachment in the composer (Figma "20c"): thumbnail, name cut at 16 characters, remove.
const { image } = defineProps<{ image: PendingImage }>()
const emit = defineEmits<{ open: []; remove: []; keydown: [event: KeyboardEvent] }>()

const size = ref<Size | null>(null)

const { t } = useI18n()
const { ariaOf } = useShortcutLabels()
</script>

<template>
  <div
    class="flex h-9 items-center gap-1 rounded-lg border border-border bg-secondary py-0.5 pr-0.5 pl-0.5 transition-colors hover:border-muted-foreground"
  >
    <ChatImageTooltip :name="image.name" :bytes="image.bytes" :size>
      <button
        type="button"
        :aria-label="
          t(image.isMarked ? 'images.open_marked' : 'chat.open_image', { name: image.name })
        "
        class="flex min-w-0 cursor-zoom-in items-center gap-2 rounded-md pr-1 text-small text-secondary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :data-image-id="image.id"
        :aria-keyshortcuts="ariaOf(MOVE_CHORD)"
        @click="emit('open')"
        @keydown="emit('keydown', $event)"
      >
        <span class="relative size-7.5 shrink-0">
          <img
            :src="image.src"
            alt=""
            class="size-full rounded-md object-cover"
            @load="size = naturalSizeOf($event)"
          />
          <span
            v-if="image.isMarked"
            aria-hidden="true"
            class="absolute -right-1 -bottom-1 grid size-3.5 place-items-center rounded-full bg-brand text-brand-foreground ring-2 ring-secondary"
          >
            <PenLine class="size-2" aria-hidden="true" />
          </span>
        </span>
        <span class="max-w-[16ch] truncate">{{ image.name }}</span>
      </button>
    </ChatImageTooltip>
    <NchIconButton
      :label="t('chat.remove_image', { name: image.name })"
      size="icon-xs"
      class="shrink-0 text-muted-foreground"
      data-no-drag
      @click="emit('remove')"
    >
      <X aria-hidden="true" />
    </NchIconButton>
  </div>
</template>
