<script setup lang="ts">
import { computed } from 'vue'
import { Folder, GripVertical } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import ChatMutedMark from '@/components/chat/ChatMutedMark.vue'
import ChatStatusIcon from '@/components/chat/ChatStatusIcon.vue'
import ChatTitleText from '@/components/chat/ChatTitleText.vue'
import SessionActionsMenu from '@/components/session/SessionActionsMenu.vue'
import SessionChatName from '@/components/session/SessionChatName.vue'
import SessionContextMenu from '@/components/session/SessionContextMenu.vue'
import SessionRowBackground from '@/components/session/SessionRowBackground.vue'
import SessionRowBadges from '@/components/session/SessionRowBadges.vue'
import SessionRowLive from '@/components/session/SessionRowLive.vue'
import { useActivityLabel } from '@/composables/useActivityLabel'
import { useAgeFormat } from '@/composables/useAgeFormat'
import { useChatStore } from '@/stores/chat'
import { openQuestionOf } from '@/utils/answerCallouts'
import { backgroundWorkOf, isBusyStatus } from '@/utils/chatTab'
import { targetOfTab } from '@/utils/sessionActions'
import { rowActivityOf, type SessionRow } from '@/utils/sessionList'

// `wide` is the full-width overview: one line per session, the step in its own column.
const {
  row,
  isActive,
  now,
  isWide = false,
  isSortable = false,
  isSeen = false
} = defineProps<{
  row: SessionRow
  isActive: boolean
  now: number
  isWide?: boolean
  isSortable?: boolean
  /** Finished and seen, next to rows that still carry a finish number: steps back */
  isSeen?: boolean
}>()
const emit = defineEmits<{ open: [] }>()

const { t } = useI18n()
const formatAge = useAgeFormat()
const activityLabel = useActivityLabel()
const { finishRanks } = storeToRefs(useChatStore())

const target = computed(() => targetOfTab(row.tab))
const rank = computed(() => finishRanks.value.get(row.tab.id) ?? null)
const isBusy = computed(() => row.group === 'needs' || row.group === 'running')
const isEmpty = computed(() => row.group === 'empty')
const age = computed(() =>
  row.since === null ? '' : formatAge.value(Math.max(0, now - row.since))
)
// A row under "needs" may also be an answer that ended on a question: its age is since the answer.
const ageLabel = computed(() =>
  t(isBusyStatus(row.status) ? 'sidebar.age_running' : 'sidebar.age_finished', { age: age.value })
)
const activity = computed(() => {
  const current = isBusy.value ? rowActivityOf(row.tab) : null
  return current ? activityLabel(current) : ''
})
// Shells or agents Claude still runs get the line a busy row's activity has: under "done" a shell
// the chat left running, under "running" the agent that holds it there. While Claude itself works
// the line says what it does now instead.
const background = computed(() => (isEmpty.value ? [] : backgroundWorkOf(row.tab)))
</script>

