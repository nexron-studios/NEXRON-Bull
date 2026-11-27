<script setup lang="ts">
import type { Component } from 'vue'
import { Check, Circle, CircleDashed, LoaderCircle } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchInlineMarkdown from '@/components/common/NchInlineMarkdown.vue'
import type { Todo, TodoStatus } from '@/utils/todos'

// Claude's task list (TodoWrite or TaskCreate/TaskUpdate) as steps in the panel, after prompt-kit's
// Steps (MIT). Only here, not in the chat (Jonas, 27.11.2026).
const { todos, isRunning = false } = defineProps<{ todos: Todo[]; isRunning?: boolean }>()

const { t } = useI18n()

const LOOK: Record<TodoStatus, { icon: Component; iconClass: string; textClass: string }> = {
  completed: { icon: Check, iconClass: 'text-good', textClass: 'text-foreground' },
  in_progress: {
    icon: LoaderCircle,
    iconClass: 'animate-spin text-warning',
    textClass: 'text-foreground'
  },
  pending: { icon: Circle, iconClass: 'text-muted-foreground', textClass: 'text-muted-foreground' }
}

// A step still marked running after the turn ended was left behind, not running.
const lookOf = (status: TodoStatus) =>
  status === 'in_progress' && !isRunning
    ? { ...LOOK.in_progress, icon: CircleDashed, iconClass: 'text-muted-foreground' }
    : LOOK[status]
</script>

<template>
  <ul class="flex max-w-[72ch] flex-col gap-1.5" :aria-label="t('chat.stream.todos')">
    <li
      v-for="todo in todos"
      :key="todo.id"
      class="flex items-start gap-2.5 text-small"
      :class="lookOf(todo.status).textClass"
    >
      <component
        :is="lookOf(todo.status).icon"
        class="mt-0.5 size-4 shrink-0"
        :class="lookOf(todo.status).iconClass"
        aria-hidden="true"
      />
      <NchInlineMarkdown :text="todo.content" class="min-w-0 break-words" />
      <span class="sr-only">{{ t(`chat.stream.todo_state.${todo.status}`) }}</span>
    </li>
  </ul>
</template>
