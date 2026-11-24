<script setup lang="ts">
import type { HighlightKind, TextPiece } from '@/utils/textPieces'

// Highlighted runs in a text: in the composer's mirror behind the textarea and in a sent prompt.
// Only background and ring, both outside the layout, so the mirror wraps like the textarea.
const { pieces } = defineProps<{ pieces: readonly TextPiece[] }>()

const HIGHLIGHT_CLASS: Record<HighlightKind, string> = {
  mention: 'rounded-sm bg-brand/25',
  image: 'rounded-sm bg-brand/20 ring-1 ring-brand/50'
}
</script>

<template>
  <template v-for="(piece, index) in pieces" :key="index">
    <span v-if="piece.kind" :class="HIGHLIGHT_CLASS[piece.kind]">{{ piece.text }}</span>
    <template v-else>{{ piece.text }}</template>
  </template>
</template>
