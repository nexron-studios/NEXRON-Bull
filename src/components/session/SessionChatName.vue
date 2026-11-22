<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { chatNameSuffixOf, folderNameOf } from '@/utils/sessionList'

// The chat's fixed name as Claude Code and the Agent Dashboard show it (`chatNameOf`). A long
// folder truncates, the ID part stays. The full session ID waits in the tooltip and in the row's
// "Copy session ID".
defineProps<{ cwd: string; sessionId: string }>()

const { t } = useI18n()
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <span class="flex min-w-0 font-mono text-meta"
        ><span class="truncate">{{ folderNameOf(cwd) }}</span
        ><span class="shrink-0">{{ chatNameSuffixOf(sessionId) }}</span></span
      >
    </TooltipTrigger>
    <TooltipContent>{{ t('sidebar.session_id', { id: sessionId }) }}</TooltipContent>
  </Tooltip>
</template>
