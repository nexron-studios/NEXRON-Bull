<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { PanelLeftClose, Plus, Search } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import BrandBullLogo from '@/components/brand/BrandBullLogo.vue'
import BrandNexronLogo from '@/components/brand/BrandNexronLogo.vue'
import NchIconButton from '@/components/common/NchIconButton.vue'
import NchThemeToggle from '@/components/common/NchThemeToggle.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs'
import ChatNotifyToggle from '@/components/chat/ChatNotifyToggle.vue'
import NavSegments from '@/components/nav/NavSegments.vue'
import SessionGroupList from '@/components/session/SessionGroupList.vue'
import SessionMachinePicker from '@/components/session/SessionMachinePicker.vue'
import SessionMachineTab from '@/components/session/SessionMachineTab.vue'
import SessionPhoneHeader from '@/components/session/SessionPhoneHeader.vue'
import SessionQuotaFooter from '@/components/session/SessionQuotaFooter.vue'
import SessionSearchField from '@/components/session/SessionSearchField.vue'
import SettingsLink from '@/components/settings/SettingsLink.vue'
import { useChatNavigation } from '@/composables/useChatNavigation'
import { useSessionList } from '@/composables/useSessionList'
import { useSidebarMachine } from '@/composables/useSidebarMachine'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import { NEW_SESSION_CHORD } from '@/utils/shortcuts'
import { useChatStore } from '@/stores/chat'
import type { SessionRow } from '@/utils/sessionList'

// `isWide`: the sidebar fills the window, rows become one-line columns and the header tools move in.
// `isPhone`: the list is the phone's home screen, with its own top bar.
const {
  isWide = false,
  isPhone = false,
  hasSearchOnOpen = false
} = defineProps<{
  isWide?: boolean
  isPhone?: boolean
  /** Opened from the rail's search button: start with the search field focused */
  hasSearchOnOpen?: boolean
}>()
const emit = defineEmits<{ new: []; hide: []; opened: [] }>()

const isSearchOpen = ref(false)
const query = ref('')

const { t } = useI18n()
const { labelOf } = useShortcutLabels()
const chat = useChatStore()
const { activeId } = storeToRefs(chat)
const { shownChatId } = useChatNavigation()
const { machineKey, machine, machineLabel, segments, tabsByMachine, switcherKind } =
  useSidebarMachine()
const { rows, groups, now, isRanked, isPending, isError, refetch, reorder } = useSessionList(
  machine,
  query
)

const toggleSearch = () => {
  isSearchOpen.value = !isSearchOpen.value
  query.value = ''
}

const resetSearch = () => {
  query.value = ''
}

const open = (row: SessionRow) => {
  activeId.value = row.tab.id
  emit('opened')
}

onMounted(() => {
  if (hasSearchOnOpen) toggleSearch()
})
</script>

