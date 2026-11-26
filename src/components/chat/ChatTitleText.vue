<script setup lang="ts">
import { computed } from 'vue'
import { Image } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useChatTitle } from '@/composables/useChatTitle'
import type { ChatMessage } from '@/types/agentd.type'
import { titleImageSrcsOf } from '@/utils/chatTitle'

// A chat title as inline text, its image references as small chips like the composer's. With the
// chat's `messages`, a chip shows the thumbnail of the prompt the title came from; without them, or
// when that prompt is not loaded, an icon. Sized in `em`, it fits a row as well as a card heading.
const { title, messages = [] } = defineProps<{
  title: string
  messages?: readonly ChatMessage[]
}>()

const { t } = useI18n()
const { piecesOf } = useChatTitle()

const pieces = computed(() => piecesOf(title))
// Only searched for a title that has references; most titles are Haiku's and have none.
const srcs = computed(() =>
  pieces.value.some((piece) => piece.kind === 'image') ? titleImageSrcsOf(title, messages) : []
)
</script>

<template>
  <template v-for="(piece, index) in pieces" :key="index">
    <template v-if="piece.kind === 'text'">{{ piece.text }}</template>
    <span
      v-else
      class="inline-flex items-center gap-[0.25em] rounded-sm bg-brand/15 px-[0.3em] align-[-0.15em] leading-[1.25] ring-1 ring-brand/40 ring-inset"
      ><img
        v-if="srcs[piece.n - 1]"
        :src="srcs[piece.n - 1]"
        alt=""
        class="size-[0.95em] shrink-0 rounded-[0.15em] object-cover"
      /><Image v-else class="size-[0.9em] shrink-0" aria-hidden="true" />{{
        t('chat.image_n', { n: piece.n })
      }}</span
    >
  </template>
</template>
