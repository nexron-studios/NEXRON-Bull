<script setup lang="ts">
import { computed } from 'vue'
import { AppWindow, ExternalLink, RotateCw, ServerOff, Unplug } from '@lucide/vue'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useI18n } from 'vue-i18n'
import NchEmpty from '@/components/common/NchEmpty.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import PreviewToolbar from '@/components/preview/PreviewToolbar.vue'
import { useMachineLabel } from '@/composables/useMachineLabel'
import { usePreviewTarget } from '@/composables/usePreviewTarget'
import { handleError } from '@/lib/error'
import { usePreviewStore } from '@/stores/preview'
import type { ChatTabState } from '@/utils/chatTab'

// A localhost page of the chat's project, beside the chat or in a sheet. The page runs in a frame
// from another origin: it may run scripts and forms, but never navigate or open Bull's window.
const FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads'

const { tab, canClose = true } = defineProps<{ tab: ChatTabState; canClose?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const preview = usePreviewStore()
const { labelOf } = useMachineLabel()
const { target, remoteMachine, reloadCount, reload } = usePreviewTarget(() => tab)

const shownUrl = computed(() => (target.value.kind === 'empty' ? null : target.value.url))
const src = computed(() => ('src' in target.value ? target.value.src : null))
const machineName = computed(() => labelOf(tab.machine) ?? tab.machine ?? '')

const openExternal = () => {
  if (src.value) openUrl(src.value).catch(handleError)
}
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-1 flex-col" :aria-label="t('preview.label')">
    <PreviewToolbar
      :url="shownUrl"
      :can-open="!!src"
      :can-close
      @load="preview.setUrl(tab, $event)"
      @reload="reload"
      @open-external="openExternal"
      @close="emit('close')"
    />
    <p
      v-if="remoteMachine && src"
      class="shrink-0 truncate border-b border-border px-3 py-1 text-meta text-muted-foreground"
    >
      {{ t('preview.remote_hint', { machine: machineName, src }) }}
    </p>
    <div class="relative flex min-h-0 flex-1 flex-col">
      <NchEmpty
        v-if="target.kind === 'empty'"
        :icon="AppWindow"
        :title="t('preview.empty_title')"
        :hint="t('preview.empty_hint')"
        size="sm"
      />
      <NchEmpty
        v-else-if="target.kind === 'no_host'"
        :icon="Unplug"
        :title="t('preview.no_host_title', { machine: machineName })"
        :hint="t('preview.no_host_hint')"
        size="sm"
      />
      <NchEmpty
        v-else-if="target.kind === 'unreachable'"
        :icon="ServerOff"
        :title="t('preview.unreachable_title')"
        :hint="
          remoteMachine
            ? t('preview.unreachable_remote_hint', { machine: machineName })
            : t('preview.unreachable_hint')
        "
        size="sm"
      >
        <div class="flex flex-wrap justify-center gap-2">
          <Button size="sm" @click="reload">
            <RotateCw class="size-4" aria-hidden="true" />
            {{ t('preview.retry') }}
          </Button>
          <Button size="sm" variant="outline" @click="openExternal">
            <ExternalLink class="size-4" aria-hidden="true" />
            {{ t('preview.open_external') }}
          </Button>
        </div>
      </NchEmpty>
      <Skeleton
        v-else-if="target.kind === 'resolving' || target.kind === 'checking'"
        class="m-3 flex-1 rounded-lg"
      />
      <!-- White like a browser tab: a page without its own background expects it. -->
      <iframe
        v-else
        :key="`${target.src}#${reloadCount}`"
        :src="target.src"
        :title="t('preview.frame_title', { url: target.url })"
        :sandbox="FRAME_SANDBOX"
        class="motion-fade-in min-h-0 flex-1 border-0 bg-white"
      />
    </div>
  </section>
</template>
