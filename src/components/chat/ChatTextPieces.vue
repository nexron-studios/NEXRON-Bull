<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { unbreakable } from '@/utils/imageRefs'
import type { TextPiece } from '@/utils/textPieces'

// Highlighted runs in a text: in the composer's mirror behind the textarea and in a sent prompt.
// Nothing here may change the layout, so the mirror wraps like the textarea: a mention is only
// tinted, an image reference keeps its text (invisible) and lays a chip over exactly that room.
// That text must not wrap, or the chip breaks apart: a sent prompt has plain spaces again, and the
// composer only chips references that are unbreakable already.
const { pieces } = defineProps<{ pieces: readonly TextPiece[] }>()

const { t } = useI18n()
</script>

<template>
  <template v-for="(piece, index) in pieces" :key="index">
    <span v-if="piece.mark?.kind === 'mention'" class="rounded-sm bg-brand/25">{{
      piece.text
    }}</span>
    <span v-else-if="piece.mark?.kind === 'image'" class="relative"
      ><span class="text-transparent">{{ unbreakable(piece.text) }}</span
      ><span
        aria-hidden="true"
        class="absolute inset-x-0 top-1/2 flex h-5 -translate-y-1/2 items-center gap-1 overflow-hidden rounded-md bg-brand/15 pr-1.5 pl-0.5 text-small whitespace-nowrap ring-1 ring-brand/40 ring-inset"
        ><img :src="piece.mark.src" alt="" class="size-4 shrink-0 rounded-sm object-cover" /><span
          class="shrink-0 font-medium text-foreground"
          >{{ t('chat.image_n', { n: piece.mark.n }) }}</span
        ><span class="min-w-0 truncate text-muted-foreground">{{ piece.mark.name }}</span></span
      ></span
    >
    <template v-else>{{ piece.text }}</template>
  </template>
</template>
