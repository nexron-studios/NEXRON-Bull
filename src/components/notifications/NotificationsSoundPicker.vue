<script setup lang="ts">
import { computed } from 'vue'
import { BellRing, CircleCheck, Play } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useNotificationSetting } from '@/composables/useNotificationSetting'
import { handleError } from '@/lib/error'
import { playSound } from '@/lib/soundPlayer'
import { SOUNDS_OF_GROUP, type NotifySoundId, type SoundGroup } from '@/utils/notifySounds'

// One of the two sounds: a finished chat, or one that needs the user. Picking a sound plays it.
const { group, disabled = false } = defineProps<{ group: SoundGroup; disabled?: boolean }>()

const { t } = useI18n()
const { settings, update } = useNotificationSetting()

const GROUP_ICONS = {
  done: { icon: CircleCheck, class: 'text-good' },
  attention: { icon: BellRing, class: 'text-warning' }
} as const

const label = computed(() => t(`notifications.sound_group.${group}`))
const choice = computed({
  get: () => settings.value.sounds[group],
  set: (id: NotifySoundId) => {
    update({ sounds: { ...settings.value.sounds, [group]: id } })
    play()
  }
})

const play = () => playSound(choice.value).catch(handleError)
</script>

<template>
  <div class="flex min-h-10 items-center gap-3 px-1.5" :class="{ 'opacity-60': disabled }">
    <component
      :is="GROUP_ICONS[group].icon"
      class="size-4 shrink-0"
      :class="GROUP_ICONS[group].class"
      aria-hidden="true"
    />
    <span class="min-w-0 flex-1">{{ label }}</span>
    <Select v-model="choice" :disabled>
      <SelectTrigger size="sm" class="w-32" :aria-label="label"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem v-for="id in SOUNDS_OF_GROUP[group]" :key="id" :value="id">
          {{ t(`notifications.sound_name.${id}`) }}
        </SelectItem>
      </SelectContent>
    </Select>
    <NchIconButton
      :label="t('notifications.sound_play', { sound: t(`notifications.sound_name.${choice}`) })"
      size="icon-sm"
      :disabled
      @click="play"
    >
      <Play class="size-3.5" aria-hidden="true" />
    </NchIconButton>
  </div>
</template>
