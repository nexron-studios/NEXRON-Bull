<script setup lang="ts">
import { Button, type ButtonVariants } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// Icon-only button: the label is the tooltip for the eye and the aria-label for screen readers.
const {
  label,
  variant = 'ghost',
  size = 'icon',
  type = 'button',
  disabled = false
} = defineProps<{
  label: string
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  type?: 'button' | 'submit'
  disabled?: boolean
}>()

// The root is the renderless Tooltip; listeners and classes belong on the button.
defineOptions({ inheritAttrs: false })
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <Button v-bind="$attrs" :variant :size :type :disabled :aria-label="label">
        <slot />
      </Button>
    </TooltipTrigger>
    <TooltipContent>{{ label }}</TooltipContent>
  </Tooltip>
</template>
