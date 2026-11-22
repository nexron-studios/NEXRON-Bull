<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { Check, Plus } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import AccountDot from '@/components/account/AccountDot.vue'
import AccountPlan from '@/components/account/AccountPlan.vue'
import NchResponsiveDialog from '@/components/common/NchResponsiveDialog.vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { FolderRuleProps } from '@/types/agentd.type'
import { accountKeyOfLabel, ruleProblemOf, type LimitAccount } from '@/utils/limitPolicy'

// Adds or changes the rule of one folder: its name, and the accounts its chats may move between.
const { rule, rules, accounts, suggestions } = defineProps<{
  /** The rule being changed; `null` adds a new one */
  rule: FolderRuleProps | null
  rules: FolderRuleProps[]
  accounts: LimitAccount[]
  /** Folder names from recent sessions, offered while typing */
  suggestions: string[]
}>()
const emit = defineEmits<{ save: [rule: FolderRuleProps, editing: string | null] }>()

const open = defineModel<boolean>('open', { required: true })

const folder = ref('')
const picked = ref<string[]>([])
const isSubmitted = ref(false)
const folderInput = ref<InstanceType<typeof Input> | null>(null)

const { t } = useI18n()
const id = useId()

const editing = computed(() => rule?.folder ?? null)
// A label of the rule that no machine offers right now stays selectable, so saving keeps it.
const choices = computed(() => {
  const missing = (rule?.accounts ?? [])
    .filter((label) => !accounts.some((account) => account.label === label))
    .map((label) => ({ label, accountKey: accountKeyOfLabel(accounts, label), plan: null }))
  return [...accounts, ...missing]
})
const draft = computed<FolderRuleProps>(() => ({ folder: folder.value, accounts: picked.value }))
const problem = computed(() => ruleProblemOf(draft.value, rules, editing.value))
const folderProblem = computed(() =>
  isSubmitted.value && problem.value !== 'no_account' ? problem.value : null
)
const accountProblem = computed(() =>
  isSubmitted.value && problem.value === 'no_account' ? problem.value : null
)

const toggle = (label: string, isWanted: boolean) => {
  const others = picked.value.filter((entry) => entry !== label)
  // In the order of the list, so the rule reads the same however it was clicked together.
  const next = isWanted ? [...others, label] : others
  picked.value = choices.value.map((c) => c.label).filter((entry) => next.includes(entry))
}

const submit = async () => {
  isSubmitted.value = true
  if (!problem.value) {
    emit('save', draft.value, editing.value)
    open.value = false
    return
  }
  await nextTick()
  if (folderProblem.value) folderInput.value?.$el?.focus()
}

watch(open, (isOpen) => {
  if (!isOpen) return
  folder.value = rule?.folder ?? ''
  picked.value = [...(rule?.accounts ?? [])]
  isSubmitted.value = false
})
</script>

<template>
  <NchResponsiveDialog
    v-model:open="open"
    :title="rule ? t('settings.limits.rule_edit_title') : t('settings.limits.rule_add_title')"
    :description="t('settings.limits.rule_description')"
    content-class="sm:max-w-md"
  >
    <form class="flex flex-col gap-4 pb-1" novalidate @submit.prevent="submit">
      <div class="flex flex-col gap-1.5">
        <Label :for="`${id}-folder`">{{ t('settings.limits.rule_folder') }}</Label>
        <Input
          :id="`${id}-folder`"
          ref="folderInput"
          v-model="folder"
          name="limit-rule-folder"
          :list="`${id}-suggestions`"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          class="font-mono"
          :aria-invalid="!!folderProblem"
          :aria-describedby="`${id}-folder-hint`"
        />
        <datalist :id="`${id}-suggestions`">
          <option v-for="name in suggestions" :key="name" :value="name" />
        </datalist>
        <p
          :id="`${id}-folder-hint`"
          class="text-meta"
          :class="folderProblem ? 'text-critical' : 'text-muted-foreground'"
          :role="folderProblem ? 'alert' : undefined"
        >
          {{
            folderProblem
              ? t(`settings.limits.rule_problems.${folderProblem}`)
              : t('settings.limits.rule_folder_hint')
          }}
        </p>
      </div>
      <fieldset class="flex flex-col gap-1.5" :aria-describedby="`${id}-accounts-hint`">
        <legend class="mb-1.5 text-small font-medium">
          {{ t('settings.limits.rule_accounts') }}
        </legend>
        <p v-if="!choices.length" class="text-small text-muted-foreground">
          {{ t('settings.limits.no_accounts') }}
        </p>
        <label
          v-for="choice in choices"
          :key="choice.label"
          class="flex min-h-9 cursor-pointer touch-manipulation items-center gap-2.5 rounded-md px-1 text-small hover:bg-muted/60 pointer-coarse:min-h-11"
        >
          <Checkbox
            :model-value="picked.includes(choice.label)"
            :aria-invalid="!!accountProblem"
            @update:model-value="toggle(choice.label, $event === true)"
          />
          <AccountDot :account-key="choice.accountKey" />
          <span class="min-w-0 flex-1 truncate">{{ choice.label }}</span>
          <AccountPlan v-if="choice.plan" :plan="choice.plan" />
        </label>
        <p
          :id="`${id}-accounts-hint`"
          class="text-meta"
          :class="accountProblem ? 'text-critical' : 'text-muted-foreground'"
          :role="accountProblem ? 'alert' : undefined"
        >
          {{
            accountProblem
              ? t('settings.limits.rule_problems.no_account')
              : t('settings.limits.rule_accounts_hint')
          }}
        </p>
      </fieldset>
      <div class="flex justify-end gap-2">
        <Button type="button" variant="outline" @click="open = false">
          {{ t('global.cancel') }}
        </Button>
        <Button type="submit">
          <Check v-if="rule" class="size-4" aria-hidden="true" />
          <Plus v-else class="size-4" aria-hidden="true" />
          {{ rule ? t('global.save') : t('settings.limits.rule_add') }}
        </Button>
      </div>
    </form>
  </NchResponsiveDialog>
</template>