<template>
  <div class="@container flex h-full min-h-0 flex-col gap-3 bg-background">
    <SessionPhoneHeader
      v-if="isPhone"
      v-model:search-open="isSearchOpen"
      v-model:query="query"
      @new="emit('new')"
      @close-search="toggleSearch"
    />
    <div v-else class="flex h-12 shrink-0 items-center gap-2 pr-2 pl-4">
      <!-- Like the homeserver start page: name | NEXRON logo -->
      <div class="mr-1 flex min-w-0 flex-1 items-center gap-3 select-none">
        <span
          class="flex items-center gap-2 font-wordmark text-title leading-none whitespace-nowrap uppercase"
        >
          <BrandBullLogo :size="24" />
          {{ t('global.app_name') }}
        </span>
        <!-- A narrow panel keeps bull, name and the collapse button; the studio logo goes. -->
        <span class="h-5 w-px shrink-0 bg-input @max-sidebar:hidden" aria-hidden="true" />
        <BrandNexronLogo :height="20" class="@max-sidebar:hidden" />
      </div>
      <!-- Only while the sidebar fills the window; otherwise the main toolbar holds these. -->
      <template v-if="isWide">
        <NchThemeToggle class="shrink-0" />
        <ChatNotifyToggle />
        <SettingsLink class="shrink-0" />
      </template>
      <NchIconButton :label="t('sidebar.hide')" size="icon-sm" @click="emit('hide')">
        <PanelLeftClose class="size-4" aria-hidden="true" />
      </NchIconButton>
    </div>

    <div v-if="!isPhone" class="flex w-full shrink-0 gap-2 px-3" :class="{ 'max-w-md': isWide }">
      <Button
        class="h-9 flex-1 justify-start bg-brand-strong text-brand-foreground hover:bg-brand-strong-hover"
        @click="emit('new')"
      >
        <Plus class="size-4" aria-hidden="true" />
        {{ t('sidebar.new_session') }}
        <kbd
          class="ml-auto rounded border border-brand-foreground/40 px-1 font-sans text-meta"
          aria-hidden="true"
          >{{ labelOf(NEW_SESSION_CHORD) }}</kbd
        >
      </Button>
      <NchIconButton
        :label="t('sidebar.search')"
        variant="outline"
        size="icon-lg"
        :aria-pressed="isSearchOpen"
        :class="{ 'bg-muted': isSearchOpen }"
        @click="toggleSearch"
      >
        <Search class="size-4" aria-hidden="true" />
      </NchIconButton>
    </div>

    <!-- The phone has its bottom bar instead. -->
    <NavSegments v-if="!isPhone" class="mx-3" :class="{ 'max-w-md': isWide }" />

    <div
      v-if="isSearchOpen && !isPhone"
      class="w-full shrink-0 px-3"
      :class="{ 'max-w-md': isWide }"
    >
      <SessionSearchField v-model="query" @close="toggleSearch" />
    </div>

    <Tabs v-model="machineKey" class="min-h-0 flex-1 gap-0">
      <!-- Hosts come from ~/.ssh/config; until they arrive the switcher keeps its place. -->
      <Skeleton
        v-if="switcherKind === 'pending'"
        class="mx-3 h-9 shrink-0 rounded-lg"
        :class="{ 'max-w-md': isWide }"
      />
      <div
        v-else-if="switcherKind === 'picker'"
        class="mx-3 shrink-0"
        :class="{ 'max-w-md': isWide }"
      >
        <SessionMachinePicker
          v-model="machineKey"
          :segments
          :tabs-by-machine="tabsByMachine"
          :now="now.getTime()"
        />
      </div>
      <TabsList
        v-else-if="switcherKind === 'segments'"
        :aria-label="t('chat.machine')"
        class="mx-3 h-9 w-auto max-w-full shrink-0 scrollbar-none justify-start overflow-x-auto group-data-horizontal/tabs:h-9"
        :class="{ 'max-w-md': isWide }"
      >
        <SessionMachineTab
          v-for="segment in segments"
          :key="segment.key"
          :value="segment.key"
          :label="segment.label"
          :is-remote="segment.machine !== null"
          :tabs="tabsByMachine.get(segment.machine) ?? []"
          :now="now.getTime()"
          :is-selected="segment.key === machineKey"
        />
      </TabsList>
      <!-- Without segments there is no tab to label the panel, so it is a region named after
           the machine instead of a tab panel pointing at a trigger that does not exist. -->
      <TabsContent
        :value="machineKey"
        class="flex min-h-0 flex-col"
        v-bind="
          switcherKind === 'segments'
            ? {}
            : { role: 'region', 'aria-labelledby': undefined, 'aria-label': machineLabel }
        "
      >
        <SessionGroupList
          :groups
          :query
          :active-id="shownChatId"
          :now="now.getTime()"
          :has-rows="rows.length > 0"
          :is-pending="isPending"
          :is-error="isError"
          :is-ranked="isRanked"
          :machine
          :machine-label="machineLabel"
          :is-wide
          @open="open"
          @new="emit('new')"
          @reset-search="resetSearch"
          @retry="refetch()"
          @reorder="reorder"
        />
      </TabsContent>
    </Tabs>
    <SessionQuotaFooter v-if="!isPhone" />
  </div>
</template>
