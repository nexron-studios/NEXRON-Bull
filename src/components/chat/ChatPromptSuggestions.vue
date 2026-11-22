<script setup lang="ts">
import type { Component } from 'vue'
import { BookOpen, FlaskConical, GitPullRequest, NotebookPen } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'

// Starters for an empty chat, after prompt-kit's Prompt Suggestion (MIT). A pick only fills the
// composer: the user still reads it and sends.
const emit = defineEmits<{ pick: [prompt: string] }>()

const { t } = useI18n()

const SUGGESTIONS: { key: string; icon: Component }[] = [
  { key: 'fix_tests', icon: FlaskConical },
  { key: 'describe_pr', icon: GitPullRequest },
  { key: 'explain_code', icon: BookOpen },
  { key: 'read_note', icon: NotebookPen }
]
</script>

<template>
  <ul class="flex flex-wrap justify-center gap-2" :aria-label="t('chat.suggestions.label')">
    <li v-for="suggestion in SUGGESTIONS" :key="suggestion.key">
      <Button
        variant="outline"
        class="touch-manipulation rounded-full"
        @click="emit('pick', t(`chat.suggestions.${suggestion.key}.prompt`))"
      >
        <component :is="suggestion.icon" class="size-4" aria-hidden="true" />
        {{ t(`chat.suggestions.${suggestion.key}.label`) }}
      </Button>
    </li>
  </ul>
</template>
