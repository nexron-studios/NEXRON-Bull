<script setup lang="ts">
import { computed } from 'vue'
import ChatShellBlock from '@/components/chat/ChatShellBlock.vue'
import { useShellRunsStore } from '@/stores/shellRuns'

// The `!` commands of a tab that have not gone to Claude yet; they join the next prompt.
const { tabId } = defineProps<{ tabId: string }>()

const shell = useShellRunsStore()

const runs = computed(() => shell.runsOf(tabId))
</script>

<template>
  <ChatShellBlock
    v-for="run in runs"
    :key="run.id"
    :command="run.command"
    :state="run.state"
    :stdout="run.stdout"
    :stderr="run.stderr"
    :code="run.code"
    :duration-ms="run.durationMs"
    :is-timed-out="run.isTimedOut"
    :error="run.error"
    is-removable
    class="message-fade"
    @remove="shell.remove(tabId, run.id)"
  />
</template>
