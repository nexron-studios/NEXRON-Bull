<script setup lang="ts">
import { computed } from 'vue'
import { Settings } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// The way to the settings on a desktop: a gear next to the theme button (17.11.2026, instead
// of a fourth page in the sidebar). While the page is open it stays marked and leads back to the
// chat: on a narrow window it is the only obvious way out, the drawer and the tab are easy to miss.
defineOptions({ inheritAttrs: false })

const { t } = useI18n()
const route = useRoute()

const isCurrent = computed(() => route.name === 'settings')
const label = computed(() => t(isCurrent.value ? 'settings.close' : 'settings.open'))
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <Button
        v-bind="$attrs"
        as-child
        variant="ghost"
        size="icon-sm"
        :class="{ 'bg-muted text-foreground': isCurrent }"
      >
        <RouterLink :to="{ name: isCurrent ? 'chat' : 'settings' }" :aria-label="label">
          <Settings class="size-4" aria-hidden="true" />
        </RouterLink>
      </Button>
    </TooltipTrigger>
    <TooltipContent>{{ label }}</TooltipContent>
  </Tooltip>
</template>
