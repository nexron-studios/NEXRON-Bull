<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { ChangedFile } from '@/utils/changedFiles'
import { TOOL_ICON, TOOL_KIND_CLASS } from '@/utils/toolIcons'
import { toolInfoOf } from '@/utils/toolKind'

// One file Claude changed: name, the folder it sits in, the lines added and removed. A click shows
// the latest change to it in the chat; the full path is in the tooltip.
const { file } = defineProps<{ file: ChangedFile }>()
const emit = defineEmits<{ open: [] }>()

/** The change kind's icon and colour, as on the Edit and Write rows above. */
const EDIT_LOOK = toolInfoOf('Edit')

const { t } = useI18n()
</script>

<template>
  <li>
    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          class="motion-press flex h-7 w-full min-w-0 items-center gap-2 rounded-sm text-left text-small outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
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
          <span class="sr-only">{{
            t('chat.diff_counts', { added: file.added, removed: file.removed })
          }}</span>
          <span class="flex shrink-0 gap-1.5 pr-1 text-meta tabular-nums" aria-hidden="true">
            <span class="text-good">+{{ file.added }}</span>
            <span class="text-critical">−{{ file.removed }}</span>
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent class="max-w-80 break-all">{{ file.path }}</TooltipContent>
    </Tooltip>
  </li>
</template>
