<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { GripVertical } from '@lucide/vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useI18n } from 'vue-i18n'
import AccountChip from '@/components/account/AccountChip.vue'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDragOptions } from '@/composables/useDragOptions'
import { useShortcutLabels } from '@/composables/useShortcutLabels'
import type { LimitAccount } from '@/utils/limitPolicy'
import { moveItem } from '@/utils/order'
import { MOVE_CHORD, moveStepOf } from '@/utils/shortcuts'

// The order a full chat tries the accounts in: drag a chip, or Ctrl+Shift+Left/Right on it.
const { accounts, isLoading } = defineProps<{ accounts: LimitAccount[]; isLoading: boolean }>()
const emit = defineEmits<{ reorder: [labels: string[]] }>()

const list = ref<HTMLElement | null>(null)
/** Read out after a keyboard move, which a screen reader does not see happen otherwise */
const announcement = ref('')

const { t } = useI18n()
const { labelOf, ariaOf } = useShortcutLabels()
const dragOptions = useDragOptions('x')

const SKELETON_CHIPS = 2

const reorder = (moved: LimitAccount[]) =>
  emit(
    'reorder',
    moved.map((account) => account.label)
  )

const handleKeydown = async (event: KeyboardEvent, at: number) => {
  const step = moveStepOf(event)
  if (!step) return
  event.preventDefault()
  const moved = moveItem(accounts, at, at + step)
  if (moved === accounts) return
  reorder(moved)
  announcement.value = t('settings.limits.order_moved', {
    account: accounts[at].label,
    place: at + step + 1
  })
  await nextTick()
  list.value?.querySelector<HTMLElement>(`[data-label="${accounts[at + step].label}"]`)?.focus()
}
</script>

<template>
  <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
    <span id="limit-order" class="w-28 shrink-0 text-small text-muted-foreground">
      {{ t('settings.limits.order') }}
    </span>
    <div v-if="isLoading && !accounts.length" class="flex gap-2">
      <Skeleton v-for="n in SKELETON_CHIPS" :key="n" class="h-8 w-28 rounded-lg" />
    </div>
    <p v-else-if="!accounts.length" class="text-small text-muted-foreground">
      {{ t('settings.limits.no_accounts') }}
    </p>
    <div v-else ref="list">
      <VueDraggable
        :model-value="accounts"
        tag="ol"
        class="flex flex-wrap gap-2"
        aria-labelledby="limit-order"
        v-bind="dragOptions"
        @update:model-value="reorder"
      >
        <li v-for="(account, at) in accounts" :key="account.label">
          <Tooltip>
            <TooltipTrigger as-child>
              <span
                tabindex="0"
                :data-label="account.label"
                :aria-label="
                  t('settings.limits.order_item', {
                    account: account.label,
                    place: at + 1,
                    count: accounts.length
                  })
                "
                :aria-keyshortcuts="ariaOf(MOVE_CHORD)"
                class="inline-flex h-8 cursor-grab touch-manipulation items-center gap-1 rounded-lg border border-border bg-card pr-1 pl-1.5 outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing pointer-coarse:h-11"
                @keydown="handleKeydown($event, at)"
              >
                <GripVertical class="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span class="text-meta text-muted-foreground tabular-nums" aria-hidden="true">
                  {{ at + 1 }}
                </span>
                <AccountChip
                  :account-key="account.accountKey"
                  :label="account.label"
                  :plan="account.plan"
                  aria-hidden="true"
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>{{
              t('settings.limits.order_move_hint', { key: labelOf(MOVE_CHORD) })
            }}</TooltipContent>
          </Tooltip>
        </li>
      </VueDraggable>
    </div>
    <p class="min-w-60 flex-1 text-meta text-muted-foreground">
      {{ t('settings.limits.order_hint') }}
    </p>
    <span class="sr-only" role="status">{{ announcement }}</span>
  </div>
</template>
