<script setup lang="ts">
import { Monitor, Moon, Sun } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import SettingsBrandPreview from '@/components/settings/SettingsBrandPreview.vue'
import SettingsSchemeCard from '@/components/settings/SettingsSchemeCard.vue'
import SettingsSectionHeader from '@/components/settings/SettingsSectionHeader.vue'
import { useColorScheme } from '@/composables/useColorScheme'
import { themeChoiceList, useThemeChoice, type ThemeChoice } from '@/composables/useThemeToggle'
import {
  COLOR_SCHEME_SWATCHES,
  colorSchemePresetList,
  type ColorSchemePreset
} from '@/theme/colorSchemes'

// Figma 22f: system, light or dark (the header button flips the same stored choice), then the
// colour scheme: only the six presets, no own colour (20.11.2026).
const { isPhone = false } = defineProps<{ isPhone?: boolean }>()

const { t } = useI18n()
const { choice: themeChoice, choose: chooseTheme } = useThemeChoice()
const scheme = useColorScheme()

const THEME_ICON = { auto: Monitor, light: Sun, dark: Moon } as const
const NOTE_KEYS: Partial<Record<ColorSchemePreset, string>> = {
  'night-desk': 'settings.appearance.preset_notes.night-desk',
  claude: 'settings.appearance.preset_notes.claude'
}

const pickTheme = (event: MouseEvent, value: ThemeChoice) => void chooseTheme(event, value)
</script>

<template>
  <SettingsSectionHeader
    :title="t('settings.sections.appearance')"
    :description="t('settings.appearance.description')"
    :is-phone
  />
  <!-- Wide enough, where the accent shows up stands beside the choices, so a pick shows its effect
       without scrolling; narrower, it follows below them. -->
  <section
    class="grid grid-cols-1 gap-5 rounded-xl border border-border bg-card p-4 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,19rem)] @4xl:gap-6"
    :aria-label="t('settings.sections.appearance')"
  >
    <div class="flex max-w-180 min-w-0 flex-col gap-5 @4xl:max-w-none">
      <div class="flex flex-col gap-2">
        <h2 id="settings-theme" class="text-small font-semibold">
          {{ t('settings.appearance.theme') }}
        </h2>
        <div role="group" aria-labelledby="settings-theme" class="grid grid-cols-3 gap-2">
          <button
            v-for="value in themeChoiceList"
            :key="value"
            type="button"
            :aria-pressed="themeChoice === value"
            class="motion-press flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg border border-border text-small text-muted-foreground transition-[color,background-color,border-color,transform] duration-150 ease-out outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-brand aria-pressed:bg-muted aria-pressed:font-medium aria-pressed:text-foreground"
            @click="pickTheme($event, value)"
          >
            <component :is="THEME_ICON[value]" class="size-4" aria-hidden="true" />
            {{ t(`settings.appearance.themes.${value}`) }}
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <h2 id="settings-scheme" class="text-small font-semibold">
          {{ t('settings.appearance.scheme') }}
        </h2>
        <div
          role="group"
          aria-labelledby="settings-scheme"
          class="grid gap-2"
          :class="isPhone ? 'grid-cols-2' : 'grid-cols-2 @lg:grid-cols-3'"
        >
          <SettingsSchemeCard
            v-for="preset in colorSchemePresetList"
            :key="preset"
            :label="t(`settings.appearance.presets.${preset}`)"
            :note="NOTE_KEYS[preset] ? t(NOTE_KEYS[preset]) : ''"
            :accent="COLOR_SCHEME_SWATCHES[preset].accent"
            :side="COLOR_SCHEME_SWATCHES[preset].side"
            :is-selected="scheme === preset"
            @pick="scheme = preset"
          />
        </div>
      </div>
    </div>

    <SettingsBrandPreview class="@4xl:border-l @4xl:border-border @4xl:pl-6" />
  </section>
</template>
