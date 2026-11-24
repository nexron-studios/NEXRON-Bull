<script setup lang="ts">
import 'vue-sonner/style.css'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useColorSchemeApply } from '@/composables/useColorScheme'

useColorSchemeApply()
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <!-- The shell has a fixed height and scrolls inside its panes, never as a document. `relative`
         makes the clip hold for absolutely positioned descendants too (`sr-only` labels). -->
    <div class="relative flex h-dvh min-h-0 flex-col overflow-hidden">
      <RouterView />
    </div>
    <Toaster />
  </TooltipProvider>
</template>
