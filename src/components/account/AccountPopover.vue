<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AccountPicker from '@/components/account/AccountPicker.vue'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import { Button, type ButtonVariants } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useIsPhone } from '@/composables/useViewport'
import type { ChatTabState } from '@/utils/chatTab'

// The account of one chat: a popover above the trigger, a bottom sheet on a phone (Figma "17",
// "M11"). The slot is the trigger's content: the chip in the composer, "Wechseln" in the panel.
const {
  tab,
  label,
  variant = 'ghost',
  size = 'sm'
} = defineProps<{
  tab: ChatTabState
  /** The trigger's accessible name */
  label: string
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
}>()

defineOptions({ inheritAttrs: false })

const isOpen = ref(false)

const { t } = useI18n()
const isPhone = useIsPhone()
</script>

<template>
  <template v-if="isPhone">
    <Button
      v-bind="$attrs"
      :variant
      :size
      :aria-label="label"
      aria-haspopup="dialog"
      @click="isOpen = true"
    >
      <slot />
    </Button>
    <NchResponsiveDialog
      v-model:open="isOpen"
      :title="t('account.title')"
      :description="t('account.description')"
    >
      <AccountPicker :tab @picked="isOpen = false" />
    </NchResponsiveDialog>
  </template>
  <Popover v-else v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button v-bind="$attrs" :variant :size :aria-label="label">
        <slot />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-80 gap-1 p-1.5">
      <p class="px-2.5 pt-1.5 text-meta font-medium text-muted-foreground">
        {{ t('account.title') }}
      </p>
      <AccountPicker :tab @picked="isOpen = false" />
    </PopoverContent>
  </Popover>
</template>
