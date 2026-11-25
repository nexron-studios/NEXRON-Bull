<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { copyText } from '@/lib/clipboard'
import { chatNameSuffixOf, folderNameOf } from '@/utils/sessionList'

// The chat's fixed name as Claude Code and the Agent Dashboard show it (`chatNameOf`). A long
// folder truncates, the ID part stays. A click copies the full session ID. The name sits inside
// the row's button, so it cannot be a button itself: a control inside a control is invalid and
// screen readers never reach it. Keyboard users copy from the row's "…" and context menu. A tap
// goes to the row: on a touch screen the small name is where a tap to open the chat lands.
const { sessionId } = defineProps<{ cwd: string; sessionId: string }>()

const { t } = useI18n()

const copyId = () => void copyText(sessionId)
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <span
        class="flex min-w-0 cursor-copy font-mono text-meta transition-colors duration-150 hover:text-foreground pointer-coarse:pointer-events-none"
        @click.stop="copyId"
        ><span class="truncate">{{ folderNameOf(cwd) }}</span
        ><span class="shrink-0">{{ chatNameSuffixOf(sessionId) }}</span></span
      >
    </TooltipTrigger>
    <TooltipContent>{{ t('sidebar.session_id_copy', { id: sessionId }) }}</TooltipContent>
  </Tooltip>
</template>
