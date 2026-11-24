<script setup lang="ts">
import 'vue-sonner/style.css'
import NchCopyHint from '@/components/common/NchCopyHint.vue'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useColorSchemeApply } from '@/composables/useColorScheme'
import { useCopyOnSelect } from '@/composables/useCopyOnSelect'

useColorSchemeApply()
useCopyOnSelect()
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <div class="flex h-dvh min-h-0 flex-col">
      <RouterView />
    </div>
    <Toaster />
    <NchCopyHint />
  </TooltipProvider>
</template>
