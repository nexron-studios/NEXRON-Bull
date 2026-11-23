<script setup lang="ts">
import { computed } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import 'vue-sonner/style.css'
import { bridgeService } from '@/api/services/bridge.service'
import BridgeTokenScreen from '@/components/bridge/BridgeTokenScreen.vue'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useColorSchemeApply } from '@/composables/useColorScheme'

useColorSchemeApply()

// A browser reaches agentd through the bridge, which first wants this device's token.
const needsToken = computed(() => {
  if (isTauri()) return false
  const { status, isSigningIn } = bridgeService.state
  return isSigningIn || status === 'needs_token' || status === 'rejected'
})
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div class="flex h-dvh min-h-0 flex-col">
      <BridgeTokenScreen v-if="needsToken" />
      <RouterView v-else />
    </div>
    <Toaster />
  </TooltipProvider>
</template>
