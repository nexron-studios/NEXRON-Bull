<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import {
  Circle,
  CircleDot,
  MessageCircleQuestion,
  Pencil,
  Send,
  Square,
  SquareCheck
} from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import NchKbd from '@/components/common/NchKbd.vue'
import { Button } from '@/components/ui/button'
import { useChoiceKeys } from '@/composables/useChoiceKeys'
import { MAX_CHOICE_KEY } from '@/utils/approval'
import type { PermissionAsk } from '@/utils/chatTab'
import {
  OTHER_CHOICE,
  answersOf,
  questionsOf,
  toggledChoice,
  withOtherChoice
} from '@/utils/questions'
import { glowClassOf } from '@/theme/glow'

// Claude's AskUserQuestion (Figma "11", "M07"): the options one under the other as compact rows,
// then the user's own answer, then skip and answer on the right.
// `isKeyed`: only the chat on screen takes number keys, not one still sliding out.
const { permission, isKeyed } = defineProps<{ permission: PermissionAsk; isKeyed: boolean }>()
const emit = defineEmits<{ answer: [answers: Record<string, string>]; skip: [] }>()

/** Chosen labels per question, `OTHER_CHOICE` for the own answer; its text goes in `other`. */
const chosen = ref<Record<string, string[]>>({})
const other = ref<Record<string, string>>({})

const { t } = useI18n()
const id = useId()

const questions = computed(() => questionsOf(permission.input))
const answers = computed(() => answersOf(questions.value, chosen.value, other.value))
// An own answer chosen but left empty answers nothing.
const isComplete = computed(() => Object.values(answers.value).every(Boolean))
// Number keys only where they are unambiguous: one question on the card.
const keyed = computed(() => (isKeyed && questions.value.length === 1 ? questions.value[0] : null))

const isChosen = (question: string, label: string) =>
  chosen.value[question]?.includes(label) ?? false

const toggle = (question: string, label: string, isMulti: boolean) => {
  chosen.value = {
    ...chosen.value,
    [question]: toggledChoice(chosen.value[question] ?? [], label, isMulti)
  }
}

// Focusing or typing in the own answer chooses it, so the card shows what "answer" sends.
const chooseOther = (question: string, isMulti: boolean) => {
  chosen.value = {
    ...chosen.value,
    [question]: withOtherChoice(chosen.value[question] ?? [], isMulti)
  }
}

const submit = () => {
  if (!isComplete.value) return
  emit('answer', answers.value)
}

// A single choice is the whole answer, as in Claude Code; several choices still need "answer".
useChoiceKeys(
  () => keyed.value?.options.length ?? 0,
  (index) => {
    const question = keyed.value
    const option = question?.options[index]
    if (!question || !option) return
    toggle(question.question, option.label, question.multiSelect)
    if (!question.multiSelect) submit()
  }
)
</script>

<template>
  <section
    data-choice-card
    :class="glowClassOf('read')"
    class="flex flex-col gap-2 rounded-xl px-3 py-2.5"
    :aria-label="t('chat.question_title')"
  >
    <form class="flex flex-col gap-3" @submit.prevent="submit">
      <div
        v-for="(q, qIndex) in questions"
        :key="q.question"
        :role="q.multiSelect ? 'group' : 'radiogroup'"
        :aria-labelledby="`${id}-q${qIndex}`"
        class="flex flex-col gap-1"
      >
        <h2 :id="`${id}-q${qIndex}`" class="mb-1 flex items-start gap-2 text-small font-semibold">
          <MessageCircleQuestion class="mt-0.5 size-4 shrink-0 text-act-read" aria-hidden="true" />
          {{ q.question }}
        </h2>
        <label
          v-for="(option, oIndex) in q.options"
          :key="option.label"
          class="flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-small transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring"
          :class="
            isChosen(q.question, option.label)
              ? 'border-brand bg-brand/8'
              : 'border-border bg-card/60 hover:bg-muted'
          "
        >
          <input
            :type="q.multiSelect ? 'checkbox' : 'radio'"
            :name="`${id}-q${qIndex}`"
            class="sr-only"
            :checked="isChosen(q.question, option.label)"
            :aria-keyshortcuts="keyed && oIndex < MAX_CHOICE_KEY ? String(oIndex + 1) : undefined"
            @change="toggle(q.question, option.label, q.multiSelect)"
          />
          <template v-if="q.multiSelect">
            <SquareCheck
              v-if="isChosen(q.question, option.label)"
              class="size-4 shrink-0 text-brand"
              aria-hidden="true"
            />
            <Square v-else class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </template>
          <template v-else>
            <CircleDot
              v-if="isChosen(q.question, option.label)"
              class="size-4 shrink-0 text-brand"
              aria-hidden="true"
            />
            <Circle v-else class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </template>
          <span class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5">
            <span class="font-semibold">{{ option.label }}</span>
            <span v-if="option.description" class="text-meta text-muted-foreground">
              {{ option.description }}
            </span>
          </span>
          <NchKbd v-if="keyed && oIndex < MAX_CHOICE_KEY" :key-label="String(oIndex + 1)" />
        </label>
        <div
          class="flex items-center gap-2.5 rounded-lg border px-2.5 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring"
          :class="
            isChosen(q.question, OTHER_CHOICE)
              ? 'border-brand bg-brand/8'
              : 'border-border bg-card/60'
          "
        >
          <Pencil
            class="size-4 shrink-0"
            :class="isChosen(q.question, OTHER_CHOICE) ? 'text-brand' : 'text-muted-foreground'"
            aria-hidden="true"
          />
          <input
            v-model="other[q.question]"
            :placeholder="t('chat.question_other')"
            :aria-label="t('chat.question_other')"
            @focus="chooseOther(q.question, q.multiSelect)"
            @input="chooseOther(q.question, q.multiSelect)"
            class="h-8 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-small"
          />
        </div>
      </div>
      <div class="flex flex-wrap justify-end gap-1.5">
        <Button type="button" variant="outline" size="sm" @click="emit('skip')">
          {{ t('chat.question_skip') }}
        </Button>
        <Button
          type="submit"
          size="sm"
          class="bg-brand-strong text-brand-foreground hover:bg-brand-strong-hover"
          :disabled="!isComplete"
        >
          <Send aria-hidden="true" />
          {{ t('chat.question_send') }}
        </Button>
      </div>
    </form>
  </section>
</template>
