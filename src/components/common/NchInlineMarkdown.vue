<script setup lang="ts">
import { computed } from 'vue'
import { handleError } from '@/lib/error'
import { openLink } from '@/lib/links'
import { renderInline } from '@/lib/markdown'

// One line of Claude's markdown outside the chat (Jonas, 27.11.2026: the panel showed `**` and
// backticks as they were). Links open in the system browser, as in the chat.
const { text } = defineProps<{ text: string }>()

const html = computed(() => renderInline(text))

const handleClick = (event: MouseEvent) => {
  if (!(event.target instanceof Element)) return
  const link = event.target.closest('a')
  if (!link) return
  event.preventDefault()
  openLink(link.href).catch(handleError)
}
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- markdown-it runs with html: false -->
  <span
    class="[&_a]:rounded-sm [&_a]:text-link [&_a]:underline [&_a]:decoration-link/40 [&_a]:underline-offset-3 [&_a:hover]:text-link-hover [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-meta [&_strong]:font-semibold"
    @click="handleClick"
    v-html="html"
  />
</template>
