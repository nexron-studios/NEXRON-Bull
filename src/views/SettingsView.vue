<script setup lang="ts">
import { computed, useTemplateRef, watch, type Component } from 'vue'
import { ChevronLeft } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { offeredSettingsSections } from '@/lib/platform'
import NchScrollEdge from '@/components/common/NchScrollEdge.vue'
import SettingsAccounts from '@/components/settings/SettingsAccounts.vue'
import SettingsAppearance from '@/components/settings/SettingsAppearance.vue'
import SettingsLimits from '@/components/settings/SettingsLimits.vue'
import SettingsMachines from '@/components/settings/SettingsMachines.vue'
import SettingsNav from '@/components/settings/SettingsNav.vue'
import SettingsNotifications from '@/components/settings/SettingsNotifications.vue'
import SettingsPhoneList from '@/components/settings/SettingsPhoneList.vue'
import SettingsTerminal from '@/components/settings/SettingsTerminal.vue'
import { useScrollEdges } from '@/composables/useScrollEdges'
import { useIsPhone } from '@/composables/useViewport'
import { shownSettingsSectionOf, type SettingsSection } from '@/utils/settings'

// One page with its sections on the left (Figma "22"); a phone lists them and opens each as its
// own screen (Figma "M22", "M23"). The section is in the URL, so the back gesture returns to the list.
const page = useTemplateRef<HTMLElement>('page')

const { t } = useI18n()
const route = useRoute()
const isPhone = useIsPhone()
// A section's bar on the phone sticks while the section scrolls beneath it.
const { hasMoreAbove } = useScrollEdges(page)

const SECTION_COMPONENT: Record<SettingsSection, Component> = {
  accounts: SettingsAccounts,
  limits: SettingsLimits,
  machines: SettingsMachines,
  notifications: SettingsNotifications,
  terminal: SettingsTerminal,
  appearance: SettingsAppearance
}

// A browser has no machine checks and no terminals; their links lead to the first section there.
const offered = offeredSettingsSections()
const section = computed(() => shownSettingsSectionOf(route.params.section, isPhone.value, offered))
// Every section reuses this page and its scroll area, and the router only resets the window's
// scroll: without this a section would open where the last one was left.
watch(section, () => page.value?.scrollTo({ top: 0 }))
</script>

<template>
  <main ref="page" class="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
    <template v-if="isPhone">
      <SettingsPhoneList v-if="!section" />
      <div v-else class="flex min-h-full shrink-0 flex-col">
        <header
          class="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border material px-2"
        >
          <RouterLink
            :to="{ name: 'settings' }"
            :aria-label="t('settings.back')"
            class="grid size-11 touch-manipulation place-items-center rounded-lg outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronLeft class="size-5" aria-hidden="true" />
          </RouterLink>
          <h1 class="truncate text-title font-semibold">{{ t(`settings.sections.${section}`) }}</h1>
          <NchScrollEdge edge="below" :is-shown="hasMoreAbove" />
        </header>
        <div class="@container flex flex-1 flex-col gap-4 px-4 py-4">
          <component :is="SECTION_COMPONENT[section]" is-phone />
        </div>
      </div>
    </template>
    <!-- Navigation and page are one composition, centred with a cap, so a wide window gets even
         margins instead of a page hugging the left edge. The page is a container: its sections
         pick their columns from the room they actually get, not from the window. -->
    <div
      v-else-if="section"
      class="mx-auto flex min-h-full w-full max-w-7xl shrink-0 gap-8 px-6 py-6 lg:gap-12 lg:px-10 lg:py-8"
    >
      <SettingsNav
        :current="section"
        class="top-6 w-52 shrink-0 self-start lg:top-8 [@media(min-height:40rem)]:sticky"
      />
      <div class="@container flex min-w-0 flex-1 flex-col gap-4">
        <component :is="SECTION_COMPONENT[section]" />
      </div>
    </div>
  </main>
</template>
