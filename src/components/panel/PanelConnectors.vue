<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronRight, Hourglass, Plug, RefreshCw, RotateCw, Unplug } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import PanelConnectorList from '@/components/panel/PanelConnectorList.vue'
import PanelGhostList from '@/components/panel/PanelGhostList.vue'
import PanelSection from '@/components/panel/PanelSection.vue'
import NchSectionEmpty from '@/components/common/NchSectionEmpty.vue'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useConnectorSetup } from '@/composables/useConnectorSetup'
import { useTabInsights } from '@/composables/useTabInsights'
import { useTerminalRequestStore } from '@/stores/terminalRequests'
import { connectorLoginRequestOf, connectorSetupRequestOf } from '@/utils/accountLogin'
import type { ChatTabState } from '@/utils/chatTab'
import { connectorsViewOf } from '@/utils/panelStates'

// The MCP servers of this session as Claude reported them at start, five rows and the rest folded
// (`PanelConnectorList`). Until they are reported, ghost rows hold about the list's height. "Anmelden" on a server that needs a login opens Claude Code's
// `/mcp` in a terminal in this chat's folder and account, the one place headless Claude Code signs
// one in. An account without any gets a shell there with `claude mcp add` on the prompt to finish
// (Figma 42e): `/mcp` itself cannot add one. Back in the chat, Claude reads its config again and a
// server added there shows up without a restart (`useConnectorSetup`). No "start now" button
// for a resting session: headless Claude reports its servers only with a turn, so starting it
// without a message would show nothing new.
const { tab } = defineProps<{ tab: ChatTabState }>()

/** Ghost rows while Claude starts: as many as the folded list shows, without a text below. */
const STARTING_GHOST_ROWS = 5

const { t } = useI18n()
const { connectors: reported } = useTabInsights(tab.id)
const terminals = useTerminalRequestStore()
const setup = useConnectorSetup(tab.id)

const view = computed(() => connectorsViewOf(tab.status, reported.value, setup.setup.value))
// The panel mounts again per chat tab: a list already there then shows at once, it only enters
// when it replaces the ghost rows (or another state) while you look.
const hasLeftList = ref(view.value !== 'list')
const connectors = computed(() => reported.value ?? [])
const connectedCount = computed(
  () => connectors.value.filter((connector) => connector.status === 'connected').length
)
// With the list folded, the header is the one place that names how many there are.
const countLabel = computed(() =>
  connectedCount.value === connectors.value.length
    ? t('activity.connected', { n: connectedCount.value })
    : t('panel.connectors_count', {
        connected: connectedCount.value,
        total: connectors.value.length
      })
)

const signIn = (name: string) =>
  terminals.request(connectorLoginRequestOf(tab, t('panel.sign_in_title', { name })))
const setUp = () => {
  setup.markOpened()
  terminals.request(connectorSetupRequestOf(tab, t('panel.connectors_setup_title')))
}

watch(view, (current) => {
  if (current !== 'list') hasLeftList.value = true
})
</script>

<template>
  <PanelSection :icon="Plug" :title="t('panel.connectors')">
    <template v-if="view === 'list'" #aside>
      <span class="text-meta text-muted-foreground tabular-nums">
        {{ countLabel }}
      </span>
    </template>
    <PanelConnectorList
      v-if="view === 'list'"
      :connectors
      :is-entering="hasLeftList"
      @sign-in="signIn"
    />
    <PanelGhostList
      v-else-if="view === 'starting' || view === 'checking'"
      :count="STARTING_GHOST_ROWS"
      is-live
    />
    <template v-else-if="view === 'awaiting'">
      <PanelGhostList />
      <NchSectionEmpty
        :icon="Plug"
        :title="t('panel.connectors_later')"
        :hint="t('panel.connectors_later_hint')"
      />
    </template>
    <template v-else-if="view === 'after_turn'">
      <PanelGhostList is-live />
      <NchSectionEmpty
        :icon="Hourglass"
        :title="t('panel.connectors_after_turn')"
        :hint="t('panel.connectors_after_turn_hint')"
      />
    </template>
    <NchSectionEmpty
      v-else-if="view === 'restart'"
      :icon="RotateCw"
      :title="t('panel.connectors_restart_title')"
      :hint="t('panel.connectors_restart_hint')"
    >
      <Tooltip :disabled="!setup.isBusy.value">
        <TooltipTrigger as-child>
          <!-- A disabled button gets no pointer events: the wrapper carries the tooltip. -->
          <span class="mt-1 w-fit" :tabindex="setup.isBusy.value ? 0 : undefined">
            <Button
              variant="outline"
              size="xs"
              class="motion-press"
              :disabled="setup.isBusy.value"
              @click="setup.restart"
            >
              <RotateCw aria-hidden="true" />
              {{ t('panel.connectors_restart') }}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{{ t('panel.connectors_restart_busy') }}</TooltipContent>
      </Tooltip>
    </NchSectionEmpty>
    <NchSectionEmpty
      v-else
      :icon="Unplug"
      :title="t('panel.connectors_empty')"
      :hint="
        t(view === 'recheck' ? 'panel.connectors_recheck_hint' : 'panel.connectors_empty_hint')
      "
    >
      <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          v-if="view === 'recheck'"
          variant="outline"
          size="xs"
          class="motion-press"
          @click="setup.check"
        >
          <RefreshCw aria-hidden="true" />
          {{ t('panel.connectors_recheck') }}
        </Button>
        <button
          type="button"
          class="motion-press flex w-fit items-center gap-0.5 rounded-sm text-meta text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          @click="setUp"
        >
          {{ t('panel.connectors_setup') }}
          <ChevronRight class="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </NchSectionEmpty>
  </PanelSection>
</template>
