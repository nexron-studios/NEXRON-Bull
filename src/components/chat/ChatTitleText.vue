<script setup lang="ts">
import { computed } from 'vue'
import { Image } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useChatTitle } from '@/composables/useChatTitle'

// A chat title as inline text, its image references as small chips like the composer's. The title
// carries no images, so the chip shows an icon where the composer shows the thumbnail. Sized in
// `em`, it fits the meta line of a row as well as a card heading.
const { title } = defineProps<{ title: string }>()

const { t } = useI18n()
const { piecesOf } = useChatTitle()

const pieces = computed(() => piecesOf(title))
</script>

<template>
  <template v-for="(piece, index) in pieces" :key="index">
    <template v-if="piece.kind === 'text'">{{ piece.text }}</template>
    <span
      v-else
      class="inline-flex items-center gap-[0.25em] rounded-sm bg-brand/15 px-[0.3em] align-[-0.15em] leading-[1.25] ring-1 ring-brand/40 ring-inset"
      ><Image class="size-[0.9em] shrink-0" aria-hidden="true" />{{
        t('chat.image_n', { n: piece.n })
      }}</span
    >
  </template>
</template>
