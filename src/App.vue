<script setup lang="ts">
import { computed } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import 'vue-sonner/style.css'
import { bridgeService } from '@/api/services/bridge.service'
import BridgeTokenScreen from '@/components/bridge/BridgeTokenScreen.vue'
import NchCopyHint from '@/components/common/NchCopyHint.vue'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useColorSchemeApply } from '@/composables/useColorScheme'
import { useCopyOnSelect } from '@/composables/useCopyOnSelect'
import { useUiZoomApply } from '@/composables/useUiZoom'

useColorSchemeApply()
useUiZoomApply()
useCopyOnSelect()

// A browser reaches agentd through the bridge, which first wants this device's token.
const needsToken = computed(() => {
  if (isTauri()) return false
  const { status, isSigningIn } = bridgeService.state
  return isSigningIn || status === 'needs_token' || status === 'rejected'
})
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <!-- The shell has a fixed height and scrolls inside its panes, never as a document. `relative`
         makes the clip hold for absolutely positioned descendants too (`sr-only` labels). -->
    <div class="relative flex h-dvh min-h-0 flex-col overflow-hidden">
      <BridgeTokenScreen v-if="needsToken" />
      <RouterView v-else />
    </div>
    <Toaster />
    <NchCopyHint />
  </TooltipProvider>
</template>
