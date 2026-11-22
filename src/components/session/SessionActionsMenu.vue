<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { Ellipsis } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchIconButton from '@/components/common/NchIconButton.vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useSessionMenuItems } from '@/composables/useSessionMenuItems'
import { useSessionActionsStore } from '@/stores/sessionActions'
import type { SessionTarget } from '@/utils/sessionActions'

// The "…" of a session: clear its chat, remove it from the lists, delete it for good.
const {
  target,
  triggerClass = '',
  size = 'icon-sm'
} = defineProps<{
  target: SessionTarget
  triggerClass?: HTMLAttributes['class']
  size?: 'icon-xs' | 'icon-sm' | 'icon'
}>()

const { t } = useI18n()
const { items, run } = useSessionMenuItems(() => target)
const actions = useSessionActionsStore()
</script>

<template>
  <DropdownMenu :modal="false">
    <DropdownMenuTrigger as-child>
      <NchIconButton
        :label="t('session_actions.menu.label', { title: actions.titleOf(target) })"
        :size
        :class="triggerClass"
        data-no-drag
      >
        <Ellipsis class="size-4" aria-hidden="true" />
      </NchIconButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-auto min-w-48">
      <template v-for="item in items" :key="item.action">
        <DropdownMenuSeparator v-if="item.isDestructive && items.length > 1" />
        <DropdownMenuItem
          :variant="item.isDestructive ? 'destructive' : 'default'"
          @select="run(item.action)"
        >
          <component :is="item.icon" aria-hidden="true" />
          {{ item.label }}
        </DropdownMenuItem>
      </template>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
