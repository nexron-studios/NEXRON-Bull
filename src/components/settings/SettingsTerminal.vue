<script setup lang="ts">
import { Info } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SettingsSectionHeader from '@/components/settings/SettingsSectionHeader.vue'
import SettingsTerminalPreview from '@/components/settings/SettingsTerminalPreview.vue'
import TerminalShellIcon from '@/components/terminal/TerminalShellIcon.vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTerminalPreferences } from '@/composables/useTerminalPreferences'
import { systemNameOf } from '@/utils/platform'
import { hasLoginShell } from '@/utils/terminal'
import { terminalFontSizeList, terminalShellChoiceList } from '@/utils/terminalPreferences'

// Shell and font size of new terminals, stored under `bull.terminal.*` where the terminal reads
// them. "Automatisch" stores nothing: the terminal takes PowerShell 7 when it is installed. A Mac
// (or Linux) starts the login shell the user set up there, so it shows that one and no choice.
const { isPhone = false } = defineProps<{ isPhone?: boolean }>()

const { t } = useI18n()
const { shell, fontSize } = useTerminalPreferences()
const isLoginShell = hasLoginShell(systemNameOf(navigator.userAgent))

// Reka selects hold strings; the stored size stays a number.
const fontSizeChoice = computed({
  get: () => String(fontSize.value),
  set: (value: string) => {
    fontSize.value = Number(value)
  }
})
</script>

<template>
  <SettingsSectionHeader
    :title="t('settings.sections.terminal')"
    :description="t('settings.terminal.description')"
    :is-phone
  />
  <!-- Wide enough, the preview stands next to the choices and grows with the page; narrower, it
       follows below them. The choices keep their own width either way. -->
  <section
    class="grid grid-cols-1 gap-5 rounded-xl border border-border bg-card p-4 @4xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] @4xl:gap-6"
    :aria-label="t('settings.sections.terminal')"
  >
    <div class="flex max-w-xl min-w-0 flex-col gap-5 @4xl:max-w-none">
      <div class="flex flex-col gap-2">
        <h2 id="settings-shell" class="text-small font-semibold">
          {{ t('settings.terminal.shell') }}
        </h2>
        <template v-if="isLoginShell">
          <!-- Shown like a value, not a tile: there is nothing to pick. -->
          <p
            class="flex min-h-11 items-center gap-2 rounded-lg bg-muted/60 px-3 text-small font-medium"
          >
            <TerminalShellIcon shell="login" class="size-4" />
            {{ t('settings.terminal.shells.login') }}
          </p>
          <p class="text-meta text-muted-foreground">
            {{ t('settings.terminal.shell_hints.login') }}
          </p>
        </template>
        <div v-else role="group" aria-labelledby="settings-shell" class="grid grid-cols-2 gap-2">
          <div
            v-for="value in terminalShellChoiceList"
            :key="value"
            class="relative first:col-span-2"
          >
            <button
              type="button"
              :aria-pressed="shell === value"
              :aria-description="t(`settings.terminal.shell_hints.${value}`)"
              :class="isPhone ? 'px-2' : 'px-9'"
              class="motion-press flex min-h-11 w-full touch-manipulation items-center justify-center gap-2 rounded-lg border border-border text-small text-muted-foreground transition-[color,background-color,border-color,transform] duration-150 ease-out outline-none hover:bg-muted/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-brand aria-pressed:bg-muted aria-pressed:font-medium aria-pressed:text-foreground"
              @click="shell = value"
            >
              <TerminalShellIcon :shell="value" class="size-4" />
              {{ t(`settings.terminal.shells.${value}`) }}
            </button>
            <!-- Its own button beside the shell button (a button inside a button is invalid), so
               only the info mark opens the hint and a click on it never picks the shell. -->
            <Tooltip v-if="!isPhone" disable-closing-trigger>
              <TooltipTrigger as-child>
                <button
                  type="button"
                  :aria-label="
                    t('settings.terminal.shell_hint_label', {
                      shell: t(`settings.terminal.shells.${value}`)
                    })
                  "
                  class="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-subtle outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Info class="size-3.5" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{{ t(`settings.terminal.shell_hints.${value}`) }}</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <!-- Touch has no hover, so on a phone the hint of the picked shell stands below. -->
        <p v-if="isPhone && !isLoginShell" class="text-meta text-muted-foreground">
          {{ t(`settings.terminal.shell_hints.${shell}`) }}
        </p>
      </div>
      <div class="flex items-center justify-between gap-3">
        <label for="settings-font-size" class="text-small font-semibold">
          {{ t('settings.terminal.font_size') }}
        </label>
        <Select v-model="fontSizeChoice">
          <SelectTrigger id="settings-font-size" class="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="size in terminalFontSizeList" :key="size" :value="String(size)">
              {{ t('settings.terminal.font_size_value', { size }) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
    <SettingsTerminalPreview :shell="isLoginShell ? 'login' : shell" :font-size />
  </section>
</template>
