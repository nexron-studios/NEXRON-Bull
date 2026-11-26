<script setup lang="ts">
import ChatImageRefChip from '@/components/chat/ChatImageRefChip.vue'
import type { LightboxImage } from '@/utils/attachments'
import { unbreakable } from '@/utils/imageRefs'
import type { TextPiece } from '@/utils/textPieces'

// Highlighted runs in a text: in the composer's mirror behind the textarea and in a sent prompt.
// Nothing here may change the layout, so the mirror wraps like the textarea: a mention is only
// tinted, an image reference keeps its text (invisible) and lays a chip over exactly that room.
// That text must not wrap, or the chip breaks apart: a sent prompt has plain spaces again, and the
// composer only chips references that are unbreakable already.
// `images`: the images the references number, in order; given, a chip opens its image.
const { pieces, images = [] } = defineProps<{
  pieces: readonly TextPiece[]
  images?: readonly LightboxImage[]
}>()
const emit = defineEmits<{ open: [n: number] }>()
</script>

<template>
  <template v-for="(piece, index) in pieces" :key="index">
    <span v-if="piece.mark?.kind === 'mention'" class="rounded-sm bg-brand/25">{{
      piece.text
    }}</span>
    <!-- The decoration has its own colour: the mirror's text is transparent without a chip. -->
    <span
      v-else-if="piece.mark?.kind === 'interim'"
      class="underline decoration-muted-foreground decoration-dotted underline-offset-4"
      >{{ piece.text }}</span
    >
    <span v-else-if="piece.mark?.kind === 'image'" class="relative" :data-image-ref="piece.mark.n"
      ><span class="text-transparent">{{ unbreakable(piece.text) }}</span
      ><ChatImageRefChip
        :mark="piece.mark"
        :image="images[piece.mark.n - 1] ?? null"
        @open="emit('open', $event)"
    /></span>
    <template v-else>{{ piece.text }}</template>
  </template>
</template>
