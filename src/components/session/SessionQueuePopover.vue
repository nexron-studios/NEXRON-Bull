<script setup lang="ts">
import { computed } from 'vue'
import { Monitor, Send, Server, Timer } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useChatNavigation } from '@/composables/useChatNavigation'
import { useMinuteClock } from '@/composables/useClock'
import { useMachineLabel } from '@/composables/useMachineLabel'
import { useChatStore } from '@/stores/chat'
import type { ChatTabState } from '@/utils/chatTab'
import { resetOf } from '@/utils/limits'
import { folderNameOf } from '@/utils/sessionList'

// The waiting chats of one account, opened from its line at the bottom of the sidebar (Figma
// "26"): what goes out at the reset and where it runs.
const { tabs, account } = defineProps<{ tabs: ChatTabState[]; account: string }>()

const { t, locale } = useI18n()
const now = useMinuteClock()
const chat = useChatStore()
const { openChat } = useChatNavigation()
const { labelOf: machineLabelOf } = useMachineLabel()

const entries = computed(() =>
  tabs.flatMap((tab) =>
    tab.limit.kind === 'waiting'
      ? [
          {
            tab,
            queue: tab.limit.queue,
            reset: resetOf(tab.limit.account.resets_at_ms, now.value.getTime(), locale.value)
          }
        ]
      : []
  )
)
const messageCount = computed(() =>
  entries.value.reduce((sum, entry) => sum + entry.queue.length, 0)
)
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <button
        type="button"
        class="flex shrink-0 items-center gap-1 rounded-sm text-meta text-act-read outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        :aria-label="t('sidebar.queue_open', { account })"
      >
        <Timer class="size-3.5" aria-hidden="true" />
        {{ t('sidebar.queue_badge', tabs.length) }}
      </button>
    </PopoverTrigger>
    <PopoverContent side="right" align="end" class="flex w-96 flex-col gap-2 p-3">
      <div class="flex items-center justify-between gap-2">
        <span class="text-small font-semibold">{{ t('sidebar.queue_title', { account }) }}</span>
        <span class="text-meta text-muted-foreground">
          {{ t('sidebar.queue_messages', messageCount) }}
        </span>
      </div>
      <ul class="flex flex-col gap-1.5">
        <li
          v-for="entry in entries"
          :key="entry.tab.id"
          class="flex flex-col gap-1 rounded-md bg-muted px-2.5 py-2"
        >
          <button
            type="button"
            class="flex min-w-0 items-center justify-between gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            @click="openChat(entry.tab.id)"
          >
            <span class="truncate text-small font-semibold">
              {{ entry.tab.title || t('chat.new_chat') }}
            </span>
            <span class="shrink-0 text-meta text-muted-foreground">
              {{ folderNameOf(entry.tab.cwd) }}
            </span>
          </button>
          <span
            v-for="prompt in entry.queue"
            :key="prompt.id"
            class="truncate text-meta text-subtle"
          >
            „{{ prompt.text }}“
          </span>
          <span class="flex items-center justify-between gap-2 text-meta text-muted-foreground">
            <span class="flex min-w-0 items-center gap-1">
              <template v-if="machineLabelOf(entry.tab.machine)">
                <component
                  :is="entry.tab.machine ? Server : Monitor"
                  class="size-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span class="truncate">{{ machineLabelOf(entry.tab.machine) }}</span>
              </template>
              <span v-if="entry.reset" class="shrink-0 tabular-nums">
                <span v-if="machineLabelOf(entry.tab.machine)" aria-hidden="true">· </span
                >{{ entry.reset.at }}
              </span>
            </span>
            <Button variant="ghost" size="sm" @click="chat.queueSend(entry.tab.id)">
              <Send aria-hidden="true" />
              {{ t('chat.limit.send_now') }}
            </Button>
          </span>
        </li>
      </ul>
      <p class="text-meta text-muted-foreground">{{ t('sidebar.queue_hint') }}</p>
    </PopoverContent>
  </Popover>
</template>
