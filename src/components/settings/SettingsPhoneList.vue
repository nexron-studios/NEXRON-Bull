<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useNotificationSetting } from '@/composables/useNotificationSetting'
import { useSettingsAccounts } from '@/composables/useSettingsAccounts'
import { useTerminalPreferences } from '@/composables/useTerminalPreferences'
import { useThemeChoice } from '@/composables/useThemeToggle'
import SettingsAboutCard from '@/components/settings/SettingsAboutCard.vue'
import { useLimitPolicyStore } from '@/stores/limitPolicy'
import { SETTINGS_SECTION_ICON, settingsSectionList, type SettingsSection } from '@/utils/settings'

// The phone's settings (Figma "M22"): one row per section with its current value, each opens
// the section as its own screen.
const { t } = useI18n()
const { offeredCount, machines } = useSettingsAccounts()
const { settings: notifications } = useNotificationSetting()
const { shownShell } = useTerminalPreferences()
const { choice } = useThemeChoice()
const { policy } = storeToRefs(useLimitPolicyStore())

const values = computed<Record<SettingsSection, string>>(() => ({
  accounts: t('settings.summary.accounts', offeredCount.value),
  limits: t(`settings.limits.modes_short.${policy.value.mode}`),
  machines: String(machines.value.length),
  notifications: notifications.value.isOn ? t('settings.summary.on') : t('settings.summary.off'),
  terminal: t(`settings.terminal.shells.${shownShell.value}`),
  appearance: t(`settings.appearance.themes.${choice.value}`)
}))
</script>

<template>
  <div class="flex flex-col gap-4 px-4 pb-4">
    <h1 class="flex h-14 items-center text-title font-semibold">{{ t('settings.title') }}</h1>
    <nav :aria-label="t('settings.nav_label')">
      <ul class="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <li
          v-for="section in settingsSectionList"
          :key="section"
          class="border-b border-border last:border-b-0"
        >
          <RouterLink
            :to="{ name: 'settings', params: { section } }"
            class="flex min-h-14 touch-manipulation items-center gap-3 px-3.5 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
              <component
                :is="SETTINGS_SECTION_ICON[section]"
                class="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </span>
            <span class="min-w-0 flex-1 truncate">{{ t(`settings.sections.${section}`) }}</span>
            <span class="shrink-0 text-meta text-muted-foreground">{{ values[section] }}</span>
            <ChevronRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </RouterLink>
        </li>
      </ul>
    </nav>
    <SettingsAboutCard />
  </div>
</template>
