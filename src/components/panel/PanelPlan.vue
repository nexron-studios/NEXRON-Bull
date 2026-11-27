<script setup lang="ts">
import { computed } from 'vue'
import { ListTodo } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import ChatSteps from '@/components/chat/ChatSteps.vue'
import PanelSection from '@/components/panel/PanelSection.vue'
import type { Todo } from '@/utils/todos'

// Claude's plan for the prompt, the same steps the chat shows below its work, with how far it got.
const { todos, isRunning } = defineProps<{ todos: Todo[]; isRunning: boolean }>()

const { t } = useI18n()

const doneCount = computed(() => todos.filter((todo) => todo.status === 'completed').length)
</script>

<template>
  <PanelSection :icon="ListTodo" :title="t('panel.plan')">
    <template #aside>
      <span class="text-meta text-muted-foreground tabular-nums">
        {{ t('panel.plan_count', { done: doneCount, all: todos.length }) }}
      </span>
    </template>
    <ChatSteps :todos :is-running />
  </PanelSection>
</template>
