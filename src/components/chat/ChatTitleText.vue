<script setup lang="ts">
import { computed } from 'vue'
import { Image } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useChatTitle } from '@/composables/useChatTitle'
import { promptImageSrcsOf, titleSourceOf, type TitleSourceTab } from '@/utils/chatTitle'

// A chat title as inline text, its image references as small chips like the composer's. With the
// chat's `tab`, a chip shows the thumbnail from the chat's first prompt, if the title was cut from
// it and the history reaches back to it; otherwise an icon. Sized in `em`, it fits a row as well as
// a card heading.
const { title, tab = null } = defineProps<{
  title: string
  tab?: TitleSourceTab | null
}>()

const { t } = useI18n()
const { piecesOf } = useChatTitle()

const pieces = computed(() => piecesOf(title))
// Only looked up for a title that has references; most titles are Haiku's and have none.
const source = computed(() =>
  tab && pieces.value.some((piece) => piece.kind === 'image') ? titleSourceOf(title, tab) : null
)
// Its own computed: a new message leaves the source the same object, so the data URLs of large
// images are not built again for every message that streams in.
const srcs = computed(() => (source.value ? promptImageSrcsOf(source.value) : []))
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
