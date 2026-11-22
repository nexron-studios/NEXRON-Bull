<script setup lang="ts">
import { computed } from 'vue'
import { ChevronsUpDown, Monitor, Server } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import SessionMachineBadges from '@/components/session/SessionMachineBadges.vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import type { MachineSegment } from '@/composables/useSidebarMachine'
import type { ChatTabState } from '@/utils/chatTab'
import { machineStateOf, mostPressingOf } from '@/utils/sessionList'

// The machine switch once segments no longer fit: the shown machine as a button, every machine in
// its menu. The dot on the button keeps what the segments said about the hidden machines: the most
// pressing state among them.
const { segments, tabsByMachine, now } = defineProps<{
  segments: MachineSegment[]
  tabsByMachine: Map<string | null, ChatTabState[]>
  now: number
}>()

const machineKey = defineModel<string>({ required: true })

const { t } = useI18n()

const entries = computed(() =>
  segments.map((segment) => {
    const tabs = tabsByMachine.get(segment.machine) ?? []
    // Like the segments: the shown machine's own tabs are in the list, so its dot says nothing new.
    const isShown = segment.key === machineKey.value
    return { ...segment, count: tabs.length, state: isShown ? null : machineStateOf(tabs, now) }
  })
)
const shown = computed(
  () => entries.value.find((entry) => entry.key === machineKey.value) ?? entries.value[0]
)
const othersState = computed(() => mostPressingOf(entries.value.map((entry) => entry.state)))
</script>

<template>
  <DropdownMenu :modal="false">
    <DropdownMenuTrigger as-child>
      <Button
        variant="secondary"
        class="h-9 w-full touch-manipulation justify-start gap-2 bg-muted px-2.5 text-small hover:bg-muted/80 pointer-coarse:h-10"
      >
        <span class="sr-only">{{ t('chat.machine') }}</span>
        <Server v-if="shown.machine" aria-hidden="true" />
        <Monitor v-else aria-hidden="true" />
        <span class="min-w-0 truncate">{{ shown.label }}</span>
        <SessionMachineBadges :count="shown.count" />
        <span class="ml-auto flex shrink-0 items-center gap-2">
          <SessionMachineBadges
            :state="othersState"
            :state-label="
              othersState
                ? t('sidebar.other_machines_state', {
                    state: t(`sidebar.machine_state.${othersState}`)
                  })
                : ''
            "
          />
          <ChevronsUpDown class="text-muted-foreground" aria-hidden="true" />
        </span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-(--reka-dropdown-menu-trigger-width) min-w-56">
      <DropdownMenuLabel class="text-meta text-muted-foreground">
        {{ t('chat.machine') }}
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup v-model="machineKey">
        <DropdownMenuRadioItem
          v-for="entry in entries"
          :key="entry.key"
          :value="entry.key"
          class="gap-2 py-1.5 pointer-coarse:py-2.5"
        >
          <Server v-if="entry.machine" class="text-muted-foreground" aria-hidden="true" />
          <Monitor v-else class="text-muted-foreground" aria-hidden="true" />
          <span class="min-w-0 truncate">{{ entry.label }}</span>
          <span class="ml-auto flex shrink-0 items-center gap-2">
            <SessionMachineBadges
              :state="entry.state"
              :state-label="entry.state ? t(`sidebar.machine_state.${entry.state}`) : ''"
              :count="entry.count"
            />
          </span>
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
