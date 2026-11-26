<script setup lang="ts">
import { computed, type Component } from 'vue'
import {
  CircleAlert,
  CircleCheck,
  ClipboardList,
  ExternalLink,
  Gauge,
  Info,
  MessageCircleQuestion,
  Monitor,
  ShieldAlert,
  TriangleAlert,
  Volume2
} from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchRangeSwitch from '@/components/common/NchRangeSwitch.vue'
import NotificationsSoundPicker from '@/components/notifications/NotificationsSoundPicker.vue'
import { Switch } from '@/components/ui/switch'
import { useNotificationSetting } from '@/composables/useNotificationSetting'
import { handleError } from '@/lib/error'
import { canOpenSystemSettings, openSystemNotificationSettings } from '@/lib/osNotification'
import {
  QUOTA_ALERT_PERCENT,
  notifyDeliveryList,
  notifyEventList,
  type NotifyDelivery,
  type NotifyEvent
} from '@/utils/notifications'
import { soundGroupList } from '@/utils/notifySounds'
import { leftPercentOf } from '@/utils/percent'
import { systemNameOf } from '@/utils/platform'

// Everything about notifications in one place (Figma "19", "M18"): the master switch, whether the
// system shows them, one switch per event, how to tell in the background, sound.
// `hasOwnTitle`: the settings page names the section already, the first row is the master switch.
const { isPhone = false, hasOwnTitle = false } = defineProps<{
  isPhone?: boolean
  hasOwnTitle?: boolean
}>()

const { t } = useI18n()
const { settings, permission, setOn, update, sendTest } = useNotificationSetting()

const EVENT_ICONS: Record<NotifyEvent, { icon: Component; class: string }> = {
  approval: { icon: ShieldAlert, class: 'text-critical' },
  question: { icon: MessageCircleQuestion, class: 'text-act-read' },
  plan: { icon: ClipboardList, class: 'text-act-change' },
  finished: { icon: CircleCheck, class: 'text-good' },
  failed: { icon: TriangleAlert, class: 'text-warning' },
  quota_low: { icon: Gauge, class: 'text-subtle' }
}

const events = computed(() =>
  notifyEventList.map((event) => ({
    event,
    ...EVENT_ICONS[event],
    title: t(`notifications.event.${event}.title`),
    hint: t(`notifications.event.${event}.hint`, { percent: leftPercentOf(QUOTA_ALERT_PERCENT) })
  }))
)
const deliveryOptions = computed(() =>
  notifyDeliveryList.map((value) => ({
    value,
    label: t(`notifications.delivery.${value}`)
  }))
)
const background = computed({
  get: () => settings.value.background,
  set: (value: NotifyDelivery) => update({ background: value })
})
// Only the master switch: with every event off, the switches must stay usable to turn one back on.
const isMasterOff = computed(() => !settings.value.isOn)
// Bull plays its own sound, for system notifications and in-window toasts alike.
const canPickSound = computed(() => settings.value.isOn && settings.value.hasSound)

const canOpenSettings = canOpenSystemSettings()
const systemName = systemNameOf(navigator.userAgent)
// "Windows zeigt sie an" names the system the user knows; unknown systems get the plain sentence.
const permissionLabel = computed(() =>
  permission.value === 'granted' && systemName === null
    ? t('notifications.permission.granted_generic')
    : t(`notifications.permission.${permission.value}`, { system: systemName })
)

const setEvent = (event: NotifyEvent, isWanted: boolean) =>
  update({ events: { ...settings.value.events, [event]: isWanted } })
const openSettings = () => openSystemNotificationSettings().catch(handleError)
</script>

