<script setup lang="ts">
import { computed } from 'vue'
import { FolderOpen, GitBranch, History, Monitor, Search } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import SessionActionsMenu from '@/components/session/SessionActionsMenu.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useGitBranch } from '@/composables/useGitBranch'
import { useMachineLabel } from '@/composables/useMachineLabel'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { useRewindStore } from '@/stores/rewind'
import type { ChatTabState } from '@/utils/chatTab'
import { folderNameOf } from '@/utils/sessionList'
import { CHAT_SEARCH_CHORD } from '@/utils/shortcuts'
import { targetOfTab } from '@/utils/sessionActions'

// Where the chat runs, as one path: machine / folder / branch, then its actions (Figma "30").
// The panel no longer repeats it, model and mode stay in the composer. The full folder path
// waits in the tooltip.
const { tab, isSearchOpen = false } = defineProps<{ tab: ChatTabState; isSearchOpen?: boolean }>()

const emit = defineEmits<{ search: [] }>()

const { t } = useI18n()
const rewind = useRewindStore()
const { labelOf, ariaOf } = useShortcutLabels()
const branch = useGitBranch(
  () => tab.cwd,
  () => tab.machine
)

const { labelOf: machineLabelOf } = useMachineLabel()
const target = computed(() => targetOfTab(tab))
const machineLabel = computed(() => machineLabelOf(tab.machine))
const canRewind = computed(
  () => !!tab.sessionId && tab.status !== 'working' && tab.status !== 'asking'
)
// Outside a repository, or on a machine whose agentd cannot tell, the path ends at the folder.
const isBranchShown = computed(
  () => !branch.isUnknown.value && (branch.isPending.value || !!branch.data.value)
)
</script>

<template>
  <nav
    class="flex h-10 shrink-0 items-center gap-2 border-b border-border pr-2 pl-6 text-meta text-muted-foreground"
    :aria-label="t('panel.session_bar')"
  >
    <template v-if="machineLabel">
      <Monitor
        class="size-4 shrink-0"
        :class="tab.machine && 'text-act-outside'"
        aria-hidden="true"
      />
      <span class="sr-only">{{ t('panel.machine') }}:</span>
      <span class="shrink-0" :class="tab.machine && 'text-foreground'">{{ machineLabel }}</span>
      <span class="text-border" aria-hidden="true">/</span>
    </template>
    <FolderOpen class="size-4 shrink-0" aria-hidden="true" />
    <span class="sr-only">{{ t('panel.folder') }}:</span>
    <Tooltip>
      <TooltipTrigger as-child>
        <span
          tabindex="0"
          class="min-w-0 truncate rounded-sm font-mono text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >{{ folderNameOf(tab.cwd) }}</span
        >
      </TooltipTrigger>
      <TooltipContent>{{ tab.cwd }}</TooltipContent>
    </Tooltip>
    <template v-if="isBranchShown">
      <span class="text-border" aria-hidden="true">/</span>
      <GitBranch class="size-4 shrink-0" aria-hidden="true" />
      <span class="sr-only">{{ t('panel.branch') }}:</span>
      <Skeleton v-if="branch.isPending.value" class="h-4 w-24" />
      <span v-else class="min-w-0 truncate font-mono">{{ branch.data.value }}</span>
    </template>
    <span class="flex-1" aria-hidden="true" />
    <!-- One piece, so a layout snap carries it along the bar's right edge (transitions.css). -->
    <div class="flex shrink-0 items-center gap-2" data-snap-bar-tools>
      <!-- The magnifier grows into the search field (useChatSearch); it stays lit while open. -->
      <NchIconButton
        :label="t('chat_search.open', { key: labelOf(CHAT_SEARCH_CHORD) })"
        :aria-keyshortcuts="ariaOf(CHAT_SEARCH_CHORD)"
        size="icon-sm"
        class="shrink-0"
        :class="{ 'bg-accent text-foreground': isSearchOpen }"
        :aria-expanded="isSearchOpen"
        data-search-button
        @click="emit('search')"
      >
        <Search class="size-4" aria-hidden="true" />
      </NchIconButton>
      <NchIconButton
        :label="t('rewind.open')"
        size="icon-sm"
        class="shrink-0"
        :disabled="!canRewind"
        @click="rewind.openRewind(tab.id)"
      >
        <History class="size-4" aria-hidden="true" />
      </NchIconButton>
      <SessionActionsMenu :target size="icon-sm" trigger-class="shrink-0" />
    </div>
  </nav>
</template>
