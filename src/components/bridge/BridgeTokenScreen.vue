<script setup lang="ts">
import { computed, ref } from 'vue'
import { KeyRound, LoaderCircle } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import BrandBullLogo from '@/components/brand/BrandBullLogo.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { bridgeService } from '@/api/services/bridge.service'

// The browser's one extra screen: before the bridge lets this device in, it needs the token that
// `npm run token` printed on the server. Asked once; it stays in this browser until refused.
const LOGO_PX = 48

const token = ref('')
const isEmpty = ref(false)

const { t } = useI18n()

const status = computed(() => bridgeService.state.status)
const isConnecting = computed(() => status.value === 'connecting')
const problem = computed(() => {
  if (isEmpty.value) return t('bridge.token_empty')
  return status.value === 'rejected' ? t('bridge.token_rejected') : null
})

const submit = () => {
  isEmpty.value = !token.value.trim()
  if (isEmpty.value) return document.getElementById('bridge-token')?.focus()
  bridgeService.signIn(token.value)
}
</script>

<template>
  <main class="grid min-h-0 flex-1 place-items-center overflow-y-auto px-4 py-8">
    <form
      class="motion-fade-in flex w-full max-w-sm flex-col gap-5"
      novalidate
      @submit.prevent="submit"
    >
      <div class="flex flex-col items-center gap-3 text-center">
        <BrandBullLogo :size="LOGO_PX" />
        <h1 class="text-display font-semibold text-balance">{{ t('bridge.title') }}</h1>
        <p class="text-small text-pretty text-muted-foreground">{{ t('bridge.description') }}</p>
      </div>
      <div class="flex flex-col gap-1.5">
        <Label for="bridge-token">{{ t('bridge.token') }}</Label>
        <Input
          id="bridge-token"
          v-model="token"
          type="password"
          name="bull-device-token"
          autocomplete="current-password"
          autocapitalize="off"
          spellcheck="false"
          class="h-11 font-mono text-base"
          :aria-invalid="!!problem"
          aria-describedby="bridge-token-hint"
        />
        <p
          id="bridge-token-hint"
          :key="problem ?? 'hint'"
          class="text-meta"
          :class="problem ? 'motion-shake text-critical' : 'text-muted-foreground'"
          :role="problem ? 'alert' : undefined"
        >
          {{ problem ?? t('bridge.token_hint') }}
        </p>
      </div>
      <Button
        type="submit"
        class="motion-press h-11 touch-manipulation bg-brand-strong text-brand-foreground hover:bg-brand-strong-hover"
        :disabled="isConnecting"
      >
        <LoaderCircle v-if="isConnecting" class="size-4 animate-spin" aria-hidden="true" />
        <KeyRound v-else class="size-4" aria-hidden="true" />
        {{ t('bridge.connect') }}
      </Button>
    </form>
  </main>
</template>