<template>
  <!-- Two groups, "when" and "how", side by side once the surrounding container is wide (the
       settings page). Popover and sheet sit outside any container and always stack them. -->
  <div class="grid grid-cols-1 gap-x-8 gap-y-1 text-small @3xl:grid-cols-2">
    <div class="flex min-w-0 flex-col gap-1">
      <div class="flex min-h-9 items-center justify-between gap-3 px-1.5">
        <!-- The sheet on a phone and the settings page already carry the title. -->
        <span class="font-semibold">{{
          isPhone || hasOwnTitle ? t('notifications.master') : t('notifications.title')
        }}</span>
        <Switch
          :model-value="settings.isOn"
          :aria-label="t('notifications.master')"
          @update:model-value="setOn"
        />
      </div>

      <div class="flex flex-col gap-0.5 rounded-md bg-muted/60 px-2 py-1.5">
        <div class="flex items-center gap-2">
          <CircleCheck
            v-if="permission === 'granted'"
            class="size-3.5 shrink-0 text-good"
            aria-hidden="true"
          />
          <CircleAlert
            v-else-if="permission === 'blocked'"
            class="size-3.5 shrink-0 text-warning"
            aria-hidden="true"
          />
          <Info v-else class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate">{{ permissionLabel }}</span>
          <button
            type="button"
            class="shrink-0 touch-manipulation rounded-sm text-meta text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 pointer-coarse:min-h-11"
            :disabled="isMasterOff"
            @click="sendTest"
          >
            {{ t('notifications.test') }}
          </button>
        </div>
        <p v-if="permission !== 'granted'" class="pl-5.5 text-meta text-muted-foreground">
          {{ t(`notifications.permission.${permission}_hint`) }}
        </p>
        <button
          v-if="permission === 'blocked' && canOpenSettings"
          type="button"
          class="ml-5.5 inline-flex w-fit touch-manipulation items-center gap-1.5 rounded-sm text-meta text-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11"
          @click="openSettings"
        >
          <ExternalLink class="size-3.5 shrink-0" aria-hidden="true" />
          {{ t('notifications.permission.open_settings') }}
        </button>
      </div>

      <p class="px-1.5 pt-2 pb-0.5 text-meta font-medium text-muted-foreground">
        {{ t('notifications.events_label') }}
      </p>
      <ul class="flex flex-col" :class="{ 'opacity-60': isMasterOff }">
        <li
          v-for="row in events"
          :key="row.event"
          class="flex min-h-12 items-center gap-3 rounded-md px-1.5 py-1.5"
        >
          <component :is="row.icon" class="size-4 shrink-0" :class="row.class" aria-hidden="true" />
          <span class="flex min-w-0 flex-1 flex-col">
            <span>{{ row.title }}</span>
            <span class="text-meta text-muted-foreground">{{ row.hint }}</span>
          </span>
          <Switch
            :model-value="settings.events[row.event]"
            :disabled="isMasterOff"
            :aria-label="row.title"
            @update:model-value="setEvent(row.event, $event)"
          />
        </li>
      </ul>
    </div>

    <div class="flex min-w-0 flex-col gap-1">
      <div class="my-1 h-px bg-border @3xl:hidden" aria-hidden="true" />
      <!-- Beside the master switch, the label takes its height so both columns start on one line. -->
      <p
        class="px-1.5 pb-0.5 text-meta font-medium text-muted-foreground @3xl:flex @3xl:min-h-9 @3xl:items-center @3xl:pb-0"
      >
        {{ t('notifications.how_label') }}
      </p>
      <div class="flex min-h-10 items-center gap-3 px-1.5" :class="{ 'opacity-60': isMasterOff }">
        <Monitor class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span class="min-w-0 flex-1">{{ t('notifications.background') }}</span>
        <NchRangeSwitch
          v-model="background"
          :options="deliveryOptions"
          :label="t('notifications.background')"
          :inert="isMasterOff"
        />
      </div>
      <div class="flex min-h-10 items-center gap-3 px-1.5" :class="{ 'opacity-60': isMasterOff }">
        <Volume2 class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span class="min-w-0 flex-1">{{ t('notifications.sound') }}</span>
        <Switch
          :model-value="settings.hasSound"
          :disabled="isMasterOff"
          :aria-label="t('notifications.sound')"
          @update:model-value="update({ hasSound: $event })"
        />
      </div>
      <NotificationsSoundPicker
        v-for="group in soundGroupList"
        :key="group"
        :group
        :disabled="!canPickSound"
      />

      <div class="my-1 h-px bg-border" aria-hidden="true" />
      <p class="flex gap-2 px-1.5 pb-1 text-meta text-muted-foreground">
        <Info class="mt-0.5 size-3 shrink-0" aria-hidden="true" />
        {{ isPhone ? t('notifications.footnote_phone') : t('notifications.footnote') }}
      </p>
    </div>
  </div>
</template>
