<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useClipped } from '@/composables/useClipped'
import type { Connector, ConnectorStatus } from '@/utils/tabInsights'

// One MCP server in "Konnektoren": a dot for its state, the name (full name in a tooltip once it
// is cut off) and on the right what to do about it: "Anmelden" for a login, the state in words
// for an error or a pending server. A connected one needs nothing on the right.
const { connector } = defineProps<{ connector: Connector }>()

const emit = defineEmits<{ signIn: [name: string] }>()

const DOT_CLASS: Record<ConnectorStatus, string> = {
  connected: 'bg-good',
  pending: 'bg-warning',
  'needs-auth': 'bg-warning',
  failed: 'bg-critical',
  unknown: 'bg-muted-foreground'
}

const LABEL_CLASS: Record<Exclude<ConnectorStatus, 'connected' | 'needs-auth'>, string> = {
  pending: 'text-warning',
  failed: 'text-critical',
  unknown: 'text-muted-foreground'
}

const nameEl = useTemplateRef<HTMLElement>('name')

const { t } = useI18n()
const { isClipped, measure: measureClip } = useClipped([nameEl])
</script>

<template>
  <li class="flex h-7 min-w-0 items-center gap-2 text-small">
    <span
      class="size-1.5 shrink-0 rounded-full"
      :class="DOT_CLASS[connector.status]"
      aria-hidden="true"
    />
    <Tooltip :disabled="!isClipped">
      <TooltipTrigger as-child>
        <span ref="name" class="min-w-0 flex-1 truncate" @pointerenter="measureClip">
          {{ connector.name }}
        </span>
      </TooltipTrigger>
      <TooltipContent class="max-w-72 break-all">{{ connector.name }}</TooltipContent>
    </Tooltip>
    <!-- The dot carries the state for a login and a connected server: screen readers get it here. -->
    <span
      v-if="connector.status === 'needs-auth' || connector.status === 'connected'"
      class="sr-only"
    >
      {{ t(`panel.connector_state.${connector.status}`) }}
    </span>
    <Button
      v-if="connector.status === 'needs-auth'"
      variant="ghost"
      size="xs"
      class="motion-press -mr-1 shrink-0"
      :aria-label="t('panel.sign_in_title', { name: connector.name })"
      @click="emit('signIn', connector.name)"
    >
      {{ t('panel.sign_in') }}
    </Button>
    <span
      v-else-if="connector.status !== 'connected'"
      class="shrink-0 pr-1 text-meta"
      :class="LABEL_CLASS[connector.status]"
    >
      {{ t(`panel.connector_state.${connector.status}`) }}
    </span>
  </li>
</template>
