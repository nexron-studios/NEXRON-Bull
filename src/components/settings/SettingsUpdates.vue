<script setup lang="ts">
import { computed } from 'vue'
import { Check, Globe, RefreshCw, TriangleAlert } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import BrandBullLogo from '@/components/brand/BrandBullLogo.vue'
import SettingsSectionHeader from '@/components/settings/SettingsSectionHeader.vue'
import SettingsSwitchRow from '@/components/settings/SettingsSwitchRow.vue'
import { Button } from '@/components/ui/button'
import { useAgeFormat } from '@/composables/useAgeFormat'
import { useMinuteClock } from '@/composables/useClock'
import { handleError } from '@/lib/error'
import { openLink } from '@/lib/links'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { MS_PER_MINUTE } from '@/utils/elapsed'
import { BULL_RELEASES_URL, updateStatusOf } from '@/utils/appUpdateDialog'

// Settings › Updates (Figma "42f"): the running version, the last look on GitHub, and whether a
// new version downloads by itself.
const { isPhone = false } = defineProps<{ isPhone?: boolean }>()

// Set by Vite from package.json at build time.
const version = __APP_VERSION__

const store = useAppUpdateStore()
const { phase, info, isAutomatic, lastCheckedAt } = storeToRefs(store)

const { t } = useI18n()
const formatAge = useAgeFormat()
const now = useMinuteClock()

const status = computed(() => updateStatusOf(phase.value, lastCheckedAt.value > 0))
const statusText = computed(() => {
  const age = now.value.getTime() - lastCheckedAt.value
  // "checked < 1 min ago" reads like a measurement; right after a look it just says so.
  const key =
    status.value.text.key === 'settings.updates.status_current' && age < MS_PER_MINUTE
      ? 'settings.updates.status_current_now'
      : status.value.text.key
  return t(key, { ...status.value.text.params, age: formatAge.value(age) })
})
// With an update on its way the button opens it; otherwise it looks again.
const hasUpdate = computed(() => info.value !== null)

const checkOrShow = () => {
  if (hasUpdate.value) return store.openDialog()
  void store.check({ isManual: true })
}
const openReleases = () => void openLink(BULL_RELEASES_URL).catch(handleError)
</script>

<template>
  <SettingsSectionHeader
    :title="t('settings.sections.updates')"
    :description="t('settings.updates.description')"
    :is-phone
  />
  <div class="flex max-w-2xl flex-col gap-3 rounded-xl border border-border bg-card p-3 @3xl:p-4">
    <div class="flex items-center gap-3">
      <span class="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
        <BrandBullLogo :size="24" />
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-body font-semibold">
          {{ t('settings.updates.version', { version }) }}
        </span>
        <span class="flex items-center gap-1.5 text-meta text-muted-foreground" aria-live="polite">
          <Check v-if="status.tone === 'good'" class="size-3.5 text-good" aria-hidden="true" />
          <TriangleAlert
            v-else-if="status.tone === 'critical'"
            class="size-3.5 text-critical"
            aria-hidden="true"
          />
          <span class="min-w-0 truncate">{{ statusText }}</span>
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        class="motion-press"
        :disabled="phase.kind === 'checking'"
        @click="checkOrShow"
      >
        <RefreshCw
          v-if="!hasUpdate"
          data-icon="inline-start"
          :class="{ 'animate-spin': phase.kind === 'checking' }"
          aria-hidden="true"
        />
        {{ hasUpdate ? t('settings.updates.show') : t('settings.updates.check') }}
      </Button>
    </div>
    <div class="border-t border-border pt-3">
      <SettingsSwitchRow
        v-model="isAutomatic"
        :title="t('settings.updates.automatic')"
        :hint="t('settings.updates.automatic_hint')"
      />
    </div>
    <div class="-mx-1 -mb-1 border-t border-border pt-2">
      <Button variant="ghost" size="sm" class="motion-press" @click="openReleases">
        <Globe data-icon="inline-start" aria-hidden="true" />
        {{ t('settings.updates.releases') }}
      </Button>
    </div>
  </div>
</template>