<template>
  <SessionContextMenu :target>
    <div class="group/row relative">
      <span
        v-if="isActive"
        class="absolute inset-y-1.5 left-0 z-10 w-0.5 rounded-full bg-brand"
        aria-hidden="true"
      />
      <!-- Mouse only; the order is a preference, nothing a keyboard user needs to reach a session. -->
      <span
        v-if="isSortable"
        data-drag-handle
        class="absolute inset-y-0 left-0.5 z-10 grid w-4 cursor-grab touch-none place-items-center text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/row:opacity-100"
        aria-hidden="true"
      >
        <GripVertical class="size-3.5" />
      </span>
      <button
        type="button"
        class="motion-press flex w-full touch-manipulation items-center gap-3 rounded-lg py-2 pr-2.5 pl-5 text-left hover:bg-muted/60 has-[[data-copy-id]:active]:transform-none pointer-coarse:pr-12"
        :class="{ 'bg-muted hover:bg-muted': isActive }"
        :aria-current="isActive ? 'true' : undefined"
        @click="emit('open')"
      >
        <!-- Seen: icon and title at 72 % like Figma. The muted parts keep their colour, at 72 %
             they would drop to 3:1. -->
        <!-- Narrow: level with the title line, like the age, not centred on two or three lines. -->
        <span
          class="flex size-4 shrink-0 items-center justify-center"
          :class="[isWide ? 'self-center' : 'mt-0.5 self-start', { 'opacity-72': isSeen }]"
        >
          <ChatStatusIcon
            :status="row.status"
            :is-empty
            :rank
            :is-failed="row.tab.notice !== null"
            :is-waiting="row.tab.limit.kind === 'waiting'"
            :has-question="openQuestionOf(row.tab) !== null"
          />
        </span>
        <span v-if="isWide" class="flex min-w-0 flex-1 items-center gap-4 text-small">
          <span class="flex w-64 min-w-0 shrink-0 items-center gap-1.5">
            <span class="truncate font-medium text-foreground" :class="{ 'opacity-72': isSeen }">
              <ChatTitleText
                :title="row.title || t('chat.new_chat')"
                :messages="row.tab.messages"
              />
            </span>
            <ChatMutedMark v-if="row.tab.isMuted" />
          </span>
          <span
            class="flex w-40 min-w-0 shrink-0 items-center gap-1.5 text-meta text-muted-foreground"
          >
            <Folder class="size-3.5 shrink-0" aria-hidden="true" />
            <SessionChatName
              v-if="row.tab.sessionId"
              :cwd="row.tab.cwd"
              :session-id="row.tab.sessionId"
            />
            <span v-else class="truncate">{{ row.folder }}</span>
          </span>
          <span
            class="shrink-0 overflow-hidden rounded-sm border border-border px-1.5 text-meta text-subtle"
          >
            <Transition name="quip" mode="out-in">
              <span :key="row.account" class="inline-block">{{ row.account }}</span>
            </Transition>
          </span>
          <span class="min-w-0 flex-1">
            <span v-if="isEmpty" class="text-meta text-muted-foreground">
              {{ t('sidebar.empty_chat') }}
            </span>
            <SessionRowLive v-else :key="row.tab.id" :tab-id="row.tab.id" :activity :background />
          </span>
        </span>
        <span v-else class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="flex min-w-0 items-center gap-1.5">
            <span
              class="truncate text-small font-medium text-foreground"
              :class="{ 'opacity-72': isSeen }"
            >
              <ChatTitleText
                :title="row.title || t('chat.new_chat')"
                :messages="row.tab.messages"
              />
            </span>
            <ChatMutedMark v-if="row.tab.isMuted" />
          </span>
          <span class="flex min-w-0 items-center gap-1.5 text-meta text-muted-foreground">
            <Folder class="size-3.5 shrink-0" aria-hidden="true" />
            <SessionChatName
              v-if="row.tab.sessionId"
              :cwd="row.tab.cwd"
              :session-id="row.tab.sessionId"
            />
            <span v-else class="min-w-0 truncate">{{ row.folder }}</span>
            <span
              class="shrink-0 overflow-hidden rounded-sm border border-border px-1.5 text-subtle"
            >
              <Transition name="quip" mode="out-in">
                <span :key="row.account" class="inline-block">{{ row.account }}</span>
              </Transition>
            </span>
            <!-- Right end of the meta line, under the age: a finished row with an agent still
                 running gets no third line that holds nothing but the badge. -->
            <SessionRowBadges :key="row.tab.id" :tab-id="row.tab.id" class="ml-auto" />
          </span>
          <span v-if="isEmpty" class="truncate text-meta text-muted-foreground">
            {{ t('sidebar.empty_chat') }}
          </span>
          <span v-else-if="activity" class="truncate font-mono text-meta text-muted-foreground">
            {{ activity }}
          </span>
          <SessionRowBackground
            v-else-if="background.length"
            :tasks="background"
            class="text-meta text-muted-foreground"
          />
        </span>
        <span
          v-if="age"
          class="shrink-0 text-meta text-muted-foreground tabular-nums pointer-fine:group-focus-within/row:opacity-0 pointer-fine:group-hover/row:opacity-0"
          :class="isWide ? 'self-center' : 'self-start pt-0.5'"
        >
          <span aria-hidden="true">{{ age }}</span>
          <span class="sr-only">{{ ageLabel }}</span>
        </span>
      </button>
      <!-- Over the age on hover and focus; always there where there is no hover. -->
      <SessionActionsMenu
        v-if="target"
        :target
        trigger-class="absolute top-1/2 right-1 z-10 -translate-y-1/2 bg-muted opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:size-11 pointer-coarse:bg-transparent pointer-coarse:opacity-100"
      />
    </div>
  </SessionContextMenu>
</template>
