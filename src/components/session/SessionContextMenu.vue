<script setup lang="ts">
import { Bell, BellOff } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { useSessionMenuItems } from '@/composables/useSessionMenuItems'
import { useChatStore } from '@/stores/chat'
import type { SessionTarget } from '@/utils/sessionActions'

// Right click (or long press, or the menu key) on a session: the same entries as its "…". Without
// a target the content shows as it is, only without the menu. An open tab can also be muted here.
// `as` renders the trigger as that element instead of taking over the slot's root, for a list
// whose items must stay its direct children (the draggable tab bar).
const { target, as } = defineProps<{ target: SessionTarget | null; as?: string }>()
defineOptions({ inheritAttrs: false })

const { t } = useI18n()
const chat = useChatStore()
const { items, run } = useSessionMenuItems(() => target)
</script>

<template>
  <ContextMenu v-if="target" :modal="false">
    <ContextMenuTrigger :as-child="!as" :as v-bind="$attrs">
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent class="w-auto min-w-48">
      <template v-if="target.tab">
        <ContextMenuItem @select="chat.setMuted(target.tab.id, !target.tab.isMuted)">
          <Bell v-if="target.tab.isMuted" aria-hidden="true" />
          <BellOff v-else aria-hidden="true" />
          {{ target.tab.isMuted ? t('notifications.unmute') : t('notifications.mute') }}
        </ContextMenuItem>
        <ContextMenuSeparator v-if="items.length" />
      </template>
      <template v-for="item in items" :key="item.action">
        <ContextMenuSeparator v-if="item.isDestructive && items.length > 1" />
        <ContextMenuItem
          :variant="item.isDestructive ? 'destructive' : 'default'"
          @select="run(item.action)"
        >
          <component :is="item.icon" aria-hidden="true" />
          {{ item.label }}
        </ContextMenuItem>
      </template>
    </ContextMenuContent>
  </ContextMenu>
  <component :is="as" v-else-if="as" v-bind="$attrs"><slot /></component>
  <slot v-else />
</template>
