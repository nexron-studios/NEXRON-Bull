<script setup lang="ts">
import 'vue-sonner/style.css'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useColorSchemeApply } from '@/composables/useColorScheme'
import { useUiZoomApply } from '@/composables/useUiZoom'

useColorSchemeApply()
useUiZoomApply()
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div class="flex h-dvh min-h-0 flex-col">
      <RouterView />
    </div>
    <Toaster />
  </TooltipProvider>
</template>
