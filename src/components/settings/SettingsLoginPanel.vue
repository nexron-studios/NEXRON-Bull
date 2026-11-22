<script setup lang="ts">
import { computed } from 'vue'
import { Copy, LogIn } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { Machine } from '@/api/services/agentd.service'
import NchIconButton from '@/components/common/NchIconButton.vue'
import { Button } from '@/components/ui/button'
import { useAccountLogin } from '@/composables/useAccountLogin'
import { copyText } from '@/lib/clipboard'
import type { ProfileProps } from '@/types/agentd.type'
import { loginCommandLineOf } from '@/utils/accountLogin'

// `claude /login` for one account (Figma "22b"): a terminal in Bull, or the same command to copy
// into a terminal of one's own. "Fertig" reads the login back.
const { machine, profile } = defineProps<{ machine: Machine; profile: ProfileProps }>()
const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()
const { openTerminal, refreshMachine } = useAccountLogin()

const commandLine = computed(() => loginCommandLineOf(profile))
const fallback = computed(() =>
  machine === null
    ? t('settings.login.fallback_here')
    : t('settings.login.fallback_remote', { machine })
)

const finish = () => {
  void refreshMachine(machine)
  emit('done')
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-1.5">
      <span class="text-meta font-semibold text-muted-foreground">{{
        t('settings.login.command')
      }}</span>
      <div class="flex items-start gap-2 rounded-lg border border-border bg-background p-2 pl-3">
        <code class="min-w-0 flex-1 py-1 font-mono text-meta break-all">{{ commandLine }}</code>
        <NchIconButton
          :label="t('settings.login.copy')"
          size="icon-sm"
          @click="copyText(commandLine)"
        >
          <Copy class="size-4" aria-hidden="true" />
        </NchIconButton>
      </div>
      <p class="text-meta text-muted-foreground">
        {{ fallback }}
      </p>
    </div>
    <div class="flex flex-wrap justify-end gap-2">
      <Button variant="outline" @click="finish">{{ t('settings.login.done') }}</Button>
      <Button @click="openTerminal(machine, profile)">
        <LogIn class="size-4" aria-hidden="true" />
        {{ t('settings.login.open_terminal') }}
      </Button>
    </div>
  </div>
</template>
