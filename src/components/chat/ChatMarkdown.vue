<script setup lang="ts">
import { computed } from 'vue'
import { openUrl } from '@tauri-apps/plugin-opener'
import ChatCallout from '@/components/chat/ChatCallout.vue'
import { copyText } from '@/lib/clipboard'
import { handleError } from '@/lib/error'
import { renderSegments } from '@/lib/markdown'
import { useChatStore } from '@/stores/chat'
import { usePreviewStore } from '@/stores/preview'

// `small`: inside a compact card (the plan), where headings stay at body size.
// `hasCalloutActions`: the last answer of a finished turn, whose callouts get their buttons.
const {
  text,
  size = 'body',
  hasCalloutActions = false
} = defineProps<{ text: string; size?: 'body' | 'small'; hasCalloutActions?: boolean }>()

const SIZE_CLASSES = {
  body: 'gap-3 text-body [&_h1]:text-title [&_h2]:text-title',
  small: 'gap-2 text-small [&_h1]:text-body [&_h2]:text-body'
} as const
const SPACING = { body: 'space-y-3', small: 'space-y-2' } as const

const chat = useChatStore()
const preview = usePreviewStore()

// Callouts (`> [!question] …`) become components with buttons; the rest stays markdown.
const segments = computed(() => renderSegments(text))

const copyCode = (button: HTMLElement) => {
  void copyText(button.closest('pre')?.querySelector('code')?.textContent ?? '')
}

// Links would navigate the app window away; they open in the system browser instead.
const handleClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  const copyButton = target.closest<HTMLElement>('[data-copy]')
  if (copyButton) return copyCode(copyButton)
  // Only the shown chat's answers are on screen, so the button belongs to the active tab.
  const previewUrl = target.closest<HTMLElement>('[data-preview]')?.dataset.preview
  if (previewUrl && chat.activeTab) return preview.show(chat.activeTab, previewUrl)
  const link = target.closest('a')
  if (!link) return
  event.preventDefault()
  openUrl(link.href).catch(handleError)
}
</script>

<template>
  <div
    :class="SIZE_CLASSES[size]"
    class="flex max-w-[72ch] flex-col break-words [&_.preview-link]:ml-1 [&_.preview-link]:inline-flex [&_.preview-link]:items-center [&_.preview-link]:gap-1 [&_.preview-link]:rounded-md [&_.preview-link]:border [&_.preview-link]:border-border [&_.preview-link]:px-1.5 [&_.preview-link]:align-middle [&_.preview-link]:text-meta [&_.preview-link]:text-muted-foreground [&_.preview-link]:transition-colors [&_.preview-link_svg]:size-3.5 [&_.preview-link:focus-visible]:ring-2 [&_.preview-link:focus-visible]:ring-ring [&_.preview-link:focus-visible]:outline-none [&_.preview-link:hover]:bg-accent [&_.preview-link:hover]:text-foreground [&_.task-check]:mr-1 [&_.task-check]:align-middle [&_.task-check]:accent-good [&_.task-item]:-ml-5 [&_.task-item]:list-none [&_a]:rounded-sm [&_a]:text-link [&_a]:underline [&_a]:decoration-link/40 [&_a]:underline-offset-3 [&_a:hover]:bg-link/12 [&_a:hover]:text-link-hover [&_a:hover]:decoration-link-hover [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-subtle [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-small [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_hr]:border-border [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:block [&_table]:max-w-full [&_table]:border-collapse [&_table]:overflow-x-auto [&_table]:text-small [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium [&_ul]:list-disc [&_ul]:pl-5"
    @click="handleClick"
  >
    <template v-for="(segment, index) in segments" :key="index">
      <!-- eslint-disable-next-line vue/no-v-html -- markdown-it runs with html: false -->
      <div v-if="segment.kind === 'markdown'" :class="SPACING[size]" v-html="segment.html" />
      <ChatCallout
        v-else
        :callout="segment.callout"
        :html="segment.html"
        :has-actions="hasCalloutActions"
      />
    </template>
  </div>
</template>
