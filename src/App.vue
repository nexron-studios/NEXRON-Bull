<script setup lang="ts">
import { computed } from 'vue'
import 'vue-sonner/style.css'
import { isDesktopApp } from '@/lib/platform'
import { bridgeService } from '@/api/services/bridge.service'
import BridgeTokenScreen from '@/components/bridge/BridgeTokenScreen.vue'
import NchCopyHint from '@/components/common/NchCopyHint.vue'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import UpdateDialog from '@/components/update/UpdateDialog.vue'
import { useAppUpdateSchedule } from '@/composables/useAppUpdateSchedule'
import { useColorSchemeApply } from '@/composables/useColorScheme'
import { useCopyOnSelect } from '@/composables/useCopyOnSelect'
import { useUiZoomApply } from '@/composables/useUiZoom'

useColorSchemeApply()
useUiZoomApply()
useCopyOnSelect()
// Only the installed app has something to update; a browser tab reloads its own code.
if (isDesktopApp()) useAppUpdateSchedule()

// A browser reaches agentd through the bridge, which first wants this device's token.
const needsToken = computed(() => {
  if (isDesktopApp()) return false
  const { status, isSigningIn } = bridgeService.state
  return isSigningIn || status === 'needs_token' || status === 'rejected'
})
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <!-- The shell has a fixed height and scrolls inside its panes, never as a document. `relative`
         makes the clip hold for absolutely positioned descendants too (`sr-only` labels). `clip`,
         not `hidden`: a hidden box can still be scrolled by focus, and a focused hidden input far
         down a chat once pushed the whole app out of the window, leaving it blank. -->
    <div class="relative flex h-dvh min-h-0 flex-col overflow-clip">
      <BridgeTokenScreen v-if="needsToken" />
      <RouterView v-else />
    </div>
    <Toaster />
    <NchCopyHint />
    <UpdateDialog v-if="isDesktopApp()" />
  </TooltipProvider>
</template>
