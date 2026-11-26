<script setup lang="ts">
import { computed } from 'vue'
import { CircleCheck, Folder, Monitor, Play } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import ChatFinishBadge from '@/components/chat/ChatFinishBadge.vue'
import ChatTitleText from '@/components/chat/ChatTitleText.vue'
import { Button } from '@/components/ui/button'
import SessionActionsMenu from '@/components/session/SessionActionsMenu.vue'
import SessionContextMenu from '@/components/session/SessionContextMenu.vue'
import SessionRowBackground from '@/components/session/SessionRowBackground.vue'
import { useAgeFormat } from '@/composables/useAgeFormat'
import { useChatTitle } from '@/composables/useChatTitle'
import { useMachineLabel } from '@/composables/useMachineLabel'
import { useChatStore } from '@/stores/chat'
import { backgroundWorkOf } from '@/utils/chatTab'
import { summaryOf } from '@/utils/finishOrder'
import type { RankedDone } from '@/utils/overview'
import { targetOfDone } from '@/utils/sessionActions'
import { folderNameOf } from '@/utils/sessionList'

// A finished session (Figma "12 Übersicht", list "Fertig"): title, where, when, and continue.
// The design's archive button is the "…" menu: remove from the list, clear, delete. A chat not
// seen yet carries its finish number instead of the check, ① on the good tint (Figma section "Fassung 6").
const { entry, now, staggerIndex } = defineProps<{
  entry: RankedDone
  now: number
  /** Place in the shown rows while the list enters; `null` once it stands */
  staggerIndex: number | null
}>()
const emit = defineEmits<{ resume: [] }>()

const { t } = useI18n()
const { labelOf: machineLabelOf } = useMachineLabel()
const formatAge = useAgeFormat()
const { plainOf: plainTitleOf } = useChatTitle()
const { tabs } = storeToRefs(useChatStore())

const title = computed(() => entry.title || t('chat.new_chat'))
const target = computed(() => targetOfDone(entry, tabs.value))
const age = computed(() => formatAge.value(Math.max(0, now - entry.finishedAt)))
const openTab = computed(() => target.value?.tab ?? null)
// Only an open tab knows Claude's last answer; a transcript row has no messages loaded.
const summary = computed(() => (openTab.value ? summaryOf(openTab.value.messages) : ''))
// Only while the chat is done; a new turn of it says what it does in its running card.
const background = computed(() =>
  openTab.value?.status === 'idle' ? backgroundWorkOf(openTab.value) : []
)

// An open tab's row opens it on a click anywhere, like the finish strip did; a transcript row
// starts Claude, so only its button does that. The row's own buttons handle their clicks, and a
// click that ends a text selection was meant for the text.
const openRow = (event: MouseEvent) => {
  if (!openTab.value) return
  if (event.target instanceof Element && event.target.closest('button')) return
  if (window.getSelection()?.toString()) return
  emit('resume')
}
</script>

<template>
  <!-- The <li> is the root, so the list's TransitionGroup can move it; the context menu renders
       no element of its own. A row reached by Tab stops below the sticky bar and day heading. -->
  <li
    class="scroll-mt-[calc(var(--done-bar-height)+2.5rem)] first:rounded-t-xl last:rounded-b-xl"
    :class="[
      entry.rank === 1 && 'bg-good/7',
      openTab && 'cursor-pointer',
      openTab && (entry.rank === 1 ? 'hover:bg-good/12' : 'hover:bg-muted/40')
    ]"
    @click="openRow"
  >
    <SessionContextMenu :target>
      <div
        class="flex min-w-0 items-center gap-3 px-4 py-3"
        :class="{ 'motion-stagger': staggerIndex !== null }"
        :style="staggerIndex === null ? undefined : { '--stagger-index': staggerIndex }"
      >
        <span class="grid size-5 shrink-0 place-items-center">
          <ChatFinishBadge v-if="entry.rank" :rank="entry.rank" is-large />
          <CircleCheck v-else class="size-4 text-good" aria-hidden="true" />
        </span>
        <!-- Columns from the list's own width (layout.md): the sidebar, not the window, decides. -->
        <div
          class="flex min-w-0 flex-1 flex-col gap-0.5 @2xl:flex-row @2xl:items-center @2xl:gap-4"
        >
          <!-- The title keeps its room; folder and machine give way first in a narrow window. -->
          <span class="flex min-w-0 flex-col @2xl:min-w-40 @2xl:flex-1">
            <span class="truncate text-small font-medium"
              ><ChatTitleText :title :tab="openTab"
            /></span>
            <span v-if="summary" class="truncate text-meta text-muted-foreground @max-2xl:hidden">
              {{ summary }}
            </span>
            <SessionRowBackground
              v-if="background.length"
              :tasks="background"
              class="text-meta text-muted-foreground"
            />
          </span>
          <span class="flex min-w-0 items-center gap-1.5 text-meta text-muted-foreground @2xl:w-56">
            <Folder class="size-3.5 shrink-0" aria-hidden="true" />
            <!-- The folder names the chat, the machine only where; the machine gives way first. -->
            <span class="max-w-1/2 shrink-0 truncate">{{ folderNameOf(entry.cwd) }}</span>
            <span class="shrink-0 rounded-sm border border-border px-1.5 text-subtle">
              {{ entry.account }}
            </span>
            <span
              v-if="machineLabelOf(entry.machine)"
              class="flex min-w-0 items-center gap-1.5 @2xl:hidden"
            >
              <span aria-hidden="true">·</span>
              <span class="truncate">{{ machineLabelOf(entry.machine) }}</span>
            </span>
          </span>
          <span
            v-if="machineLabelOf(entry.machine)"
            class="hidden w-36 min-w-0 items-center gap-1.5 text-meta text-muted-foreground @2xl:flex"
          >
            <Monitor class="size-3.5 shrink-0" aria-hidden="true" />
            <span class="truncate">{{ machineLabelOf(entry.machine) }}</span>
          </span>
        </div>
        <span class="shrink-0 text-right text-meta text-muted-foreground tabular-nums @2xl:w-16">
          <span aria-hidden="true">{{ age }}</span>
          <span class="sr-only">{{ t('sidebar.age_finished', { age }) }}</span>
        </span>
        <Button
          variant="outline"
          size="sm"
          class="motion-press shrink-0 touch-manipulation"
          :aria-label="t('overview.resume_label', { title: plainTitleOf(title) })"
          @click="emit('resume')"
        >
          <Play class="size-3.5" aria-hidden="true" />
          <span class="hidden @2xl:inline">{{ t('overview.resume') }}</span>
        </Button>
        <SessionActionsMenu v-if="target" :target trigger-class="shrink-0 pointer-coarse:size-11" />
      </div>
    </SessionContextMenu>
  </li>
</template>
