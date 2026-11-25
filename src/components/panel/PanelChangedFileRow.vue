<script setup lang="ts">
import { MessageSquareText } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ChangedFile } from '@/utils/changedFiles'
import { TOOL_ICON, TOOL_KIND_CLASS } from '@/utils/toolIcons'
import { toolInfoOf } from '@/utils/toolKind'

// One file Claude changed: name, the folder it sits in, the lines added and removed. A click opens
// its diff in the review; the button beside it shows the latest change in the chat, as the row
// itself did before the review. The full path is in the tooltip.
const { file } = defineProps<{ file: ChangedFile }>()
const emit = defineEmits<{ open: []; reveal: [] }>()

/** The change kind's icon and colour, as on the Edit and Write rows above. */
const EDIT_LOOK = toolInfoOf('Edit')

const { t } = useI18n()
</script>

<template>
  <li class="group flex min-w-0 items-center gap-0.5">
    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          class="motion-press flex h-7 min-w-0 flex-1 items-center gap-2 rounded-sm text-left text-small outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
          :aria-label="
            t('review.open_file', { name: file.name, added: file.added, removed: file.removed })
          "
          @click="emit('open')"
        >
          <component
            :is="TOOL_ICON[EDIT_LOOK.icon]"
            class="size-3.5 shrink-0"
            :class="TOOL_KIND_CLASS[EDIT_LOOK.kind]"
            aria-hidden="true"
          />
          <span class="max-w-full min-w-0 shrink-0 truncate font-medium">{{ file.name }}</span>
          <span class="min-w-0 flex-1 truncate font-mono text-meta text-muted-foreground">
            {{ file.folder }}
          </span>
          <span class="flex shrink-0 gap-1.5 pr-1 text-meta tabular-nums" aria-hidden="true">
            <span class="text-good">+{{ file.added }}</span>
            <span class="text-critical">−{{ file.removed }}</span>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent class="max-w-80 break-all">{{ file.path }}</TooltipContent>
    </Tooltip>
    <!-- Quiet until the row is pointed at or reached by keyboard; touch has no hover, so it stays. -->
    <NchIconButton
      :label="t('review.show_in_chat_of', { name: file.name })"
      size="icon-xs"
      class="shrink-0 text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
      @click="emit('reveal')"
    >
      <MessageSquareText class="size-3.5" aria-hidden="true" />
    </NchIconButton>
  </li>
</template>
