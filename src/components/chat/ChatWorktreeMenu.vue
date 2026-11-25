<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, FolderX, GitBranch, GitMerge, LoaderCircle } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useSessionActionsStore } from '@/stores/sessionActions'
import { useWorktreeActionsStore } from '@/stores/worktreeActions'
import type { ChatTabState } from '@/utils/chatTab'

// The branch of a chat that runs in its own worktree: it says so, and opens what comes next for
// the branch, merging it into `preview` for the dev server and removing the worktree once done.
// `root` is the worktree's top folder: a chat on a subfolder removes all of it.
const { tab, branch, root } = defineProps<{ tab: ChatTabState; branch: string; root: string }>()

const { t } = useI18n()
const worktrees = useWorktreeActionsStore()
const actions = useSessionActionsStore()

const isMerging = computed(() => worktrees.mergingTabs.has(tab.id))
</script>

<template>
  <DropdownMenu :modal="false">
    <DropdownMenuTrigger
      class="motion-press -mx-1.5 flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-[color,background-color,transform] duration-150 ease-out outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted aria-expanded:text-foreground"
      :aria-label="t('worktree.menu_label', { branch })"
    >
      <GitBranch class="size-4 shrink-0" aria-hidden="true" />
      <span class="min-w-0 truncate font-mono">{{ branch }}</span>
      <span
        class="shrink-0 rounded-sm border border-border px-1 text-meta leading-4 text-muted-foreground"
        >{{ t('worktree.badge') }}</span
      >
      <ChevronDown class="size-3.5 shrink-0" aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-auto max-w-80 min-w-56">
      <DropdownMenuLabel class="flex flex-col gap-0.5 font-normal">
        <span class="text-small font-medium">{{ t('worktree.menu_title') }}</span>
        <span class="text-meta break-words text-muted-foreground">{{ tab.cwd }}</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem :disabled="isMerging" @select="worktrees.mergeIntoPreview(tab)">
        <LoaderCircle v-if="isMerging" class="animate-spin" aria-hidden="true" />
        <GitMerge v-else aria-hidden="true" />
        {{ isMerging ? t('worktree.merging') : t('worktree.merge') }}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" @select="actions.requestRemoveWorktree(tab, root)">
        <FolderX aria-hidden="true" />
        {{ t('worktree.remove') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
