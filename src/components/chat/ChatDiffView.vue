<script setup lang="ts">
import { DIFF_MARK_CLASS, DIFF_ROW_CLASS, lineNumberOf, type DiffRow } from '@/utils/diffRows'

// A file change as the terminal shows it (Figma "30"): line number, mark, text; added and removed
// lines on a tint, the unchanged ones around them plain. Numbers only where Claude Code sent them:
// a removed line's in the old file, the others' in the new one.
const { rows } = defineProps<{ rows: DiffRow[] }>()
</script>

<template>
  <div class="max-h-80 overflow-auto py-1.5 font-mono text-meta">
    <template v-for="(row, index) in rows" :key="index">
      <div v-if="row.kind === 'gap'" class="px-3 text-muted-foreground" aria-hidden="true">⋯</div>
      <div v-else class="flex gap-2 px-3" :class="DIFF_ROW_CLASS[row.sign]">
        <span
          v-if="lineNumberOf(row) !== null"
          class="w-8 shrink-0 text-right text-muted-foreground tabular-nums select-none"
          >{{ lineNumberOf(row) }}</span
        >
        <span class="w-2.5 shrink-0 select-none" :class="DIFF_MARK_CLASS[row.sign]">{{
          row.sign.trim()
        }}</span>
        <span class="min-w-0 flex-1 break-all whitespace-pre-wrap">{{ row.text }}</span>
      </div>
    </template>
  </div>
</template>
