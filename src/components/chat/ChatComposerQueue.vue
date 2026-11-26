<script setup lang="ts">
import { ref } from 'vue'
import { Clock, CornerDownLeft, Pencil, X } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import ChatImageLightbox from '@/components/chat/ChatImageLightbox.vue'
import ChatTextPieces from '@/components/chat/ChatTextPieces.vue'
import NchIconButton from '@/components/common/NchIconButton.vue'
import NchKbd from '@/components/common/NchKbd.vue'
import { useImageRefFormat } from '@/composables/useImageRefFormat'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import type { HeldPrompt } from '@/stores/heldPrompts'
import type { LightboxImage } from '@/utils/attachments'
import { sentImageRefHighlightsOf } from '@/utils/imageRefs'
import { SEND_CHORD } from '@/utils/shortcuts'
import { parseSlashInput } from '@/utils/slashCommands'
import { textPiecesOf } from '@/utils/textPieces'

// Figma 30: what was sent while Claude works or waits for a decision, numbered above the composer
// until the turn ends. Each one can go into the running turn at once, as Ctrl/Cmd+Enter does for
// the draft; a slash command cannot, Claude runs it only as a turn of its own.
defineProps<{ prompts: HeldPrompt[] }>()
const emit = defineEmits<{ edit: [id: string]; remove: [id: string]; sendNow: [id: string] }>()

const { t } = useI18n()
const { labelOf } = useShortcutLabels()
const imageRefFormat = useImageRefFormat()

// "[Bild 1 (Name…)]" reads as the same chip as in the composer and a sent prompt.
const piecesOf = (prompt: HeldPrompt) =>
  textPiecesOf(
    prompt.text,
    sentImageRefHighlightsOf(
      prompt.text,
      prompt.images.map((image) => image.src),
      imageRefFormat.value
    )
  )

// Only to look at: without an `id` the preview offers no markup that would replace an attachment.
const imagesOf = (prompt: HeldPrompt): LightboxImage[] =>
  prompt.images.map(({ src, name, bytes }) => ({ src, name, bytes }))

const previewImages = ref<LightboxImage[]>([])
const previewIndex = ref(0)
const isPreviewOpen = ref(false)
const openPreview = (prompt: HeldPrompt, n: number) => {
  previewImages.value = imagesOf(prompt)
  previewIndex.value = n - 1
  isPreviewOpen.value = true
}
</script>

<template>
  <section class="flex flex-col gap-1.5" :aria-label="t('prompt_input.queue_title')">
    <div class="flex items-center gap-1.5 text-meta text-muted-foreground">
      <Clock class="size-3.5 shrink-0" aria-hidden="true" />
      <p class="min-w-0 flex-1 truncate">{{ t('prompt_input.queue_title') }}</p>
      <i18n-t
        keypath="prompt_input.queue_into_turn_hint"
        tag="p"
        scope="global"
        class="flex shrink-0 items-center gap-1 pr-1 pointer-coarse:hidden"
      >
        <template #key><NchKbd :key-label="labelOf(SEND_CHORD)" /></template>
      </i18n-t>
    </div>
    <ol class="flex flex-col gap-1">
      <li
        v-for="(prompt, index) in prompts"
        :key="prompt.id"
        class="flex items-center gap-2.5 rounded-xl border border-border bg-card py-1 pr-1 pl-3"
      >
        <span
          class="grid size-5 shrink-0 place-items-center rounded-full bg-secondary text-meta text-secondary-foreground tabular-nums"
          aria-hidden="true"
        >
          {{ index + 1 }}
        </span>
        <span class="min-w-0 flex-1 truncate text-small">
          <ChatTextPieces
            :pieces="piecesOf(prompt)"
            :images="imagesOf(prompt)"
            @open="openPreview(prompt, $event)"
          />
        </span>
        <span v-if="prompt.images.length" class="shrink-0 text-meta text-muted-foreground">
          {{ t('prompt_input.queue_images', { n: prompt.images.length }) }}
        </span>
        <NchIconButton
          v-if="!parseSlashInput(prompt.text)"
          :label="t('prompt_input.queue_send_now', { n: index + 1 })"
          size="icon-sm"
          class="shrink-0 text-muted-foreground"
          @click="emit('sendNow', prompt.id)"
        >
          <CornerDownLeft class="size-3.5" aria-hidden="true" />
        </NchIconButton>
        <NchIconButton
          :label="t('prompt_input.queue_edit', { n: index + 1 })"
          size="icon-sm"
          class="shrink-0 text-muted-foreground"
          @click="emit('edit', prompt.id)"
        >
          <Pencil class="size-3.5" aria-hidden="true" />
        </NchIconButton>
        <NchIconButton
          :label="t('prompt_input.queue_remove', { n: index + 1 })"
          size="icon-sm"
          class="shrink-0 text-muted-foreground"
          @click="emit('remove', prompt.id)"
        >
          <X class="size-3.5" aria-hidden="true" />
        </NchIconButton>
      </li>
    </ol>
    <ChatImageLightbox
      v-if="previewImages.length"
      v-model:open="isPreviewOpen"
      v-model:index="previewIndex"
      :images="previewImages"
    />
  </section>
</template>
