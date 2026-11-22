<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsAboutCard from '@/components/settings/SettingsAboutCard.vue'
import { SETTINGS_SECTION_ICON, settingsSectionList, type SettingsSection } from '@/utils/settings'

// The sections of the settings page, as links: each has its own URL (Figma "22"). The current
// one sits on a marker of its own, so a section change can glide it to the next link while the
// list itself stands still (transitions.css, "Route change").
defineProps<{ current: SettingsSection }>()

const { t } = useI18n()
</script>

<template>
  <div class="flex flex-col gap-6" data-route-still>
    <nav :aria-label="t('settings.nav_label')" class="flex flex-col gap-0.5">
      <RouterLink
        v-for="section in settingsSectionList"
        :key="section"
        :to="{ name: 'settings', params: { section } }"
        :aria-current="section === current ? 'page' : undefined"
        class="motion-press relative isolate flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-small text-muted-foreground transition-[color,background-color,border-color,transform] duration-150 ease-out outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:font-medium aria-[current=page]:text-foreground"
      >
        <span
          v-if="section === current"
          class="absolute inset-0 -z-10 rounded-lg bg-muted"
          aria-hidden="true"
          data-route-marker
        />
        <component
          :is="SETTINGS_SECTION_ICON[section]"
          class="size-4 shrink-0"
          aria-hidden="true"
        />
        <span class="truncate">{{ t(`settings.sections.${section}`) }}</span>
      </RouterLink>
    </nav>
    <SettingsAboutCard />
  </div>
</template>
